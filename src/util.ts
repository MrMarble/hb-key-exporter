import LZString from 'lz-string'
import { hasRedeemedKeyValue, type RedeemedKeyValue } from './redeemed-key'
import { normalizeCountryCodes, type RegionRestrictions } from './region'

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
      redeemed_key_val?: RedeemedKeyValue
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

export interface Product extends RegionRestrictions {
  machine_name: string
  category: 'Store' | 'Bundle' | 'Other' | 'Choice'
  category_id: string
  category_human_name: string
  human_name: string
  key_type: string
  direct_redeem: boolean
  type: 'Key' | 'Gift' | ''
  redeemed_key_val: RedeemedKeyValue | ''
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

/**
 * Number of cached orders still arriving from Humble.
 *
 * Humble streams orders into localStorage progressively after the keys page
 * loads, so this is polled to tell whether that background fill is still
 * running. It counts raw `v2|` entries without decompressing them, which keeps
 * it cheap enough for an interval, but means it includes orders that carry no
 * keys. Use it to detect change, not to report a total — `loadOrders()` is the
 * number that matches the table.
 */
export const countCachedOrders = () =>
  Object.keys(localStorage).filter((key) => key.startsWith('v2|')).length

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

      const redeemedKey = hasRedeemedKeyValue(product.redeemed_key_val)
        ? product.redeemed_key_val
        : ''

      return {
        machine_name: product.machine_name || '',
        category: getCategory(order.product.category),
        category_id: order.gamekey,
        category_human_name: order.product.human_name || '',
        human_name: product.human_name || product.machine_name || '',
        key_type: product.key_type || '',
        direct_redeem: product.direct_redeem || false,
        type: product.is_gift ? 'Gift' : redeemedKey ? 'Key' : '',
        redeemed_key_val: redeemedKey,
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
        exclusive_countries: normalizeCountryCodes(product.exclusive_countries),
        disallowed_countries: normalizeCountryCodes(product.disallowed_countries),
      }
    })
  )
}

type RedeemResponse = {
  success?: boolean
  error_msg?: string
  error?: string
  redeem_retryable?: boolean
  giftkey?: unknown
  key?: unknown
}

/**
 * A failed reveal. `permanent` is true when Humble explicitly reported the
 * failure as non-retryable (`redeem_retryable: false`), which is how expired
 * keys are signalled. Retrying those always fails the same way, so callers can
 * use this to skip them instead of re-requesting on every bulk reveal.
 */
export class RedeemError extends Error {
  readonly permanent: boolean

  constructor(message: string, permanent: boolean) {
    super(message)
    this.name = 'RedeemError'
    this.permanent = permanent
  }
}

export const redeem = async (product: Product, gift = false): Promise<RedeemedKeyValue> => {
  if (product.keyindex == null) throw new Error('Missing Humble key index')

  const body = new URLSearchParams({
    keytype: product.machine_name,
    key: product.category_id,
    keyindex: String(product.keyindex),
  })

  if (gift) body.set('gift', 'true')

  const response = await fetch('https://www.humblebundle.com/humbler/redeemkey', {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body,
    method: 'POST',
    mode: 'cors',
  })
  let data: RedeemResponse

  try {
    data = (await response.json()) as RedeemResponse
  } catch {
    throw new Error(`Humble returned an invalid response (HTTP ${response.status})`)
  }

  if (!response.ok || !data.success) {
    throw new RedeemError(
      data.error_msg || data.error || `Failed to reveal key (HTTP ${response.status})`,
      data.redeem_retryable === false
    )
  }

  const value = gift ? data.giftkey : data.key
  if (!hasRedeemedKeyValue(value)) throw new Error('Failed to reveal key')

  if (!gift) return value
  if (typeof value !== 'string') throw new Error('Humble returned an invalid gift key')

  return `https://www.humblebundle.com/gift?key=${value}`
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

type FlashToastType = 'default' | 'warning' | 'error'

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
  flashToastEl.setAttribute('role', type === 'default' ? 'status' : 'alert')

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

export function copyToClipboard(text: string): boolean {
  try {
    GM_setClipboard(text, 'text/plain')
    return true
  } catch (error) {
    showErrorToast(error, 'Failed to copy to clipboard')
    return false
  }
}

type SteamNoticeLink = {
  text: string
  href: string
  onClick?: () => void
}

const STEAM_NOTICE_ID_PREFIX = 'hb_extractor-notice-steam-'
const MAX_NOTICES = 5
const NOTICE_EXIT_DURATION = 180
const NOTICE_REFLOW_DURATION = 180
const NOTICE_ENTER_DURATION = 240
const NOTICE_AUTO_DISMISS_DURATION = 10_000
const NOTICE_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'
const pendingSteamNotices = new Set<HTMLElement>()
const noticeDismissals = new WeakMap<HTMLElement, Promise<void>>()
const noticeTimers = new WeakMap<HTMLElement, number>()
const autoDismissNotices = new WeakSet<HTMLElement>()
let noticeSequence = 0
let noticeRenderQueue = Promise.resolve()

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const animateNoticeIn = (notice: HTMLElement): void => {
  if (prefersReducedMotion()) return

  notice.animate(
    [
      { opacity: 0, transform: 'translate3d(6px, 14px, 0)' },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ],
    { duration: NOTICE_ENTER_DURATION, easing: NOTICE_EASING }
  )
}

const clearNoticeTimer = (notice: HTMLElement): void => {
  const timer = noticeTimers.get(notice)
  if (timer === undefined) return

  window.clearTimeout(timer)
  noticeTimers.delete(notice)
}

const dismissNotice = (notice: HTMLElement): Promise<void> => {
  const activeDismissal = noticeDismissals.get(notice)
  if (activeDismissal) return activeDismissal

  clearNoticeTimer(notice)

  const dismissal = (async () => {
    const root = notice.parentElement
    if (!(root instanceof HTMLElement) || !notice.isConnected || prefersReducedMotion()) {
      notice.remove()
      return
    }

    const siblings = Array.from(root.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child !== notice
    )
    const previousTops = new Map(
      siblings.map((sibling) => [sibling, sibling.getBoundingClientRect().top])
    )
    const rootRect = root.getBoundingClientRect()
    const noticeRect = notice.getBoundingClientRect()
    const previousRootWidth = root.style.width

    // Keep the container stable while the departing notice leaves normal flow.
    root.style.width = `${rootRect.width}px`
    Object.assign(notice.style, {
      position: 'absolute',
      top: `${noticeRect.top - rootRect.top}px`,
      left: `${noticeRect.left - rootRect.left}px`,
      width: `${noticeRect.width}px`,
      boxSizing: 'border-box',
    })

    const animations = siblings.flatMap((sibling) => {
      const deltaY = previousTops.get(sibling)! - sibling.getBoundingClientRect().top
      if (Math.abs(deltaY) < 0.5) return []

      return [
        sibling.animate([{ top: `${deltaY}px` }, { top: '0px' }], {
          duration: NOTICE_REFLOW_DURATION,
          easing: NOTICE_EASING,
        }),
      ]
    })

    animations.push(
      notice.animate(
        [
          { opacity: 1, transform: 'translate3d(0, 0, 0)' },
          { opacity: 0, transform: 'translate3d(6px, -10px, 0)' },
        ],
        { duration: NOTICE_EXIT_DURATION, easing: 'ease-in', fill: 'forwards' }
      )
    )

    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
    notice.remove()
    root.style.width = previousRootWidth
  })()

  noticeDismissals.set(notice, dismissal)
  return dismissal
}

const scheduleNoticeDismissal = (notice: HTMLElement, duration: number): void => {
  const startTimer = () => {
    clearNoticeTimer(notice)
    noticeTimers.set(
      notice,
      window.setTimeout(() => void dismissNotice(notice), duration)
    )
  }

  notice.addEventListener('mouseenter', () => clearNoticeTimer(notice))
  notice.addEventListener('mouseleave', startTimer)
  notice.addEventListener('focusin', () => clearNoticeTimer(notice))
  notice.addEventListener('focusout', startTimer)
  startTimer()
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

type SteamNoticeOptions = {
  allowDuplicates?: boolean
  autoDismissMs?: number
}

const hasSteamNotice = (id: string): boolean => {
  if (Array.from(pendingSteamNotices).some((notice) => notice.dataset.noticeId === id)) {
    return true
  }

  const root = document.getElementById('hb_extractor-notices')
  return Array.from(root?.children ?? []).some(
    (child) => child instanceof HTMLElement && child.dataset.noticeId === id
  )
}

const showSteamNotice = (
  id: string,
  title: string,
  message: string | string[],
  links: SteamNoticeLink[],
  options: SteamNoticeOptions = {}
): void => {
  if (!options.allowDuplicates && hasSteamNotice(id)) return

  const notice = document.createElement('div')
  notice.id = `${id}-${++noticeSequence}`
  notice.dataset.noticeId = id
  notice.className = 'hb_extractor-notice'

  const heading = document.createElement('strong')
  heading.textContent = title

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'hb_extractor-notice-close'
  close.title = 'Dismiss'
  close.textContent = '×'
  close.addEventListener('click', () => void dismissNotice(notice))

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
  pendingSteamNotices.add(notice)
  if (options.autoDismissMs !== undefined) autoDismissNotices.add(notice)

  noticeRenderQueue = noticeRenderQueue.then(async () => {
    if (!pendingSteamNotices.has(notice)) return

    const root = ensureNoticeRoot()

    while (root.childElementCount >= MAX_NOTICES) {
      const oldestNotice =
        Array.from(root.children).find(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && autoDismissNotices.has(child)
        ) ?? root.firstElementChild
      if (!(oldestNotice instanceof HTMLElement)) break
      await dismissNotice(oldestNotice)
      if (!pendingSteamNotices.has(notice)) return
    }

    pendingSteamNotices.delete(notice)
    root.append(notice)
    animateNoticeIn(notice)

    if (options.autoDismissMs !== undefined) {
      scheduleNoticeDismissal(notice, options.autoDismissMs)
    }
  })
}

const clearSteamNotice = (id: string): void => {
  for (const notice of pendingSteamNotices) {
    if (notice.dataset.noticeId === id) pendingSteamNotices.delete(notice)
  }

  const root = document.getElementById('hb_extractor-notices')
  if (!root) return

  for (const child of Array.from(root.children)) {
    if (child instanceof HTMLElement && child.dataset.noticeId === id) {
      clearNoticeTimer(child)
      child.remove()
    }
  }
}

export const clearSteamNotices = (): void => {
  for (const notice of pendingSteamNotices) {
    if (notice.dataset.noticeId?.startsWith(STEAM_NOTICE_ID_PREFIX)) {
      pendingSteamNotices.delete(notice)
    }
  }

  const root = document.getElementById('hb_extractor-notices')
  if (!root) return

  for (const child of Array.from(root.children)) {
    if (
      child instanceof HTMLElement &&
      child.dataset.noticeId?.startsWith(STEAM_NOTICE_ID_PREFIX)
    ) {
      clearNoticeTimer(child)
      child.remove()
    }
  }
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
    ],
    { allowDuplicates: true, autoDismissMs: NOTICE_AUTO_DISMISS_DURATION }
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
