import { createResource, createSignal, onCleanup, onMount, Show } from 'solid-js'
import {
  clearSteamAccountNotice,
  clearSteamNotices,
  clearSteamOwnedNotice,
  fetchSteamAccountId,
  getProducts,
  loadOrders,
  loadOwnedApps,
  showSteamAccountNotice,
  showSteamOwnedNotice,
  type Product,
} from './util'

import { Table } from './components/Table'
import { Refresh } from './components/Refresh'
import { Actions } from './components/Actions'
import type { Api } from 'datatables.net-dt'

export function App() {
  const [open, setOpen] = createSignal(false)
  const [pendingSteamOwnedNotice, setPendingSteamOwnedNotice] = createSignal(false)
  const [pendingSteamOwnedNoticeUsedCache, setPendingSteamOwnedNoticeUsedCache] =
    createSignal(false)
  const [pendingSteamAccountNotice, setPendingSteamAccountNotice] = createSignal(false)
  const [steamId, setSteamId] = createSignal<string | null>(null)

  let checkSteamAccountTimer: number | undefined

  const refreshAfterSteamPageOpen = () => {
    window.setTimeout(() => refreshProducts(), 3000)
  }

  const checkSteamAccountChanged = () => {
    if (!open()) return

    window.clearTimeout(checkSteamAccountTimer)

    checkSteamAccountTimer = window.setTimeout(async () => {
      const account = await fetchSteamAccountId()

      if (!account.loadFailed && account.steamId !== steamId()) {
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

  const [products, { refetch: refreshProducts }] = createResource<Product[], boolean>(
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

  const [dt, setDt] = createSignal<Api<Product> | null>(null)

  onMount(() => {
    const checkSteamAccountChangedAfterVisibility = () => {
      if (!document.hidden) checkSteamAccountChanged()
    }

    window.addEventListener('focus', checkSteamAccountChanged)
    document.addEventListener('visibilitychange', checkSteamAccountChangedAfterVisibility)

    onCleanup(() => {
      window.clearTimeout(checkSteamAccountTimer)
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
        <div style={{ display: 'flex', 'justify-content': 'end', 'align-items': 'center' }}>
          <Refresh refresh={refreshProducts} />
        </div>
        <Show when={products()} keyed fallback={<p>Loading products...</p>}>
          {(loadedProducts) => <Table products={loadedProducts} steamId={steamId} setDt={setDt} />}
        </Show>
        <Actions dt={dt} />
      </div>
    </>
  )
}
