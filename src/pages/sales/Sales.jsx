import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { Plus, Search, Eye, Printer, FileText, X, ChevronDown, Settings } from "lucide-react"
import NewInvoice from "./NewInvoice"

export default function Sales() {
  const { storeId }             = useStoreId()
  const [invoices,  setInvoices]= useState([])
  const [loading,   setLoading] = useState(true)
  const [view,      setView]    = useState("list")
  const [selected,  setSelected]= useState(null)
  const [search,    setSearch]  = useState("")
  const [status,    setStatus]  = useState("all")
  const [dateFrom,  setDateFrom]= useState("")
  const [dateTo,    setDateTo]  = useState("")

  useEffect(() => { if (storeId) load() }, [storeId])

  async function load() {
    setLoading(true)
    const all = []
    let page = 0
    while (true) {
      const { data } = await supabase
        .from("invoices")
        .select("*, customers(name, phone)")
        .eq("store_id", storeId)
        .order("invoice_date", { ascending: false })
        .range(page * 1000, (page + 1) * 1000 - 1)
      all.push(...(data || []))
      if ((data || []).length < 1000) break
      page++
    }
    setInvoices(all)
    setLoading(false)
  }

  async function loadDetail(inv) {
    const { data: items } = await supabase
      .from("invoice_items").select("*").eq("invoice_id", inv.id)
    setSelected({ ...inv, items: items || [] })
    setView("detail")
  }

  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase()
    return (
      (!search || inv.invoice_number?.toLowerCase().includes(q) || inv.customers?.name?.toLowerCase().includes(q)) &&
      (status === "all" || inv.status === status) &&
      (!dateFrom || inv.invoice_date >= dateFrom) &&
      (!dateTo   || inv.invoice_date <= dateTo)
    )
  })

  const fmt = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

  // Detail view
  if (view === "detail" && selected) return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => setView("list")} className="btn-sm btn-outline">← Back</button>
        <h1 className="text-base font-bold text-gray-900 flex-1">{selected.invoice_number}</h1>
        <button onClick={() => window.print()} className="btn-sm btn-outline"><Printer size={13}/> Print</button>
      </div>
      <div className="card p-6">
        <div className="flex justify-between mb-6 pb-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900 mb-3">TAX INVOICE</h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex gap-3"><span className="text-gray-400 w-24 shrink-0">Invoice No</span><span className="font-semibold text-gray-900">{selected.invoice_number}</span></div>
              <div className="flex gap-3"><span className="text-gray-400 w-24 shrink-0">Date (AD)</span><span className="text-gray-700">{formatAD(selected.invoice_date)}</span></div>
              <div className="flex gap-3"><span className="text-gray-400 w-24 shrink-0">Date (BS)</span><span className="text-gray-700">{formatBS(selected.invoice_date)}</span></div>
              <div className="flex gap-3"><span className="text-gray-400 w-24 shrink-0">Payment</span><span className="text-gray-700 capitalize">{selected.payment_method?.replace("_"," ")}</span></div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 mb-1">Bill To</p>
            <p className="font-semibold text-gray-900">{selected.customers?.name || "Walk-in Customer"}</p>
            {selected.customers?.phone && <p className="text-sm text-gray-400 mt-0.5">{selected.customers.phone}</p>}
          </div>
        </div>
        <table className="tbl mb-5">
          <thead><tr><th>S.N.</th><th>Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Discount</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {selected.items.map((item, i) => (
              <tr key={item.id}>
                <td className="text-gray-400">{i+1}</td>
                <td className="font-medium text-gray-900">{item.product_name}</td>
                <td className="text-right">{item.quantity}</td>
                <td className="text-right">{fmt(item.unit_price)}</td>
                <td className="text-right text-gray-400">{item.discount > 0 ? fmt(item.discount) : "—"}</td>
                <td className="text-right font-semibold">{fmt(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end">
          <div className="w-56 space-y-2 text-sm">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="text-gray-900">{fmt(selected.subtotal)}</span></div>
            {selected.discount > 0 && <div className="flex justify-between text-gray-500"><span>Discount</span><span className="text-gray-900">- {fmt(selected.discount)}</span></div>}
            {selected.tax > 0 && <div className="flex justify-between text-gray-500"><span>Tax</span><span className="text-gray-900">{fmt(selected.tax)}</span></div>}
            {(selected.delivery_charge||0)>0 && <div className="flex justify-between text-gray-500"><span>Delivery</span><span className="text-gray-900">+ {fmt(selected.delivery_charge)}</span></div>}
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2"><span>Total</span><span>{fmt(selected.total)}</span></div>
            <div className="flex justify-between text-gray-500"><span>Paid</span><span className="text-gray-900">{fmt(selected.paid_amount)}</span></div>
            {selected.total - selected.paid_amount > 0 && <div className="flex justify-between text-gray-500"><span>Balance</span><span className="font-semibold text-gray-900">{fmt(selected.total-selected.paid_amount)}</span></div>}
            <div className="flex justify-between pt-1">
              <span className="text-gray-500">Status</span>
              <span className={`badge ${selected.status==="paid"?"badge-paid":selected.status==="partial"?"badge-partial":"badge-unpaid"}`}>{selected.status.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // New invoice
  if (view === "new") return <NewInvoice storeId={storeId} onBack={() => { setView("list"); load() }} />

  // List view
  return (
    <div className="p-5">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-base font-bold text-gray-900">
          Sales Invoices <span className="text-sm font-normal text-gray-400">({filtered.length})</span>
        </h1>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><Settings size={15}/></button>
          <button onClick={() => setView("new")}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            <Plus size={14}/> Create Sales Invoice
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search invoices..."
            className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg w-52 focus:outline-none focus:border-blue-400"/>
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X size={12}/></button>}
        </div>

        <div className="relative">
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="appearance-none pl-3 pr-7 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 cursor-pointer">
            <option value="all">All Status</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
        </div>

        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"/>
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"/>
          {(dateFrom||dateTo) && <button onClick={() => {setDateFrom("");setDateTo("")}} className="text-gray-400"><X size={13}/></button>}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
                {["Invoice No","Party Name","Date","Status","Total Amount","Unpaid Amount","Action"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "48px" }}>
                  <div style={{ width: "20px", height: "20px", border: "2px solid #2563eb", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }}/>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "64px" }}>
                  <p style={{ fontSize: "13px", color: "#9ca3af" }}>No invoices found</p>
                </td></tr>
              ) : filtered.map(inv => {
                const unpaid = Math.max(0, inv.total - inv.paid_amount)
                return (
                  <tr key={inv.id}
                    style={{ borderBottom: "1px solid #f3f4f6", cursor: "default" }}
                    onMouseEnter={e => e.currentTarget.style.background="#f9fafb"}
                    onMouseLeave={e => e.currentTarget.style.background="#fff"}>

                    <td style={{ padding: "12px 16px" }}>
                      <button onClick={() => loadDetail(inv)}
                        style={{ fontSize: "13px", fontWeight: 600, color: "#111827", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        onMouseEnter={e => e.currentTarget.style.color="#2563eb"}
                        onMouseLeave={e => e.currentTarget.style.color="#111827"}>
                        {inv.invoice_number}
                      </button>
                    </td>

                    <td style={{ padding: "12px 16px" }}>
                      <p style={{ fontSize: "13px", fontWeight: 500, color: "#1f2937" }}>{inv.customers?.name || "Walk-in Customer"}</p>
                      {inv.customers?.phone && <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: "1px" }}>{inv.customers.phone}</p>}
                    </td>

                    <td style={{ padding: "12px 16px" }}>
                      <p style={{ fontSize: "13px", color: "#374151" }}>{formatAD(inv.invoice_date)}</p>
                      <p style={{ fontSize: "11px", color: "#6b7280", marginTop: "1px" }}>{formatBS(inv.invoice_date)}</p>
                    </td>

                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
                        background: inv.status==="paid"?"#dcfce7":inv.status==="partial"?"#fef3c7":"#fee2e2",
                        color: inv.status==="paid"?"#15803d":inv.status==="partial"?"#92400e":"#dc2626"
                      }}>
                        {inv.status.toUpperCase()}
                      </span>
                    </td>

                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#111827" }}>
                      {fmt(inv.total)}
                    </td>

                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#111827" }}>
                      {unpaid > 0 ? fmt(unpaid) : <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>

                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button onClick={() => loadDetail(inv)}
                          style={{ padding: "6px", borderRadius: "6px", border: "none", background: "none", cursor: "pointer", color: "#9ca3af" }}
                          onMouseEnter={e => {e.currentTarget.style.background="#f3f4f6";e.currentTarget.style.color="#374151"}}
                          onMouseLeave={e => {e.currentTarget.style.background="none";e.currentTarget.style.color="#9ca3af"}}>
                          <Eye size={15}/>
                        </button>
                        <button
                          style={{ padding: "6px", borderRadius: "6px", border: "none", background: "none", cursor: "pointer", color: "#9ca3af" }}
                          onMouseEnter={e => {e.currentTarget.style.background="#f3f4f6";e.currentTarget.style.color="#374151"}}
                          onMouseLeave={e => {e.currentTarget.style.background="none";e.currentTarget.style.color="#9ca3af"}}>
                          <Printer size={15}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid #f3f4f6", background: "#f9fafb", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", color: "#9ca3af" }}>{filtered.length} of {invoices.length} invoices</span>
            <span style={{ fontSize: "12px", color: "#6b7280" }}>Total: <strong style={{ color: "#111827" }}>{fmt(filtered.reduce((s,i)=>s+i.total,0))}</strong></span>
          </div>
        )}
      </div>
    </div>
  )
}
