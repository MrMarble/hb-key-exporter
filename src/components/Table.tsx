import { onCleanup, onMount, type Setter } from 'solid-js'
import { redeem, fetchActivatedDate, setActivatedDate, type Product } from '../util'
import DataTable, { type Api } from 'datatables.net-dt'
import { hm } from '@violentmonkey/dom'
// @ts-expect-error missing types
import styles from '../style.module.css'
import { showToast } from '@violentmonkey/ui'

export function Table({ products, setDt }: { products: Product[]; setDt: Setter<Api<Product>> }) {
  let tableRef!: HTMLTableElement

  onMount(() => {
    console.debug('Mounting table with', products.length, 'products')

    // Cast: TypeScript thinks render.date() isn't callable
    type DtRender<T> = (data: unknown, type: string, row: T, meta: unknown) => string
    const dtDate = DataTable.render.date() as unknown as DtRender<Product>

    const renderCellValue = (data: unknown, type: string): string | undefined => {
      if (data == null || data === '') return type === 'display' ? '-' : ''
      if (type !== 'display') return String(data)
      return undefined
    }

    const displayDash = (data: unknown, type: string): string =>
      !data ? (type === 'display' ? '-' : '') : String(data)

    const displayDate = (data: unknown, type: string, row: Product, meta: unknown): string => {
      if (!data) return type === 'display' ? '-' : ''

      if (type === 'display') return dtDate(data, type, row, meta) // Formatted date for display

      return String(data) // Raw ISO date for SearchBuilder filter + correct sorting
    }

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
              title: 'Activated',
              data: null,
              type: 'string-utf8',
              render: (data, type, row) => {
                if (!row.steam_app_id || row.owned !== 'Yes') {
                  return type === 'display' ? '-' : ''
                }

                if (row.activated_date) {
                  return type === 'display' ? row.activated_date : row.activated_date
                }

                if (type !== 'display') return ''

                const btn = hm(
                  'button',
                  {
                    class: styles.btn,
                    type: 'button',
                    title: 'Fetch activation date from Steam',
                    onclick: async (e: MouseEvent) => {
                      const target = e.currentTarget as HTMLButtonElement
                      target.disabled = true
                      target.innerHTML = '<i class="hb hb-spin hb-spinner"></i>'
                      try {
                        const date = await fetchActivatedDate(row.steam_app_id!)
                        if (date) {
                          setActivatedDate(row.steam_app_id!, date)
                          row.activated_date = date
                          target.parentElement!.textContent = date
                          dt.rows().invalidate().draw(false)
                        } else {
                          showToast('No activation date found')
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
                return btn as unknown as string
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

                if (
                  row.redeemed_key_val &&
                  !row.is_gift &&
                  !row.is_expired &&
                  row.key_type === 'steam'
                ) {
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
          '⚠️ "Owned" column: Keys containing packages can incorrectly appear owned when only the base game is owned. This column may also contain many null values.'
        ),
        show: (selectedColumns) => selectedColumns.includes('Owned'),
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
