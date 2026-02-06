import { createResource, createSignal, onCleanup, Show } from 'solid-js'
import { countOrders, getProducts, loadOrders, loadOwnedApps, type Product } from './util'

import { Table } from './components/Table'
import { Refresh } from './components/Refresh'
import { Actions } from './components/Actions'
import type { Api } from 'datatables.net-dt'

export function App() {
  const [products, { refetch: refresh }] = createResource<Product[], boolean>(async (_, info) => {
    console.debug('Loading products...')
    const orders = loadOrders()
    const owned = await loadOwnedApps(info.refetching)

    console.debug('Loaded', orders.length, 'orders,', owned.length, 'owned apps')
    return getProducts(orders, owned)
  })

  const [dt, setDt] = createSignal<Api<Product> | null>(null)

  // Watch for order loading completion
  const [orderCount, setOrderCount] = createSignal(countOrders())
  const [ordersReady, setOrdersReady] = createSignal(false)
  let lastCount = countOrders()
  let lastChangeTime = Date.now()

  const interval = setInterval(() => {
    const count = countOrders()
    setOrderCount(count)
    if (count !== lastCount) {
      lastCount = count
      lastChangeTime = Date.now()
      setOrdersReady(false)
    } else if (!ordersReady() && Date.now() - lastChangeTime >= 3000) {
      setOrdersReady(true)
      refresh(true)
    }
  }, 500)

  onCleanup(() => clearInterval(interval))

  console.debug('App loaded')
  return (
    <details>
      <summary>
        <h3>
          <i class="hb hb-key"></i> Advanced Exporter
        </h3>
      </summary>
      <div
        style={{ display: 'flex', 'justify-content': 'end', 'align-items': 'center', gap: '10px' }}
      >
        <span>
          {ordersReady() ? `${orderCount()} orders loaded` : `Loading orders... (${orderCount()})`}
        </span>
        <Refresh refresh={refresh} />
      </div>
      <Show when={products()?.length} fallback={<p>Loading products...</p>}>
        <Table products={products()} setDt={setDt} />
      </Show>
      <Actions dt={dt} />
    </details>
  )
}
