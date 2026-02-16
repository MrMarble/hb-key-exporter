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
      steam_app_id?: number
      sold_out?: boolean
      direct_redeem?: boolean
      exclusive_countries?: string[]
      disallowed_countries?: string[]
    }>
  }
}

export interface Product {
  machine_name: string
  category: 'Store' | 'Bundle' | 'Other' | 'Choice'
  category_id: string
  category_human_name: string
  human_name: string
  key_type: string
  type: 'Key' | 'Gift' | '-'
  redeemed_key_val: string
  is_gift: boolean
  is_expired: boolean
  owned: 'Yes' | 'No' | '-'
  expiry_date?: string
  steam_app_id?: number
  created: string
  keyindex?: number
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
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

const DEFAULT_TZ = 'America/Los_Angeles'

const pad2 = (n: number) => String(n).padStart(2, '0')

function resolveExpiryDate(tpk: TpkLike): string {
  const direct = tpk.expiry_date?.trim()
  if (direct) return normalizeHumbleExpiry(direct)

  const html = tpk.custom_instructions_html?.trim()
  if (!html) return ''

  const text =
    new DOMParser()
      .parseFromString(html, 'text/html')
      .body.textContent?.replace(/\s+/g, ' ')
      .trim() ?? ''

  return parseExpiryFromText(text)
}

function normalizeHumbleExpiry(s: string): string {
  // already has an offset or Z → keep
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s).toISOString()

  // date-only YYYY-MM-DD → interpret as PT end-of-day, convert to UTC ISO
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (d) {
    const year = Number(d[1]),
      month = Number(d[2]),
      day = Number(d[3])
    return zonedTimeToUtc(
      { year, month, day, hour: 23, minute: 59, second: 59 },
      DEFAULT_TZ
    ).toISOString()
  }

  // "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DD HH:mm:ss" → interpret as PT, convert
  const dt = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (dt) {
    const year = Number(dt[1]),
      month = Number(dt[2]),
      day = Number(dt[3])
    const hour = Number(dt[4]),
      minute = Number(dt[5]),
      second = Number(dt[6] ?? '0')
    return zonedTimeToUtc({ year, month, day, hour, minute, second }, DEFAULT_TZ).toISOString()
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

  // No time provided → return ISO date only (don’t invent precision)
  if (!tailRaw) return `${year}-${pad2(month)}-${pad2(day)}`

  // Parse time + optional timezone phrase/abbr
  const t = tailRaw.trim()
  const tm = t.match(/(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)\s*(.*)?/i)
  if (!tm) return `${year}-${pad2(month)}-${pad2(day)}`

  const [, hh, mm = '0', ss = '0', ampm, tzRest = ''] = tm
  let hour = Number(hh)
  const minute = Number(mm)
  const second = Number(ss)

  const isPM = ampm.toUpperCase() === 'PM'
  if (hour === 12) hour = isPM ? 12 : 0
  else if (isPM) hour += 12

  const timeZone = pickIanaTimeZone(tzRest) // defaults to UTC if unknown/empty
  const utc = zonedTimeToUtc({ year, month, day, hour, minute, second }, timeZone)
  return utc.toISOString()
}

function pickIanaTimeZone(tzText: string): string {
  const s = tzText.replace(/[()]/g, '').trim()
  if (!s) return DEFAULT_TZ
  for (const [needle, iana] of TZ_ALIASES) {
    if (s.includes(needle)) return iana
  }
  return DEFAULT_TZ
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

export const getProducts = (orders: Order[], ownedApps: number[]): Product[] =>
  orders.flatMap((order) =>
    order.tpkd_dict.all_tpks.map((product) => {
      const expiry = resolveExpiryDate(product)
      const expiryMs = expiry ? Date.parse(expiry) : NaN
      const isExpired = product.is_expired || (!Number.isNaN(expiryMs) && expiryMs < Date.now())

      return {
        machine_name: product.machine_name || '-',
        category: getCategory(order.product.category),
        category_id: order.gamekey,
        category_human_name: order.product.human_name || '-',
        human_name: product.human_name || product.machine_name || '-',
        key_type: product.key_type || '-',
        type: product.is_gift ? 'Gift' : product.redeemed_key_val ? 'Key' : '-',
        redeemed_key_val: product.redeemed_key_val || '',
        is_gift: product.is_gift || false,
        is_expired: isExpired,
        expiry_date: expiry,
        steam_app_id: product.steam_app_id,
        created: order.created || '',
        keyindex: product.keyindex,
        owned: product.steam_app_id
          ? ownedApps.includes(product.steam_app_id)
            ? 'Yes'
            : 'No'
          : '-',
      }
    })
  )

export const redeem = async (
  product: Pick<Product, 'machine_name' | 'category_id' | 'keyindex'>,
  gift: boolean = false
) => {
  console.log('Redeeming product:', product.machine_name)
  const data = await fetch('https://www.humblebundle.com/humbler/redeemkey', {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: `keytype=${product.machine_name}&key=${product.category_id}&keyindex=${product.keyindex}${gift ? '&gift=true' : ''}`,
    method: 'POST',
    mode: 'cors',
  }).then((res) => res.json())
  console.log('Redeem response:', data)

  return gift ? `https://www.humblebundle.com/gift?key=${data.giftkey}` : (data.key as string)
}

const fetchOwnedApps = async (): Promise<Array<number>> =>
  new Promise<VMScriptResponseObject<{ rgOwnedPackages: number[]; rgOwnedApps: number[] }>>(
    (resolve) =>
      GM_xmlhttpRequest({
        url: 'https://store.steampowered.com/dynamicstore/userdata',
        method: 'GET',
        timeout: 5000,
        responseType: 'json',
        onload: resolve,
      })
  )
    .then((data) =>
      (data?.response?.rgOwnedPackages || []).concat(data?.response?.rgOwnedApps || [])
    )
    .catch(() => [])

let ownedApps: Array<number> = []
export const loadOwnedApps = async (refresh: boolean = false) => {
  if (!refresh && ownedApps.length) {
    console.debug('Using cached owned apps')
    return ownedApps
  }
  console.debug('Fetching owned apps from Steam')
  // Try to load from localStorage first
  const storedApps = localStorage.getItem('hb-key-exporter-ownedApps')
  if (storedApps) {
    return JSON.parse(LZString.decompressFromUTF16(storedApps)) as Array<number>
  }
  // If not found, fetch from Steam
  ownedApps = await fetchOwnedApps()
  if (!ownedApps) {
    return []
  }
  // Store the result in localStorage for future use
  localStorage.setItem(
    'hb-key-exporter-ownedApps',
    LZString.compressToUTF16(JSON.stringify(ownedApps))
  )
  return ownedApps
}
