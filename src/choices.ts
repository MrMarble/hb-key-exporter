import LZString from 'lz-string'
import { getErrorMessage } from './claim-report'
import { serializeRedeemedKeyValue } from './redeemed-key'
import type { Order, Product } from './util'

/**
 * Humble Choice (subscription) redemption.
 *
 * Choice months differ from regular bundles: the keys do not exist until the
 * games are "chosen". Revealing one is therefore two steps — POST the picks to
 * `/humbler/choosecontent`, then redeem each resulting key. Only the first step
 * lives here; the reveal itself reuses the normal claim pipeline. The data
 * needed to choose only exists in the choice page HTML, not in the cached
 * order, so the page is fetched and its embedded JSON payload parsed.
 */

/** A single key entry attached to a choice game. */
interface ChoiceTpkd {
  machine_name: string
  key_type: string
  human_name: string
  is_expired: boolean
  sold_out: boolean
  steam_app_id?: number
  redeemed_key_val?: unknown
}

interface ChoiceGameData {
  title: string
  tpkds?: ChoiceTpkd[]
}

/** Shape of the JSON embedded in `#webpack-monthly-product-data`. */
interface ChoicePageData {
  parentIdentifier?: string
  /**
   * True for modern Choice months, where every game in the month is granted.
   * False for legacy Humble Monthly, which requires the user to pick a limited
   * number of games — deliberately out of scope, see `processChoice`.
   */
  productIsChoiceless: boolean
  contentChoiceOptions: {
    gamekey: string
    canRedeemGames: boolean
    title: string
    contentChoiceData: {
      display_order?: string[]
      game_data: Record<string, ChoiceGameData>
    }
    contentChoicesMade?: Record<string, { choices_made?: string[] }>
  }
}

export interface ChoiceOrder {
  gamekey: string
  choice_url: string
  human_name: string
}

type ChoiceOrderLike = Order & {
  product: Order['product'] & { choice_url?: string }
}

/**
 * Choice months whose preparation failed this session.
 *
 * Mirrors `claim-report`'s permanent-failure tracking, but keyed on the
 * gamekey, since the failure applies to the whole month rather than one key.
 */
const failedChoiceMonths = new Set<string>()

/** Find cached subscription orders that expose a choice URL. */
export const findChoiceOrders = (): ChoiceOrder[] =>
  Object.keys(localStorage)
    .filter((key) => key.startsWith('v2|'))
    .map((key) => {
      try {
        return JSON.parse(
          LZString.decompressFromUTF16(localStorage.getItem(key))
        ) as ChoiceOrderLike
      } catch {
        return null
      }
    })
    .filter(
      (order): order is ChoiceOrderLike =>
        order?.product?.category === 'subscriptioncontent' && Boolean(order.product.choice_url)
    )
    .map((order) => ({
      gamekey: order.gamekey,
      choice_url: order.product.choice_url as string,
      human_name: order.product.human_name,
    }))

/** Fetch a choice page and parse the product data embedded in it. */
export const fetchChoicePageData = async (choiceUrl: string): Promise<ChoicePageData> => {
  const response = await fetch(`https://www.humblebundle.com/membership/${choiceUrl}`, {
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(`Failed to load Choice page (HTTP ${response.status})`)
  }

  const doc = new DOMParser().parseFromString(await response.text(), 'text/html')
  const payload = doc.querySelector('#webpack-monthly-product-data')?.textContent

  if (!payload) {
    throw new Error('Could not find Choice data on the page')
  }

  try {
    return JSON.parse(payload) as ChoicePageData
  } catch {
    throw new Error('Could not parse Choice data on the page')
  }
}

const getCsrfToken = (): string => document.cookie.match(/csrf_cookie=([^;]+)/)?.[1] ?? ''

/** Select games for a Choice month so their keys become redeemable. */
const chooseContent = async (
  gamekey: string,
  parentIdentifier: string,
  identifiers: string[]
): Promise<void> => {
  const body = new URLSearchParams()
  body.append('gamekey', gamekey)
  body.append('parent_identifier', parentIdentifier)
  for (const identifier of identifiers) body.append('chosen_identifiers[]', identifier)

  const response = await fetch('https://www.humblebundle.com/humbler/choosecontent', {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'csrf-prevention-token': getCsrfToken(),
    },
    body,
    method: 'POST',
    mode: 'cors',
  })

  let data: { success?: boolean; error_msg?: string; errors?: Record<string, unknown> }

  try {
    data = await response.json()
  } catch {
    throw new Error(`Humble returned an invalid response (HTTP ${response.status})`)
  }

  // `errors.dummy` is what Humble returns when the choice was already made,
  // which is a no-op for us rather than a failure.
  if (data.success !== true && !data.errors?.dummy) {
    throw new Error(data.error_msg || 'Failed to choose Choice content')
  }
}

const isRedeemable = (tpkd: ChoiceTpkd): boolean =>
  !tpkd.key_type.endsWith('_keyless') &&
  !serializeRedeemedKeyValue(tpkd.redeemed_key_val) &&
  !tpkd.is_expired &&
  !tpkd.sold_out

/**
 * Choose the games backing the given Choice products so their keys become
 * redeemable.
 *
 * Runs once per Choice month rather than once per product, and resolves to the
 * per-product errors that should be reported instead of attempting a reveal.
 */
export const prepareChoiceProducts = async (
  products: readonly Product[],
  onStatus?: (message: string) => void
): Promise<Map<Product, Error>> => {
  const failures = new Map<Product, Error>()
  const choiceProducts = products.filter((product) => product.category === 'Choice')
  if (!choiceProducts.length) return failures

  // Choice products carry the month's gamekey as their category id.
  const byGamekey = new Map<string, Product[]>()
  for (const product of choiceProducts) {
    const group = byGamekey.get(product.category_id)
    if (group) group.push(product)
    else byGamekey.set(product.category_id, [product])
  }

  const ordersByGamekey = new Map(findChoiceOrders().map((order) => [order.gamekey, order]))

  const failGroup = (group: readonly Product[], error: unknown): void => {
    const wrapped = error instanceof Error ? error : new Error(getErrorMessage(error))
    for (const product of group) failures.set(product, wrapped)
  }

  // Deliberately sequential: each month issues a choosecontent write, and
  // Humble is rate-sensitive on that endpoint.
  for (const [gamekey, group] of byGamekey) {
    const order = ordersByGamekey.get(gamekey)

    if (!order) {
      failGroup(group, new Error('Could not find the Humble Choice month for this key'))
      continue
    }

    if (failedChoiceMonths.has(gamekey)) {
      failGroup(group, new Error('Humble Choice month already failed this session'))
      continue
    }

    try {
      onStatus?.(`Loading ${order.human_name}`)
      const pageData = await fetchChoicePageData(order.choice_url)
      const options = pageData.contentChoiceOptions

      // Legacy Humble Monthly grants only a subset of the month, so choosing
      // everything would spend the allowance on arbitrary games.
      if (!pageData.productIsChoiceless) {
        failGroup(group, new Error('Choices for this month must be made on Humble first'))
        continue
      }

      if (!options?.canRedeemGames) {
        failGroup(group, new Error('This Humble Choice month is not redeemable'))
        continue
      }

      const gameData = options.contentChoiceData?.game_data ?? {}
      const displayOrder = options.contentChoiceData?.display_order ?? Object.keys(gameData)
      const parentIdentifier = pageData.parentIdentifier ?? 'initial'

      const alreadyChosen = new Set(
        Object.values(options.contentChoicesMade ?? {}).flatMap((made) => made.choices_made ?? [])
      )

      const unchosenIds = displayOrder.filter(
        (id) => !alreadyChosen.has(id) && gameData[id]?.tpkds?.some(isRedeemable)
      )

      if (!unchosenIds.length) continue

      onStatus?.(`Choosing ${unchosenIds.length} games in ${order.human_name}`)
      await chooseContent(gamekey, parentIdentifier, unchosenIds)
    } catch (error) {
      failedChoiceMonths.add(gamekey)
      failGroup(group, error)
    }
  }

  return failures
}
