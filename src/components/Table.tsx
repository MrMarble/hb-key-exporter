import { onMount, type Setter } from 'solid-js'
import { copyToClipboard, redeem, type Product } from '../util'
import DataTable, { type Api } from 'datatables.net-dt'
import { hm } from '@violentmonkey/dom'
// @ts-expect-error missing types
import styles from '../style.module.css'
import { showToast } from '@violentmonkey/ui'

// Collect unique country codes from product data
const collectCountries = (products: Product[]) => {
  const codes = new Set<string>()
  for (const p of products) {
    for (const c of p.exclusive_countries) codes.add(c)
    for (const c of p.disallowed_countries) codes.add(c)
  }
  return [...codes].sort()
}

const createCountrySelect = (countries: string[], preDefined: string[] | null) => {
  const container = document.createElement('div')
  const select = document.createElement('select')
  select.className = 'dtsb-value dtsb-input'
  const defaultOpt = document.createElement('option')
  defaultOpt.value = ''
  defaultOpt.disabled = true
  defaultOpt.selected = true
  defaultOpt.textContent = 'Country'
  select.appendChild(defaultOpt)
  for (const code of countries) {
    const opt = document.createElement('option')
    opt.value = code
    opt.textContent = code
    select.appendChild(opt)
  }
  if (preDefined?.[0]) select.value = preDefined[0]
  container.appendChild(select)
  return container
}

const getSelectValue = (el: HTMLElement[]) => {
  const select = el[0]?.querySelector('select') as HTMLSelectElement | null
  return select ? [select.value] : ['']
}

const registerRegionLockConditions = (countries: string[]) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ext = DataTable.ext as any
  const makeInit =
    () => (_that: unknown, fn: (...args: unknown[]) => void, preDefined: string[] | null) => {
      const container = createCountrySelect(countries, preDefined)
      container.querySelector('select')!.addEventListener('change', () => fn(_that, container))
      return container
    }

  ext.searchBuilder.conditions.regionLock = {
    redeemable: {
      conditionName: 'Redeemable in',
      init: makeInit(),
      inputValue: getSelectValue,
      isInputValid: (el: HTMLElement[]) => !!getSelectValue(el)[0],
      search: (value: string, comparison: string[]) => {
        const country = comparison[0]
        if (!country) return true
        if (!value || value === 'NONE') return true
        if (value.startsWith('ONLY:')) return value.substring(5).split(',').includes(country)
        if (value.startsWith('NOT:')) return !value.substring(4).split(',').includes(country)
        return true
      },
    },
    notRedeemable: {
      conditionName: 'Not redeemable in',
      init: makeInit(),
      inputValue: getSelectValue,
      isInputValid: (el: HTMLElement[]) => !!getSelectValue(el)[0],
      search: (value: string, comparison: string[]) => {
        const country = comparison[0]
        if (!country) return true
        if (!value || value === 'NONE') return false
        if (value.startsWith('ONLY:')) return !value.substring(5).split(',').includes(country)
        if (value.startsWith('NOT:')) return value.substring(4).split(',').includes(country)
        return false
      },
    },
  }
}

export function Table({ products, setDt }: { products: Product[]; setDt: Setter<Api<Product>> }) {
  let tableRef!: HTMLTableElement
  registerRegionLockConditions(collectCountries(products))
  onMount(() => {
    console.debug('Mounting table with', products.length, 'products')
    setDt(
      () =>
        new DataTable<Product>(tableRef, {
          columnDefs: [
            {
              targets: [7, 8],
              render: DataTable.render.date(),
            },
            {
              targets: [10],
              data: null,
              defaultContent: '',
            },
          ],
          order: {
            idx: 7,
            dir: 'desc',
          },
          columns: [
            {
              title: 'Type',
              data: 'key_type',
              type: 'html-utf8',
              render: (data, type, row) =>
                hm(
                  'i',
                  {
                    class: `hb hb-key hb-${data}`,
                    onclick: () => showToast(JSON.stringify(row, null, 2)),
                  },
                  hm('span', { class: 'hidden', innerText: data })
                ),
              className: styles.platform,
            },
            {
              title: 'Name',
              data: 'human_name',
              type: 'html-utf8',
              render: (data, _, row) =>
                row.steam_app_id
                  ? hm('a', {
                      href: `https://store.steampowered.com/app/${row.steam_app_id}`,
                      target: '_blank',
                      innerText: data,
                    })
                  : data,
            },
            { title: 'Category', data: 'category', type: 'string-utf8' },
            {
              title: 'Bundle Name',
              data: 'category_human_name',
              type: 'html-utf8',
              render: (data, _, row) =>
                hm('a', {
                  href: `https://www.humblebundle.com/download?key=${row.category_id}`,
                  target: '_blank',
                  innerText: data,
                }),
            },
            { title: 'Gift', data: 'type', type: 'string-utf8' },
            {
              title: 'Revealed',
              data: (row: Product) => (row.is_gift || row.redeemed_key_val ? 'Yes' : 'No'),
              type: 'string-utf8',
            },
            { title: 'Owned', data: 'owned', type: 'string-utf8' },
            { title: 'Purchased', data: 'created', type: 'date' },
            { title: 'Exp. Date', data: 'expiry_date', type: 'date' },
            {
              title: 'Region Lock',
              data: 'region_lock',
              // @ts-expect-error searchBuilderType is a valid DataTables option
              searchBuilderType: 'regionLock',
              render: (_data: string, type: string, row: Product) => {
                if (type === 'filter' || type === 'type') {
                  if (row.exclusive_countries.length)
                    return 'ONLY:' + row.exclusive_countries.join(',')
                  if (row.disallowed_countries.length)
                    return 'NOT:' + row.disallowed_countries.join(',')
                  return 'NONE'
                }
                if (row.exclusive_countries.length || row.disallowed_countries.length) {
                  const countries = (
                    row.exclusive_countries.length
                      ? row.exclusive_countries
                      : row.disallowed_countries
                  ).join(', ')
                  return hm('span', { title: countries, style: 'cursor: help' }, row.region_lock)
                }
                return row.region_lock
              },
            },
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
                          copyToClipboard(row.redeemed_key_val).then(() =>
                            showToast('Copied to clipboard')
                          )
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
                        onclick: () => {
                          redeem(row)
                            .then((data) => copyToClipboard(data))
                            .then(() => showToast('Key copied to clipboard'))
                        },
                      },
                      hm('i', { class: 'hb hb-magic', title: 'Reveal' })
                    ),
                    hm(
                      'button',
                      {
                        class: styles.btn,
                        type: 'button',
                        onclick: () => {
                          redeem(row, true)
                            .then((link) => copyToClipboard(link))
                            .then(() => showToast('Link copied to clipboard'))
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
        })
    )
  })
  console.debug('Table Loaded')
  return <table ref={tableRef} id="hb_extractor-table" class="display compact"></table>
}
