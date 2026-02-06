import { createSignal, type Accessor } from 'solid-js'
import { copyToClipboard, redeem, RedeemError, type Product } from '../util'
import { showToast } from '@violentmonkey/ui'
// @ts-expect-error missing types
import styles from '../style.module.css'
import type { Api } from 'datatables.net-dt'

// Track products that permanently failed redemption so they aren't retried
const failedRedemptions = new Set<string>()

const productKey = (p: Pick<Product, 'machine_name' | 'category_id'>) =>
  `${p.category_id}:${p.machine_name}`

export function Actions({ dt }: { dt: Accessor<Api<Product>> }) {
  const [exportType, setExportType] = createSignal('')
  const [filtered, setFiltered] = createSignal(false)
  const [claim, setClaim] = createSignal(false)
  const [claimType, setClaimType] = createSignal('key')
  const [exporting, setExporting] = createSignal(false)
  const [separator, setSeparator] = createSignal(',')
  const [pendingCopy, setPendingCopy] = createSignal('')
  const [progressText, setProgressText] = createSignal('')

  const exportASF = (products: Product[]) => {
    return products
      .filter(
        (product) =>
          !product.is_gift &&
          product.redeemed_key_val &&
          !product.is_expired &&
          product.key_type === 'steam'
      )
      .map((product) => `${product.human_name}\t${product.redeemed_key_val}`)
      .join('\n')
  }

  const exportKeys = (products: Product[]) => {
    return products
      .filter(
        (product) =>
          !product.is_gift && product.redeemed_key_val && !product.key_type.endsWith('_keyless')
      )
      .map((product) => product.redeemed_key_val)
      .join('\n')
  }

  const csvEscape = (value: unknown) => {
    const str = String(value ?? '')
    if (str.includes(separator()) || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const exportCSV = (products: Product[]) => {
    const filtered = products.filter((product) => !product.key_type.endsWith('_keyless'))
    if (filtered.length === 0) {
    	showToast('There are no keys to export')
    	return ''
    }
    const header = Object.keys(filtered[0])
    const csv = filtered
      .map((product) => {
        return header.map((h) => csvEscape(product[h])).join(separator())
      })
      .join('\n')

    return header.join(separator()) + '\n' + csv
  }

  const exportToClipboard = async () => {
    // If there's a pending copy from a previous failed clipboard write,
    // copy it immediately (within user gesture) and return
    const cached = pendingCopy()
    if (cached) {
      const ok = await copyToClipboard(cached)
      if (ok) {
        setPendingCopy('')
        showToast('Exported to clipboard')
      } else {
        showToast('Clipboard write failed. Please try again.')
      }
      return
    }

    setExporting(true)
    const toExport = dt()
      .rows({ search: filtered() ? 'applied' : 'none' })
      .data()
      .toArray() as Product[]

    let redeemed = 0
    let failed = 0
    let skipped = 0

    if (claim()) {
      const toClaim = toExport.filter(
        (p) =>
          !p.redeemed_key_val &&
          !p.key_type.endsWith('_keyless') &&
          !failedRedemptions.has(productKey(p))
      )
      skipped = toExport.filter(
        (p) => !p.redeemed_key_val && failedRedemptions.has(productKey(p))
      ).length
      let processed = 0

      for (const product of toClaim) {
        processed++
        setProgressText(`Claiming ${processed}/${toClaim.length}`)
        try {
          product.redeemed_key_val = await redeem(product, claimType() === 'gift')
          redeemed++
        } catch (e) {
          console.error('Error redeeming product:', product.machine_name, e)
          failed++
          if (e instanceof RedeemError && e.permanent) {
            failedRedemptions.add(productKey(product))
          }
        }
      }
    }

    setProgressText('Copying to clipboard...')

    let text = ''
    switch (exportType()) {
      case 'asf':
        text = exportASF(toExport)
        break
      case 'keys':
        text = exportKeys(toExport)
        break
      case 'csv':
        text = exportCSV(toExport)
        break
    }

    const ok = await copyToClipboard(text)
    setExporting(false)
    setProgressText('')

    if (!ok) {
      setPendingCopy(text)
      const { close } = showToast('Clipboard blocked. Click "Copy to clipboard" to retry.', {
        duration: 0,
      })
      document.addEventListener('click', () => close(), { once: true })
      return
    }

    if (claim() && (failed > 0 || skipped > 0)) {
      showToast(`Exported to clipboard (${redeemed} claimed, ${failed} failed, ${skipped} skipped)`)
    } else {
      showToast('Exported to clipboard')
    }
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
            onChange={(e) => setFiltered(e.target.checked)}
          />
          Use table filter
        </label>
        <select
          name="export"
          id="export"
          class={styles.select}
          onChange={(e) => setExportType(e.target.value)}
        >
          <option value="" disabled selected>
            Export format
          </option>
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
          {exporting() ? (
            <>
              <i class="hb hb-spin hb-spinner"></i> {progressText()}
            </>
          ) : pendingCopy() ? (
            'Copy to clipboard'
          ) : (
            'Export'
          )}
        </button>
      </div>
    </>
  )
}
