import { createSignal, type Accessor } from 'solid-js'
import { redeem, showFlashToast, type Product } from '../util'
// @ts-expect-error missing types
import styles from '../style.module.css'
import type { Api } from 'datatables.net-dt'

export function Actions({ dt }: { dt: Accessor<Api<Product>> }) {
  const [exportType, setExportType] = createSignal('csv')
  const [filtered, setFiltered] = createSignal(true)
  const [claim, setClaim] = createSignal(false)
  const [claimType, setClaimType] = createSignal('key')
  const [exporting, setExporting] = createSignal(false)
  const [separator, setSeparator] = createSignal(',')

  const exportASF = (products: Product[]) => {
    const keys = products
      .filter(
        (product) => !product.is_gift && product.redeemed_key_val && product.key_type === 'steam'
      )
      .map((product) => `${product.human_name}\t${product.redeemed_key_val}`)
      .join('\n')

    navigator.clipboard.writeText(keys)
  }

  const exportKeys = (products: Product[]) => {
    const keys = products
      .filter((product) => !product.is_gift && product.redeemed_key_val)
      .map((product) => product.redeemed_key_val)
      .join('\n')

    navigator.clipboard.writeText(keys)
  }

  const escapeCsvField = (value: unknown, delim: string) => {
    const s = value == null ? '' : String(value)
    const needsQuotes =
      s.includes('"') ||
      s.includes('\n') ||
      s.includes('\r') ||
      (delim ? s.includes(delim) : false) ||
      s.trim() !== s

    return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s
  }

  const serializeField = (value: unknown): string => {
    if (value == null) return ''
    return String(value)
  }

  const exportCSV = (products: Product[]) => {
    if (!products.length) {
      navigator.clipboard.writeText('')
      return
    }

    const delim = separator() || ','
    const header = Object.keys(products[0]).flatMap((h) =>
      h === 'redeemed_date' ? ['redeemed_date_label', 'redeemed_date_iso'] : [h]
    )

    const getCsvValue = (product: Product, header: string): unknown => {
      if (header === 'redeemed_date_label') return product.redeemed_date?.label ?? ''
      if (header === 'redeemed_date_iso') return product.redeemed_date?.iso ?? ''

      return product[header as keyof Product]
    }

    const lines = [
      header.map((h) => escapeCsvField(h, delim)).join(delim),
      ...products.map((product) =>
        header
          .map((h) => escapeCsvField(serializeField(getCsvValue(product, h)), delim))
          .join(delim)
      ),
    ]

    navigator.clipboard.writeText(lines.join('\r\n'))
  }

  const exportToClipboard = async () => {
    setExporting(true)
    const toExport = dt()
      .rows({ search: filtered() ? 'applied' : 'none' })
      .data()
      .toArray() as Product[]

    if (claim()) {
      for (const product of toExport) {
        if (product.redeemed_key_val) {
          continue
        }
        try {
          product.redeemed_key_val = await redeem(product, claimType() === 'gift')
        } catch (e) {
          console.error('Error redeeming product:', product.machine_name, e)
        }
      }
    }

    switch (exportType()) {
      case 'asf':
        exportASF(toExport)
        break
      case 'keys':
        exportKeys(toExport)
        break
      case 'csv':
        exportCSV(toExport)
        break
    }
    setExporting(false)
    showFlashToast('Exported to clipboard')
  }

  return (
    <>
      <div class={styles.actions}>
        <label for="separator">
          CSV Separator&nbsp;
          <input
            type="text"
            name="separator"
            id="separator"
            value=","
            onInput={(e) => setSeparator(e.target.value)}
            style={{ width: '5ch', 'text-align': 'center' }}
            required
          />
        </label>
      </div>
      <div class={styles.actions}>
        <label for="claim">
          <input
            type="checkbox"
            id="claim"
            name="claim"
            checked={claim()}
            onChange={(e) => setClaim(e.target.checked)}
          />
          Claim unredeemed games
        </label>
        <select
          name="claimType"
          id="claimType"
          class={styles.select}
          classList={{ hidden: !claim() }}
          onChange={(e) => setClaimType(e.target.value)}
        >
          <option value="" disabled>
            What to claim
          </option>
          <option value="key" selected>
            Key
          </option>
          <option value="gift">Gift link</option>
        </select>
        <label for="filtered">
          <input
            type="checkbox"
            id="filtered"
            name="filtered"
            checked={filtered()}
            onChange={(e) => setFiltered(e.target.checked)}
          />
          Use table filter
        </label>
        <select
          name="export"
          id="export"
          class={styles.select}
          value={exportType()}
          onChange={(e) => setExportType(e.target.value)}
        >
          <option value="asf">ASF</option>
          <option value="keys">Keys</option>
          <option value="csv">CSV</option>
        </select>
        <button
          type="button"
          class="primary-button"
          onClick={exportToClipboard}
          disabled={!exportType() || exporting()}
        >
          {exporting() ? <i class="hb hb-spin hb-spinner"></i> : 'Export'}
        </button>
      </div>
    </>
  )
}
