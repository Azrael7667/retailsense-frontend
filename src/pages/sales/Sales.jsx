import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { useLocation, useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import apiClient from "../../lib/apiClient"
import { confirmDialog } from "../../components/common/ConfirmDialog"
import toast from "react-hot-toast"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { Plus, Search, Eye, Printer, FileText, X, ChevronDown, Settings, Check, Pencil, Trash2, Copy, ArrowLeftRight } from "lucide-react"
import DateRangeDropdown from "../../components/common/DateRangeDropdown"

// Shared styles (same look as Dashboard / Inventory / Customers)
const FIELD       = "w-full px-3.5 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 focus:border-lime-500 transition-colors"
const BTN_DARK    = "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50"
const BTN_OUTLINE = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
const TH          = "px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"

// Ruled-table styles for the invoice popup (same look as the create / edit pages)
const P_LABEL = "block text-[13px] font-semibold text-slate-700 mb-1.5"
const P_BOX   = "px-3.5 py-2 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg"
const P_TH    = "px-3 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-700 bg-gray-50 border-b border-r border-gray-200 whitespace-nowrap"
const P_TD    = "px-3 py-3 text-sm text-gray-700 border-b border-r border-gray-200 align-middle"
const T_LABEL = "h-10 px-3 text-[13px] font-semibold text-slate-700 bg-gray-50 border-b border-r border-gray-200"
const T_VALUE = "h-10 px-3 text-right text-[13px] font-semibold text-gray-900 border-b border-gray-200 whitespace-nowrap tabular-nums"

const STATUS_STYLE = {
  paid:    "bg-green-50 text-green-700",
  partial: "bg-amber-50 text-amber-700",
  unpaid:  "bg-red-50 text-red-600",
}

const STATUS_OPTIONS = [
  { value: "all",     label: "All Status" },
  { value: "paid",    label: "Paid" },
  { value: "unpaid",  label: "Unpaid" },
  { value: "partial", label: "Partial" },
]

function Spinner() {
  return <div className="w-5 h-5 border-2 border-lime-600 border-t-transparent rounded-full animate-spin mx-auto" />
}

const fmt = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

// ---------------- Printable A4 bill ----------------
const NAVY = "#0f172a", INK = "#111827", GRAY = "#6b7280", MUTED = "#9ca3af",
      BORDER = "#e5e7eb", LIGHT = "#f9fafb", RED = "#dc2626",
      LIME_PILL = "#ecfccb", LIME_BORDER = "#d9f99d"
const PAGE_H = 297 // mm

// Long invoices are scaled down a little so every item still fits on the single page
function printZoom(n) {
  if (n <= 16) return 1
  if (n <= 22) return 0.85
  if (n <= 28) return 0.72
  if (n <= 36) return 0.6
  return 0.5
}

const PR_TH = { padding: "8px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
  border: `1px solid ${INK}`, whiteSpace: "nowrap", background: INK, color: "#fff" }
const PR_TD = { padding: "7px 8px", borderLeft: `1px solid ${INK}`, borderRight: `1px solid ${INK}`,
  borderBottom: `1px solid ${BORDER}`, verticalAlign: "middle", fontSize: 12 }
const PR_FILL = { borderLeft: `1px solid ${INK}`, borderRight: `1px solid ${INK}`, padding: 0 }

function PrintRow({ label, value, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0",
      fontWeight: bold ? 700 : 400, fontSize: bold ? 12.5 : 11.5 }}>
      <span style={{ color: bold ? INK : GRAY }}>{label}:</span><span>{value}</span>
    </div>
  )
}

function Meta({ label, value, strong }) {
  return (
    <p style={{ marginBottom: 2 }}>
      <span style={{ color: MUTED }}>{label}: </span>
      <span style={{ fontWeight: strong ? 700 : 500 }}>{value}</span>
    </p>
  )
}

function PrintableInvoice({ inv, store, docNumber }) {
  const items = inv.items || []
  const zoom = printZoom(items.length)
  const discount = inv.discount || 0
  const taxable = Math.max(0, (inv.subtotal || 0) - discount)
  const taxPercent = inv.tax > 0 && taxable > 0 ? Math.round((inv.tax / taxable) * 100) : null
  const due = Math.max(0, (inv.total || 0) - (inv.paid_amount || 0))
  const payMode = inv.payment_method ? inv.payment_method.replace("_", " ") : ""

  return createPortal(
    <div className="print-area">
      <div style={{
        zoom, width: "210mm", height: `${PAGE_H / zoom}mm`, boxSizing: "border-box",
        padding: "10mm 12mm 9mm", margin: "0 auto", display: "flex", flexDirection: "column",
        fontFamily: "'Helvetica Neue', Arial, sans-serif", color: INK, background: "#fff"
      }}>

        {/* Header */}
        <div style={{ borderTop: `4px solid ${NAVY}`, paddingTop: 12, marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ fontSize: 23, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{store.name}</h1>
              <p style={{ fontSize: 11.5, color: GRAY, margin: "4px 0 0", lineHeight: 1.5 }}>
                {store.address}<br />
                Phone: {store.phone}
                {store.vat_number && <>  &nbsp;•&nbsp; VAT No: {store.vat_number}</>}
              </p>
            </div>
            <div style={{ background: LIME_PILL, color: NAVY, border: `1px solid ${LIME_BORDER}`, borderRadius: 8,
              padding: "6px 14px", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
              TAX INVOICE
            </div>
          </div>
        </div>

        {/* Bill to + invoice info */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 24, flexShrink: 0,
          background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 16px",
          marginBottom: 12, fontSize: 11.5 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Bill To</p>
            <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 1 }}>{inv.customers?.name || "Walk-in Customer"}</p>
            {inv.customers?.phone && <p style={{ color: GRAY }}>Phone: {inv.customers.phone}</p>}
          </div>
          <div style={{ textAlign: "right", minWidth: 200 }}>
            <Meta label="Invoice No" value={docNumber || "—"} strong />
            <Meta label="Date (AD)" value={formatAD(inv.invoice_date)} />
            <Meta label="Date (BS)" value={formatBS(inv.invoice_date)} />
            <Meta label="Payment" value={<span style={{ textTransform: "capitalize" }}>{payMode || "—"}</span>} />
          </div>
        </div>

        {/* Items: takes all free height so the column lines run down to the bottom */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
          borderBottom: `1.5px solid ${INK}`, marginBottom: 12 }}>
          <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col />
              <col style={{ width: 44 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 104 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...PR_TH, textAlign: "left" }}>S.N.</th>
                <th style={{ ...PR_TH, textAlign: "left" }}>Item</th>
                <th style={{ ...PR_TH, textAlign: "right" }}>Qty</th>
                <th style={{ ...PR_TH, textAlign: "right" }}>Rate</th>
                <th style={{ ...PR_TH, textAlign: "right" }}>Discount</th>
                <th style={{ ...PR_TH, textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} style={{ pageBreakInside: "avoid", breakInside: "avoid" }}>
                  <td style={{ ...PR_TD, color: GRAY }}>{i + 1}</td>
                  <td style={{ ...PR_TD, fontWeight: 600, wordBreak: "break-word" }}>{item.product_name}</td>
                  <td style={{ ...PR_TD, textAlign: "right", whiteSpace: "nowrap" }}>{item.quantity}</td>
                  <td style={{ ...PR_TD, textAlign: "right", whiteSpace: "nowrap" }}>{fmt(item.unit_price)}</td>
                  <td style={{ ...PR_TD, textAlign: "right", color: GRAY, whiteSpace: "nowrap" }}>{item.discount > 0 ? fmt(item.discount) : "—"}</td>
                  <td style={{ ...PR_TD, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{fmt(item.total)}</td>
                </tr>
              ))}
              {/* Filler row: keeps the column lines running to the bottom of the table */}
              <tr style={{ height: "100%" }}>
                <td style={PR_FILL}></td><td style={PR_FILL}></td><td style={PR_FILL}></td>
                <td style={PR_FILL}></td><td style={PR_FILL}></td><td style={PR_FILL}></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bottom: remarks (left) + totals (right) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20,
          flexShrink: 0, pageBreakInside: "avoid", breakInside: "avoid" }}>
          <div style={{ flex: 1, fontSize: 11.5, alignSelf: "stretch" }}>
            {inv.notes && (
              <div style={{ background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", maxWidth: 330 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Remarks</p>
                <p>{inv.notes}</p>
              </div>
            )}
          </div>

          <div style={{ width: 270, border: `1.5px solid ${INK}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "8px 16px 8px", fontSize: 11.5 }}>
              <PrintRow label="Sub Total" value={fmt(inv.subtotal)} />
              {discount > 0 && <PrintRow label="Discount" value={`- ${fmt(discount)}`} />}
              {discount > 0 && <PrintRow label="Taxable" value={fmt(taxable)} />}
              {inv.tax > 0 && <PrintRow label={taxPercent ? `VAT (${taxPercent}%)` : "VAT / Tax"} value={fmt(inv.tax)} />}
              {(inv.delivery_charge || 0) > 0 && <PrintRow label="Delivery Charge" value={`+ ${fmt(inv.delivery_charge)}`} />}
              <div style={{ borderTop: `1px solid ${BORDER}`, margin: "4px 0" }} />
              <PrintRow label="Total Amount" value={fmt(inv.total)} bold />
              <PrintRow label="Received Amount" value={fmt(inv.paid_amount)} />
            </div>
          </div>
        </div>

        {/* Thank-you line + signatures pinned to the bottom */}
        <p style={{ textAlign: "center", fontSize: 11, color: GRAY, fontStyle: "italic", margin: "14px 0 0", flexShrink: 0 }}>
          Thank you for your business!
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 34, flexShrink: 0 }}>
          <p style={{ borderTop: `1px solid ${INK}`, paddingTop: 4, fontSize: 10, minWidth: 170, textAlign: "center" }}>
            Customer's Signature
          </p>
          <p style={{ borderTop: `1px solid ${INK}`, paddingTop: 4, fontSize: 10, minWidth: 170, textAlign: "center" }}>
            Authorized Signature
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Custom dropdown — same look as the customers sort/filter menu:
// white card, soft shadow, small uppercase heading, lime highlight on the active option.
function Dropdown({ value, onChange, options, heading, wrapClass = "", menuClass = "w-48" }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const current = options.find(o => o.value === value) || options[0]

  return (
    <div className={`relative ${wrapClass}`} ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 pl-3.5 pr-3 py-2 text-sm bg-white border rounded-lg text-gray-700 cursor-pointer transition-colors ${
          open ? "border-lime-500 ring-2 ring-lime-400/40" : "border-gray-200 hover:bg-gray-50"
        }`}>
        <span className="truncate">{current?.label}</span>
        <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className={`absolute left-0 top-full mt-1.5 z-30 bg-white border border-gray-100 rounded-xl shadow-lg py-1.5 ${menuClass}`}>
          {heading && (
            <p className="px-4 pt-1.5 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{heading}</p>
          )}
          <div className="max-h-64 overflow-y-auto slim-scroll">
            {options.map(o => {
              const active = o.value === value
              return (
                <button key={o.value} type="button"
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-sm text-left transition-colors ${
                    active ? "bg-lime-50 text-gray-900 font-semibold" : "text-gray-700 hover:bg-gray-50"
                  }`}>
                  <span className="truncate">{o.label}</span>
                  {active && <Check size={14} className="text-lime-600 shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Sales() {
  const { storeId } = useStoreId()
  const location    = useLocation()
  const navigate    = useNavigate()
  const [invoices,      setInvoices]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [selected,      setSelected]      = useState(null)   // invoice open in the popup
  const [detailLoading, setDetailLoading] = useState(false)
  const [moreOpen,      setMoreOpen]      = useState(false)
  useEffect(() => { setMoreOpen(false) }, [selected?.id])
  const [deleting,      setDeleting]      = useState(false)
  const [search,        setSearch]        = useState("")
  const [status,        setStatus]        = useState("all")
  const [dateFrom,      setDateFrom]      = useState("")
  const [dateTo,        setDateTo]        = useState("")
  // Store details for the printed bill (fallbacks are used if the lookup fails)
  const [store, setStore] = useState({
    name: "Bijeta Auto Parts", address: "Chabahil, Gangahiti", phone: "9841687441", vat_number: "603890844",
  })

  useEffect(() => { if (storeId) { load(); loadStore() } }, [storeId])

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

  async function loadStore() {
    const { data } = await supabase.from("stores").select("name, address, phone, vat_number").eq("id", storeId).maybeSingle()
    if (data) setStore(s => ({
      name: data.name || s.name, address: data.address || s.address,
      phone: data.phone || s.phone, vat_number: data.vat_number || s.vat_number,
    }))
  }

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

  // Prints the A4 bill (sets the tab title so the saved PDF gets a proper name)
  function printBill(inv) {
    const original = document.title
    const no = shortDocNumber(inv.invoice_number, inv.invoice_date)
    document.title = `Sales Invoice ${no} - ${store.name}`.replace(/\s+/g, " ").trim()
    window.print()
    document.title = original
  }

  // Print icon in the table row: open the invoice, wait for the items, then print
  async function printRow(inv) {
    await openDetail(inv)
    setTimeout(() => printBill(inv), 350)
  }

  function stub(label) {
    setMoreOpen(false)
    toast(`${label} — coming soon`, { icon: "🚧" })
  }

  async function removeInvoice(inv) {
    const no = shortDocNumber(inv.invoice_number, inv.invoice_date)
    const ok = await confirmDialog({
      title: "Delete this invoice?",
      message: "This reverses its balance and stock effects, and also deletes any linked sales returns.",
      confirmText: "Delete",
      variant: "danger",
    })
    if (!ok) return
    setDeleting(true)
    try {
      await apiClient.delete(`/api/invoices/${inv.id}`)
      toast.success("Invoice deleted")
      setSelected(null)
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not delete invoice")
    } finally {
      setDeleting(false)
    }
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

      <style>{`
        .print-area { display: none; }
        @page { size: A4; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; height: auto !important; }
          body > *:not(.print-area) { display: none !important; }
          .print-area { display: block !important; overflow: hidden; height: 296mm; page-break-after: avoid; break-after: avoid; }
        }
      `}</style>

      {/* Hidden on screen; this is what actually gets printed */}
      {selected && !detailLoading && (
        <PrintableInvoice inv={selected} store={store} docNumber={selectedNo} />
      )}

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

        <Dropdown
          wrapClass="w-40"
          heading="Status"
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
        />

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
                        <button onClick={() => printRow(inv)}
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
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-100">

            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-base font-semibold text-gray-900">{selectedNo}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelected(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Close">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-6">

              {/* Invoice card: everything sits inside one bordered card with tables */}
              <div className="border border-gray-200 border-t-[3px] border-t-lime-500 rounded-xl overflow-hidden bg-white">

                {/* Top row: party + invoice info */}
                <div className="px-6 py-5 border-b border-gray-200 flex flex-wrap items-start justify-between gap-6">
                  <div className="min-w-[240px]">
                    <span className={P_LABEL}>Party</span>
                    <div className={`${P_BOX} rounded-full font-semibold bg-white`}>
                      {selected.customers?.name || "Walk-in Customer"}
                    </div>
                    {selected.customers?.phone && (
                      <p className="text-xs text-gray-400 mt-2">{selected.customers.phone}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-6">
                    <div>
                      <span className={P_LABEL}>Invoice No</span>
                      <div className={`${P_BOX} min-w-[150px]`}>{selectedNo || "—"}</div>
                    </div>
                    <div>
                      <span className={P_LABEL}>Invoice Date</span>
                      <div className={`${P_BOX} min-w-[150px]`}>{formatAD(selected.invoice_date)}</div>
                      <p className="text-xs font-semibold text-slate-600 mt-1.5">{formatBS(selected.invoice_date)}</p>
                    </div>
                    <div>
                      <span className={P_LABEL}>Payment</span>
                      <div className={`${P_BOX} min-w-[120px] capitalize`}>
                        {selected.payment_method?.replace("_", " ") || "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items table */}
                <div className="overflow-x-auto slim-scroll">
                  <table className="w-full text-sm min-w-[640px] border-collapse table-fixed">
                    <colgroup>
                      <col style={{ width: 56 }} />
                      <col />
                      <col style={{ width: 80 }} />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 140 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className={`${P_TH} text-center`}>S.N.</th>
                        <th className={`${P_TH} text-left`}>Item Name</th>
                        <th className={`${P_TH} text-center`}>Qty</th>
                        <th className={`${P_TH} text-right`}>Rate</th>
                        <th className={`${P_TH} text-right`}>Discount</th>
                        <th className={`${P_TH} text-right border-r-0`}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailLoading ? (
                        <tr><td colSpan={6} className="py-8 border-b border-gray-200"><Spinner /></td></tr>
                      ) : selected.items.length === 0 ? (
                        <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-400 border-b border-gray-200">No items on this invoice</td></tr>
                      ) : selected.items.map((item, i) => (
                        <tr key={item.id}>
                          <td className={`${P_TD} text-center`}>
                            <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-lime-100 text-slate-900 text-xs font-bold">
                              {i + 1}
                            </span>
                          </td>
                          <td className={`${P_TD} font-medium text-gray-900 break-words`}>{item.product_name}</td>
                          <td className={`${P_TD} text-center font-semibold text-gray-900 tabular-nums`}>{item.quantity}</td>
                          <td className={`${P_TD} text-right whitespace-nowrap tabular-nums`}>{fmt(item.unit_price)}</td>
                          <td className={`${P_TD} text-right whitespace-nowrap tabular-nums text-gray-500`}>
                            {item.discount > 0 ? fmt(item.discount) : "—"}
                          </td>
                          <td className={`${P_TD} text-right whitespace-nowrap tabular-nums font-bold text-gray-900 border-r-0`}>
                            {fmt(item.total)}
                          </td>
                        </tr>
                      ))}

                      {/* Sub Total row, like the create page */}
                      {!detailLoading && (
                        <tr>
                          <td colSpan={4} className={`${P_TD} border-b-0`}></td>
                          <td className={`${P_TD} border-b-0 text-right text-[13px] font-semibold text-slate-700`}>Sub Total</td>
                          <td className={`${P_TD} border-b-0 border-r-0 text-right font-bold text-gray-900 whitespace-nowrap tabular-nums`}>
                            {fmt(selected.subtotal)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Bottom: notes (left) + totals table (right) */}
                <div className="px-6 py-6 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div>
                    <span className={P_LABEL}>Notes or Remarks</span>
                    <div className={`min-h-[84px] max-w-[400px] px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg ${
                      selected.notes ? "text-gray-700" : "text-gray-400"
                    }`}>
                      {selected.notes || "No remarks"}
                    </div>
                  </div>

                  <div className="w-full max-w-[360px] md:ml-auto">
                    <div className="border border-gray-200 overflow-hidden">
                      <table className="w-full border-collapse table-fixed">
                        <colgroup>
                          <col style={{ width: "46%" }} />
                          <col style={{ width: "54%" }} />
                        </colgroup>
                        <tbody>
                          <tr>
                            <td className={T_LABEL}>Sub Total</td>
                            <td className={T_VALUE}>{fmt(selected.subtotal)}</td>
                          </tr>
                          {selected.discount > 0 && (
                            <tr>
                              <td className={T_LABEL}>Discount</td>
                              <td className={T_VALUE}>- {fmt(selected.discount)}</td>
                            </tr>
                          )}
                          {selected.tax > 0 && (
                            <tr>
                              <td className={T_LABEL}>VAT / Tax</td>
                              <td className={T_VALUE}>{fmt(selected.tax)}</td>
                            </tr>
                          )}
                          {(selected.delivery_charge || 0) > 0 && (
                            <tr>
                              <td className={T_LABEL}>Delivery</td>
                              <td className={T_VALUE}>+ {fmt(selected.delivery_charge)}</td>
                            </tr>
                          )}
                          <tr>
                            <td className={T_LABEL}>Total Amount</td>
                            <td className={T_VALUE}>{fmt(selected.total)}</td>
                          </tr>
                          <tr>
                            <td className={T_LABEL}>Received</td>
                            <td className={T_VALUE}>{fmt(selected.paid_amount)}</td>
                          </tr>
                          <tr>
                            <td className={`${T_LABEL} !h-11 font-bold text-gray-900 ${balance > 0 ? "!bg-red-50" : "!bg-lime-50"}`}>
                              Balance Due
                            </td>
                            <td className={`${T_VALUE} !h-11 text-[17px] font-extrabold ${
                              balance > 0 ? "text-red-600 bg-red-50" : "text-gray-900 bg-lime-50"
                            }`}>
                              {fmt(Math.max(0, balance))}
                            </td>
                          </tr>
                          <tr>
                            <td className={`${T_LABEL} border-b-0`}>Status</td>
                            <td className={`${T_VALUE} border-b-0`}>
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLE[selected.status] || STATUS_STYLE.unpaid}`}>
                                {selected.status.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50/70 flex items-center justify-between gap-2 rounded-b-2xl">
              <div className="relative">
                <button onClick={() => setMoreOpen(o => !o)} disabled={detailLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                  More Actions <ChevronDown size={13} className={moreOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                </button>
                {moreOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                    <div className="absolute left-0 bottom-full mb-1 z-20 w-52 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      <button onClick={() => stub("Duplicate Transaction")}
                        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-[12px] text-gray-700 hover:bg-gray-50 border-b border-gray-100">
                        <Copy size={13} className="text-gray-500" /> Duplicate Transaction
                      </button>
                      <button onClick={() => stub("Convert to Sales Return")}
                        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-[12px] text-gray-700 hover:bg-gray-50">
                        <ArrowLeftRight size={13} className="text-gray-500" /> Convert to Sales Return
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => removeInvoice(selected)} disabled={detailLoading || deleting}
                  className="p-2.5 rounded-xl border border-red-200 bg-white text-red-500 hover:bg-red-50 disabled:opacity-40" title="Delete">
                  <Trash2 size={15} />
                </button>
                <button onClick={() => navigate("/sales/create", { state: { editId: selected.id } })}
                  disabled={detailLoading || deleting} className={BTN_OUTLINE}>
                  <Pencil size={13} /> Edit
                </button>
                <button onClick={() => printBill(selected)} disabled={detailLoading || deleting} className={BTN_OUTLINE}>
                  <Printer size={13} /> Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}