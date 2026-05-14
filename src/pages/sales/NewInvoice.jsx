import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { Plus, Trash2, Search } from "lucide-react"
import toast from "react-hot-toast"

const emptyRow = () => ({ product_id: null, product_name: "", quantity: 1, unit_price: 0, discount: 0, total: 0 })

export default function NewInvoice({ storeId, onBack }) {
  const [customers, setCustomers] = useState([])
  const [products,  setProducts]  = useState([])
  const [rows,      setRows]      = useState([emptyRow()])
  const [header,    setHeader]    = useState({
    customer_id: "", invoice_date: new Date().toISOString().split("T")[0],
    payment_method: "cash", discount: 0, tax: 0, notes: "",
  })
  const [saving,    setSaving]    = useState(false)
  const [prodSearch, setProdSearch] = useState("")

  useEffect(() => {
    if (!storeId) return
    supabase.from("customers").select("id,name,phone").eq("store_id", storeId).order("name")
      .then(({ data }) => setCustomers(data || []))
    supabase.from("products").select("id,name,selling_price,unit,stock_quantity").eq("store_id", storeId).eq("is_active", true).order("name")
      .then(({ data }) => setProducts(data || []))
  }, [storeId])

  function updateRow(i, field, val) {
    const updated = [...rows]
    updated[i][field] = val
    if (field === "quantity" || field === "unit_price" || field === "discount") {
      const qty   = parseFloat(updated[i].quantity)  || 0
      const price = parseFloat(updated[i].unit_price) || 0
      const disc  = parseFloat(updated[i].discount)   || 0
      updated[i].total = Math.max(0, qty * price - disc)
    }
    if (field === "product_name") {
      const match = products.find(p => p.name.toLowerCase().includes(val.toLowerCase()))
      if (match && val.length > 1) {
        updated[i].product_id  = match.id
        updated[i].unit_price  = match.selling_price
        updated[i].total       = parseFloat(updated[i].quantity) * match.selling_price
      }
    }
    setRows(updated)
  }

  function selectProduct(i, product) {
    const updated = [...rows]
    updated[i].product_id   = product.id
    updated[i].product_name = product.name
    updated[i].unit_price   = product.selling_price
    updated[i].total        = parseFloat(updated[i].quantity) * product.selling_price
    setRows(updated)
  }

  const subtotal = rows.reduce((s, r) => s + (parseFloat(r.total) || 0), 0)
  const discount = parseFloat(header.discount) || 0
  const tax      = parseFloat(header.tax)      || 0
  const total    = Math.max(0, subtotal - discount + tax)

  async function handleSave(status = "paid") {
    const validRows = rows.filter(r => r.product_name.trim() && r.quantity > 0)
    if (validRows.length === 0) return toast.error("Add at least one item")
    setSaving(true)
    try {
      const invNum = "INV-" + Date.now().toString().slice(-6)
      const { data: inv, error } = await supabase.from("invoices").insert({
        store_id:       storeId,
        customer_id:    header.customer_id || null,
        invoice_number: invNum,
        invoice_date:   header.invoice_date,
        subtotal:       Math.round(subtotal * 100) / 100,
        discount,
        tax,
        total:          Math.round(total * 100) / 100,
        paid_amount:    status === "paid" ? Math.round(total * 100) / 100 : 0,
        payment_method: header.payment_method,
        status,
        notes:          header.notes,
      }).select().single()
      if (error) throw error

      await supabase.from("invoice_items").insert(
        validRows.map(r => ({
          invoice_id:   inv.id,
          product_id:   r.product_id,
          product_name: r.product_name,
          quantity:     parseFloat(r.quantity),
          unit_price:   parseFloat(r.unit_price),
          discount:     parseFloat(r.discount) || 0,
          total:        parseFloat(r.total),
        }))
      )

      // Deduct stock
      for (const r of validRows) {
        if (r.product_id) {
          const { data: p } = await supabase.from("products").select("stock_quantity").eq("id", r.product_id).single()
          if (p) await supabase.from("products").update({ stock_quantity: p.stock_quantity - parseFloat(r.quantity) }).eq("id", r.product_id)
        }
      }

      toast.success("Invoice saved!")
      onBack()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase())).slice(0, 8)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">← Back</button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex-1">New Sales Invoice</h1>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-4">
        {/* Invoice header */}
        <div className="grid grid-cols-3 gap-4 mb-6 pb-6 border-b border-gray-100 dark:border-gray-800">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Customer</label>
            <select value={header.customer_id} onChange={e => setHeader({...header, customer_id: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">Walk-in customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Invoice date</label>
            <input type="date" value={header.invoice_date} onChange={e => setHeader({...header, invoice_date: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Payment mode</label>
            <select value={header.payment_method} onChange={e => setHeader({...header, payment_method: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none">
              {["cash","card","esewa","khalti","bank_transfer","credit"].map(m => (
                <option key={m} value={m} className="capitalize">{m.replace("_"," ")}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick product search */}
        <div className="mb-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={prodSearch} onChange={e => setProdSearch(e.target.value)}
              placeholder="Quick search products to add…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-dashed border-orange-300 dark:border-orange-700 rounded-lg bg-orange-50 dark:bg-orange-950 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          {prodSearch && (
            <div className="mt-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
              {filteredProducts.map(p => (
                <button key={p.id} onClick={() => {
                  const emptyRow = rows.findIndex(r => !r.product_name)
                  if (emptyRow >= 0) { selectProduct(emptyRow, p) }
                  else { const nr = emptyRow(); nr.product_id = p.id; nr.product_name = p.name; nr.unit_price = p.selling_price; nr.total = p.selling_price; setRows([...rows, nr]) }
                  setProdSearch("")
                }} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-orange-50 dark:hover:bg-orange-950 border-b border-gray-100 dark:border-gray-800 last:border-0 text-left">
                  <span className="text-sm text-gray-900 dark:text-white">{p.name}</span>
                  <span className="text-sm text-gray-500">Rs {p.selling_price} · {p.stock_quantity} {p.unit}</span>
                </button>
              ))}
              {filteredProducts.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No products found</p>}
            </div>
          )}
        </div>

        {/* Line items table */}
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="text-left px-3 py-2 text-gray-500 font-medium rounded-l-lg w-8">S.N.</th>
              <th className="text-left px-3 py-2 text-gray-500 font-medium">Item name</th>
              <th className="text-right px-3 py-2 text-gray-500 font-medium w-20">Qty</th>
              <th className="text-right px-3 py-2 text-gray-500 font-medium w-28">Rate (Rs)</th>
              <th className="text-right px-3 py-2 text-gray-500 font-medium w-28">Discount</th>
              <th className="text-right px-3 py-2 text-gray-500 font-medium w-28 rounded-r-lg">Amount</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-gray-800">
                <td className="px-3 py-2 text-gray-400 text-center">{i + 1}</td>
                <td className="px-2 py-2">
                  <input value={row.product_name} onChange={e => updateRow(i, "product_name", e.target.value)}
                    placeholder="Enter item name or search above"
                    className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </td>
                <td className="px-2 py-2">
                  <input type="number" value={row.quantity} onChange={e => updateRow(i, "quantity", e.target.value)} min="1"
                    className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </td>
                <td className="px-2 py-2">
                  <input type="number" value={row.unit_price} onChange={e => updateRow(i, "unit_price", e.target.value)} min="0"
                    className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </td>
                <td className="px-2 py-2">
                  <input type="number" value={row.discount} onChange={e => updateRow(i, "discount", e.target.value)} min="0"
                    className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </td>
                <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">
                  Rs {parseFloat(row.total || 0).toLocaleString("en-IN")}
                </td>
                <td className="px-1 py-2">
                  {rows.length > 1 && (
                    <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button onClick={() => setRows([...rows, emptyRow()])}
          className="flex items-center gap-2 text-sm text-orange-500 hover:text-orange-600 mb-6">
          <Plus size={15} /> Add billing item
        </button>

        {/* Footer */}
        <div className="flex gap-8 justify-between">
          <div className="flex-1 max-w-sm">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes / Remarks</label>
            <textarea value={header.notes} onChange={e => setHeader({...header, notes: e.target.value})} rows={3}
              placeholder="Any additional notes for this invoice…"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none resize-none" />
          </div>
          <div className="w-64 space-y-3">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span><span>Rs {subtotal.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Discount (Rs)</span>
              <input type="number" value={header.discount} onChange={e => setHeader({...header, discount: e.target.value})} min="0"
                className="w-24 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded text-right text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none" />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Tax (Rs)</span>
              <input type="number" value={header.tax} onChange={e => setHeader({...header, tax: e.target.value})} min="0"
                className="w-24 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded text-right text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none" />
            </div>
            <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white border-t border-gray-200 dark:border-gray-700 pt-3">
              <span>Total</span><span>Rs {total.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3">
        <button onClick={onBack} className="px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
        <button onClick={() => handleSave("unpaid")} disabled={saving}
          className="px-4 py-2.5 text-sm border border-orange-500 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950 rounded-lg font-medium disabled:opacity-50">
          Save & Mark Unpaid
        </button>
        <button onClick={() => handleSave("paid")} disabled={saving}
          className="px-6 py-2.5 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium disabled:opacity-50">
          {saving ? "Saving…" : "Save Invoice"}
        </button>
      </div>
    </div>
  )
}
