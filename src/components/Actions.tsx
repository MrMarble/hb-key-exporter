import { createSignal, onCleanup, Show, type Accessor } from 'solid-js'
import type { Api } from 'datatables.net-dt'
import {
  createClaimPlan,
  hasPermanentlyFailed,
  markPermanentlyFailed,
  type ClaimFailure,
  type ClaimPlan,
  type ClaimReport,
  type ClaimSuccess,
  type ExportDestination,
} from '../claim-report'
import { forEachConcurrent } from '../concurrency'
import { downloadTextFile, formatLocalTimestamp } from '../download'
import {
  hasSearchBuilderCriteria,
  invertSearchBuilderGroup,
  type WithSearchBuilder,
} from '../table-filter'
import { hasRedeemedKeyValue, serializeRedeemedKeyValue } from '../redeemed-key'
import {
  applyRedeemedProductState,
  captureProductReferences,
  resolveProductReferences,
} from '../product-reference'
import {
  exportCSV,
  loadCsvExportPreferences,
  resolveCsvColumnIds,
  saveCsvExportPreferences,
  type CsvExportPreferences,
} from '../csv-export'
import {
  copyToClipboard,
  redeem,
  RedeemError,
  showErrorToast,
  showFlashToast,
  type Product,
} from '../util'
import { BulkRevealConfirmation, BulkRevealResults } from './BulkRevealDialogs'
import { CsvExportSettingsDialog } from './CsvExportSettingsDialog'
// @ts-expect-error missing types
import styles from '../style.module.css'

const CLAIM_CONCURRENCY = 5

type PendingConfirmation = {
  plan: ClaimPlan<Product>
  gift: boolean
  destination: ExportDestination
  resolve: (confirmed: boolean) => void
}

const claimProducts = async (
  products: Product[],
  gift: boolean,
  onProgress?: (completed: number) => void
): Promise<{
  successes: ClaimSuccess<Product>[]
  failures: ClaimFailure<Product>[]
}> => {
  const successes: ClaimSuccess<Product>[] = []
  const failures: ClaimFailure<Product>[] = []
  let completed = 0

  await forEachConcurrent(products, CLAIM_CONCURRENCY, async (product, index) => {
    try {
      product.redeemed_key_val = await redeem(product, gift)
      product.type = gift ? 'Gift' : 'Key'
      product.is_gift = gift
      successes.push({ index, product })
    } catch (error) {
      console.error('Error redeeming product:', product.machine_name, error)
      if (error instanceof RedeemError && error.permanent) markPermanentlyFailed(product)
      failures.push({ index, product, error })
    } finally {
      onProgress?.(++completed)
    }
  })

  successes.sort((left, right) => left.index - right.index)
  failures.sort((left, right) => left.index - right.index)

  return { successes, failures }
}

const terminateExport = (text: string): string => (text ? `${text}\n` : '')

const exportASF = (products: Product[]): string =>
  terminateExport(
    products
      .filter(
        (product) =>
          !product.is_gift &&
          hasRedeemedKeyValue(product.redeemed_key_val) &&
          product.key_type === 'steam'
      )
      .map(
        (product) => `${product.human_name}\t${serializeRedeemedKeyValue(product.redeemed_key_val)}`
      )
      .join('\n')
  )

const exportKeys = (products: Product[]): string =>
  terminateExport(
    products
      .filter((product) => !product.is_gift && hasRedeemedKeyValue(product.redeemed_key_val))
      .map((product) => serializeRedeemedKeyValue(product.redeemed_key_val))
      .join('\n')
  )

type ExportType = 'asf' | 'keys' | 'csv'
type CsvDelimiterPreset = 'comma' | 'tab' | 'semicolon' | 'pipe' | 'custom'

const getCsvDelimiter = (preset: CsvDelimiterPreset, customDelimiter: string): string => {
  if (preset === 'comma') return ','
  if (preset === 'tab') return '\t'
  if (preset === 'semicolon') return ';'
  if (preset === 'pipe') return '|'
  return customDelimiter
}

const isValidCsvDelimiter = (delimiter: string): boolean =>
  delimiter.length > 0 && !/["\r\n]/.test(delimiter)

const getExportFilename = (type: ExportType, delimiter: string, date = new Date()): string => {
  const timestamp = formatLocalTimestamp(date)

  if (type === 'asf') return `humble-bundle-asf-${timestamp}.keys`
  if (type === 'keys') return `humble-bundle-keys-${timestamp}.txt`

  const extension =
    delimiter === '\t' ? 'tsv' : delimiter === ',' || delimiter === ';' ? 'csv' : 'txt'
  return `humble-bundle-export-${timestamp}.${extension}`
}

const getExportMimeType = (type: ExportType, delimiter: string): string => {
  if (type !== 'csv') return 'text/plain;charset=utf-8'
  if (delimiter === '\t') return 'text/tab-separated-values;charset=utf-8'
  if (delimiter === ',' || delimiter === ';') return 'text/csv;charset=utf-8'
  return 'text/plain;charset=utf-8'
}

const downloadExport = (
  text: string,
  filename: string,
  type: ExportType,
  delimiter: string
): boolean => {
  try {
    downloadTextFile(text, filename, getExportMimeType(type, delimiter))
    return true
  } catch (error) {
    showErrorToast(error, 'Failed to start download')
    return false
  }
}

const getEmptyExportMessage = (type: ExportType, products: Product[]): string => {
  if (!products.length) return 'Empty export: no rows in table'
  if (type === 'asf') return 'Empty export: no revealed Steam keys in table'
  if (type === 'keys') return 'Empty export: no revealed keys in table'

  return 'Empty export'
}

export function Actions({
  dt,
  products,
  waitForProductRefresh,
}: {
  dt: Accessor<Api<Product> | null>
  products: Accessor<Product[] | undefined>
  waitForProductRefresh: () => Promise<void>
}) {
  const [exportType, setExportType] = createSignal<ExportType>('csv')
  const [claim, setClaim] = createSignal(false)
  const [claimType, setClaimType] = createSignal('key')
  const [exportingDestination, setExportingDestination] = createSignal<ExportDestination | null>(
    null
  )
  const exporting = (): boolean => exportingDestination() !== null
  const [bulkRevealProcessing, setBulkRevealProcessing] = createSignal(false)
  const [bulkRevealProgress, setBulkRevealProgress] = createSignal(0)
  const [csvDelimiterPreset, setCsvDelimiterPreset] = createSignal<CsvDelimiterPreset>('comma')
  const [customCsvDelimiter, setCustomCsvDelimiter] = createSignal('')
  const [csvExportPreferences, setCsvExportPreferences] = createSignal<CsvExportPreferences>(
    loadCsvExportPreferences()
  )
  const [csvSettingsOpen, setCsvSettingsOpen] = createSignal(false)
  const [pendingConfirmation, setPendingConfirmation] = createSignal<PendingConfirmation | null>(
    null
  )
  const [claimReport, setClaimReport] = createSignal<ClaimReport<Product> | null>(null)
  const csvDelimiter = (): string => getCsvDelimiter(csvDelimiterPreset(), customCsvDelimiter())
  const hasValidDelimiter = (): boolean =>
    exportType() !== 'csv' || isValidCsvDelimiter(csvDelimiter())
  const hasSelectedCsvColumns = (): boolean =>
    exportType() !== 'csv' || resolveCsvColumnIds(csvExportPreferences()).length > 0

  const closeCsvSettings = (): void => {
    setCsvSettingsOpen(false)
  }

  const applyCsvSettings = (preferences: CsvExportPreferences): void => {
    setCsvExportPreferences(preferences)
    try {
      saveCsvExportPreferences(preferences)
    } catch (error) {
      showErrorToast(error, 'Failed to save CSV export settings')
    }
    closeCsvSettings()
  }

  const cancelConfirmation = (): void => {
    if (bulkRevealProcessing()) return

    const pending = pendingConfirmation()
    if (!pending) return

    setPendingConfirmation(null)
    pending.resolve(false)
  }

  const confirmReveal = (): void => {
    const pending = pendingConfirmation()
    if (!pending || bulkRevealProcessing()) return

    setBulkRevealProcessing(true)
    pending.resolve(true)
  }

  const confirmBulkReveal = (
    plan: ClaimPlan<Product>,
    gift: boolean,
    destination: ExportDestination
  ): Promise<boolean> => {
    setBulkRevealProcessing(false)
    setBulkRevealProgress(0)
    return new Promise((resolve) => setPendingConfirmation({ plan, gift, destination, resolve }))
  }

  onCleanup(() => pendingConfirmation()?.resolve(false))

  const invertFilter = (): void => {
    const table = dt()
    if (!table) return

    try {
      const searchBuilder = (table as WithSearchBuilder<Api<Product>>).searchBuilder
      const details = searchBuilder.getDetails(true)

      if (!hasSearchBuilderCriteria(details)) {
        const hasTextSearch =
          Boolean(table.search()) || table.columns().search().toArray().some(Boolean)

        throw new Error(
          hasTextSearch
            ? 'Invert filter only supports conditions created with "Add Condition"; text searches cannot be inverted.'
            : 'Add at least one condition with "Add Condition" before inverting the filter.'
        )
      }

      searchBuilder.rebuild(invertSearchBuilderGroup(details), false)
      table.draw(false)
      showFlashToast('Table filter inverted')
    } catch (error) {
      showErrorToast(error, 'Failed to invert table filter')
    }
  }

  const runExport = async (destination: ExportDestination): Promise<void> => {
    const table = dt()
    if (!table) return

    const type = exportType()
    const delimiter = csvDelimiter()
    const preferences = csvExportPreferences()
    if (type === 'csv' && !isValidCsvDelimiter(delimiter)) {
      showFlashToast(
        delimiter
          ? 'CSV delimiters cannot contain double quotes or line breaks'
          : 'Choose a CSV delimiter or enter a custom delimiter',
        'warning'
      )
      return
    }
    setExportingDestination(destination)

    try {
      const initialSelection = table.rows({ search: 'applied' }).data().toArray() as Product[]
      const claimAsGift = claimType() === 'gift'
      const claimable = claim()
        ? initialSelection.filter(
            (product) =>
              !hasRedeemedKeyValue(product.redeemed_key_val) && !hasPermanentlyFailed(product)
          )
        : []
      let toExport = initialSelection
      let report: ClaimReport<Product> | null = null

      if (claimable.length) {
        const initialProducts = products()
        if (!initialProducts) throw new Error('Product data is unavailable. Please try again.')

        const selectionReferences = captureProductReferences(initialProducts, initialSelection)
        const claimableReferences = captureProductReferences(initialProducts, claimable)
        const plan = createClaimPlan(claimable)
        const confirmed = await confirmBulkReveal(plan, claimAsGift, destination)
        if (!confirmed) return

        // A Steam notice can schedule a product refresh while the confirmation is open. Resolve the
        // exact confirmed rows against the newest product objects before revealing anything.
        await waitForProductRefresh()
        const latestBeforeClaim = products()
        if (!latestBeforeClaim) throw new Error('Product data is unavailable. Please try again.')

        const currentClaimable = resolveProductReferences(claimableReferences, latestBeforeClaim)
        const { successes, failures } = await claimProducts(
          currentClaimable,
          claimAsGift,
          setBulkRevealProgress
        )

        // A refresh can also finish while reveal requests are in flight. Resolve once more, then
        // carry successful reveal state onto the latest objects so refreshed fields (such as
        // Steam ownership) and newly revealed keys are both preserved in the export.
        await waitForProductRefresh()
        const latestAfterClaim = products()
        if (!latestAfterClaim) throw new Error('Product data is unavailable. Please try again.')

        toExport = resolveProductReferences(selectionReferences, latestAfterClaim)
        const latestClaimable = resolveProductReferences(claimableReferences, latestAfterClaim)
        const updated = new Set<Product>()

        const currentSuccesses: ClaimSuccess<Product>[] = successes.map(({ index, product }) => {
          const latestProduct = latestClaimable[index]
          applyRedeemedProductState(latestProduct, product)
          updated.add(latestProduct)
          return { index, product: latestProduct }
        })
        const currentFailures: ClaimFailure<Product>[] = failures.map(({ index, error }) => ({
          index,
          product: latestClaimable[index],
          error,
        }))

        const currentTable = dt()
        if (currentTable && updated.size) {
          currentTable
            .rows((_index, product) => updated.has(product))
            .invalidate('data')
            .draw(false)
        }

        report = {
          gift: claimAsGift,
          successes: currentSuccesses,
          failures: currentFailures,
          typeCounts: plan.typeCounts,
          keylessCount: plan.keylessCount,
          exportDestination: destination,
          exportSucceeded: false,
          exportEmpty: false,
          exportFilename: null,
        }
      }

      const text =
        type === 'asf'
          ? exportASF(toExport)
          : type === 'keys'
            ? exportKeys(toExport)
            : exportCSV(toExport, delimiter, preferences)
      if (!text) {
        showFlashToast(getEmptyExportMessage(type, toExport), 'warning')

        if (report) {
          setPendingConfirmation(null)
          setClaimReport({ ...report, exportEmpty: true })
        }
        return
      }

      let exportSucceeded: boolean
      let exportFilename: string | null = null

      if (destination === 'clipboard') {
        exportSucceeded = copyToClipboard(text)
      } else {
        exportFilename = getExportFilename(type, delimiter)
        exportSucceeded = downloadExport(text, exportFilename, type, delimiter)
      }

      if (report) {
        setPendingConfirmation(null)
        setClaimReport({ ...report, exportSucceeded, exportFilename })
      } else if (exportSucceeded) {
        showFlashToast(
          destination === 'clipboard'
            ? 'Export copied to clipboard'
            : `Download started: ${exportFilename}`
        )
      }
    } catch (error) {
      showErrorToast(error, 'Export failed')
    } finally {
      setPendingConfirmation(null)
      setBulkRevealProcessing(false)
      setExportingDestination(null)
    }
  }

  return (
    <>
      <div class={styles.actions}>
        <label for="claim" class={styles.checkbox_label}>
          <input
            type="checkbox"
            id="claim"
            name="claim"
            checked={claim()}
            onChange={(event) => setClaim(event.target.checked)}
          />
          Reveal unrevealed keys
        </label>
        <select
          name="claimType"
          id="claimType"
          class={styles.select}
          classList={{ hidden: !claim() }}
          onChange={(event) => setClaimType(event.target.value)}
        >
          <option value="" disabled>
            What to claim
          </option>
          <option value="key" selected>
            Key
          </option>
          <option value="gift">Gift link</option>
        </select>
        <button
          type="button"
          class={styles.btn}
          onClick={invertFilter}
          disabled={!dt() || exporting()}
          title="Invert conditions created with Add Condition"
        >
          Invert filter
        </button>
        <select
          name="export"
          id="export"
          class={styles.select}
          value={exportType()}
          aria-label="Export format"
          onChange={(event) => setExportType(event.currentTarget.value as ExportType)}
        >
          <option value="asf">ASF</option>
          <option value="keys">Keys</option>
          <option value="csv">CSV</option>
        </select>
        <Show when={exportType() === 'csv'}>
          <div class={styles.export_delimiter}>
            <label for="csvDelimiter">Delimiter</label>
            <select
              name="csvDelimiter"
              id="csvDelimiter"
              class={`${styles.select} ${styles.export_delimiter_select}`}
              value={csvDelimiterPreset()}
              onChange={(event) =>
                setCsvDelimiterPreset(event.currentTarget.value as CsvDelimiterPreset)
              }
            >
              <option value="comma">Comma</option>
              <option value="tab">Tab</option>
              <option value="semicolon">Semicolon</option>
              <option value="pipe">Pipe</option>
              <option value="custom">Custom…</option>
            </select>
            <Show when={csvDelimiterPreset() === 'custom'}>
              <input
                type="text"
                name="customCsvDelimiter"
                id="customCsvDelimiter"
                class={styles.export_custom_delimiter}
                value={customCsvDelimiter()}
                onInput={(event) => setCustomCsvDelimiter(event.currentTarget.value)}
                on:keydown={(event) => event.stopPropagation()}
                on:keypress={(event) => event.stopPropagation()}
                on:keyup={(event) => event.stopPropagation()}
                aria-label="Custom CSV delimiter"
                aria-required="true"
                aria-invalid={!isValidCsvDelimiter(customCsvDelimiter())}
                placeholder="Custom"
                title="Enter a delimiter without double quotes or line breaks"
                required
              />
            </Show>
          </div>
          <button
            type="button"
            class={styles.btn}
            onClick={() => setCsvSettingsOpen(true)}
            disabled={!dt() || exporting()}
            aria-haspopup="dialog"
            title="Choose CSV columns and date formatting"
          >
            Columns…
          </button>
        </Show>
        <button
          type="button"
          class="primary-button"
          onClick={() => void runExport('clipboard')}
          disabled={
            !dt() ||
            !exportType() ||
            !hasValidDelimiter() ||
            !hasSelectedCsvColumns() ||
            exporting()
          }
        >
          {exportingDestination() === 'clipboard' &&
          !pendingConfirmation() &&
          !bulkRevealProcessing() ? (
            <i class="hb hb-spin hb-spinner" aria-hidden="true"></i>
          ) : (
            'Copy'
          )}
        </button>
        <button
          type="button"
          class={`primary-button ${styles.export_secondary_button}`}
          onClick={() => void runExport('download')}
          disabled={
            !dt() ||
            !exportType() ||
            !hasValidDelimiter() ||
            !hasSelectedCsvColumns() ||
            exporting()
          }
        >
          {exportingDestination() === 'download' &&
          !pendingConfirmation() &&
          !bulkRevealProcessing() ? (
            <i class="hb hb-spin hb-spinner" aria-hidden="true"></i>
          ) : (
            'Download'
          )}
        </button>
      </div>

      <Show when={csvSettingsOpen() && dt()} keyed>
        {(table) => (
          <CsvExportSettingsDialog
            table={table}
            preferences={csvExportPreferences()}
            onCancel={closeCsvSettings}
            onApply={applyCsvSettings}
          />
        )}
      </Show>

      <Show when={pendingConfirmation()} keyed>
        {(pending) => (
          <BulkRevealConfirmation
            plan={pending.plan}
            gift={pending.gift}
            destination={pending.destination}
            processing={bulkRevealProcessing}
            progress={bulkRevealProgress}
            onCancel={cancelConfirmation}
            onConfirm={confirmReveal}
          />
        )}
      </Show>

      <Show when={claimReport()} keyed>
        {(report) => <BulkRevealResults report={report} onClose={() => setClaimReport(null)} />}
      </Show>
    </>
  )
}
