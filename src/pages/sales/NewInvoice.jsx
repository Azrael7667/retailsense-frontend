import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { Plus, Trash2, Search, X, ChevronDown } from "lucide-react"
import toast from "react-hot-toast"

const emptyRow = () => ({
  product_id: null, product_name: "", quantity: 1,
  unit_price: 0, discount: 0, total: 0
})

export default function NewInvoice({ storeId, onBack }) {
  const [customers,    setCustomers]    = useState([])
  const [products,     setProducts]     = useState([])
  const [rows,         setRows]         = useState([emptyRow()])
  const [header,       setHeader]       = useState({
    customer_id: "", invoice_date: new Date().toISOString().split("T")[0],
    payment_method: "cash", discount: 0, tax: 0, notes: "",
    delivery_charge: 0, delivery_address: "", delivery_note: "",
  })
  const [saving,       setSaving]       = useState(false)
  const [showDelivery, setShowDelivery] = useState(false)
  const [custOpen,     setCustOpen]     = useState(false)
  const [custSearch,   setCustSearch]   = useState("")
  const [activeRowSearch, setActiveRowSearch] = useState(null)
  const [prodSearch,   setProdSearch]   = useState("")
  const custRef = useRef(null)

  useEffect(() => {
    if (!storeId) return
    supabase.from("customers").select("id,name,phone,balance").eq("store_id", storeId).order("name")
      .then(({ data }) => setCustomers(data || []))
    supabase.from("products").select("id,name,selling_price,unit,stock_quantity,sku")
      .eq("store_id", storeId).eq("is_active", true).order("name")
      .then(({ data }) => setProducts(data || []))
  }, [storeId])

  // Close party dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (custRef.current && !custRef.current.contains(e.target)) {
        setCustOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function updateRow(i, field, val) {
    const u = [...rows]
    u[i][field] = val
    if (["quantity","unit_price","discount"].includes(field)) {
      u[i].total = Math.max(0,
        (parseFloat(u[i].quantity)||0) * (parseFloat(u[i].unit_price)||0) -
        (parseFloat(u[i].discount)||0)
      )
    }
    setRows(u)
  }

  function pickProduct(i, product) {
    const u = [...rows]
    u[i].product_id   = product.id
    u[i].product_name = product.name
    u[i].unit_price   = product.selling_price
    u[i].total        = product.selling_price * (parseFloat(u[i].quantity) || 1)
    setRows(u)
    setActiveRowSearch(null)
    setProdSearch("")
  }

  const subtotal = rows.reduce((s, r) => s + (parseFloat(r.total)||0), 0)
  const discount = parseFloat(header.discount) || 0
  const tax      = parseFloat(header.tax)      || 0
  const delivery = parseFloat(header.delivery_charge) || 0
  const total    = Math.max(0, subtotal - discount + tax + delivery)

  async function handleSave(payStatus = "paid") {
    const validRows = rows.filter(r => r.product_name.trim() && r.quantity > 0)
    if (!validRows.length) return toast.error("Add at least one item")
    setSaving(true)
    try {
      const { count } = await supabase.from("invoices")
        .select("id", { count: "exact", head: true }).eq("store_id", storeId)
      const invNum = `INV-${new Date().getFullYear()}-${String((count||0)+1).padStart(3,"0")}`

      const { data: inv, error } = await supabase.from("invoices").insert({
        store_id:         storeId,
        customer_id:      header.customer_id || null,
        invoice_number:   invNum,
        invoice_date:     header.invoice_date,
        subtotal:         Math.round(subtotal  * 100) / 100,
        discount, tax,
        delivery_charge:  delivery,
        delivery_address: header.delivery_address || null,
        delivery_note:    header.delivery_note    || null,
        total:            Math.round(total    * 100) / 100,
        paid_amount:      payStatus === "paid" ? Math.round(total * 100) / 100 : 0,
        payment_method:   header.payment_method,
        status:           payStatus === "paid" ? "paid" : "unpaid",
        notes:            header.notes,
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

      for (const r of validRows) {
        if (r.product_id) {
          const { data: p } = await supabase.from("products")
            .select("stock_quantity").eq("id", r.product_id).single()
          if (p) await supabase.from("products")
            .update({ stock_quantity: p.stock_quantity - parseFloat(r.quantity) })
            .eq("id", r.product_id)
        }
      }

      toast.success(`${invNum} saved!`)
      onBack()
    } catch(e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredCusts = customers.filter(c =>
    c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
    (c.phone||"").includes(custSearch)
  )

  const filteredProds = (q) => products.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    (p.sku||"").toLowerCase().includes(q.toLowerCase())
  ).slice(0, 8)

  const selCust = customers.find(c => c.id === header.customer_id)

  return (
    <div className="p-5 max-w-4xl">

      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          ← Back
        </button>
        <span className="text-gray-300">/</span>
        <h1 className="text-base font-bold text-gray-900">Create Sales Invoice</h1>
      </div>

      <div className="card">

        {/* Top: Party + Invoice info — Karobar layout */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-start gap-8">

            {/* Party selector */}
            <div className="flex-1 max-w-xs" ref={custRef}>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Select Party</p>
              <div className="relative">
                <button
                  onClick={() => { setCustOpen(!custOpen); setCustSearch("") }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <span className={selCust ? "text-gray-900 font-medium" : "text-gray-400"}>
                    {selCust ? selCust.name : "Search for party"}
                  </span>
                  <ChevronDown size={14} className="text-gray-400 shrink-0 ml-2" />
                </button>

                {custOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
                    <div className="p-2 border-b border-gray-100">
                      <input autoFocus
                        value={custSearch}
                        onChange={e => setCustSearch(e.target.value)}
                        placeholder="Search customers..."
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {/* Cash sale option */}
                      <button
                        onClick={() => { setHeader({...header, customer_id:""}); setCustOpen(false) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 text-left border-b border-gray-50">
                        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                          W
                        </div>
                        <span className="text-sm font-medium text-gray-700">Walk-in / Cash Sale</span>
                      </button>
                      {filteredCusts.map(c => (
                        <button key={c.id}
                          onClick={() => { setHeader({...header, customer_id:c.id}); setCustOpen(false) }}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                              {c.name[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{c.name}</p>
                              {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                            </div>
                          </div>
                          {c.balance > 0 && (
                            <span className="text-xs text-red-500 font-medium shrink-0 ml-2">
                              Due: Rs. {c.balance.toLocaleString("en-IN")}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Invoice No + Date — right side like Karobar */}
            <div className="flex items-start gap-8 ml-auto">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Invoice No</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">Auto</span>
                  <span className="text-xs text-gray-400">| INV-{new Date().getFullYear()}-###</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Invoice Date</p>
                <input type="date" value={header.invoice_date}
                  onChange={e => setHeader({...header, invoice_date: e.target.value})}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                <p className="text-xs text-blue-500 mt-1 font-medium">{formatBS(header.invoice_date)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Items table — Karobar style */}
        <div className="overflow-x-auto">
          <table style={{ minWidth: "100%" }}>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-12">S.N.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Item Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-28">Quantity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-36">Rate</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-32">Discount</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 w-32">Amount</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-4 py-3 text-sm text-gray-400">{i+1}</td>

                  {/* Item name with product search */}
                  <td className="px-4 py-3 relative">
                    <input
                      value={row.product_name}
                      onChange={e => {
                        updateRow(i, "product_name", e.target.value)
                        setActiveRowSearch(i)
                        setProdSearch(e.target.value)
                      }}
                      onFocus={() => { setActiveRowSearch(i); setProdSearch(row.product_name) }}
                      placeholder="Search or type item name"
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />

                    {/* Product dropdown */}
                    {activeRowSearch === i && prodSearch && filteredProds(prodSearch).length > 0 && (
                      <div className="absolute left-4 right-4 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20">
                        {filteredProds(prodSearch).map(p => (
                          <button key={p.id}
                            onMouseDown={() => pickProduct(i, p)}
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 text-left border-b border-gray-50 last:border-0">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{p.name}</p>
                              {p.sku && <p className="text-xs text-gray-400">#{p.sku}</p>}
                            </div>
                            <div className="text-right shrink-0 ml-4">
                              <p className="text-sm font-semibold text-gray-900">Rs. {p.selling_price.toLocaleString("en-IN")}</p>
                              <p className="text-xs text-gray-400">{p.stock_quantity} {p.unit} in stock</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Quantity */}
                  <td className="px-4 py-3">
                    <input type="number" value={row.quantity} min="1"
                      onChange={e => updateRow(i, "quantity", e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-center no-spin" />
                  </td>

                  {/* Rate */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400 shrink-0">Rs.</span>
                      <input type="number" value={row.unit_price} min="0"
                        onChange={e => updateRow(i, "unit_price", e.target.value)}
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 no-spin" />
                    </div>
                  </td>

                  {/* Discount */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <input type="number" value={row.discount} min="0"
                        onChange={e => updateRow(i, "discount", e.target.value)}
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 no-spin" />
                      <span className="text-xs text-gray-400 shrink-0">Rs.</span>
                    </div>
                  </td>

                  {/* Amount */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      Rs. {parseFloat(row.total||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </td>

                  {/* Delete */}
                  <td className="px-2 py-3">
                    {rows.length > 1 && (
                      <button onClick={() => setRows(rows.filter((_,j)=>j!==i))}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={14}/>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add item */}
        <div className="px-4 py-3 border-b border-gray-100">
          <button onClick={() => setRows([...rows, emptyRow()])}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1.5">
            <Plus size={14}/> Add Billing Item
          </button>
        </div>

        {/* Footer: notes + totals — Karobar layout */}
        <div className="p-5 grid grid-cols-2 gap-8">

          {/* Left: notes + payment mode + delivery */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Notes or Remarks</p>
              <textarea value={header.notes}
                onChange={e => setHeader({...header, notes: e.target.value})}
                rows={3}
                placeholder="Enter note or description..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none placeholder-gray-400" />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Payment Mode</p>
              <select value={header.payment_method}
                onChange={e => setHeader({...header, payment_method: e.target.value})}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 capitalize">
                {["cash","card","esewa","khalti","bank_transfer","credit"].map(m => (
                  <option key={m} value={m}>{m.replace("_"," ")}</option>
                ))}
              </select>
            </div>

            <button onClick={() => setShowDelivery(!showDelivery)}
              className="text-xs text-blue-600 font-medium flex items-center gap-1 hover:text-blue-700">
              <ChevronDown size={12} className={`transition-transform ${showDelivery ? "rotate-180" : ""}`}/>
              {showDelivery ? "Hide" : "Add"} Delivery Details
            </button>

            {showDelivery && (
              <div className="space-y-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Delivery Charge (Rs)</p>
                  <input type="number" min="0" value={header.delivery_charge}
                    onChange={e => setHeader({...header, delivery_charge: e.target.value})}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 no-spin" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Delivery Address</p>
                  <input value={header.delivery_address}
                    onChange={e => setHeader({...header, delivery_address: e.target.value})}
                    placeholder="Where to deliver?"
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
              </div>
            )}
          </div>

          {/* Right: totals — Karobar style */}
          <div>
            <div className="space-y-3">
              {/* Sub total */}
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-600">Sub Total</span>
                <span className="text-sm font-medium text-gray-900">
                  Rs. {subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Discount */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Discount (Rs)</span>
                <input type="number" value={header.discount} min="0"
                  onChange={e => setHeader({...header, discount: e.target.value})}
                  className="w-32 px-3 py-1.5 text-sm text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 no-spin" />
              </div>

              {/* Tax */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Tax (Rs)</span>
                <input type="number" value={header.tax} min="0"
                  onChange={e => setHeader({...header, tax: e.target.value})}
                  className="w-32 px-3 py-1.5 text-sm text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 no-spin" />
              </div>

              {/* Delivery */}
              {delivery > 0 && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-600">Delivery Charge</span>
                  <span className="text-sm text-gray-900">
                    Rs. {delivery.toLocaleString("en-IN")}
                  </span>
                </div>
              )}

              {/* Total — Karobar style bold */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <span className="text-base font-bold text-gray-900">Total Amount</span>
                <span className="text-base font-bold text-gray-900">
                  Rs. {total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons — Karobar style */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button onClick={onBack}
            className="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-300 bg-white rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={() => handleSave("unpaid")} disabled={saving}
            className="px-5 py-2 text-sm font-medium text-amber-600 border border-amber-200 bg-white rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50">
            Save & New
          </button>
          <button onClick={() => handleSave("paid")} disabled={saving}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm">
            {saving ? "Saving…" : "Save Sales Invoice"}
          </button>
        </div>
      </div>
    </div>
  )
}
