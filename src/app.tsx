import { createResource, createSignal, Show } from 'solid-js'
import { getProducts, loadOrders, loadOwnedApps, type Product } from './util'

import { Table } from './components/Table'
import { Refresh } from './components/Refresh'
import { Actions } from './components/Actions'
import type { Api } from 'datatables.net-dt'

export function App() {
  const [open, setOpen] = createSignal(false)
  const [useLocalTime, setUseLocalTime] = createSignal(false)

  const [products, { refetch: refresh }] = createResource<Product[], boolean>(async (_, info) => {
    console.debug('Loading products...')
    const orders = loadOrders()
    const owned = await loadOwnedApps(info.refetching)

    console.debug('Loaded', orders.length, 'orders,', owned.length, 'owned apps')
    return getProducts(orders, owned)
  })

  const [dt, setDt] = createSignal<Api<Product> | null>(null)
  console.debug('App loaded')

  return (
    <>
      <button
        type="button"
        class="js-big-button js-nav-button"
        onClick={() => setOpen((v) => !v)}
        style={{ 'margin-bottom': '10px' }}
      >
        <i class="hb hb-key"></i> Advanced Exporter
      </button>

      <div classList={{ hidden: !open() }}>
        <div
          style={{
            display: 'flex',
            'justify-content': 'space-between',
            'align-items': 'center',
            'margin-bottom': '10px',
          }}
        >
          <label for="hb_extractor-local-time">
            <input
              type="checkbox"
              id="hb_extractor-local-time"
              checked={useLocalTime()}
              onChange={(e) => setUseLocalTime(e.currentTarget.checked)}
            />
            Local time
          </label>
          <Refresh refresh={refresh} />
        </div>
        <Show when={products()?.length} fallback={<p>Loading products...</p>}>
          <Table products={products()} setDt={setDt} useLocalTime={useLocalTime} />
        </Show>
        <Actions dt={dt} />
      </div>
    </>
  )
}
