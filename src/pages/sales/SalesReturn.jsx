import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Search, ChevronDown, X, Trash2, FileText, Check } from "lucide-react"
import toast from "react-hot-toast"

const fmt = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
const r2  = (n) => Math.round((Number(n) || 0) * 100) / 100
const r4  = (n) => Math.round((Number(n) || 0) * 10000) / 10000

// Lowercase, turn every character that is not a letter or digit (dashes, dots, commas,
// slashes, brackets...) into a space, and collapse repeated spaces.
function normalizeText(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

// Punctuation-insensitive match. Every word typed must appear in the text, OR the typed
// characters (without spaces) must appear in the text (without spaces), so "INV-2026-1098",
// "inv 2026 1098" and "inv20261098" all find the same invoice.
function matchesSearch(haystackRaw, query) {
  const tokens = normalizeText(query).split(" ").filter(Boolean)
  if (!tokens.length) return true
  const hay = normalizeText(haystackRaw)
  if (tokens.every(t => hay.includes(t))) return true
  return hay.replace(/ /g, "").includes(tokens.join(""))
}

// Shared styles (same look as Dashboard / Inventory / Customers / Sales)
const FIELD       = "w-full px-3.5 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 focus:border-lime-500 transition-colors"
const LABEL       = "block text-xs font-medium text-gray-700 mb-1.5"
const BTN_DARK    = "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50"
const BTN_OUTLINE = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
const MODAL_WRAP  = "fixed inset-0 z-50 flex items-center justify-center p-4"
const MODAL_BACK  = "absolute inset-0 bg-black/30 backdrop-blur-sm"
const MODAL_CARD  = "relative bg-white rounded-2xl shadow-2xl w-full border border-gray-100"
const MODAL_HEAD  = "flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0"
const MODAL_FOOT  = "flex items-center justify-end gap-2.5 px-6 py-4 border-t border-gray-100 bg-gray-50/70 rounded-b-2xl shrink-0"
const MODAL_X     = "p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
const TH          = "px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"
const TH_SM       = "px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"

const WALK_IN = { id: null, name: "Walk-in / no customer" }

function Spinner() {
  return <div className="w-5 h-5 border-2 border-lime-600 border-t-transparent rounded-full animate-spin mx-auto" />
}

// ───────────────────────── Detail modal ─────────────────────────
function ReturnDetailModal({ ret, invoiceNo, customerName, onClose, onDeleted }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiClient.get(`/api/sales-returns/${ret.id}`)
      .then(res => { if (!cancelled) setItems(res.data?.items || []) })
      .catch(e => { if (!cancelled) toast.error(e?.response?.data?.detail || "Failed to load return") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ret.id])

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  async function handleDelete() {
    if (!confirm("Delete this return? Stock it added back is taken out again, and the customer's balance is restored.")) return
    setDeleting(true)
    try {
      await apiClient.delete(`/api/sales-returns/${ret.id}`)
      toast.success("Sales return deleted")
      onDeleted?.()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to delete return")
    } finally {
      setDeleting(false)
    }
  }

  const Info = ({ label, children }) => (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-900">{children}</p>
    </div>
  )

  return (
    <div className={`${MODAL_WRAP} !z-[60]`}>
      <div onClick={onClose} className={MODAL_BACK} />
      <div className={`${MODAL_CARD} max-w-2xl max-h-[90vh] flex flex-col`}>
        <div className={MODAL_HEAD}>
          <h2 className="text-base font-semibold text-gray-900">Sales Return</h2>
          <button onClick={onClose} className={MODAL_X}><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Info label="Return Number">{shortDocNumber(ret.return_number, ret.return_date) || "—"}</Info>
            <Info label="Date">{formatAD(ret.return_date)}</Info>
            <Info label="Customer">{customerName || "Walk-in"}</Info>
            <Info label="Against Invoice">{invoiceNo || "—"}</Info>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-2">Returned Items</p>
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto slim-scroll">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className={TH_SM}>Item</th>
                      <th className={`${TH_SM} text-right`}>Qty</th>
                      <th className={`${TH_SM} text-right`}>Rate</th>
                      <th className={`${TH_SM} text-right`}>Amount</th>
                      <th className={`${TH_SM} text-right`}>Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      <tr><td colSpan={5} className="py-8"><Spinner /></td></tr>
                    ) : items.length === 0 ? (
                      <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">No items</td></tr>
                    ) : items.map(it => (
                      <tr key={it.id}>
                        <td className="px-4 py-3 font-medium text-gray-900">{it.product_name}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{it.quantity_returned}</td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{fmt(it.unit_price)}</td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap font-semibold text-gray-900">{fmt(it.line_refund_amount)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                            it.restock_flag ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                          }`}>
                            {it.restock_flag ? "Restocked" : "Not restocked"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="ml-auto w-72 space-y-2 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Total Refund</span><span className="font-bold text-gray-900 tabular-nums">{fmt(ret.total_refund_amount)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Reduced from balance</span><span className="text-gray-900 tabular-nums">{fmt(ret.credit_applied_amount)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Refunded in cash</span><span className="text-gray-900 tabular-nums">{fmt(ret.cash_refunded_amount)}</span>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-1.5">Reason</p>
            <div className={`px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-sm min-h-[44px] ${ret.reason ? "text-gray-700" : "text-gray-400"}`}>
              {ret.reason || "No reason given"}
            </div>
          </div>
          <p className="text-xs text-gray-400">Created by: {ret.created_by_name || "—"}</p>
        </div>

        <div className="flex items-center px-6 py-4 border-t border-gray-100 bg-gray-50/70 rounded-b-2xl shrink-0">
          <button onClick={handleDelete} disabled={deleting}
            className={`${BTN_OUTLINE} !text-red-600 !border-red-200 hover:!bg-red-50 ${deleting ? "cursor-wait" : ""}`}>
            <Trash2 size={13} /> {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── Page ─────────────────────────
export default function SalesReturn() {
  const { storeId } = useStoreId()
  const [showForm,  setShowForm]  = useState(false)
  const [returns,   setReturns]   = useState([])
  const [invMap,    setInvMap]    = useState({})
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState("")
  const [selected,  setSelected]  = useState(null)

  // Create form
  const [custOpen,   setCustOpen]   = useState(false)
  const [custSearch, setCustSearch] = useState("")
  const [selCust,    setSelCust]    = useState(null)
  const [invoices,   setInvoices]   = useState([])
  const [invLoading, setInvLoading] = useState(false)
  const [invOpen,    setInvOpen]    = useState(false)
  const [invSearch,  setInvSearch]  = useState("")
  const [selInvId,   setSelInvId]   = useState("")
  const [lines,      setLines]      = useState([])
  const [linesLoading, setLinesLoading] = useState(false)
  const [priorCredit,  setPriorCredit]  = useState(0)
  const [retDate,    setRetDate]    = useState(new Date().toISOString().split("T")[0])
  const [reason,     setReason]     = useState("")
  const [saving,     setSaving]     = useState(false)
  const pickerRef = useRef(null)

  useEffect(() => { if (storeId) loadAll() }, [storeId])

  // Close the customer / invoice lists when clicking anywhere outside them
  useEffect(() => {
    function onClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setCustOpen(false)
        setInvOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: rets }, { data: custs }] = await Promise.all([
      supabase.from("sales_returns")
        .select("*, customers(name, phone)")
        .eq("store_id", storeId)
        .order("return_date", { ascending: false })
        .limit(500),
      supabase.from("customers").select("id, name, phone, balance").eq("store_id", storeId).order("name"),
    ])
    const list = rets || []

    // Look up the invoice numbers in small chunks (keeps the request URL short)
    const ids = [...new Set(list.map(r => r.invoice_id).filter(Boolean))]
    const map = {}
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from("invoices")
        .select("id, invoice_number, invoice_date").in("id", ids.slice(i, i + 100))
      for (const inv of (data || [])) map[inv.id] = inv
    }

    setReturns(list)
    setInvMap(map)
    setCustomers(custs || [])
    setLoading(false)
  }

  function invoiceNoFor(r) {
    const inv = invMap[r.invoice_id]
    return inv ? shortDocNumber(inv.invoice_number, inv.invoice_date) : ""
  }

  function resetForm() {
    setSelCust(null); setInvoices([]); setSelInvId(""); setLines([]); setPriorCredit(0)
    setReason(""); setRetDate(new Date().toISOString().split("T")[0])
    setCustSearch(""); setCustOpen(false)
    setInvSearch(""); setInvOpen(false)
  }

  function openForm()  { resetForm(); setShowForm(true) }
  function closeForm() { resetForm(); setShowForm(false) }

  function toggleCustList() {
    setCustOpen(o => !o)
    setInvOpen(false)
  }
  function toggleInvList() {
    setInvOpen(o => !o)
    setCustOpen(false)
    setInvSearch("")
  }

  async function pickCustomer(c) {
    setSelCust(c); setCustOpen(false); setCustSearch("")
    setSelInvId(""); setLines([]); setPriorCredit(0)
    setInvSearch(""); setInvOpen(false)
    setInvLoading(true)
    let q = supabase.from("invoices")
      .select("id, invoice_number, invoice_date, total, paid_amount, status")
      .eq("store_id", storeId)
      .order("invoice_date", { ascending: false })
      .limit(200)
    q = c.id ? q.eq("customer_id", c.id) : q.is("customer_id", null)
    const { data, error } = await q
    if (error) toast.error(error.message)
    setInvoices(data || [])
    setInvLoading(false)
  }

  async function pickInvoice(id) {
    setInvOpen(false); setInvSearch("")
    setSelInvId(id); setLines([]); setPriorCredit(0)
    if (!id) return
    setLinesLoading(true)
    const [{ data: items }, { data: prior }] = await Promise.all([
      supabase.from("invoice_items").select("id, product_id, product_name, quantity, unit_price").eq("invoice_id", id),
      supabase.from("sales_returns").select("id, credit_applied_amount").eq("invoice_id", id),
    ])

    const priorIds = (prior || []).map(r => r.id)
    const returned = {}
    if (priorIds.length) {
      const { data: ri } = await supabase.from("sales_return_items")
        .select("product_id, quantity_returned").in("return_id", priorIds)
      for (const r of (ri || [])) {
        if (r.product_id) returned[r.product_id] = (returned[r.product_id] || 0) + r.quantity_returned
      }
    }

    setPriorCredit((prior || []).reduce((s, r) => s + (r.credit_applied_amount || 0), 0))
    setLines((items || []).map(it => ({
      ...it,
      returnable: it.product_id ? Math.max(0, r4(it.quantity - (returned[it.product_id] || 0))) : it.quantity,
      qty: "",
      restock: true,
    })))
    setLinesLoading(false)
  }

  function updateLine(i, patch) {
    setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  }

  const selInvoice = invoices.find(i => i.id === selInvId)
  const chosen = lines.filter(l => (parseFloat(l.qty) || 0) > 0)
  const totalRefund = r2(chosen.reduce((s, l) => s + (parseFloat(l.qty) || 0) * l.unit_price, 0))
  const unpaidOnInvoice = selInvoice
    ? Math.max(0, r2(selInvoice.total - (selInvoice.paid_amount || 0) - priorCredit))
    : 0
  const creditApplied = r2(Math.min(unpaidOnInvoice, totalRefund))
  const cashRefunded  = r2(totalRefund - creditApplied)

  async function handleSave() {
    if (!selInvId) return toast.error("Select an invoice")
    if (!chosen.length) return toast.error("Enter a return quantity for at least one item")
    for (const l of chosen) {
      const q = parseFloat(l.qty)
      if (q > l.returnable) return toast.error(`Only ${l.returnable} of "${l.product_name}" can be returned`)
    }
    setSaving(true)
    try {
      await apiClient.post("/api/sales-returns/", {
        invoice_id: selInvId,
        return_date: retDate,
        reason: reason.trim() || null,
        items: chosen.map(l => ({
          product_id: l.product_id || null,
          invoice_item_id: l.id,
          quantity_returned: parseFloat(l.qty),
          restock_flag: l.restock,
        })),
      })
      toast.success(`Return of ${fmt(totalRefund)} recorded`)
      closeForm()
      loadAll()
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message)
    } finally {
      setSaving(false)
    }
  }

  // Customer search: punctuation-insensitive on name and phone
  const filteredCusts = customers.filter(c =>
    matchesSearch(`${c.name || ""} ${c.phone || ""}`, custSearch)
  )

  // Invoice search: punctuation-insensitive on invoice number (short and full), date and amount
  const filteredInvoices = invoices.filter(inv =>
    matchesSearch(
      `${shortDocNumber(inv.invoice_number, inv.invoice_date)} ${inv.invoice_number || ""} ` +
      `${formatAD(inv.invoice_date)} ${inv.invoice_date || ""} ${inv.total ?? ""} ${fmt(inv.total)}`,
      invSearch
    )
  )

  const selInvoiceLabel = selInvoice
    ? `${shortDocNumber(selInvoice.invoice_number, selInvoice.invoice_date)} · ${formatAD(selInvoice.invoice_date)} · ${fmt(selInvoice.total)}`
    : ""
  const invDisabled = !selCust || invLoading

  const filteredRets = returns.filter(r => {
    if (!search) return true
    const inv = invMap[r.invoice_id]
    return matchesSearch(
      `${r.customers?.name || ""} ${r.return_number || ""} ` +
      `${shortDocNumber(r.return_number, r.return_date)} ${inv?.invoice_number || ""} ${invoiceNoFor(r)}`,
      search
    )
  })
  const totalReturned = filteredRets.reduce((s, r) => s + (r.total_refund_amount || 0), 0)

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col gap-4 px-6 py-5 overflow-hidden">

      {/* Title + action */}
      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <h1 className="text-xl font-bold text-gray-900">
          Sales Return <span className="text-base font-normal text-gray-400">({filteredRets.length})</span>
        </h1>
        <button onClick={openForm} className={BTN_DARK}>
          <Plus size={14} /> Create Sales Return
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <div className="relative w-full max-w-sm">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, return or invoice no…"
            className={`${FIELD} pl-9 ${search ? "pr-9" : "pr-3"}`} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Table card: fixed card, rows scroll inside it, header stays pinned */}
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto slim-scroll">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_0_#f3f4f6]">
              <tr>
                <th className={TH}>Return No</th>
                <th className={TH}>Date</th>
                <th className={TH}>Customer</th>
                <th className={TH}>Invoice No</th>
                <th className={`${TH} text-right`}>Refund</th>
                <th className={`${TH} text-right`}>Credit Applied</th>
                <th className={`${TH} text-right`}>Cash Refunded</th>
                <th className={TH}>Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="py-16"><Spinner /></td></tr>
              ) : filteredRets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                      <FileText size={24} className="text-gray-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">
                      {returns.length === 0 ? "No sales returns yet" : "No returns match your search"}
                    </p>
                    {returns.length === 0 && (
                      <button onClick={openForm} className={`${BTN_DARK} mt-4`}>
                        <Plus size={14} /> Create first sales return
                      </button>
                    )}
                  </td>
                </tr>
              ) : filteredRets.map(r => (
                <tr key={r.id}
                  onClick={() => setSelected(r)}
                  className="cursor-pointer transition-colors hover:bg-gray-50/70">

                  <td className="px-5 py-4 whitespace-nowrap font-medium text-gray-900">
                    {shortDocNumber(r.return_number, r.return_date) || "—"}
                  </td>

                  <td className="px-5 py-4 whitespace-nowrap">
                    <p className="text-[13px] text-gray-700">{formatAD(r.return_date)}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{formatBS(r.return_date)}</p>
                  </td>

                  <td className="px-5 py-4 text-[13px] font-medium text-gray-900">
                    {r.customers?.name || "Walk-in"}
                  </td>

                  <td className="px-5 py-4 whitespace-nowrap text-[13px] text-gray-700">
                    {invoiceNoFor(r) || "—"}
                  </td>

                  <td className="px-5 py-4 whitespace-nowrap text-right tabular-nums font-medium text-gray-900">
                    {fmt(r.total_refund_amount)}
                  </td>

                  <td className="px-5 py-4 whitespace-nowrap text-right tabular-nums text-gray-600">
                    {r.credit_applied_amount > 0 ? fmt(r.credit_applied_amount) : <span className="text-gray-400">—</span>}
                  </td>

                  <td className="px-5 py-4 whitespace-nowrap text-right tabular-nums text-gray-600">
                    {r.cash_refunded_amount > 0 ? fmt(r.cash_refunded_amount) : <span className="text-gray-400">—</span>}
                  </td>

                  <td className="px-5 py-4 text-[13px] text-gray-500">
                    <span className="block max-w-[14rem] truncate" title={r.reason || ""}>
                      {r.reason || <span className="text-gray-400">—</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filteredRets.length > 0 && (
          <div className="shrink-0 px-5 py-2.5 border-t border-gray-100 bg-gray-50/70 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <p>
              Showing <span className="font-semibold text-gray-700">{filteredRets.length}</span> of{" "}
              <span className="font-semibold text-gray-700">{returns.length}</span> returns
            </p>
            <p>
              Total returned:{" "}
              <span className="font-semibold text-gray-700 tabular-nums">{fmt(totalReturned)}</span>
            </p>
          </div>
        )}
      </div>

      {/* Create Sales Return popup */}
      {showForm && (
        <div className={MODAL_WRAP}>
          <div onClick={closeForm} className={MODAL_BACK} />
          <div className={`${MODAL_CARD} max-w-3xl max-h-[90vh] flex flex-col`}>
            <div className={MODAL_HEAD}>
              <h2 className="text-base font-semibold text-gray-900">Create Sales Return</h2>
              <button onClick={closeForm} className={MODAL_X}><X size={18} /></button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto slim-scroll px-6 py-5 space-y-5">

              {/* Step 1: customer + invoice. Both lists open inline below the fields (they drop down, never up) */}
              <div ref={pickerRef} className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={LABEL}>Customer</label>
                    <button onClick={toggleCustList}
                      className={`${FIELD} flex items-center justify-between text-left cursor-pointer ${custOpen ? "!border-lime-500 ring-2 ring-lime-400/40" : ""}`}>
                      <span className={`truncate ${selCust ? "font-medium text-gray-900" : "text-gray-400"}`}>
                        {selCust ? selCust.name : "Select customer"}
                      </span>
                      <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${custOpen ? "rotate-180" : ""}`} />
                    </button>
                  </div>

                  <div className="col-span-2">
                    <label className={LABEL}>Invoice</label>
                    <button onClick={toggleInvList} disabled={invDisabled}
                      className={`${FIELD} flex items-center justify-between text-left ${
                        invDisabled ? "cursor-not-allowed bg-gray-50" : "cursor-pointer"
                      } ${invOpen ? "!border-lime-500 ring-2 ring-lime-400/40" : ""}`}>
                      <span className={`truncate ${selInvoice ? "font-medium text-gray-900" : "text-gray-400"}`}>
                        {selInvoice
                          ? selInvoiceLabel
                          : !selCust ? "Select a customer first"
                          : invLoading ? "Loading…"
                          : invoices.length ? "Select invoice" : "No invoices found"}
                      </span>
                      <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${invOpen ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                </div>

                {/* Inline customer list */}
                {custOpen && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                    <div className="p-3 border-b border-gray-100 bg-white">
                      <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input autoFocus value={custSearch} onChange={e => setCustSearch(e.target.value)}
                          placeholder="Type name or phone…" className={`${FIELD} pl-9`} />
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto slim-scroll bg-white divide-y divide-gray-50">
                      {!custSearch.trim() && (
                        <button onClick={() => pickCustomer(WALK_IN)}
                          className="w-full px-4 py-2.5 text-left text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                          Walk-in / no customer
                        </button>
                      )}
                      {filteredCusts.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-gray-400">No customers found</p>
                      ) : filteredCusts.map(c => (
                        <button key={c.id} onClick={() => pickCustomer(c)}
                          className="w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors">
                          <p className="text-[13px] font-medium text-gray-900">{c.name}</p>
                          {c.phone && <p className="text-[11px] text-gray-400">{c.phone}</p>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inline invoice list with search */}
                {invOpen && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                    <div className="p-3 border-b border-gray-100 bg-white">
                      <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input autoFocus value={invSearch} onChange={e => setInvSearch(e.target.value)}
                          placeholder="Search invoice no, date or amount…" className={`${FIELD} pl-9`} />
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto slim-scroll bg-white divide-y divide-gray-50">
                      {filteredInvoices.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-gray-400">No invoices found</p>
                      ) : filteredInvoices.map(inv => {
                        const active = inv.id === selInvId
                        return (
                          <button key={inv.id} onClick={() => pickInvoice(inv.id)}
                            className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                              active ? "bg-lime-50/70" : "hover:bg-gray-50"
                            }`}>
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-gray-900">
                                {shortDocNumber(inv.invoice_number, inv.invoice_date)}
                              </p>
                              <p className="text-[11px] text-gray-400">
                                {formatAD(inv.invoice_date)} · {formatBS(inv.invoice_date)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[13px] font-medium text-gray-900 tabular-nums">{fmt(inv.total)}</span>
                              {active && <Check size={14} className="text-lime-600" />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {selInvId && (
                <>
                  {/* Step 2: items */}
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto slim-scroll">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className={TH_SM}>Item</th>
                            <th className={`${TH_SM} text-right`}>Sold</th>
                            <th className={`${TH_SM} text-right`}>Can return</th>
                            <th className={`${TH_SM} text-right`}>Rate</th>
                            <th className={`${TH_SM} text-right`}>Return qty</th>
                            <th className={`${TH_SM} text-right`}>Put back in stock</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {linesLoading ? (
                            <tr><td colSpan={6} className="py-8"><Spinner /></td></tr>
                          ) : lines.map((l, i) => (
                            <tr key={l.id} className={l.returnable <= 0 ? "opacity-50" : ""}>
                              <td className="px-4 py-3 font-medium text-gray-900">{l.product_name}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{l.quantity}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{l.returnable}</td>
                              <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{fmt(l.unit_price)}</td>
                              <td className="px-4 py-2 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <button onClick={() => updateLine(i, { qty: String(l.returnable) })} disabled={l.returnable <= 0}
                                    className="text-[11px] font-medium text-lime-700 hover:text-lime-800 hover:underline disabled:opacity-40">
                                    All
                                  </button>
                                  <input type="number" min="0" max={l.returnable} value={l.qty}
                                    disabled={l.returnable <= 0}
                                    onFocus={e => e.target.select()}
                                    onChange={e => updateLine(i, { qty: e.target.value })}
                                    placeholder="0"
                                    className={`${FIELD} no-spin !w-20 !py-1.5 text-right`} />
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <input type="checkbox" checked={l.restock} disabled={l.returnable <= 0}
                                  onChange={e => updateLine(i, { restock: e.target.checked })}
                                  className="h-4 w-4 rounded border-gray-300 accent-lime-600 cursor-pointer" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Step 3: details + totals */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className={LABEL}>Return date</label>
                        <input type="date" value={retDate} onChange={e => setRetDate(e.target.value)} className={FIELD} />
                        <p className="text-[11px] text-gray-400 mt-1.5">{formatBS(retDate)}</p>
                      </div>
                      <div>
                        <label className={LABEL}>Reason (optional)</label>
                        <input value={reason} onChange={e => setReason(e.target.value)}
                          placeholder="e.g. Wrong part, defective" className={FIELD} />
                      </div>
                    </div>

                    <div className="text-sm space-y-2">
                      <div className="flex justify-between items-center text-gray-500">
                        <span>Total refund</span>
                        <span className="text-base font-bold text-gray-900 tabular-nums">{fmt(totalRefund)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Reduces customer's balance</span>
                        <span className="text-gray-900 tabular-nums">{fmt(creditApplied)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Refunded in cash</span>
                        <span className="text-gray-900 tabular-nums">{fmt(cashRefunded)}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-relaxed pt-1">
                        The return first cancels any unpaid amount on this invoice ({fmt(unpaidOnInvoice)} unpaid). Anything beyond that is refunded in cash.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={MODAL_FOOT}>
              <button onClick={closeForm} className={BTN_OUTLINE}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !selInvId || totalRefund <= 0} className={BTN_DARK}>
                {saving ? "Saving…" : totalRefund > 0 ? `Return ${fmt(totalRefund)}` : "Create Return"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return detail popup */}
      {selected && (
        <ReturnDetailModal
          ret={selected}
          invoiceNo={invoiceNoFor(selected)}
          customerName={selected.customers?.name}
          onClose={() => setSelected(null)}
          onDeleted={() => { setSelected(null); loadAll() }}
        />
      )}
    </div>
  )
}