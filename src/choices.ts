import LZString from 'lz-string'
import { redeem, RedeemError } from './util'

// --- Interfaces ---

interface ChoiceTpkd {
  machine_name: string
  key_type: string
  human_name: string
  is_expired: boolean
  sold_out: boolean
  steam_app_id?: number
  redeemed_key_val?: string
}

interface ChoiceGameData {
  title: string
  tpkds: ChoiceTpkd[]
}

interface ChoicePageData {
  parentIdentifier: string
  productIsChoiceless: boolean
  contentChoiceOptions: {
    gamekey: string
    canRedeemGames: boolean
    title: string
    contentChoiceData: {
      display_order: string[]
      game_data: Record<string, ChoiceGameData>
    }
    contentChoicesMade: Record<string, { choices_made: string[] }>
  }
}

export interface ChoiceOrder {
  gamekey: string
  choice_url: string
  human_name: string
}

export interface RedeemedChoiceKey {
  game_name: string
  machine_name: string
  key_type: string
  key: string
  choice_title: string
  error?: string
}

// Track games that failed redemption (e.g. keys depleted) so they're skipped on retry
const failedChoiceGames = new Set<string>()
// --- Core functions ---

/** Find subscription orders with a choice_url from localStorage */
export const findChoiceOrders = (): ChoiceOrder[] =>
  Object.keys(localStorage)
    .filter((key) => key.startsWith('v2|'))
    .map((key) => {
      try {
        return JSON.parse(LZString.decompressFromUTF16(localStorage.getItem(key)))
      } catch {
        return null
      }
    })
    .filter(
      (order) => order?.product?.category === 'subscriptioncontent' && order?.product?.choice_url
    )
    .map((order) => ({
      gamekey: order.gamekey,
      choice_url: order.product.choice_url,
      human_name: order.product.human_name,
    }))

/** Fetch the choice page HTML and parse the embedded JSON data */
export const fetchChoicePageData = async (choiceUrl: string): Promise<ChoicePageData> => {
  const response = await fetch(`https://www.humblebundle.com/membership/${choiceUrl}`, {
    credentials: 'include',
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch choice page: ${response.status}`)
  }

  const html = await response.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const script = doc.querySelector('#webpack-monthly-product-data')
  if (!script) {
    throw new Error('Could not find choice data in page')
  }

  return JSON.parse(script.textContent) as ChoicePageData
}

const getCsrfToken = (): string => {
  const match = document.cookie.match(/csrf_cookie=([^;]+)/)
  return match ? match[1] : ''
}

/** POST to choosecontent to select games for redemption */
const chooseContent = async (
  gamekey: string,
  parentIdentifier: string,
  identifiers: string[]
): Promise<void> => {
  const csrfToken = getCsrfToken()
  const body = new URLSearchParams()
  body.append('gamekey', gamekey)
  body.append('parent_identifier', parentIdentifier)
  for (const id of identifiers) {
    body.append('chosen_identifiers[]', id)
  }

  console.log('Choosing content:', { gamekey, parentIdentifier, identifiers })

  const data = await fetch('https://www.humblebundle.com/humbler/choosecontent', {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'csrf-prevention-token': csrfToken,
    },
    body: body.toString(),
    method: 'POST',
    mode: 'cors',
  }).then((res) => res.json())

  console.log('Choose content response:', data)
  // "already made this choice" is fine - continue to redeem
  if (data.success !== true && !data.errors?.dummy) {
    throw new Error(data.error_msg || JSON.stringify(data.errors) || 'Failed to choose content')
  }
}

/** Process a single choice order: choose all games then redeem their keys */
export const processChoice = async (
  order: ChoiceOrder,
  onProgress: (msg: string) => void
): Promise<RedeemedChoiceKey[]> => {
  const results: RedeemedChoiceKey[] = []

  onProgress(`Fetching: ${order.human_name}`)
  const pageData = await fetchChoicePageData(order.choice_url)

  if (!pageData.productIsChoiceless) {
    onProgress(`Skipping ${order.human_name} (old-style choice)`)
    return results
  }

  if (!pageData.contentChoiceOptions.canRedeemGames) {
    onProgress(`Skipping ${order.human_name} (cannot redeem)`)
    return results
  }

  const { gamekey, contentChoicesMade } = pageData.contentChoiceOptions
  const { game_data, display_order } = pageData.contentChoiceOptions.contentChoiceData
  const parentIdentifier = 'initial'

  // Collect all games already chosen via the API
  const alreadyChosen = new Set(
    Object.values(contentChoicesMade || {}).flatMap((v) => v.choices_made || [])
  )

  // Only include games that have redeemable keys
  let gameIds = display_order.filter((id) => game_data[id]?.tpkds?.length > 0)

  // Skip games that previously failed (e.g. keys depleted)
  gameIds = gameIds.filter((id) => !failedChoiceGames.has(`${gamekey}:${id}`))

  // Only send games not yet chosen that have redeemable keys to choosecontent
  const unchosenIds = gameIds.filter(
    (id) =>
      !alreadyChosen.has(id) &&
      game_data[id].tpkds.some(
        (t) =>
          !t.key_type.endsWith('_keyless') && !t.redeemed_key_val && !t.is_expired && !t.sold_out
      )
  )

  // Step 1: Choose content (only for games not yet chosen)
  if (unchosenIds.length) {
    onProgress(`Choosing ${unchosenIds.length} games for ${order.human_name}`)
    await chooseContent(gamekey, parentIdentifier, unchosenIds)
  }

  // Step 2: Redeem each key
  for (const id of gameIds) {
    const game = game_data[id]
    for (const tpkd of game.tpkds) {
      if (tpkd.redeemed_key_val) {
        results.push({
          game_name: game.title,
          machine_name: tpkd.machine_name,
          key_type: tpkd.key_type,
          key: tpkd.redeemed_key_val,
          choice_title: pageData.contentChoiceOptions.title,
        })
        continue
      }

      if (tpkd.key_type.endsWith('_keyless')) continue

      if (tpkd.is_expired || tpkd.sold_out) {
        results.push({
          game_name: game.title,
          machine_name: tpkd.machine_name,
          key_type: tpkd.key_type,
          key: '',
          choice_title: pageData.contentChoiceOptions.title,
          error: tpkd.is_expired ? 'Expired' : 'Sold out',
        })
        continue
      }

      onProgress(`Redeeming: ${game.title}`)
      try {
        const key = await redeem(
          { machine_name: tpkd.machine_name, category_id: gamekey, keyindex: 0 },
          false
        )
        results.push({
          game_name: game.title,
          machine_name: tpkd.machine_name,
          key_type: tpkd.key_type,
          key,
          choice_title: pageData.contentChoiceOptions.title,
        })
      } catch (e) {
        failedChoiceGames.add(`${gamekey}:${id}`)
        results.push({
          game_name: game.title,
          machine_name: tpkd.machine_name,
          key_type: tpkd.key_type,
          key: '',
          choice_title: pageData.contentChoiceOptions.title,
          error: e instanceof RedeemError ? e.message : String(e),
        })
      }
    }
  }

  return results
}

/** Process all choice orders */
export const processAllChoices = async (
  onProgress: (msg: string) => void
): Promise<RedeemedChoiceKey[]> => {
  const orders = findChoiceOrders()
  console.log('Found', orders.length, 'choice orders')

  if (!orders.length) {
    onProgress('No choice orders found')
    return []
  }

  const allResults: RedeemedChoiceKey[] = []

  for (const order of orders) {
    try {
      const results = await processChoice(order, onProgress)
      allResults.push(...results)
    } catch (e) {
      console.error('Failed to process choice:', order.choice_url, e)
      onProgress(
        `Error processing ${order.human_name}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  return allResults
}
