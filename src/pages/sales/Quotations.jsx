import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { FileText, Pencil, Plus, Printer, Search, Trash2, X } from "lucide-react"
import toast from "react-hot-toast"
import apiClient from "../../lib/apiClient"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import EmptyStatePage from "../../components/common/EmptyStatePage"
import { confirmDialog } from "../../components/common/ConfirmDialog"

const FIELD = "w-full px-3.5 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 focus:border-lime-500"
const BTN_DARK = "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-full transition-colors"
const BTN_OUTLINE = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
const TH = "px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"

const P_LABEL = "block text-[13px] font-semibold text-slate-700 mb-1.5"
const P_BOX   = "px-3.5 py-2 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg"
const P_TH    = "px-3 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-700 bg-gray-50 border-b border-r border-gray-200 whitespace-nowrap"
const P_TD    = "px-3 py-3 text-sm text-gray-700 border-b border-r border-gray-200 align-middle"
const T_LABEL = "h-10 px-3 text-[13px] font-semibold text-slate-700 bg-gray-50 border-b border-r border-gray-200"
const T_VALUE = "h-10 px-3 text-right text-[13px] font-semibold text-gray-900 border-b border-gray-200 whitespace-nowrap tabular-nums"

const STATUS_STYLE = {
  draft: "bg-gray-100 text-gray-600", sent: "bg-blue-50 text-blue-700",
  accepted: "bg-green-50 text-green-700", rejected: "bg-red-50 text-red-600",
  expired: "bg-amber-50 text-amber-700", converted: "bg-lime-100 text-slate-800",
}
const SETTABLE = ["draft", "sent", "accepted", "rejected"]
const fmt = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

// The list API already marks overdue open quotations as expired; the detail API doesn't, so do it here too
const withStatus = (q) => {
  const today = new Date().toISOString().split("T")[0]
  if ((q.status === "draft" || q.status === "sent") && q.valid_until && q.valid_until < today) {
    return { ...q, status: "expired" }
  }
  return q
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-lime-600 border-t-transparent rounded-full animate-spin mx-auto" />
}

// ---------------- Printable A4 quotation ----------------
const NAVY = "#0f172a", INK = "#111827", GRAY = "#6b7280", MUTED = "#9ca3af",
      BORDER = "#e5e7eb", LIGHT = "#f9fafb", LIME_PILL = "#ecfccb", LIME_BORDER = "#d9f99d"
const PAGE_H = 297 // mm

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

function PrintableQuotation({ q, store }) {
  const items = q.items || []
  const zoom = printZoom(items.length)
  const discount = q.discount || 0
  const taxable = Math.max(0, (q.subtotal || 0) - discount)
  const taxPercent = q.tax > 0 && taxable > 0 ? Math.round((q.tax / taxable) * 100) : null

  return createPortal(
    <div className="print-area">
      <div style={{
        zoom, width: "210mm", height: `${PAGE_H / zoom}mm`, boxSizing: "border-box",
        padding: "10mm 12mm 9mm", margin: "0 auto", display: "flex", flexDirection: "column",
        fontFamily: "'Helvetica Neue', Arial, sans-serif", color: INK, background: "#fff"
      }}>

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
              QUOTATION
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 24, flexShrink: 0,
          background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 16px",
          marginBottom: 12, fontSize: 11.5 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Quotation For</p>
            <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 1 }}>{q.customers?.name || "Walk-in Customer"}</p>
            {q.customers?.phone && <p style={{ color: GRAY }}>Phone: {q.customers.phone}</p>}
          </div>
          <div style={{ textAlign: "right", minWidth: 200 }}>
            <Meta label="Quotation No" value={q.quotation_number} strong />
            <Meta label="Date (AD)" value={formatAD(q.quotation_date)} />
            <Meta label="Date (BS)" value={formatBS(q.quotation_date)} />
            {q.valid_until && <Meta label="Valid Until" value={`${formatAD(q.valid_until)} (${formatBS(q.valid_until)})`} />}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
          borderBottom: `1.5px solid ${INK}`, marginBottom: 12 }}>
          <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 36 }} /><col /><col style={{ width: 44 }} />
              <col style={{ width: 92 }} /><col style={{ width: 92 }} /><col style={{ width: 104 }} />
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
              <tr style={{ height: "100%" }}>
                <td style={PR_FILL}></td><td style={PR_FILL}></td><td style={PR_FILL}></td>
                <td style={PR_FILL}></td><td style={PR_FILL}></td><td style={PR_FILL}></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20,
          flexShrink: 0, pageBreakInside: "avoid", breakInside: "avoid" }}>
          <div style={{ flex: 1, fontSize: 11.5, alignSelf: "stretch" }}>
            {q.notes && (
              <div style={{ background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", maxWidth: 330, marginBottom: 8 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Remarks</p>
                <p>{q.notes}</p>
              </div>
            )}
            {q.terms && (
              <div style={{ background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", maxWidth: 330 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Terms &amp; Conditions</p>
                <p style={{ whiteSpace: "pre-line" }}>{q.terms}</p>
              </div>
            )}
          </div>

          <div style={{ width: 270, border: `1.5px solid ${INK}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "8px 16px 8px", fontSize: 11.5 }}>
              <PrintRow label="Sub Total" value={fmt(q.subtotal)} />
              {discount > 0 && <PrintRow label="Discount" value={`- ${fmt(discount)}`} />}
              {discount > 0 && <PrintRow label="Taxable" value={fmt(taxable)} />}
              {q.tax > 0 && <PrintRow label={taxPercent ? `VAT (${taxPercent}%)` : "VAT / Tax"} value={fmt(q.tax)} />}
              <div style={{ borderTop: `1px solid ${BORDER}`, margin: "4px 0" }} />
              <PrintRow label="Total Amount" value={fmt(q.total)} bold />
            </div>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: GRAY, fontStyle: "italic", margin: "14px 0 0", flexShrink: 0 }}>
          This is a quotation, not a tax invoice. Prices are subject to the validity date above.
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

export default function Quotations() {
  const { storeId } = useStoreId()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [selected, setSelected] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [store, setStore] = useState({
    name: "Bijeta Auto Parts", address: "Chabahil, Gangahiti", phone: "9841687441", vat_number: "603890844",
  })

  useEffect(() => { if (storeId) { load(); loadStore() } }, [storeId])

  async function loadStore() {
    const { data } = await supabase.from("stores").select("name, address, phone, vat_number").eq("id", storeId).maybeSingle()
    if (data) setStore(s => ({
      name: data.name || s.name, address: data.address || s.address,
      phone: data.phone || s.phone, vat_number: data.vat_number || s.vat_number,
    }))
  }

  useEffect(() => {
    if (!selected) return
    const onKey = (e) => { if (e.key === "Escape") setSelected(null) }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [selected])

  async function load() {
    setLoading(true)
    try {
      const { data } = await apiClient.get("/api/quotations/")
      setRows(data || [])
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load quotations")
    } finally {
      setLoading(false)
    }
  }

  async function openDetail(q) {
    setSelected({ ...q, items: [] })
    setDetailLoading(true)
    try {
      const { data } = await apiClient.get(`/api/quotations/${q.id}`)
      setSelected(withStatus(data))
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not open quotation")
      setSelected(null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function changeStatus(newStatus) {
    if (!selected || newStatus === selected.status) return
    setBusy(true)
    try {
      await apiClient.patch(`/api/quotations/${selected.id}/status`, { status: newStatus })
      setSelected(s => withStatus({ ...s, status: newStatus }))
      setRows(rs => rs.map(r => r.id === selected.id ? withStatus({ ...r, status: newStatus }) : r))
      toast.success(`Marked as ${newStatus}`)
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not change status")
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!selected) return
    const ok = await confirmDialog({
      title: "Delete this quotation?",
      message: `${selected.quotation_number} will be permanently removed. Stock and balances are not affected, because quotations never change them.`,
      confirmText: "Delete",
      variant: "danger",
    })
    if (!ok) return
    setBusy(true)
    try {
      await apiClient.delete(`/api/quotations/${selected.id}`)
      toast.success("Quotation deleted")
      setSelected(null)
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not delete")
    } finally {
      setBusy(false)
    }
  }

  function printQuotation(q) {
    const original = document.title
    document.title = `Quotation ${q.quotation_number} - ${store.name}`.replace(/\s+/g, " ").trim()
    window.print()
    document.title = original
  }

  const goCreate = () => navigate("/quotations/create")
  const goEdit = (q) => navigate("/quotations/create", { state: { editId: q.id } })

  const filtered = rows.filter(q => {
    const s = search.toLowerCase()
    return (!s || q.quotation_number.toLowerCase().includes(s) || (q.customers?.name || "").toLowerCase().includes(s)) &&
      (status === "all" || q.status === status)
  })

  if (!loading && rows.length === 0) {
    return (
      <EmptyStatePage title="Create Your First Quotation"
        description="Click the create quotation button and start sending quotes to customers."
        buttonLabel="Create Quotation" onCreate={goCreate} />
    )
  }

  const taxable = selected ? Math.max(0, (selected.subtotal || 0) - (selected.discount || 0)) : 0

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

      {selected && !detailLoading && <PrintableQuotation q={selected} store={store} />}

      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <h1 className="text-xl font-bold text-gray-900">
          Quotations <span className="text-base font-normal text-gray-400">({filtered.length})</span>
        </h1>
        <button onClick={goCreate} className={BTN_DARK}><Plus size={14} /> Create Quotation</button>
      </div>

      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <div className="relative w-full max-w-[16rem]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quotations…"
            className={`${FIELD} pl-9 ${search ? "pr-9" : "pr-3"}`} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={14} /></button>
          )}
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} className={`${FIELD} !w-40`}>
          <option value="all">All Status</option>
          {["draft", "sent", "accepted", "rejected", "expired", "converted"].map(s =>
            <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto slim-scroll">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_0_#f3f4f6]">
              <tr>
                <th className={TH}>Quotation No</th><th className={TH}>Party Name</th>
                <th className={TH}>Date</th><th className={TH}>Valid Until</th>
                <th className={TH}>Status</th><th className={`${TH} text-right`}>Total Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="py-16"><Spinner /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16">
                  <FileText size={24} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No quotations match your filters</p>
                </td></tr>
              ) : filtered.map(q => (
                <tr key={q.id} onClick={() => openDetail(q)} className="cursor-pointer hover:bg-gray-50/70">
                  <td className="px-5 py-4 font-medium text-gray-900 whitespace-nowrap">{q.quotation_number}</td>
                  <td className="px-5 py-4 text-[13px] font-medium text-gray-900">{q.customers?.name || "Walk-in Customer"}</td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <p className="text-[13px] text-gray-700">{formatAD(q.quotation_date)}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{formatBS(q.quotation_date)}</p>
                  </td>
                  <td className="px-5 py-4 text-[13px] text-gray-700 whitespace-nowrap">{q.valid_until ? formatAD(q.valid_until) : "—"}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLE[q.status] || STATUS_STYLE.draft}`}>
                      {q.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-gray-900 whitespace-nowrap">{fmt(q.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quotation popup */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-100">

            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900">Quotation {selected.quotation_number}</h2>
                <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLE[selected.status] || STATUS_STYLE.draft}`}>
                  {selected.status.toUpperCase()}
                </span>
              </div>
              <button onClick={() => setSelected(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Close">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-6">
              <div className="border border-gray-200 border-t-[3px] border-t-lime-500 rounded-xl overflow-hidden bg-white">

                <div className="px-6 py-5 border-b border-gray-200 flex flex-wrap items-start justify-between gap-6">
                  <div className="min-w-[240px]">
                    <span className={P_LABEL}>Party</span>
                    <div className={`${P_BOX} rounded-full font-semibold bg-white`}>
                      {selected.customers?.name || "Walk-in Customer"}
                    </div>
                    {selected.customers?.phone && <p className="text-xs text-gray-400 mt-2">{selected.customers.phone}</p>}
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <span className={P_LABEL}>Quotation No</span>
                      <div className={`${P_BOX} min-w-[150px]`}>{selected.quotation_number}</div>
                    </div>
                    <div>
                      <span className={P_LABEL}>Date</span>
                      <div className={`${P_BOX} min-w-[150px]`}>{formatAD(selected.quotation_date)}</div>
                      <p className="text-xs font-semibold text-slate-600 mt-1.5">{formatBS(selected.quotation_date)}</p>
                    </div>
                    <div>
                      <span className={P_LABEL}>Valid Until</span>
                      <div className={`${P_BOX} min-w-[150px]`}>{selected.valid_until ? formatAD(selected.valid_until) : "—"}</div>
                      {selected.valid_until && (
                        <p className="text-xs font-semibold text-slate-600 mt-1.5">{formatBS(selected.valid_until)}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto slim-scroll">
                  <table className="w-full text-sm min-w-[640px] border-collapse table-fixed">
                    <colgroup>
                      <col style={{ width: 56 }} /><col /><col style={{ width: 80 }} />
                      <col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 140 }} />
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
                      ) : (selected.items || []).length === 0 ? (
                        <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-400 border-b border-gray-200">No items</td></tr>
                      ) : selected.items.map((item, i) => (
                        <tr key={item.id}>
                          <td className={`${P_TD} text-center`}>
                            <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-lime-100 text-slate-900 text-xs font-bold">{i + 1}</span>
                          </td>
                          <td className={`${P_TD} font-medium text-gray-900 break-words`}>{item.product_name}</td>
                          <td className={`${P_TD} text-center font-semibold text-gray-900 tabular-nums`}>{item.quantity}</td>
                          <td className={`${P_TD} text-right whitespace-nowrap tabular-nums`}>{fmt(item.unit_price)}</td>
                          <td className={`${P_TD} text-right whitespace-nowrap tabular-nums text-gray-500`}>{item.discount > 0 ? fmt(item.discount) : "—"}</td>
                          <td className={`${P_TD} text-right whitespace-nowrap tabular-nums font-bold text-gray-900 border-r-0`}>{fmt(item.total)}</td>
                        </tr>
                      ))}
                      {!detailLoading && (
                        <tr>
                          <td colSpan={4} className={`${P_TD} border-b-0`}></td>
                          <td className={`${P_TD} border-b-0 text-right text-[13px] font-semibold text-slate-700`}>Sub Total</td>
                          <td className={`${P_TD} border-b-0 border-r-0 text-right font-bold text-gray-900 whitespace-nowrap tabular-nums`}>{fmt(selected.subtotal)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="px-6 py-6 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-4">
                    <div>
                      <span className={P_LABEL}>Notes or Remarks</span>
                      <div className={`min-h-[60px] max-w-[400px] px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg ${selected.notes ? "text-gray-700" : "text-gray-400"}`}>
                        {selected.notes || "No remarks"}
                      </div>
                    </div>
                    <div>
                      <span className={P_LABEL}>Terms & Conditions</span>
                      <div className={`min-h-[60px] max-w-[400px] px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg ${selected.terms ? "text-gray-700" : "text-gray-400"}`}>
                        {selected.terms || "None"}
                      </div>
                    </div>
                  </div>

                  <div className="w-full max-w-[360px] md:ml-auto self-start">
                    <div className="border border-gray-200 overflow-hidden">
                      <table className="w-full border-collapse table-fixed">
                        <colgroup><col style={{ width: "46%" }} /><col style={{ width: "54%" }} /></colgroup>
                        <tbody>
                          <tr><td className={T_LABEL}>Sub Total</td><td className={T_VALUE}>{fmt(selected.subtotal)}</td></tr>
                          {selected.discount > 0 && (
                            <tr><td className={T_LABEL}>Discount</td><td className={T_VALUE}>- {fmt(selected.discount)}</td></tr>
                          )}
                          {selected.discount > 0 && (
                            <tr><td className={T_LABEL}>Taxable</td><td className={T_VALUE}>{fmt(taxable)}</td></tr>
                          )}
                          {selected.tax > 0 && (
                            <tr><td className={T_LABEL}>VAT / Tax</td><td className={T_VALUE}>{fmt(selected.tax)}</td></tr>
                          )}
                          <tr>
                            <td className={`${T_LABEL} !h-11 font-bold text-gray-900 !bg-lime-50 border-b-0`}>Total Amount</td>
                            <td className={`${T_VALUE} !h-11 text-[17px] font-extrabold bg-lime-50 border-b-0`}>{fmt(selected.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50/70 flex items-center justify-between gap-3 rounded-b-2xl">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-gray-500">Mark as</span>
                <select disabled={busy || detailLoading || selected.status === "converted"}
                  value={SETTABLE.includes(selected.status) ? selected.status : ""}
                  onChange={e => changeStatus(e.target.value)}
                  className="px-3 py-2 text-[13px] bg-white border border-gray-200 rounded-xl text-gray-700 disabled:opacity-50">
                  {!SETTABLE.includes(selected.status) && <option value="" disabled>{selected.status}</option>}
                  {SETTABLE.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={remove} disabled={busy || detailLoading || selected.status === "converted"}
                  className="p-2.5 rounded-xl border border-red-200 bg-white text-red-500 hover:bg-red-50 disabled:opacity-40" title="Delete">
                  <Trash2 size={15} />
                </button>
                <button onClick={() => printQuotation(selected)} disabled={detailLoading || busy} className={BTN_OUTLINE}>
                  <Printer size={13} /> Print
                </button>
                <button onClick={() => goEdit(selected)} disabled={detailLoading || selected.status === "converted"} className={BTN_OUTLINE}>
                  <Pencil size={13} /> Edit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
