import { onMount, type Setter } from 'solid-js'
import { copyToClipboard, redeem, type Product } from '../util'
import DataTable, { type Api } from 'datatables.net-dt'
import { hm } from '@violentmonkey/dom'
// @ts-expect-error missing types
import styles from '../style.module.css'
import { showToast } from '@violentmonkey/ui'

export function Table({ products, setDt }: { products: Product[]; setDt: Setter<Api<Product>> }) {
  let tableRef!: HTMLTableElement
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
              targets: [9],
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
            top1: 'searchBuilder',
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
