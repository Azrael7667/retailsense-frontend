import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Search, Eye, Printer, FileText, Filter } from "lucide-react"
import toast from "react-hot-toast"
import NewInvoice from "./NewInvoice"

export default function Sales() {
  const { storeId } = useStoreId()
  const [invoices,  setInvoices]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [view,      setView]      = useState("list") // list | new | detail
  const [selected,  setSelected]  = useState(null)
  const [search,    setSearch]    = useState("")
  const [filter,    setFilter]    = useState("all")

  useEffect(() => { if (storeId) load() }, [storeId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from("invoices")
      .select("*, customers(name, phone)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  async function loadDetail(inv) {
    const { data: items } = await supabase
      .from("invoice_items").select("*").eq("invoice_id", inv.id)
    setSelected({ ...inv, items: items || [] })
    setView("detail")
  }

  const fmt = (n) => "Rs " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

  const filtered = invoices.filter(inv => {
    const matchSearch = inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      inv.customers?.name?.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === "all" || inv.status === filter
    return matchSearch && matchFilter
  })

  const totalRevenue = filtered.reduce((s, i) => s + (i.total || 0), 0)
  const totalPaid    = filtered.reduce((s, i) => s + (i.paid_amount || 0), 0)
  const totalDue     = totalRevenue - totalPaid

  if (view === "new") return <NewInvoice storeId={storeId} onBack={() => { setView("list"); load() }} />

  if (view === "detail" && selected) return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => setView("list")} className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">← Back</button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex-1">{selected.invoice_number}</h1>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
          <Printer size={15} /> Print
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 print:shadow-none" id="invoice-print">
        {/* Invoice header */}
        <div className="flex justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-orange-500">TAX INVOICE</h2>
            <p className="text-sm text-gray-500 mt-1">Invoice No: <span className="font-medium text-gray-900 dark:text-white">{selected.invoice_number}</span></p>
            <p className="text-sm text-gray-500">Date: <span className="font-medium text-gray-900 dark:text-white">{selected.invoice_date}</span></p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Bill To:</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{selected.customers?.name || "Walk-in Customer"}</p>
            {selected.customers?.phone && <p className="text-sm text-gray-500">{selected.customers.phone}</p>}
          </div>
        </div>

        {/* Items table */}
        <table className="w-full mb-6 text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="text-left px-3 py-2 text-gray-500 font-medium rounded-l-lg">S.N.</th>
              <th className="text-left px-3 py-2 text-gray-500 font-medium">Item name</th>
              <th className="text-right px-3 py-2 text-gray-500 font-medium">Qty</th>
              <th className="text-right px-3 py-2 text-gray-500 font-medium">Rate</th>
              <th className="text-right px-3 py-2 text-gray-500 font-medium">Discount</th>
              <th className="text-right px-3 py-2 text-gray-500 font-medium rounded-r-lg">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {selected.items.map((item, i) => (
              <tr key={item.id}>
                <td className="px-3 py-3 text-gray-400">{i + 1}</td>
                <td className="px-3 py-3 text-gray-900 dark:text-white font-medium">{item.product_name}</td>
                <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-300">{item.quantity}</td>
                <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(item.unit_price)}</td>
                <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(item.discount || 0)}</td>
                <td className="px-3 py-3 text-right font-medium text-gray-900 dark:text-white">{fmt(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span><span>{fmt(selected.subtotal)}</span>
            </div>
            {selected.discount > 0 && (
              <div className="flex justify-between text-sm text-red-500">
                <span>Discount</span><span>- {fmt(selected.discount)}</span>
              </div>
            )}
            {selected.tax > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Tax</span><span>{fmt(selected.tax)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white border-t border-gray-200 dark:border-gray-700 pt-2">
              <span>Total</span><span>{fmt(selected.total)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>Payment</span><span className="capitalize">{selected.payment_method}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Status</span>
              <span className={`font-medium capitalize ${selected.status === "paid" ? "text-green-600" : "text-amber-500"}`}>{selected.status}</span>
            </div>
          </div>
        </div>

        {selected.notes && (
          <div className="mt-6 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-xs text-gray-500">Notes: {selected.notes}</p>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Sales & Invoices</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage all your sales transactions</p>
        </div>
        <button onClick={() => setView("new")}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total revenue", value: fmt(totalRevenue), color: "text-green-600 dark:text-green-400" },
          { label: "Amount received", value: fmt(totalPaid), color: "text-blue-600 dark:text-blue-400" },
          { label: "Balance due", value: fmt(totalDue), color: totalDue > 0 ? "text-red-500" : "text-gray-900 dark:text-white" },
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-400 mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice or customer…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        {["all","paid","partial","unpaid"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-2 text-xs rounded-lg font-medium capitalize transition-colors ${filter === f ? "bg-orange-500 text-white" : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50"}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {["Invoice no","Date","Customer","Items","Amount","Paid","Status",""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12">
                <FileText size={40} className="mx-auto text-gray-200 dark:text-gray-700 mb-3" />
                <p className="text-gray-400">No invoices yet. Create your first sale.</p>
              </td></tr>
            ) : filtered.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <td className="px-4 py-3 font-medium text-orange-500">{inv.invoice_number}</td>
                <td className="px-4 py-3 text-gray-500">{inv.invoice_date}</td>
                <td className="px-4 py-3 text-gray-900 dark:text-white">{inv.customers?.name || "Walk-in"}</td>
                <td className="px-4 py-3 text-gray-500">{inv.items_count || "—"}</td>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{fmt(inv.total)}</td>
                <td className="px-4 py-3 text-gray-500">{fmt(inv.paid_amount)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                    inv.status === "paid" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" :
                    inv.status === "partial" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" :
                    "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                  }`}>{inv.status}</span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => loadDetail(inv)} className="text-gray-400 hover:text-orange-500 transition-colors">
                    <Eye size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
