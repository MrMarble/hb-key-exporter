import { createResource, createSignal, onCleanup, onMount, Show } from 'solid-js'
import {
  clearSteamAccountNotice,
  clearSteamNotices,
  clearSteamOwnedNotice,
  countCachedOrders,
  fetchSteamAccountId,
  getProducts,
  loadOrders,
  loadOwnedApps,
  showErrorToast,
  showSteamAccountNotice,
  showSteamOwnedNotice,
  type Product,
} from './util'

import { Table } from './components/Table'
import { captureTableState, type TableState } from './table-state'
import { Refresh } from './components/Refresh'
import { Actions } from './components/Actions'
import { KeylessRedemptionConfirmation } from './components/BulkRevealDialogs'
import type { Api } from 'datatables.net-dt'

type PendingKeylessRedemption = {
  product: Product
  gift: boolean
  resolve: (confirmed: boolean) => void
}

const ORDER_POLL_INTERVAL_MS = 500
/** How long the order count must hold steady before loading counts as done. */
const ORDER_SETTLE_DELAY_MS = 3000

export function App() {
  const [open, setOpen] = createSignal(false)
  const [pendingSteamOwnedNotice, setPendingSteamOwnedNotice] = createSignal(false)
  const [pendingSteamOwnedNoticeUsedCache, setPendingSteamOwnedNoticeUsedCache] =
    createSignal(false)
  const [pendingSteamAccountNotice, setPendingSteamAccountNotice] = createSignal(false)
  const [steamId, setSteamId] = createSignal<string | null>(null)
  const [pendingTableState, setPendingTableState] = createSignal<TableState | null>(null)
  const [dt, setDt] = createSignal<Api<Product> | null>(null)

  const [pendingKeylessRedemption, setPendingKeylessRedemption] =
    createSignal<PendingKeylessRedemption | null>(null)
  const [keylessRedemptionProcessing, setKeylessRedemptionProcessing] = createSignal(false)

  const initialCachedOrderCount = countCachedOrders()
  // Raw localStorage entries, used only to show that orders are still arriving.
  const [cachedOrderCount, setCachedOrderCount] = createSignal(initialCachedOrderCount)
  // Orders that actually carry keys, i.e. the ones behind the table.
  const [orderCount, setOrderCount] = createSignal<number | null>(null)
  const [ordersSettled, setOrdersSettled] = createSignal(false)

  let checkSteamAccountTimer: number | undefined
  let orderPollTimer: number | undefined
  let refreshInFlight: Promise<void> | null = null
  const pendingSteamPageRefreshes = new Set<Promise<void>>()

  const refreshAfterSteamPageOpen = () => {
    const pendingRefresh = new Promise<void>((resolve) => {
      window.setTimeout(() => {
        void Promise.resolve()
          .then(refreshProducts)
          .catch((error) => showErrorToast(error, 'Failed to refresh products'))
          .finally(() => {
            pendingSteamPageRefreshes.delete(pendingRefresh)
            resolve()
          })
      }, 3000)
    })
    pendingSteamPageRefreshes.add(pendingRefresh)
  }

  const checkSteamAccountChanged = () => {
    if (!open()) return

    window.clearTimeout(checkSteamAccountTimer)

    checkSteamAccountTimer = window.setTimeout(async () => {
      const account = await fetchSteamAccountId()

      if (
        (!account.loadFailed && account.steamId !== steamId()) ||
        (account.loggedOut && steamId())
      ) {
        clearSteamNotices()
        refreshProducts()
      }
    }, 750)
  }

  const showOwnedNotice = (usedCache: boolean) => {
    showSteamOwnedNotice(usedCache, refreshAfterSteamPageOpen)
  }

  const showAccountNotice = () => {
    showSteamAccountNotice(refreshAfterSteamPageOpen)
  }

  const toggleOpen = () => {
    const next = !open()
    setOpen(next)

    if (next && (pendingSteamAccountNotice() || pendingSteamOwnedNotice())) {
      refreshProducts()
      return
    }

    if (next) {
      checkSteamAccountChanged()
    }

    if (next && pendingSteamAccountNotice()) {
      setPendingSteamAccountNotice(false)
      showAccountNotice()
    }

    if (next && pendingSteamOwnedNotice()) {
      setPendingSteamOwnedNotice(false)
      showOwnedNotice(pendingSteamOwnedNoticeUsedCache())
    }
  }

  const [products, { refetch: refetchProducts }] = createResource<Product[], boolean>(
    async (_, info) => {
      console.debug('Loading products...')
      const orders = loadOrders()
      const owned = await loadOwnedApps(info.refetching)
      setSteamId(owned.steamId)

      if (owned.accountLoadFailed) {
        if (open()) {
          showAccountNotice()
        } else {
          setPendingSteamAccountNotice(true)
        }
      } else {
        setPendingSteamAccountNotice(false)
        clearSteamAccountNotice()
      }

      if (owned.liveLoadFailed) {
        if (open()) {
          showOwnedNotice(owned.usedCache)
        } else {
          setPendingSteamOwnedNotice(true)
          setPendingSteamOwnedNoticeUsedCache(owned.usedCache)
        }
      } else {
        setPendingSteamOwnedNotice(false)
        setPendingSteamOwnedNoticeUsedCache(false)
        clearSteamOwnedNotice()
      }

      setOrderCount(orders.length)

      console.debug(
        'Loaded',
        orders.length,
        'orders,',
        owned.apps?.length ?? 'unavailable',
        'owned apps'
      )
      return getProducts(orders, owned.apps, owned.steamId)
    }
  )

  const refreshProducts = (): Promise<void> => {
    if (refreshInFlight) return refreshInFlight

    const table = dt()
    if (table) setPendingTableState(captureTableState(table))

    refreshInFlight = (async () => {
      try {
        await refetchProducts()
      } catch (error) {
        setPendingTableState(null)
        showErrorToast(error, 'Failed to refresh products')
      } finally {
        refreshInFlight = null
      }
    })()

    return refreshInFlight
  }

  const waitForProductRefresh = async (): Promise<void> => {
    while (refreshInFlight || pendingSteamPageRefreshes.size) {
      const pending = [...pendingSteamPageRefreshes]
      if (refreshInFlight) pending.push(refreshInFlight)
      await Promise.all(pending)
    }
  }

  const requestKeylessConfirmation = (product: Product, gift: boolean): Promise<boolean> => {
    if (pendingKeylessRedemption()) return Promise.resolve(false)

    setKeylessRedemptionProcessing(false)
    return new Promise((resolve) => setPendingKeylessRedemption({ product, gift, resolve }))
  }

  const cancelKeylessRedemption = (): void => {
    if (keylessRedemptionProcessing()) return

    const pending = pendingKeylessRedemption()
    if (!pending) return

    setPendingKeylessRedemption(null)
    pending.resolve(false)
  }

  const confirmKeylessRedemption = (): void => {
    const pending = pendingKeylessRedemption()
    if (!pending || keylessRedemptionProcessing()) return

    setKeylessRedemptionProcessing(true)
    pending.resolve(true)
  }

  const finishKeylessRedemption = (): void => {
    setPendingKeylessRedemption(null)
    setKeylessRedemptionProcessing(false)
  }

  onMount(() => {
    const checkSteamAccountChangedAfterVisibility = () => {
      if (!document.hidden) checkSteamAccountChanged()
    }

    window.addEventListener('focus', checkSteamAccountChanged)
    document.addEventListener('visibilitychange', checkSteamAccountChangedAfterVisibility)

    // Humble keeps writing orders into localStorage for a while after page
    // load. Poll until the count stops moving, then refresh once so the table
    // reflects every order instead of whatever happened to be cached on mount.
    let lastCount = countCachedOrders()
    let lastChangeAt = Date.now()

    orderPollTimer = window.setInterval(() => {
      const count = countCachedOrders()
      setCachedOrderCount(count)

      if (count !== lastCount) {
        lastCount = count
        lastChangeAt = Date.now()
        return
      }

      if (Date.now() - lastChangeAt < ORDER_SETTLE_DELAY_MS) return

      window.clearInterval(orderPollTimer)
      orderPollTimer = undefined
      setOrdersSettled(true)

      // Only worth refetching if orders showed up after the initial load.
      if (count > initialCachedOrderCount) void refreshProducts()
    }, ORDER_POLL_INTERVAL_MS)

    onCleanup(() => {
      pendingKeylessRedemption()?.resolve(false)
      window.clearTimeout(checkSteamAccountTimer)
      window.clearInterval(orderPollTimer)
      window.removeEventListener('focus', checkSteamAccountChanged)
      document.removeEventListener('visibilitychange', checkSteamAccountChangedAfterVisibility)
    })
  })

  console.debug('App loaded')

  return (
    <>
      <button
        type="button"
        class="js-big-button js-nav-button"
        onClick={toggleOpen}
        style={{ 'margin-bottom': '10px' }}
      >
        <i class="hb hb-key"></i> Advanced Exporter
      </button>

      <div classList={{ hidden: !open() }}>
        <div
          style={{
            display: 'flex',
            'justify-content': 'end',
            'align-items': 'center',
            gap: '10px',
          }}
        >
          <span>
            {ordersSettled() && orderCount() !== null
              ? `${orderCount()} order${orderCount() === 1 ? '' : 's'} loaded`
              : `Loading orders… (${cachedOrderCount()} cached)`}
          </span>
          <Refresh refresh={refreshProducts} />
        </div>
        <Show when={products()} keyed fallback={<p>Loading products...</p>}>
          {(loadedProducts) => (
            <Table
              products={loadedProducts}
              latestProducts={products}
              currentDt={dt}
              steamId={steamId}
              setDt={setDt}
              waitForProductRefresh={waitForProductRefresh}
              requestKeylessConfirmation={requestKeylessConfirmation}
              finishKeylessRedemption={finishKeylessRedemption}
              initialState={pendingTableState()}
              onStateRestored={() => setPendingTableState(null)}
            />
          )}
        </Show>
        <Show when={pendingKeylessRedemption()} keyed>
          {(pending) => (
            <KeylessRedemptionConfirmation
              product={pending.product}
              gift={pending.gift}
              processing={keylessRedemptionProcessing}
              onCancel={cancelKeylessRedemption}
              onConfirm={confirmKeylessRedemption}
            />
          )}
        </Show>
        <Actions dt={dt} products={products} waitForProductRefresh={waitForProductRefresh} />
      </div>
    </>
  )
}
