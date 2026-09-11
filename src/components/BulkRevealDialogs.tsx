import { For, Show, type Accessor } from 'solid-js'
import {
  formatClaimLog,
  getClaimTypeLabel,
  getErrorMessage,
  groupClaimResults,
  isKeylessProduct,
  type ClaimPlan,
  type ClaimReport,
  type ExportDestination,
} from '../claim-report'
import { downloadTextFile, formatLocalTimestamp } from '../download'
import { useModalBehavior } from '../modal'
import { copyToClipboard, showErrorToast, showFlashToast, type Product } from '../util'
// @ts-expect-error missing types
import styles from '../style.module.css'

const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  count === 1 ? singular : plural

const getRevealLogFilename = (date = new Date()): string =>
  `humble-bundle-reveal-log-${formatLocalTimestamp(date)}.log`

const claimTypeIconClasses: Record<string, string> = {
  battlenet: 'hb-bnet',
  epic: 'hb-epic',
  epicgames: 'hb-epic',
  gog: 'hb-gog',
  oculus: 'hb-oculus',
  origin: 'hb-origin',
  steam: 'hb-steam',
  ubisoft: 'hb-uplay',
  ubisoftconnect: 'hb-uplay',
  uplay: 'hb-uplay',
}

const ClaimType = ({ product }: { product: Product }) => {
  const iconClass = isKeylessProduct(product)
    ? 'hb-link'
    : claimTypeIconClasses[product.key_type.toLowerCase().replace(/[^a-z0-9]/g, '')]

  return (
    <span class={styles.result_type}>
      {iconClass ? (
        <i class={`hb ${iconClass} ${styles.result_type_icon}`} aria-hidden="true"></i>
      ) : null}
      <span>{getClaimTypeLabel(product)}</span>
    </span>
  )
}

export function KeylessRedemptionConfirmation({
  product,
  gift,
  processing,
  onCancel,
  onConfirm,
}: {
  product: Product
  gift: boolean
  processing: Accessor<boolean>
  onCancel: () => void
  onConfirm: () => void
}) {
  const warning = gift
    ? [
        'Humble may redeem this item immediately to the third-party account linked to your',
        'Humble Bundle account instead of producing a transferable gift link.',
      ].join(' ')
    : [
        'Continuing will redeem this item immediately to the third-party account linked to your',
        'Humble Bundle account. No transferable key will be shown.',
      ].join(' ')
  let dialogRef: HTMLElement | undefined
  const { handleKeyDown, stopPropagation } = useModalBehavior({
    dialog: () => dialogRef,
    onEscape: onCancel,
    escapeDisabled: processing,
  })

  return (
    <div
      class={styles.modal_backdrop}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !processing() && onCancel()}
    >
      <section
        ref={dialogRef}
        class={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hb_extractor-keyless-confirm-title"
        aria-busy={processing()}
        tabindex="-1"
        on:keydown={handleKeyDown}
        on:keypress={stopPropagation}
        on:keyup={stopPropagation}
      >
        <header class={styles.modal_header}>
          <div>
            <p class={styles.modal_eyebrow}>Keyless redemption warning</p>
            <h2 id="hb_extractor-keyless-confirm-title" class={styles.modal_title}>
              {gift ? 'Continue with keyless gift-link creation?' : 'Redeem to linked account?'}
            </h2>
          </div>
          <button
            type="button"
            class={styles.modal_close}
            aria-label="Cancel"
            title="Cancel"
            onClick={onCancel}
            disabled={processing()}
          >
            ×
          </button>
        </header>

        <div class={styles.modal_body} data-modal-scroll-body>
          <p class={styles.modal_lead}>
            <strong>{product.human_name}</strong> is marked by Humble for direct redemption.
          </p>

          <div class={styles.modal_warning} role="alert">
            <strong>Linked-account redemption</strong>
            <p>{warning} Verify that the correct account is linked before continuing.</p>
          </div>

          <p class={styles.modal_note} aria-live="polite">
            {processing()
              ? 'Keep this window open while Humble processes the request.'
              : 'Nothing will be redeemed unless you confirm.'}
          </p>
        </div>

        <footer class={styles.modal_footer}>
          <button
            type="button"
            class={styles.modal_secondary_button}
            onClick={onCancel}
            disabled={processing()}
          >
            Cancel
          </button>
          <button
            type="button"
            class={styles.modal_primary_button}
            onClick={onConfirm}
            disabled={processing()}
            autofocus
          >
            {processing() ? (
              <>
                <i class="hb hb-spin hb-spinner" aria-hidden="true"></i>{' '}
                {gift ? 'Continuing…' : 'Redeeming…'}
              </>
            ) : gift ? (
              'Continue'
            ) : (
              'Redeem to Linked Account'
            )}
          </button>
        </footer>
      </section>
    </div>
  )
}

export function BulkRevealConfirmation({
  plan,
  gift,
  destination,
  processing,
  progress,
  status,
  onCancel,
  onConfirm,
}: {
  plan: ClaimPlan<Product>
  gift: boolean
  destination: ExportDestination
  processing: Accessor<boolean>
  progress: Accessor<number>
  /** Current phase, e.g. the per-month Humble Choice preparation step. */
  status?: Accessor<string>
  onCancel: () => void
  onConfirm: () => void
}) {
  const count = plan.products.length
  const action = gift ? 'create gift links for' : 'reveal'
  const destinationVerb = destination === 'download' ? 'download' : 'copy'
  const destinationProgress = destination === 'download' ? 'Downloading' : 'Copying'
  const keylessWarning = gift
    ? [
        'These may redeem directly to the third-party account linked to your Humble Bundle',
        'account instead of producing transferable gift links.',
      ].join(' ')
    : [
        'Revealing them will redeem them immediately to the third-party account linked to',
        'your Humble Bundle account; they will not produce transferable keys.',
      ].join(' ')

  let dialogRef: HTMLElement | undefined
  const { handleKeyDown, stopPropagation } = useModalBehavior({
    dialog: () => dialogRef,
    onEscape: onCancel,
    escapeDisabled: processing,
  })

  return (
    <div
      class={styles.modal_backdrop}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !processing() && onCancel()}
    >
      <section
        ref={dialogRef}
        class={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hb_extractor-confirm-title"
        aria-busy={processing()}
        tabindex="-1"
        on:keydown={handleKeyDown}
        on:keypress={stopPropagation}
        on:keyup={stopPropagation}
      >
        <header class={styles.modal_header}>
          <div>
            <p class={styles.modal_eyebrow}>Bulk reveal confirmation</p>
            <h2 id="hb_extractor-confirm-title" class={styles.modal_title}>
              {gift
                ? `Create gift links and ${destinationVerb}?`
                : `Reveal keys and ${destinationVerb}?`}
            </h2>
          </div>
          <button
            type="button"
            class={styles.modal_close}
            aria-label="Cancel"
            title="Cancel"
            onClick={onCancel}
            disabled={processing()}
          >
            ×
          </button>
        </header>

        <div class={styles.modal_body} data-modal-scroll-body>
          <p class={styles.modal_lead}>
            The exporter is about to {action} <strong>{count}</strong>{' '}
            {pluralize(count, 'unrevealed item')} across <strong>{plan.bundleCount}</strong>{' '}
            {pluralize(plan.bundleCount, 'bundle')}.
          </p>

          <div class={styles.modal_stats}>
            <div class={styles.modal_stat}>
              <strong>{count}</strong>
              <span>Items</span>
            </div>
            <div class={styles.modal_stat}>
              <strong>{plan.bundleCount}</strong>
              <span>Bundles</span>
            </div>
            <div class={styles.modal_stat}>
              <strong>{plan.typeCounts.length}</strong>
              <span>Types</span>
            </div>
          </div>

          <Show when={processing()}>
            <div class={styles.modal_progress}>
              <div class={styles.modal_progress_header}>
                <span>{status?.() || (gift ? 'Creating gift links' : 'Revealing keys')}</span>
                <strong>
                  {progress()} of {count}
                </strong>
              </div>
              <div
                class={styles.modal_progress_track}
                role="progressbar"
                aria-label={gift ? 'Gift-link creation progress' : 'Key reveal progress'}
                aria-valuemin="0"
                aria-valuemax={count}
                aria-valuenow={progress()}
              >
                <div
                  class={styles.modal_progress_bar}
                  style={{ width: `${Math.round((progress() / count) * 100)}%` }}
                ></div>
              </div>
            </div>
          </Show>

          <div class={styles.type_breakdown}>
            <h3>Type breakdown</h3>
            <ul>
              <For each={plan.typeCounts}>
                {({ label, count: typeCount }) => (
                  <li>
                    <span>{label}</span>
                    <strong>{typeCount}</strong>
                  </li>
                )}
              </For>
            </ul>
          </div>

          <Show when={plan.keylessCount > 0}>
            <div class={styles.modal_warning} role="alert">
              <strong>Keyless redemption warning</strong>
              <p>
                {plan.keylessCount} {pluralize(plan.keylessCount, 'item')} Humble marks for direct
                redemption. {keylessWarning} Verify that the correct account is linked before
                continuing.
              </p>
            </div>
          </Show>

          <Show when={plan.expiredCount > 0}>
            <div class={styles.modal_warning} role="alert">
              <strong>Expired-item warning</strong>
              <p>
                {plan.expiredCount} {pluralize(plan.expiredCount, 'item')} Humble marks as expired.
                These requests may fail, but the exporter will attempt them if you continue.
              </p>
            </div>
          </Show>

          <p class={styles.modal_note} aria-live="polite">
            {processing()
              ? 'Keep this window open while the reveal and export complete.'
              : 'Nothing will be revealed or exported unless you confirm.'}
          </p>
        </div>

        <footer class={styles.modal_footer}>
          <button
            type="button"
            class={styles.modal_secondary_button}
            onClick={onCancel}
            disabled={processing()}
          >
            Cancel
          </button>
          <button
            type="button"
            class={styles.modal_primary_button}
            onClick={onConfirm}
            disabled={processing()}
            autofocus
          >
            {processing() ? (
              <>
                <i class="hb hb-spin hb-spinner" aria-hidden="true"></i>{' '}
                {gift ? 'Creating' : 'Revealing'} & {destinationProgress}…
              </>
            ) : gift ? (
              `Create & ${destination === 'download' ? 'Download' : 'Copy'}`
            ) : (
              `Reveal & ${destination === 'download' ? 'Download' : 'Copy'}`
            )}
          </button>
        </footer>
      </section>
    </div>
  )
}

export function BulkRevealResults({
  report,
  onClose,
}: {
  report: ClaimReport<Product>
  onClose: () => void
}) {
  const groups = groupClaimResults(report)
  const requested = report.successes.length + report.failures.length
  const log = formatClaimLog(report)
  let resultGroupsRef!: HTMLDivElement
  let dialogRef: HTMLElement | undefined
  const { handleKeyDown, stopPropagation } = useModalBehavior({
    dialog: () => dialogRef,
    onEscape: onClose,
  })

  const setAllBundlesOpen = (open: boolean): void => {
    for (const bundle of resultGroupsRef.querySelectorAll<HTMLDetailsElement>('details')) {
      bundle.open = open
    }
  }

  const copyLog = (): void => {
    if (copyToClipboard(log)) {
      showFlashToast('Log copied to clipboard')
    }
  }

  const downloadLog = (): void => {
    const filename = getRevealLogFilename()

    try {
      downloadTextFile(log, filename)
      showFlashToast(`Download started: ${filename}`)
    } catch (error) {
      showErrorToast(error, 'Failed to start log download')
    }
  }

  return (
    <div
      class={styles.modal_backdrop}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && event.preventDefault()}
    >
      <section
        ref={dialogRef}
        class={`${styles.modal} ${styles.modal_wide}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hb_extractor-results-title"
        tabindex="-1"
        on:keydown={handleKeyDown}
        on:keypress={stopPropagation}
        on:keyup={stopPropagation}
      >
        <header class={styles.modal_header}>
          <div>
            <p class={styles.modal_eyebrow}>Bulk reveal complete</p>
            <h2 id="hb_extractor-results-title" class={styles.modal_title}>
              Reveal results
            </h2>
          </div>
          <button
            type="button"
            class={styles.modal_close}
            aria-label="Close results"
            title="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div class={styles.modal_body} data-modal-scroll-body>
          <div class={styles.result_summary} aria-live="polite">
            <div class={styles.result_summary_item}>
              <strong>{requested}</strong>
              <span>Attempted</span>
            </div>
            <div class={`${styles.result_summary_item} ${styles.result_success_summary}`}>
              <strong>{report.successes.length}</strong>
              <span>Succeeded</span>
            </div>
            <div class={`${styles.result_summary_item} ${styles.result_failure_summary}`}>
              <strong>{report.failures.length}</strong>
              <span>Failed</span>
            </div>
          </div>

          <div
            class={`${styles.export_status} ${
              report.exportSucceeded
                ? styles.export_status_success
                : report.exportEmpty
                  ? styles.export_status_warning
                  : styles.export_status_failure
            }`}
          >
            {report.exportSucceeded ? (
              report.exportDestination === 'clipboard' ? (
                'Export copied to clipboard.'
              ) : (
                <>
                  Download started: <strong>{report.exportFilename}</strong>
                </>
              )
            ) : report.exportEmpty ? (
              report.exportDestination === 'clipboard' ? (
                'The reveal finished, but the selected export was empty. Your clipboard was left unchanged.'
              ) : (
                'The reveal finished, but the selected export was empty. No download was started.'
              )
            ) : report.exportDestination === 'clipboard' ? (
              'The reveal finished, but the export could not be copied to your clipboard.'
            ) : (
              'The reveal finished, but the download could not be started.'
            )}
          </div>

          <Show when={groups.length > 1}>
            <div class={styles.result_group_controls}>
              <button
                type="button"
                class={styles.result_group_button}
                onClick={() => setAllBundlesOpen(true)}
              >
                Expand all
              </button>
              <button
                type="button"
                class={styles.result_group_button}
                onClick={() => setAllBundlesOpen(false)}
              >
                Collapse all
              </button>
            </div>
          </Show>

          <div ref={resultGroupsRef} class={styles.result_groups}>
            <For each={groups}>
              {(group) => (
                <details
                  class={styles.result_bundle}
                  open={groups.length === 1 || group.failures.length > 0}
                >
                  <summary>
                    <span>{group.bundleName}</span>
                    <span class={styles.result_bundle_counts}>
                      <span class={styles.result_count_success}>
                        {group.successes.length} succeeded
                      </span>
                      <Show when={group.failures.length > 0}>
                        <span class={styles.result_count_failure}>
                          {group.failures.length} failed
                        </span>
                      </Show>
                    </span>
                  </summary>

                  <div class={styles.result_bundle_body}>
                    <Show when={group.successes.length > 0}>
                      <h4>Successfully revealed</h4>
                      <ul class={styles.result_list}>
                        <For each={group.successes}>
                          {({ product }) => (
                            <li class={styles.result_success}>
                              <span class={styles.result_icon} aria-hidden="true">
                                ✓
                              </span>
                              <span>
                                <strong>{product.human_name}</strong>
                                <small>
                                  <ClaimType product={product} />
                                </small>
                              </span>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>

                    <Show when={group.failures.length > 0}>
                      <h4>Failed</h4>
                      <ul class={styles.result_list}>
                        <For each={group.failures}>
                          {({ product, error }) => (
                            <li class={styles.result_failure}>
                              <span class={styles.result_icon} aria-hidden="true">
                                ×
                              </span>
                              <span>
                                <strong>{product.human_name}</strong>
                                <small>
                                  <ClaimType product={product} /> — {getErrorMessage(error)}
                                </small>
                              </span>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  </div>
                </details>
              )}
            </For>
          </div>
        </div>

        <footer class={`${styles.modal_footer} ${styles.result_footer}`}>
          <button type="button" class={styles.modal_secondary_button} onClick={onClose}>
            Close
          </button>
          <button type="button" class={styles.modal_primary_button} onClick={copyLog} autofocus>
            Copy Log
          </button>
          <button type="button" class={styles.modal_secondary_button} onClick={downloadLog}>
            Download Log
          </button>
        </footer>
      </section>
    </div>
  )
}
