import LZString from 'lz-string'

export interface Order {
  created: string
  gamekey: string
  product: {
    category: 'storefront' | 'bundle' | 'gamepage' | 'widget' | 'subscriptioncontent'
    human_name: string
  }
  tpkd_dict: {
    all_tpks: Array<{
      machine_name: string
      expiry_date?: string
      custom_instructions_html?: string
      human_name: string
      is_expired: boolean
      is_gift: boolean
      key_type: string
      keyindex: number
      redeemed_key_val?: string
      steam_app_id?: number | null
      sold_out?: boolean
      direct_redeem?: boolean
      exclusive_countries?: string[]
      disallowed_countries?: string[]
    }>
  }
}

/** Structured result from Steam Support for the Redeemed column. */
export interface RedeemedDate {
  /** "Activated" | "Purchased" — the label shown on Steam Support */
  label: 'Activated' | 'Purchased'
  /** ISO 8601 date-only string, e.g. "2023-04-15", used for sorting/filtering */
  iso: string
}

export interface Product {
  machine_name: string
  category: 'Store' | 'Bundle' | 'Other' | 'Choice'
  category_id: string
  category_human_name: string
  human_name: string
  key_type: string
  type: 'Key' | 'Gift' | ''
  redeemed_key_val: string
  is_gift: boolean
  is_expired: boolean
  owned: 'Yes' | 'No' | ''
  expiry_date?: string
  steam_app_id?: number
  created: string
  keyindex?: number
  /** Stored structured result from Steam Support */
  redeemed_date?: RedeemedDate
}

type TpkLike = Pick<
  Order['tpkd_dict']['all_tpks'][number],
  'expiry_date' | 'custom_instructions_html'
>

const TZ_ALIASES: Array<[string, string]> = [
  // names
  ['Pacific Time', 'America/Los_Angeles'],
  ['Pacific Standard Time', 'America/Los_Angeles'],
  ['Pacific Daylight Time', 'America/Los_Angeles'],
  ['Mountain Time', 'America/Denver'],
  ['Mountain Standard Time', 'America/Denver'],
  ['Mountain Daylight Time', 'America/Denver'],
  ['Central Time', 'America/Chicago'],
  ['Central Standard Time', 'America/Chicago'],
  ['Central Daylight Time', 'America/Chicago'],
  ['Eastern Time', 'America/New_York'],
  ['Eastern Standard Time', 'America/New_York'],
  ['Eastern Daylight Time', 'America/New_York'],
  // abbrevs
  ['UTC', 'UTC'],
  ['GMT', 'UTC'],
  ['Z', 'UTC'],
  ['PT', 'America/Los_Angeles'],
  ['PST', 'America/Los_Angeles'],
  ['PDT', 'America/Los_Angeles'],
  ['MT', 'America/Denver'],
  ['MST', 'America/Denver'],
  ['MDT', 'America/Denver'],
  ['CT', 'America/Chicago'],
  ['CST', 'America/Chicago'],
  ['CDT', 'America/Chicago'],
  ['ET', 'America/New_York'],
  ['EST', 'America/New_York'],
  ['EDT', 'America/New_York'],
]

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
}

const DEFAULT_HUMAN_TZ = 'America/Los_Angeles'

const pad2 = (n: number) => String(n).padStart(2, '0')

const utcDateMarker = (year: number, month: number, day: number): string =>
  new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).toISOString()

const defaultHumanExpiry = (year: number, month: number, day: number): string =>
  zonedTimeToUtc(
    { year, month, day, hour: 23, minute: 59, second: 59 },
    DEFAULT_HUMAN_TZ
  ).toISOString()

function resolveExpiryDate(tpk: TpkLike): string {
  const direct = tpk.expiry_date?.trim()
  if (direct) return normalizeHumbleDateTime(direct)

  const html = tpk.custom_instructions_html?.trim()
  if (!html) return ''

  const text =
    new DOMParser()
      .parseFromString(html, 'text/html')
      .body.textContent?.replace(/\s+/g, ' ')
      .trim() ?? ''

  return parseExpiryFromText(text)
}

function normalizeHumbleDateTime(s: string): string {
  // already has an offset or Z → keep
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s).toISOString()

  // API date-only YYYY-MM-DD → encode as a UTC midnight datetime
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (d) {
    const year = Number(d[1]),
      month = Number(d[2]),
      day = Number(d[3])
    return utcDateMarker(year, month, day)
  }

  // API datetime without an offset → treat as UTC and normalize
  const dt = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (dt) {
    const year = Number(dt[1]),
      month = Number(dt[2]),
      day = Number(dt[3])
    const hour = Number(dt[4]),
      minute = Number(dt[5]),
      second = Number(dt[6] ?? '0')
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString()
  }

  // last resort: let Date try, but normalize to ISO
  const parsed = new Date(s)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

function parseExpiryFromText(text: string): string {
  // Match: Month Day, Year [by|at Time TZ]
  const m = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:\s+(?:by|at)\s+([^.;]+))?/i
  )
  if (!m) return ''

  const [, monName, dayStr, yearStr, tailRaw] = m
  const month = MONTHS[monName.toLowerCase()]
  const day = Number(dayStr)
  const year = Number(yearStr)

  // No time provided → assume end of day in Pacific and convert to UTC
  if (!tailRaw) return defaultHumanExpiry(year, month, day)

  // Parse time + optional timezone phrase/abbr
  const t = tailRaw.trim()
  const tm = t.match(/(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)\s*(.*)?/i)

  // No time provided → assume end of day in Pacific and convert to UTC
  if (!tm) return defaultHumanExpiry(year, month, day)

  const [, hh, mm = '0', ss = '0', ampm, tzRest = ''] = tm
  let hour = Number(hh)
  const minute = Number(mm)
  const second = Number(ss)

  const isPM = ampm.toUpperCase() === 'PM'
  if (hour === 12) hour = isPM ? 12 : 0
  else if (isPM) hour += 12

  const timeZone = pickIanaTimeZone(tzRest) // defaults to Pacific if unknown/empty
  const utc = zonedTimeToUtc({ year, month, day, hour, minute, second }, timeZone)
  return utc.toISOString()
}

function pickIanaTimeZone(tzText: string): string {
  const s = tzText.replace(/[()]/g, '').trim()
  if (!s) return DEFAULT_HUMAN_TZ
  for (const [needle, iana] of TZ_ALIASES) {
    if (s.includes(needle)) return iana
  }
  return DEFAULT_HUMAN_TZ
}

// Convert "local time in timeZone" → UTC Date, DST-correct (small date-fns-tz style helper)
function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string
): Date {
  let utcGuess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  )
  const offset1 = tzOffsetMs(utcGuess, timeZone)
  utcGuess = new Date(utcGuess.getTime() - offset1)
  const offset2 = tzOffsetMs(utcGuess, timeZone)
  if (offset2 !== offset1) utcGuess = new Date(utcGuess.getTime() - offset2)
  return utcGuess
}

function tzOffsetMs(dateUtc: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    dtf
      .formatToParts(dateUtc)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  ) as Record<string, string>

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )

  return asUtc - dateUtc.getTime()
}

const getCategory = (category: Order['product']['category']): Product['category'] => {
  switch (category) {
    case 'storefront':
      return 'Store'
    case 'bundle':
      return 'Bundle'
    case 'subscriptioncontent':
      return 'Choice'
    default:
      return 'Other'
  }
}

export const loadOrders = () =>
  Object.keys(localStorage)
    .filter((key) => key.startsWith('v2|'))
    .map((key) => JSON.parse(LZString.decompressFromUTF16(localStorage.getItem(key))) as Order)
    .filter((order) => order?.tpkd_dict?.all_tpks?.length)

export const getProducts = (
  orders: Order[],
  ownedApps: number[] | null,
  steamId: string | null
): Product[] => {
  const redeemedMap = loadRedeemedDatesMap(steamId)

  return orders.flatMap((order) =>
    order.tpkd_dict.all_tpks.map((product) => {
      const expiry = resolveExpiryDate(product)
      const created = order.created ? normalizeHumbleDateTime(order.created) : ''
      const steamAppId =
        typeof product.steam_app_id === 'number' && product.steam_app_id > 0
          ? product.steam_app_id
          : undefined
      const expiryMs = expiry ? Date.parse(expiry) : NaN
      const isExpired = product.is_expired || (!Number.isNaN(expiryMs) && expiryMs < Date.now())
      const owned: Product['owned'] = steamAppId
        ? ownedApps === null
          ? ''
          : ownedApps.includes(steamAppId)
            ? 'Yes'
            : 'No'
        : ''

      return {
        machine_name: product.machine_name || '',
        category: getCategory(order.product.category),
        category_id: order.gamekey,
        category_human_name: order.product.human_name || '',
        human_name: product.human_name || product.machine_name || '',
        key_type: product.key_type || '',
        type: product.is_gift ? 'Gift' : product.redeemed_key_val ? 'Key' : '',
        redeemed_key_val: product.redeemed_key_val || '',
        is_gift: product.is_gift || false,
        is_expired: isExpired,
        expiry_date: expiry,
        steam_app_id: steamAppId,
        created,
        keyindex: product.keyindex,
        owned,
        redeemed_date:
          steamAppId && owned === 'Yes'
            ? (redeemedMap[String(steamAppId)] ?? undefined)
            : undefined,
      }
    })
  )
}

export const redeem = async (product: Product, gift = false): Promise<string> => {
  const data = await fetch('https://www.humblebundle.com/humbler/redeemkey', {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: `keytype=${product.machine_name}&key=${product.category_id}&keyindex=${product.keyindex}${gift ? '&gift=true' : ''}`,
    method: 'POST',
    mode: 'cors',
  }).then((res) => res.json())

  if (!data?.success) {
    throw new Error(data?.error_msg || data?.error || 'Failed to reveal key')
  }

  const value = gift ? data.giftkey : data.key
  if (!value) throw new Error('Failed to reveal key')

  return gift ? `https://www.humblebundle.com/gift?key=${value}` : value
}

type SteamUserData = {
  rgOwnedApps?: number[]
}

type OwnedAppsCache = {
  steamId: string
  apps: number[]
  fetchedAt: string
}

const OWNED_APPS_KEY = 'hb-key-exporter:owned-apps'
const OWNED_APPS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const STEAM_ID64_BASE = 76561197960265728n

const requestSteam = (
  url: string,
  responseType?: 'json'
): Promise<VMScriptResponseObject<unknown>> =>
  new Promise((resolve, reject) =>
    GM_xmlhttpRequest({
      url,
      method: 'GET',
      timeout: 5000,
      responseType,
      onload: (res) => {
        if (res.status !== 200) {
          reject(new Error(`HTTP ${res.status}`))
          return
        }
        resolve(res)
      },
      onerror: () => reject(new Error('Steam request failed')),
      ontimeout: () => reject(new Error('Steam request timed out')),
    })
  )

type SteamAccountIdResult = {
  steamId: string | null
  loadFailed: boolean
  loggedOut: boolean
}

export const fetchSteamAccountId = async (): Promise<SteamAccountIdResult> =>
  requestSteam(`https://store.steampowered.com/account/?_=${Date.now()}`)
    .then((res) => {
      const html = res.responseText ?? ''
      const steamId = html.match(/\bg_steamID\s*=\s*["']?(\d+)["']?/)?.[1]
      const accountId = html.match(/\bg_AccountID\s*=\s*(\d+)/)?.[1]

      if (steamId && steamId !== '0') {
        return {
          steamId,
          loadFailed: false,
          loggedOut: false,
        }
      }

      if (accountId && accountId !== '0') {
        return {
          steamId: (STEAM_ID64_BASE + BigInt(accountId)).toString(),
          loadFailed: false,
          loggedOut: false,
        }
      }

      return {
        steamId: null,
        loadFailed: true,
        loggedOut: true,
      }
    })
    .catch((err) => {
      console.warn('Failed to detect Steam account:', err)
      return {
        steamId: null,
        loadFailed: true,
        loggedOut: false,
      }
    })

const loadOwnedAppsCache = (): OwnedAppsCache | null => {
  try {
    const data = localStorage.getItem(OWNED_APPS_KEY)
    if (!data) return null

    const cache = JSON.parse(data) as OwnedAppsCache
    if (!cache.steamId || !Array.isArray(cache.apps)) return null

    const age = Date.now() - Date.parse(cache.fetchedAt)
    if (!Number.isFinite(age) || age > OWNED_APPS_CACHE_MAX_AGE_MS) return null

    return cache
  } catch {
    return null
  }
}

const saveOwnedAppsCache = (steamId: string, apps: number[]): void => {
  try {
    localStorage.setItem(
      OWNED_APPS_KEY,
      JSON.stringify({
        steamId,
        apps,
        fetchedAt: new Date().toISOString(),
      } satisfies OwnedAppsCache)
    )
  } catch (e) {
    console.error('Failed to store Steam owned apps:', e)
  }
}

const clearOwnedAppsCache = (): void => {
  localStorage.removeItem(OWNED_APPS_KEY)
}

const fetchOwnedApps = async (): Promise<number[] | null> =>
  requestSteam(`https://store.steampowered.com/dynamicstore/userdata?_=${Date.now()}`, 'json')
    .then((res) => {
      const apps = (res.response as SteamUserData | null)?.rgOwnedApps

      if (!Array.isArray(apps) || apps.length === 0) {
        console.warn('Steam owned apps unavailable or empty')
        return null
      }

      console.debug(`Steam owned apps fetched: ${apps.length}`)
      return apps
    })
    .catch((err) => {
      console.error('Failed to load Steam owned apps:', err)
      return null
    })

type FlashToastType = 'default' | 'error'

const getFlashToastDuration = (message: string): number => {
  const trimmed = message.trim()
  const words = trimmed ? trimmed.split(/\s+/).length : 0

  return Math.min(8000, Math.max(2500, 1500 + words * 250 + trimmed.length * 8))
}

let flashToastEl: HTMLElement | null = null
let flashToastTimer: number | undefined

export const showFlashToast = (message: string, type: FlashToastType = 'default'): void => {
  if (!flashToastEl) {
    flashToastEl = document.createElement('div')
    flashToastEl.id = 'hb_extractor-flash-toast'
    document.body.append(flashToastEl)
  }

  flashToastEl.textContent = message
  flashToastEl.hidden = false
  flashToastEl.className = `hb_extractor-flash-toast hb_extractor-flash-toast_${type}`
  flashToastEl.setAttribute('role', type === 'error' ? 'alert' : 'status')

  void flashToastEl.offsetWidth
  flashToastEl.classList.add('hb_extractor-flash-toast_flash')

  if (flashToastTimer !== undefined) {
    window.clearTimeout(flashToastTimer)
  }

  flashToastTimer = window.setTimeout(() => {
    if (flashToastEl) {
      flashToastEl.hidden = true
    }

    flashToastTimer = undefined
  }, getFlashToastDuration(message))
}

export const showErrorToast = (error: unknown, fallback = 'Failed'): void => {
  const message =
    error instanceof Error ? error.message || fallback : error == null ? fallback : String(error)

  showFlashToast(message, 'error')
}

type SteamNoticeLink = {
  text: string
  href: string
  onClick?: () => void
}

const ensureNoticeRoot = (): HTMLElement => {
  let root = document.getElementById('hb_extractor-notices')

  if (!root) {
    root = document.createElement('div')
    root.id = 'hb_extractor-notices'
    document.body.append(root)
  }

  return root
}

const showSteamNotice = (
  id: string,
  title: string,
  message: string | string[],
  links: SteamNoticeLink[]
): void => {
  if (document.getElementById(id)) return

  const notice = document.createElement('div')
  notice.id = id
  notice.className = 'hb_extractor-notice'

  const heading = document.createElement('strong')
  heading.textContent = title

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'hb_extractor-notice-close'
  close.title = 'Dismiss'
  close.textContent = '×'
  close.addEventListener('click', () => notice.remove())

  const body = document.createElement('p')
  const messageLines = Array.isArray(message) ? message : [message]

  for (const [index, line] of messageLines.entries()) {
    if (index > 0) body.append(document.createElement('br'))
    body.append(line)
  }

  const actions = document.createElement('div')
  actions.className = 'hb_extractor-notice-actions'

  for (const link of links) {
    const a = document.createElement('a')
    a.href = link.href
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.textContent = link.text
    if (link.onClick) a.addEventListener('click', link.onClick)
    actions.append(a)
  }

  notice.append(heading, close, body, actions)
  ensureNoticeRoot().append(notice)
}

const clearSteamNotice = (id: string): void => {
  document.getElementById(id)?.remove()
}

export const clearSteamNotices = (): void => {
  document
    .querySelectorAll<HTMLElement>('[id^="hb_extractor-notice-steam-"]')
    .forEach((notice) => notice.remove())
}

export const showSteamOwnedNotice = (usedCache: boolean, onOpen?: () => void): void => {
  showSteamNotice(
    'hb_extractor-notice-steam-owned-apps',
    'Steam games could not be loaded',
    usedCache
      ? ['Open Steam data, then refresh.', 'Using cached Steam games from a previous load.']
      : ['Open Steam data, then refresh.', 'No cached Steam games are available.'],
    [
      {
        text: 'Open Steam data',
        href: 'https://store.steampowered.com/dynamicstore/userdata/',
        onClick: onOpen,
      },
    ]
  )
}

export const clearSteamOwnedNotice = (): void => {
  clearSteamNotice('hb_extractor-notice-steam-owned-apps')
}

export const showSteamAccountNotice = (onOpen?: () => void): void => {
  showSteamNotice(
    'hb_extractor-notice-steam-account',
    'Steam account could not be checked',
    [
      'Open Steam account, then refresh.',
      'Cache cannot be cleared automatically if you changed Steam accounts.',
    ],
    [
      {
        text: 'Open Steam account',
        href: 'https://store.steampowered.com/account/',
        onClick: onOpen,
      },
    ]
  )
}

export const clearSteamAccountNotice = (): void => {
  clearSteamNotice('hb_extractor-notice-steam-account')
}

export const showSteamSupportNotice = (appId: number): void => {
  showSteamNotice(
    `hb_extractor-notice-steam-support-${appId}`,
    'Steam Support unavailable',
    'Open the Support page, then retry.',
    [
      {
        text: 'Open Support page',
        href: `https://help.steampowered.com/en/wizard/HelpWithGame?appid=${appId}`,
      },
    ]
  )
}

export const clearSteamSupportNotice = (appId: number): void => {
  clearSteamNotice(`hb_extractor-notice-steam-support-${appId}`)
}

// ---------------------------------------------------------------------------
// Redeemed date — Steam Support app-level data
// ---------------------------------------------------------------------------

const REDEEMED_DATES_LEGACY_KEY = 'hb-key-exporter:redeemed-dates'
const REDEEMED_DATES_KEY_PREFIX = 'hb-key-exporter:redeemed-dates:v2'

let redeemedDatesLegacyCacheCleared = false

const clearLegacyRedeemedDatesCache = (): void => {
  if (redeemedDatesLegacyCacheCleared) return

  redeemedDatesLegacyCacheCleared = true

  try {
    localStorage.removeItem(REDEEMED_DATES_LEGACY_KEY)

    for (const key of Object.keys(localStorage)) {
      if (/^hb-key-exporter:redeemed-dates:\d+$/.test(key)) {
        localStorage.removeItem(key)
      }
    }
  } catch (e) {
    console.error('Failed to clear legacy redeemed dates cache:', e)
  }
}

const getRedeemedDatesKey = (steamId: string): string => `${REDEEMED_DATES_KEY_PREFIX}:${steamId}`

const loadRedeemedDatesMap = (steamId: string | null): Record<string, RedeemedDate> => {
  clearLegacyRedeemedDatesCache()

  if (!steamId) return {}

  try {
    const data = localStorage.getItem(getRedeemedDatesKey(steamId))
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
}

export const setRedeemedDate = (
  appId: number,
  entry: RedeemedDate,
  steamId: string | null
): void => {
  clearLegacyRedeemedDatesCache()

  if (!steamId) return

  try {
    const key = getRedeemedDatesKey(steamId)
    const data = localStorage.getItem(key)
    const map: Record<string, RedeemedDate> = data ? JSON.parse(data) : {}
    map[String(appId)] = entry
    localStorage.setItem(key, JSON.stringify(map))
  } catch (e) {
    console.error('Failed to store redeemed date:', e)
  }
}

/**
 * Parse a human-readable Steam date string like "4 Apr, 2023" → "YYYY-MM-DD".
 * Falls back to the original string (untouched) if parsing fails, so the
 * caller can still surface something useful in the display label.
 */
function parseSteamDateToIso(raw: string): string {
  const m = raw.trim().match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,\s*(\d{4}))?\b/)
  if (!m) return ''

  const month = MONTHS[m[1].toLowerCase()]
  const day = Number(m[2])
  const year = m[3] ? Number(m[3]) : new Date().getFullYear()

  if (!month || !day || day < 1 || day > 31) return ''

  return `${year}-${pad2(month)}-${pad2(day)}`
}

export const fetchRedeemedDate = async (appId: number): Promise<RedeemedDate | null> => {
  const html = await new Promise<string>((resolve, reject) => {
    GM_xmlhttpRequest({
      url: `https://help.steampowered.com/en/wizard/HelpWithGame?appid=${appId}`,
      method: 'GET',
      timeout: 10000,
      onload: (res) => {
        if (res.status === 401 || res.status === 403) {
          reject(
            new Error(
              `Steam login required (HTTP ${res.status}). ` +
                `Open the Steam Support page for this app, log in, then try again.`
            )
          )
          return
        }
        if (res.status !== 200) {
          reject(
            new Error(
              `Steam Support returned HTTP ${res.status}. ` +
                `This may be a missing @connect permission, a network issue, ` +
                `or Steam blocking the request. Check the browser console.`
            )
          )
          return
        }
        resolve(res.responseText)
      },
      onerror: () =>
        reject(
          new Error(
            `Request failed. Possible causes: the @connect help.steampowered.com permission ` +
              `has not been granted yet (approve it in your userscript manager), ` +
              `a network/CORS error, or Steam is temporarily unavailable.`
          )
        ),
      ontimeout: () => reject(new Error('Request timed out after 10 s')),
    })
  })

  const doc = new DOMParser().parseFromString(html, 'text/html')

  const accountDetails = doc.querySelector('.account_details')
  if (accountDetails) {
    const divs = accountDetails.querySelectorAll('div')
    for (const div of divs) {
      const label = div.querySelector('.help_highlight_text')
      const labelText = label?.textContent?.trim() ?? ''
      if (labelText === 'Activated:' || labelText === 'Purchased:') {
        const value = div.querySelector('.help_lowlight_text')
        const raw = value?.textContent?.trim()
        if (raw) {
          const iso = parseSteamDateToIso(raw)
          if (iso) {
            return {
              label: labelText === 'Activated:' ? 'Activated' : 'Purchased',
              iso,
            }
          }
        }
      }
    }
  }

  return null
}

export type OwnedAppsResult = {
  apps: number[] | null
  liveLoadFailed: boolean
  usedCache: boolean
  accountLoadFailed: boolean
  steamId: string | null
}

let ownedApps: number[] | null = null
let ownedAppsLoaded = false
let ownedAppsLiveLoadFailed = false
let ownedAppsUsedCache = false
let steamAccountLoadFailed = false
let currentSteamId: string | null = null

export const loadOwnedApps = async (refresh: boolean = false): Promise<OwnedAppsResult> => {
  if (!refresh && ownedAppsLoaded) {
    return {
      apps: ownedApps,
      liveLoadFailed: ownedAppsLiveLoadFailed,
      usedCache: ownedAppsUsedCache,
      accountLoadFailed: steamAccountLoadFailed,
      steamId: currentSteamId,
    }
  }

  let cache = loadOwnedAppsCache()
  const steamAccount = await fetchSteamAccountId()
  const steamId = steamAccount.steamId
  console.debug('Steam account ID:', steamAccount ?? 'unavailable')
  console.debug('Steam steam ID:', steamId ?? 'unavailable')
  steamAccountLoadFailed = steamAccount.loadFailed
  currentSteamId = steamId

  if (steamId && cache?.steamId && steamId !== cache.steamId) {
    clearOwnedAppsCache()
    cache = null
  }

  const fetched = await fetchOwnedApps()

  if (fetched) {
    ownedApps = fetched
    ownedAppsLoaded = true
    ownedAppsLiveLoadFailed = false
    ownedAppsUsedCache = false

    if (steamId) {
      saveOwnedAppsCache(steamId, fetched)
    }

    return {
      apps: ownedApps,
      liveLoadFailed: false,
      usedCache: false,
      accountLoadFailed: steamAccountLoadFailed,
      steamId,
    }
  }

  ownedAppsLiveLoadFailed = true

  if (
    !refresh &&
    cache &&
    (steamId === cache.steamId || (!steamId && steamAccount.loadFailed && !steamAccount.loggedOut))
  ) {
    ownedApps = cache.apps
    ownedAppsLoaded = true
    ownedAppsUsedCache = true
    console.debug(
      `Steam owned apps returned from cache after live load failed: ${ownedApps.length}`
    )
    return {
      apps: ownedApps,
      liveLoadFailed: true,
      usedCache: true,
      accountLoadFailed: steamAccountLoadFailed,
      steamId,
    }
  }

  ownedApps = null
  ownedAppsLoaded = true
  ownedAppsUsedCache = false
  return {
    apps: ownedApps,
    liveLoadFailed: true,
    usedCache: false,
    accountLoadFailed: steamAccountLoadFailed,
    steamId,
  }
}
