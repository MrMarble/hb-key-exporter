import { onCleanup, onMount, type Setter } from 'solid-js'
import { redeem, fetchRedeemedDate, setRedeemedDate, type Product } from '../util'
import DataTable, { type Api } from 'datatables.net-dt'
import { hm } from '@violentmonkey/dom'
// @ts-expect-error missing types
import styles from '../style.module.css'
import { showToast } from '@violentmonkey/ui'

export function Table({ products, setDt }: { products: Product[]; setDt: Setter<Api<Product>> }) {
  let tableRef!: HTMLTableElement

  onMount(() => {
    console.debug('Mounting table with', products.length, 'products')

    const renderCellValue = (data: unknown, type: string): string | undefined => {
      if (data == null || data === '') return type === 'display' ? '-' : ''
      if (type !== 'display') return String(data)
      return undefined
    }

    const displayDash = (data: unknown, type: string): string =>
      !data ? (type === 'display' ? '-' : '') : String(data)

    const displayDateOnly = (iso: string): string =>
      iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) => `${Number(m)}/${Number(d)}/${y}`)

    const isUtcDateMarker = (value: string): boolean =>
      /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(value)

    const parseDate = (value: unknown): Date | null => {
      const date = new Date(String(value))
      return Number.isNaN(date.getTime()) ? null : date
    }

    const localDateKey = (value: unknown): string => {
      const s = String(value)
      if (isUtcDateMarker(s)) return s.slice(0, 10)

      const date = parseDate(s)
      if (!date) return s

      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')

      return `${year}-${month}-${day}`
    }

    const displayDate = (data: unknown, type: string): string => {
      if (!data) return type === 'display' ? '-' : ''

      const s = String(data)

      if (type === 'filter') return localDateKey(s)

      if (type === 'display') {
        return isUtcDateMarker(s)
          ? displayDateOnly(s.slice(0, 10))
          : (parseDate(s)?.toLocaleDateString() ?? s)
      }

      return s
    }

    /** Steam Support URL for a given appId */
    const steamSupportUrl = (appId: number) =>
      `https://help.steampowered.com/en/wizard/HelpWithGame?appid=${appId}`

    const searchDateKey = (value: string): string => {
      const s = value.trim()
      if (!s) return ''
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

      return localDateKey(s)
    }

    type DateCondition = {
      search?: (value: string, comparison: string[]) => boolean
    }

    const dateConditions = (
      DataTable as typeof DataTable & {
        Criteria?: {
          dateConditions?: Record<string, DateCondition>
        }
      }
    ).Criteria?.dateConditions

    const setDateCondition = (
      condition: string,
      search: (value: string, comparison: string[]) => boolean
    ): void => {
      const dateCondition = dateConditions?.[condition]
      if (dateCondition) dateCondition.search = search
    }

    setDateCondition('=', (value, comparison) => {
      const left = searchDateKey(value)
      const right = searchDateKey(comparison[0] ?? '')
      return left !== '' && right !== '' && left === right
    })

    setDateCondition('!=', (value, comparison) => {
      const left = searchDateKey(value)
      const right = searchDateKey(comparison[0] ?? '')
      return left !== '' && right !== '' && left !== right
    })

    setDateCondition('<', (value, comparison) => {
      const left = searchDateKey(value)
      const right = searchDateKey(comparison[0] ?? '')
      return left !== '' && right !== '' && left < right
    })

    setDateCondition('>', (value, comparison) => {
      const left = searchDateKey(value)
      const right = searchDateKey(comparison[0] ?? '')
      return left !== '' && right !== '' && left >= right
    })

    setDateCondition('between', (value, comparison) => {
      const left = searchDateKey(value)
      const min = searchDateKey(comparison[0] ?? '')
      const max = searchDateKey(comparison[1] ?? '')
      return left !== '' && min !== '' && max !== '' && left >= min && left <= max
    })

    setDateCondition('!between', (value, comparison) => {
      const left = searchDateKey(value)
      const min = searchDateKey(comparison[0] ?? '')
      const max = searchDateKey(comparison[1] ?? '')
      return left !== '' && min !== '' && max !== '' && (left < min || left > max)
    })

    let dt!: Api<Product>
    setDt(
      () =>
        (dt = new DataTable<Product>(tableRef, {
          columnDefs: [
            {
              targets: [7, 9],
              render: displayDate,
            },
            {
              targets: [10],
              data: null,
              defaultContent: '',
            },
          ],
          order: [[7, 'desc']],
          columns: [
            {
              title: 'Type',
              data: 'key_type',
              type: 'html-utf8',
              render: (data, type, row) => {
                const value = renderCellValue(data, type)
                if (value !== undefined) return value

                return hm(
                  'i',
                  {
                    class: `hb hb-key hb-${data}`,
                    onclick: () => showToast(JSON.stringify(row, null, 2)),
                  },
                  hm('span', { class: 'hidden', innerText: String(data) })
                )
              },
              className: styles.platform,
            },
            {
              title: 'Name',
              data: 'human_name',
              type: 'html-utf8',
              render: (data, type, row) => {
                const value = renderCellValue(data, type)
                if (value !== undefined) return value

                return row.steam_app_id
                  ? hm('a', {
                      href: `https://store.steampowered.com/app/${row.steam_app_id}`,
                      target: '_blank',
                      innerText: String(data),
                    })
                  : String(data)
              },
            },
            { title: 'Category', data: 'category', type: 'string-utf8' },
            {
              title: 'Bundle Name',
              data: 'category_human_name',
              type: 'html-utf8',
              render: (data, type, row) => {
                const value = renderCellValue(data, type)
                if (value !== undefined) return value

                return hm('a', {
                  href: `https://www.humblebundle.com/download?key=${row.category_id}`,
                  target: '_blank',
                  innerText: String(data),
                })
              },
            },
            {
              title: 'Gift',
              data: 'type',
              type: 'string-utf8',
              render: displayDash,
            },
            {
              title: 'Revealed',
              data: (row: Product) => (row.is_gift || row.redeemed_key_val ? 'Yes' : 'No'),
              type: 'string-utf8',
            },
            {
              title: 'Owned',
              data: 'owned',
              type: 'string-utf8',
              render: displayDash,
            },
            { title: 'Purchased', data: 'created', type: 'date' },
            {
              // ---------------------------------------------------------------
              // "Redeemed" column — Steam Support app-level data
              // ---------------------------------------------------------------
              title: 'Redeemed',
              data: null,
              type: 'date',
              className: 'dt-right',
              render: (_, type, row) => {
                // For SearchBuilder / sorting: emit only the ISO date string so
                // DataTables never sees the display label text.
                if (type !== 'display') {
                  return row.redeemed_date?.iso ?? ''
                }

                // ── Already fetched ─────────────────────────────────────────
                if (row.redeemed_date) {
                  const { label, iso } = row.redeemed_date
                  return hm('a', {
                    href: steamSupportUrl(row.steam_app_id!),
                    target: '_blank',
                    title: 'Open Steam Support page',
                    innerText: `${label}: ${displayDateOnly(iso)}`,
                  }) as unknown as string
                }

                // ── Not owned on this Steam account — nothing to show ───────────────────
                if (!row.steam_app_id || row.owned !== 'Yes') return '-'

                // ── Not yet fetched: show a fetch button ────────────────────────────────
                const fetchBtn = hm(
                  'button',
                  {
                    class: styles.btn,
                    type: 'button',
                    title: 'Fetch redeemed date from Steam Support',
                    onclick: async (e: MouseEvent) => {
                      const target = e.currentTarget as HTMLButtonElement
                      target.disabled = true
                      target.innerHTML = '<i class="hb hb-spin hb-spinner"></i>'
                      try {
                        const result = await fetchRedeemedDate(row.steam_app_id!)
                        if (result) {
                          const appId = row.steam_app_id!

                          setRedeemedDate(appId, result)

                          for (const product of products) {
                            if (product.steam_app_id === appId) {
                              product.redeemed_date = result
                            }
                          }

                          dt.rows().invalidate('data').draw('page')
                        } else {
                          showToast('No redeemed date found on Steam Support page')
                          target.disabled = false
                          target.innerHTML = '<i class="hb hb-clock"></i>'
                        }
                      } catch (err) {
                        showToast(err instanceof Error ? err.message : 'Failed to fetch')
                        target.disabled = false
                        target.innerHTML = '<i class="hb hb-clock"></i>'
                      }
                    },
                  },
                  hm('i', { class: 'hb hb-clock' })
                )

                // ── Not yet fetched: show Steam Support link + fetch button ──────────────
                const supportLink = hm(
                  'a',
                  {
                    class: styles.btn,
                    href: steamSupportUrl(row.steam_app_id),
                    target: '_blank',
                    title: 'Open Steam Support page',
                    style: 'margin-right:2px;',
                  },
                  hm('i', { class: 'hb hb-steam' })
                )

                return hm('span', { class: styles.redeemed_actions }, [
                  supportLink,
                  fetchBtn,
                ]) as unknown as string
              },
            },
            { title: 'Exp. Date', data: 'expiry_date', type: 'date' },
            {
              title: '',
              orderable: false,
              searchable: false,
              data: (row: Product) => {
                const actions = []

                if (row.redeemed_key_val) {
                  actions.push(
                    hm(
                      'button',
                      {
                        class: styles.btn,
                        title: 'Copy to clipboard',
                        type: 'button',
                        onclick: () => {
                          navigator.clipboard.writeText(row.redeemed_key_val)
                          showToast('Copied to clipboard')
                        },
                      },
                      hm('i', { class: 'hb hb-key hb-clipboard' })
                    )
                  )
                }

                if (row.redeemed_key_val && !row.is_gift && row.key_type === 'steam') {
                  actions.push(
                    hm(
                      'a',
                      {
                        class: styles.btn,
                        href: `https://store.steampowered.com/account/registerkey?key=${row.redeemed_key_val}`,
                        target: '_blank',
                      },
                      hm('i', { class: 'hb hb-shopping-cart-light', title: 'Redeem' })
                    )
                  )
                }

                if (row.redeemed_key_val && row.is_gift && !row.is_expired) {
                  actions.push(
                    hm(
                      'a',
                      {
                        class: styles.btn,
                        href: row.redeemed_key_val,
                        target: '_blank',
                      },
                      hm('i', { class: 'hb hb-shopping-cart-light', title: 'Redeem' })
                    )
                  )
                }

                if (!row.redeemed_key_val && !row.is_gift && !row.is_expired) {
                  actions.push(
                    hm(
                      'button',
                      {
                        class: styles.btn,
                        type: 'button',
                        onclick: async () => {
                          try {
                            const key = await redeem(row)
                            await navigator.clipboard.writeText(key)
                            showToast('Key copied to clipboard')
                          } catch (error) {
                            showToast(error instanceof Error ? error.message : String(error))
                          }
                        },
                      },
                      hm('i', { class: 'hb hb-magic', title: 'Reveal' })
                    ),
                    hm(
                      'button',
                      {
                        class: styles.btn,
                        type: 'button',
                        onclick: async () => {
                          try {
                            const link = await redeem(row, true)
                            await navigator.clipboard.writeText(link)
                            showToast('Link copied to clipboard')
                          } catch (error) {
                            showToast(error instanceof Error ? error.message : String(error))
                          }
                        },
                      },
                      hm('i', { class: 'hb hb-gift', title: 'Create gift link' })
                    )
                  )
                }

                return hm('div', { class: styles.row_actions }, actions)
              },
            },
          ],
          data: products,
          layout: {
            top1: {
              searchBuilder: {
                columns: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
              },
            },
          },
          createdRow: function (row, data: Product) {
            if (data.is_expired) {
              row.classList.add(styles.expired)
            }
          },
        }))
    )

    // Warnings when selecting certain column filters

    const container = dt.table().container() as HTMLElement
    const searchBuilderRoot = container.querySelector('.dtsb-searchBuilder') as HTMLElement | null

    type WarningRule = {
      element: HTMLElement
      show: (selectedColumns: string[]) => boolean
    }

    const makeWarning = (text: string): HTMLElement =>
      hm('div', {
        class: 'warning-wrapper',
        innerText: text,
        hidden: true,
      }) as HTMLElement

    const getSelectedColumns = (): string[] =>
      Array.from(
        searchBuilderRoot?.querySelectorAll<HTMLSelectElement>('select.dtsb-data') ?? []
      ).map((select) => select.selectedOptions[0]?.text.trim() ?? '')

    const warnings: WarningRule[] = [
      {
        element: makeWarning(
          '⚠️ "Owned" column: Keys containing multiple app IDs/content can incorrectly appear owned because only one app ID is returned by Humble\'s API. This column may also contain many null values.'
        ),
        show: (selectedColumns) => selectedColumns.includes('Owned'),
      },
      {
        element: makeWarning(
          '⚠️ "Redeemed" column uses Steam Support app ID data, which may be inaccurate when the key\'s package (sub ID) contains more than one app ID.'
        ),
        show: (selectedColumns) => selectedColumns.includes('Redeemed'),
      },
    ]

    for (const warning of warnings) {
      container.insertAdjacentElement('beforebegin', warning.element)
    }

    const refreshWarnings = (): void => {
      const selectedColumns = getSelectedColumns()

      for (const warning of warnings) {
        warning.element.hidden = !warning.show(selectedColumns)
      }
    }

    refreshWarnings()

    searchBuilderRoot?.addEventListener('change', refreshWarnings)

    const observer = searchBuilderRoot ? new MutationObserver(refreshWarnings) : null

    if (searchBuilderRoot) {
      observer?.observe(searchBuilderRoot, {
        subtree: true,
        childList: true,
      })
    }

    onCleanup(() => {
      searchBuilderRoot?.removeEventListener('change', refreshWarnings)
      observer?.disconnect()
      for (const warning of warnings) warning.element.remove()
    })
  })
  console.debug('Table Loaded')
  return <table ref={tableRef} id="hb_extractor-table" class="display compact"></table>
}
