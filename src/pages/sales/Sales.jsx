import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { Plus, Search, Eye, Printer, FileText, X, ChevronDown, Settings } from "lucide-react"
import DateRangeDropdown from "../../components/common/DateRangeDropdown"

// Shared styles (same look as Dashboard / Inventory / Customers)
const FIELD       = "w-full px-3.5 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 focus:border-lime-500 transition-colors"
const BTN_DARK    = "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50"
const BTN_OUTLINE = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
const TH          = "px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"

const STATUS_STYLE = {
  paid:    "bg-green-50 text-green-700",
  partial: "bg-amber-50 text-amber-700",
  unpaid:  "bg-red-50 text-red-600",
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-lime-600 border-t-transparent rounded-full animate-spin mx-auto" />
}

const fmt = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

export default function Sales() {
  const { storeId } = useStoreId()
  const location    = useLocation()
  const navigate    = useNavigate()
  const [invoices,      setInvoices]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [selected,      setSelected]      = useState(null)   // invoice open in the popup
  const [detailLoading, setDetailLoading] = useState(false)
  const [search,        setSearch]        = useState("")
  const [status,        setStatus]        = useState("all")
  const [dateFrom,      setDateFrom]      = useState("")
  const [dateTo,        setDateTo]        = useState("")

  useEffect(() => { if (storeId) load() }, [storeId])

  // Old callers (e.g. Customers) may still navigate here with openCreate / openEdit state
  useEffect(() => {
    if (location.state?.openCreate) {
      navigate("/sales/create", { replace: true, state: { customerId: location.state.customerId || null } })
    } else if (location.state?.openEdit) {
      navigate("/sales/create", { replace: true, state: { customerId: location.state.customerId || null, editId: location.state.editId } })
    }
  }, [location.state])

  // Close the popup with the Escape key
  useEffect(() => {
    if (!selected) return
    function onKey(e) { if (e.key === "Escape") setSelected(null) }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [selected])

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

  // Opens the popup right away, then fills in the line items
  async function openDetail(inv) {
    setSelected({ ...inv, items: [] })
    setDetailLoading(true)
    const { data: items } = await supabase
      .from("invoice_items").select("*").eq("invoice_id", inv.id)
    setSelected({ ...inv, items: items || [] })
    setDetailLoading(false)
  }

  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase()
    const raw = (inv.invoice_number || "").toLowerCase()
    const short = shortDocNumber(inv.invoice_number, inv.invoice_date).toLowerCase()
    return (
      (!search || raw.includes(q) || short.includes(q) || inv.customers?.name?.toLowerCase().includes(q)) &&
      (status === "all" || inv.status === status) &&
      (!dateFrom || inv.invoice_date >= dateFrom) &&
      (!dateTo   || inv.invoice_date <= dateTo)
    )
  })

  const selectedNo = selected ? shortDocNumber(selected.invoice_number, selected.invoice_date) : ""
  const balance = selected ? (selected.total || 0) - (selected.paid_amount || 0) : 0

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col gap-4 px-6 py-5 overflow-hidden">

      {/* Title + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <h1 className="text-xl font-bold text-gray-900">
          Sales Invoices <span className="text-base font-normal text-gray-400">({filtered.length})</span>
        </h1>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" title="Settings">
            <Settings size={15} />
          </button>
          <button onClick={() => navigate("/sales/create")} className={BTN_DARK}>
            <Plus size={14} /> Create Sales Invoice
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <div className="relative w-full max-w-[16rem]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search invoices…"
            className={`${FIELD} pl-9 ${search ? "pr-9" : "pr-3"}`} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="relative w-40">
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="w-full appearance-none pl-3.5 pr-9 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-lime-400/40 focus:border-lime-500 cursor-pointer transition-colors">
            <option value="all">All Status</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        <DateRangeDropdown
          from={dateFrom}
          to={dateTo}
          onApply={({ from, to }) => { setDateFrom(from); setDateTo(to) }}
        />
      </div>

      {/* Table card: fixed card, rows scroll inside it, header stays pinned */}
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto slim-scroll">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_0_#f3f4f6]">
              <tr>
                <th className={TH}>Invoice No</th>
                <th className={TH}>Party Name</th>
                <th className={TH}>Date</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Total Amount</th>
                <th className={`${TH} text-right`}>Unpaid Amount</th>
                <th className={`${TH} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="py-16"><Spinner /></td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                      <FileText size={24} className="text-gray-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">No invoices found</p>
                    <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or create a new invoice</p>
                  </td>
                </tr>
              ) : filtered.map(inv => {
                const unpaid = Math.max(0, inv.total - inv.paid_amount)
                return (
                  <tr key={inv.id}
                    onClick={() => openDetail(inv)}
                    className="cursor-pointer transition-colors hover:bg-gray-50/70">

                    <td className="px-5 py-4 whitespace-nowrap font-medium text-gray-900">
                      {shortDocNumber(inv.invoice_number, inv.invoice_date)}
                    </td>

                    <td className="px-5 py-4">
                      <p className="text-[13px] font-medium text-gray-900">{inv.customers?.name || "Walk-in Customer"}</p>
                      {inv.customers?.phone && <p className="text-[11px] text-gray-400 mt-0.5">{inv.customers.phone}</p>}
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap">
                      <p className="text-[13px] text-gray-700">{formatAD(inv.invoice_date)}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{formatBS(inv.invoice_date)}</p>
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLE[inv.status] || STATUS_STYLE.unpaid}`}>
                        {inv.status.toUpperCase()}
                      </span>
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap text-right tabular-nums text-gray-900">
                      {fmt(inv.total)}
                    </td>

                    <td className={`px-5 py-4 whitespace-nowrap text-right tabular-nums ${unpaid > 0 ? "font-medium text-red-600" : "text-gray-400"}`}>
                      {unpaid > 0 ? fmt(unpaid) : "—"}
                    </td>

                    <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openDetail(inv)}
                          className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                          title="View">
                          <Eye size={15} />
                        </button>
                        <button
                          className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                          title="Print">
                          <Printer size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div className="shrink-0 px-5 py-2.5 border-t border-gray-100 bg-gray-50/70 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <p>
              Showing <span className="font-semibold text-gray-700">{filtered.length}</span> of{" "}
              <span className="font-semibold text-gray-700">{invoices.length}</span> invoices
            </p>
            <p>
              Total:{" "}
              <span className="font-semibold text-gray-700 tabular-nums">
                {fmt(filtered.reduce((s, i) => s + i.total, 0))}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Invoice popup */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-100">

            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-base font-semibold text-gray-900">{selectedNo}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className={BTN_OUTLINE}><Printer size={13} /> Print</button>
                <button onClick={() => setSelected(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Close">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto slim-scroll px-6 py-5">
              <div className="flex justify-between gap-4 mb-6 pb-5 border-b border-gray-100">
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-3">TAX INVOICE</h3>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex gap-3"><span className="text-gray-400 w-24 shrink-0">Invoice No</span><span className="font-semibold text-gray-900">{selectedNo}</span></div>
                    <div className="flex gap-3"><span className="text-gray-400 w-24 shrink-0">Date (AD)</span><span className="text-gray-700">{formatAD(selected.invoice_date)}</span></div>
                    <div className="flex gap-3"><span className="text-gray-400 w-24 shrink-0">Date (BS)</span><span className="text-gray-700">{formatBS(selected.invoice_date)}</span></div>
                    <div className="flex gap-3"><span className="text-gray-400 w-24 shrink-0">Payment</span><span className="text-gray-700 capitalize">{selected.payment_method?.replace("_", " ")}</span></div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 mb-1">Bill To</p>
                  <p className="font-semibold text-gray-900">{selected.customers?.name || "Walk-in Customer"}</p>
                  {selected.customers?.phone && <p className="text-sm text-gray-400 mt-0.5">{selected.customers.phone}</p>}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 overflow-hidden mb-5">
                <div className="overflow-x-auto slim-scroll">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className={TH}>S.N.</th>
                        <th className={TH}>Item</th>
                        <th className={`${TH} text-right`}>Qty</th>
                        <th className={`${TH} text-right`}>Rate</th>
                        <th className={`${TH} text-right`}>Discount</th>
                        <th className={`${TH} text-right`}>Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detailLoading ? (
                        <tr><td colSpan={6} className="py-8"><Spinner /></td></tr>
                      ) : selected.items.length === 0 ? (
                        <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-400">No items on this invoice</td></tr>
                      ) : selected.items.map((item, i) => (
                        <tr key={item.id}>
                          <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                          <td className="px-5 py-3 font-medium text-gray-900">{item.product_name}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{item.quantity}</td>
                          <td className="px-5 py-3 text-right tabular-nums whitespace-nowrap">{fmt(item.unit_price)}</td>
                          <td className="px-5 py-3 text-right tabular-nums whitespace-nowrap text-gray-400">{item.discount > 0 ? fmt(item.discount) : "—"}</td>
                          <td className="px-5 py-3 text-right tabular-nums whitespace-nowrap font-semibold text-gray-900">{fmt(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <div className="w-60 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="text-gray-900 tabular-nums">{fmt(selected.subtotal)}</span></div>
                  {selected.discount > 0 && <div className="flex justify-between text-gray-500"><span>Discount</span><span className="text-gray-900 tabular-nums">- {fmt(selected.discount)}</span></div>}
                  {selected.tax > 0 && <div className="flex justify-between text-gray-500"><span>Tax</span><span className="text-gray-900 tabular-nums">{fmt(selected.tax)}</span></div>}
                  {(selected.delivery_charge || 0) > 0 && <div className="flex justify-between text-gray-500"><span>Delivery</span><span className="text-gray-900 tabular-nums">+ {fmt(selected.delivery_charge)}</span></div>}
                  <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2"><span>Total</span><span className="tabular-nums">{fmt(selected.total)}</span></div>
                  <div className="flex justify-between text-gray-500"><span>Paid</span><span className="text-gray-900 tabular-nums">{fmt(selected.paid_amount)}</span></div>
                  {balance > 0 && <div className="flex justify-between text-gray-500"><span>Balance</span><span className="font-semibold text-red-600 tabular-nums">{fmt(balance)}</span></div>}
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-gray-500">Status</span>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLE[selected.status] || STATUS_STYLE.unpaid}`}>
                      {selected.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}