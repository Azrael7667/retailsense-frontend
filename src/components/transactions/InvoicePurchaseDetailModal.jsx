import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X, Trash2, Edit2, Printer, Download, ChevronDown, Copy, ArrowLeftRight } from "lucide-react"
import apiClient from "../../lib/apiClient"
import { shortDocNumber } from "../../utils/docNumber"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { confirmDialog } from "../common/ConfirmDialog" // adjust the path if your ConfirmDialog file lives elsewhere
import toast from "react-hot-toast"

// Navy replaces the old blue everywhere (same navy as the "Save" buttons).
const NAVY="#0f172a", LIME="#84cc16", LIME_SOFT="#f7fee7", LIME_PILL="#ecfccb", LIME_BORDER="#d9f99d",
      DARK="#111827", GRAY="#6b7280", MUTED="#9ca3af",
      BORDER="#e5e7eb", LIGHT="#f9fafb", RED="#dc2626", GREEN="#16a34a"

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

// ---- Ruled-table styles (same look as the create / edit pages) ----
const lbl = { fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 7, display: "block" }
const fieldBox = { padding: "9px 13px", fontSize: 14, border: `1px solid ${BORDER}`, borderRadius: 9,
  color: DARK, background: LIGHT, minWidth: 170, boxSizing: "border-box" }
const thStyle = { padding: "12px 11px", fontSize: 11, fontWeight: 700, color: "#334155",
  textTransform: "uppercase", letterSpacing: "0.04em", background: LIGHT,
  borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, whiteSpace: "nowrap" }
const tdStyle = { padding: "12px 11px", fontSize: 14, color: "#374151",
  borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, verticalAlign: "middle" }
const T_CELL  = { height: 38, borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, verticalAlign: "middle" }
const T_LABEL = { ...T_CELL, padding: "0 12px", background: LIGHT, fontSize: 13, fontWeight: 600, color: "#334155" }
const T_VALUE = { ...T_CELL, padding: "0 12px", textAlign: "right", fontSize: 13, fontWeight: 600, color: DARK,
  whiteSpace: "nowrap", borderRight: "none" }

// ---- Print layout: one full A4 sheet, like a real bill ----
// Long bills are scaled down a little so every item still fits on the single page.
function printZoom(itemCount) {
  if (itemCount <= 16) return 1
  if (itemCount <= 22) return 0.85
  if (itemCount <= 28) return 0.72
  if (itemCount <= 36) return 0.6
  return 0.5
}

const PAGE_H = 297 // mm (A4)
const INK = "#111827"
const P_TH = { padding: "8px 8px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.05em", border: `1px solid ${INK}`, whiteSpace: "nowrap", background: INK, color: "#fff" }
const P_TD = { padding: "7px 8px", borderLeft: `1px solid ${INK}`, borderRight: `1px solid ${INK}`,
  borderBottom: `1px solid ${BORDER}`, verticalAlign: "middle", fontSize: 12 }
const P_FILL = { borderLeft: `1px solid ${INK}`, borderRight: `1px solid ${INK}`, padding: 0 }

function PrintableDocument({ data, docNumber, partyLabel, isInvoice }) {
  if (!data) return null
  const party = isInvoice ? data.customers : data.suppliers
  const store = data.stores || {}
  const items = data.items || []
  const zoom = printZoom(items.length)

  const taxPercent = data.subtotal > 0 && data.tax
    ? Math.round((data.tax / data.subtotal) * 100)
    : null

  return createPortal(
    <div className="print-area">
      {/* One A4 sheet: header + party on top, items table stretches down, totals + signatures pinned at the bottom */}
      <div style={{
        zoom, width: "210mm", height: `${PAGE_H / zoom}mm`, boxSizing: "border-box",
        padding: "10mm 12mm 9mm", margin: "0 auto", display: "flex", flexDirection: "column",
        fontFamily: "'Helvetica Neue', Arial, sans-serif", color: DARK, background: "#fff"
      }}>

        {/* Header */}
        <div style={{ borderTop: `4px solid ${NAVY}`, paddingTop: 12, marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ fontSize: 23, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
                {store.name || "Bijeta Auto Parts"}
              </h1>
              <p style={{ fontSize: 11.5, color: GRAY, margin: "4px 0 0", lineHeight: 1.5 }}>
                {store.address || "Chabahil, Gangahiti"}<br/>
                Phone: {store.phone || "9841687441"}
                {store.vat_number && <>  &nbsp;•&nbsp; VAT No: {store.vat_number}</>}
              </p>
            </div>
            <div style={{
              background: isInvoice ? LIME_PILL : "#fef2f2",
              color: isInvoice ? NAVY : RED,
              border: `1px solid ${isInvoice ? LIME_BORDER : "#fecaca"}`,
              borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 800,
              letterSpacing: "0.06em", whiteSpace: "nowrap"
            }}>
              {isInvoice ? "TAX INVOICE" : "PURCHASE BILL"}
            </div>
          </div>
        </div>

        {/* Party + bill info */}
        <div style={{
          display: "flex", justifyContent: "space-between", gap: 24, flexShrink: 0,
          background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 10,
          padding: "10px 16px", marginBottom: 12, fontSize: 11.5
        }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
              {isInvoice ? "Bill To" : "Purchased From"}
            </p>
            <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 1 }}>{party?.name || partyLabel}</p>
            {party?.address && <p style={{ color: GRAY }}>{party.address}</p>}
            {party?.phone && <p style={{ color: GRAY }}>Phone: {party.phone}</p>}
          </div>
          <div style={{ textAlign: "right", minWidth: 190 }}>
            <Meta label={isInvoice ? "Invoice No" : "Bill No"} value={docNumber || "—"} strong/>
            <Meta label="Date" value={isInvoice ? data.invoice_date : data.purchase_date}/>
            <Meta label="Payment Mode" value={data.status === "paid" ? "Paid" : data.status === "partial" ? "Partial" : "Credit"}/>
          </div>
        </div>

        {/* Items: this block takes all the free height, so the column lines run down to the bottom */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
          borderBottom: `1.5px solid ${INK}`, marginBottom: 12 }}>
          <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 36 }}/>
              <col/>
              <col style={{ width: 44 }}/>
              <col style={{ width: 92 }}/>
              <col style={{ width: 92 }}/>
              <col style={{ width: 104 }}/>
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...P_TH, textAlign: "left" }}>S.N.</th>
                <th style={{ ...P_TH, textAlign: "left" }}>Item</th>
                <th style={{ ...P_TH, textAlign: "right" }}>Qty</th>
                <th style={{ ...P_TH, textAlign: "right" }}>Rate</th>
                <th style={{ ...P_TH, textAlign: "right" }}>Discount</th>
                <th style={{ ...P_TH, textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const gross = item.quantity * item.unit_price
                const discountAmt = isInvoice
                  ? (item.discount || 0)
                  : Math.max(0, gross - item.total)
                return (
                  <tr key={item.id} style={{ pageBreakInside: "avoid", breakInside: "avoid" }}>
                    <td style={{ ...P_TD, color: GRAY }}>{i + 1}</td>
                    <td style={{ ...P_TD, fontWeight: 600, wordBreak: "break-word" }}>{item.product_name}</td>
                    <td style={{ ...P_TD, textAlign: "right", whiteSpace: "nowrap" }}>{item.quantity}</td>
                    <td style={{ ...P_TD, textAlign: "right", whiteSpace: "nowrap" }}>{fmt(item.unit_price)}</td>
                    <td style={{ ...P_TD, textAlign: "right", color: GRAY, whiteSpace: "nowrap" }}>{discountAmt > 0 ? fmt(discountAmt) : "—"}</td>
                    <td style={{ ...P_TD, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{fmt(item.total)}</td>
                  </tr>
                )
              })}
              {/* Filler row: soaks up all the remaining height so the empty part of the table keeps its column lines */}
              <tr style={{ height: "100%" }}>
                <td style={P_FILL}></td>
                <td style={P_FILL}></td>
                <td style={P_FILL}></td>
                <td style={P_FILL}></td>
                <td style={P_FILL}></td>
                <td style={P_FILL}></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bottom block: remarks (left) + totals (right) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20,
          flexShrink: 0, pageBreakInside: "avoid", breakInside: "avoid" }}>
          <div style={{ flex: 1, fontSize: 11.5, alignSelf: "stretch" }}>
            {data.notes && (
              <div style={{ background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", maxWidth: 330 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Remarks</p>
                <p>{data.notes}</p>
              </div>
            )}
          </div>

          <div style={{ width: 270, border: `1.5px solid ${INK}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "8px 16px 8px", fontSize: 11.5 }}>
              <PrintRow label="Sub Total" value={fmt(data.subtotal)} />
              {!!data.tax && (
                <PrintRow label={taxPercent ? `Tax (VAT ${taxPercent}%)` : "Tax"} value={fmt(data.tax)} />
              )}
              {!!data.discount_total && <PrintRow label="Discount" value={fmt(data.discount_total)} />}
              {isInvoice && !!data.delivery_charge && <PrintRow label="Delivery Charge" value={fmt(data.delivery_charge)} />}
              {!isInvoice && !!data.charges_amount && <PrintRow label="Charges" value={fmt(data.charges_amount)} />}
              <div style={{ borderTop: `1px solid ${BORDER}`, margin: "4px 0" }} />
              <PrintRow label="Total Amount" value={fmt(data.total)} bold />
              <PrintRow label={isInvoice ? "Received Amount" : "Paid Amount"} value={fmt(data.paid_amount)} />
            </div>
          </div>
        </div>

        {/* Thank-you line + signatures, pinned to the very bottom */}
        <p style={{ textAlign: "center", fontSize: 11, color: GRAY, fontStyle: "italic", margin: "14px 0 0", flexShrink: 0 }}>
          Thank you for your business!
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 34, flexShrink: 0 }}>
          <p style={{ borderTop: `1px solid ${INK}`, paddingTop: 4, fontSize: 10, color: INK, minWidth: 170, textAlign: "center" }}>
            {isInvoice ? "Customer's Signature" : "Prepared By"}
          </p>
          <p style={{ borderTop: `1px solid ${INK}`, paddingTop: 4, fontSize: 10, color: INK, minWidth: 170, textAlign: "center" }}>
            Authorized Signature
          </p>
        </div>

      </div>
    </div>,
    document.body
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

function PrintRow({ label, value, bold }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", padding: "3px 0",
      fontWeight: bold ? 700 : 400, fontSize: bold ? 12.5 : 11.5
    }}>
      <span style={{ color: bold ? DARK : GRAY }}>{label}:</span><span>{value}</span>
    </div>
  )
}

export default function InvoicePurchaseDetailModal({ kind, id, partyLabel, partyBalance, onClose, onDeleted, onEdit }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const isInvoice = kind === "invoice"
  const endpoint = isInvoice ? "invoices" : "purchases"
  const noun = isInvoice ? "Sales Invoice" : "Purchase Bill"
  const docNumber = data
    ? shortDocNumber(
        isInvoice ? data.invoice_number : data.bill_number,
        isInvoice ? data.invoice_date : data.purchase_date
      )
    : ""

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiClient.get(`/api/${endpoint}/${id}`)
      .then(res => { if (!cancelled) setData(res.data) })
      .catch(e => { if (!cancelled) setError(e?.response?.data?.detail || "Failed to load") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [endpoint, id])

  function stub(label) {
    setMoreOpen(false)
    toast(`${label} — coming soon`, { icon: "🚧" })
  }

  function handleEdit() {
    if (onEdit) { onEdit(); onClose() }
    else stub("Edit")
  }

  function handlePrint() {
    const originalTitle = document.title
    const storeName = data?.stores?.name || "Bijeta Auto Parts"
    document.title = `${noun} ${docNumber} - ${storeName}`.replace(/\s+/g, " ").trim()
    window.print()
    document.title = originalTitle
  }

  async function handleDelete() {
    const ok = await confirmDialog({
      title: isInvoice ? "Delete this invoice?" : "Delete this purchase?",
      message: isInvoice
        ? "This reverses its balance and stock effects, and also deletes any linked sales returns."
        : "This reverses its balance and stock effects, and removes any linked payment allocations.",
      confirmText: "Delete",
      variant: "danger",
    })
    if (!ok) return

    setDeleting(true)
    try {
      await apiClient.delete(`/api/${endpoint}/${id}`)
      toast.success(`${noun} deleted`)
      onDeleted?.()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Failed to delete ${isInvoice ? "invoice" : "purchase"}`)
    } finally {
      setDeleting(false)
    }
  }

  const due = data ? (data.total || 0) - (data.paid_amount || 0) : 0

  return (
    <>
      <style>{`
        .print-area { display: none; }
        @page { size: A4; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; height: auto !important; }
          body > *:not(.print-area) { display: none !important; }
          .print-area { display: block !important; overflow: hidden; height: 296mm; page-break-after: avoid; break-after: avoid; }
        }
        .thin-scroll { scrollbar-width: thin; scrollbar-color: #d1d5db transparent; }
        .thin-scroll::-webkit-scrollbar { width: 6px; }
        .thin-scroll::-webkit-scrollbar-track { background: transparent; }
        .thin-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
        .thin-scroll::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
      `}</style>

      {!loading && !error && (
        <PrintableDocument data={data} docNumber={docNumber} partyLabel={partyLabel} isInvoice={isInvoice} />
      )}

      <div style={{ position:"fixed", inset:0, zIndex:60, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
        <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.35)" }}/>
        <div className="thin-scroll" style={{ position:"relative", background:"#fff", borderRadius:14, width:"100%", maxWidth:1040,
          maxHeight:"90vh", overflowY:"auto", border:`1px solid ${BORDER}`, boxShadow:"0 24px 48px rgba(0,0,0,0.18)" }}>

          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", borderBottom:`1px solid ${BORDER}`, position:"sticky", top:0, background:"#fff", zIndex:2 }}>
            <h2 style={{ fontSize:18, fontWeight:700, color:DARK }}>
              {noun} {docNumber}
            </h2>
            <button onClick={onClose} style={{ padding:6, borderRadius:8, border:"none", background:"none", cursor:"pointer", color:MUTED }}>
              <X size={18}/>
            </button>
          </div>

          {loading ? (
            <div style={{ padding:60, textAlign:"center" }}>
              <div style={{ width:24, height:24, border:`2px solid ${NAVY}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto" }}/>
            </div>
          ) : error ? (
            <div style={{ padding:40, textAlign:"center" }}>
              <p style={{ fontSize:13, color:RED }}>{error}</p>
            </div>
          ) : (
            <>
              {/* Bill card: everything sits inside one bordered card, like the edit page */}
              <div style={{ margin:"20px 22px", border:`1px solid ${BORDER}`, borderTop:`3px solid ${LIME}`,
                borderRadius:12, overflow:"hidden", background:"#fff" }}>

                {/* Top row: party + bill info */}
                <div style={{ padding:"20px 24px", borderBottom:`1px solid ${BORDER}`, display:"flex",
                  alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:24 }}>
                  <div style={{ minWidth:260 }}>
                    <span style={lbl}>Party</span>
                    <div style={{ ...fieldBox, borderRadius:999, fontWeight:600, background:"#fff" }}>{partyLabel}</div>
                    <p style={{ fontSize:13, marginTop:10, color:"#334155", fontWeight:600 }}>
                      Balance:{" "}
                      <span style={{ color: partyBalance > 0 ? (isInvoice ? GREEN : RED) : DARK, fontWeight:700 }}>
                        {fmt(Math.abs(partyBalance || 0))} {partyBalance > 0 ? (isInvoice ? "(To Receive)" : "(To Give)") : ""}
                      </span>
                    </p>
                  </div>
                  <div style={{ display:"flex", gap:28, flexWrap:"wrap" }}>
                    <div>
                      <span style={lbl}>{isInvoice ? "Invoice No" : "Bill No"}</span>
                      <div style={fieldBox}>{docNumber || "—"}</div>
                    </div>
                    <div>
                      <span style={lbl}>{isInvoice ? "Invoice Date" : "Bill Date"}</span>
                      <div style={fieldBox}>{formatAD(isInvoice ? data.invoice_date : data.purchase_date)}</div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginTop: 6 }}>
                        {formatBS(isInvoice ? data.invoice_date : data.purchase_date)}
                      </p>
                    </div>
                    <div>
                      <span style={lbl}>Payment Mode</span>
                      <div style={{ ...fieldBox, minWidth:140 }}>
                        {data.status === "paid" ? "Paid" : data.status === "partial" ? "Partial" : "Credit"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items table */}
                <div style={{ overflowX:"auto" }} className="thin-scroll">
                  <table style={{ width:"100%", minWidth:720, borderCollapse:"collapse", tableLayout:"fixed" }}>
                    <colgroup>
                      <col style={{ width:56 }}/>
                      <col/>
                      <col style={{ width:90 }}/>
                      <col style={{ width:130 }}/>
                      <col style={{ width:150 }}/>
                      <col style={{ width:150 }}/>
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, textAlign:"center" }}>S.N.</th>
                        <th style={{ ...thStyle, textAlign:"left" }}>Item Name</th>
                        <th style={{ ...thStyle, textAlign:"center" }}>Qty</th>
                        <th style={{ ...thStyle, textAlign:"right" }}>Rate</th>
                        <th style={{ ...thStyle, textAlign:"right" }}>Discount</th>
                        <th style={{ ...thStyle, textAlign:"right", borderRight:"none" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.items || []).map((item, i) => {
                        const gross = item.quantity * item.unit_price
                        const discountAmt = isInvoice
                          ? (item.discount || 0)
                          : Math.max(0, gross - item.total)
                        const discountPct = isInvoice
                          ? (gross > 0 ? (discountAmt / gross) * 100 : 0)
                          : (item.discount_percent || 0)
                        return (
                          <tr key={item.id}>
                            <td style={{ ...tdStyle, textAlign:"center" }}>
                              <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center",
                                width:22, height:22, borderRadius:6, background:LIME_PILL, color:NAVY,
                                fontSize:12, fontWeight:700 }}>{i + 1}</span>
                            </td>
                            <td style={{ ...tdStyle, color:DARK, fontWeight:500, wordBreak:"break-word" }}>{item.product_name}</td>
                            <td style={{ ...tdStyle, textAlign:"center", fontWeight:600, color:DARK, whiteSpace:"nowrap" }}>{item.quantity}</td>
                            <td style={{ ...tdStyle, textAlign:"right", whiteSpace:"nowrap" }}>{fmt(item.unit_price)}</td>
                            <td style={{ ...tdStyle, textAlign:"right", whiteSpace:"nowrap" }}>
                              {discountAmt > 0 ? (
                                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:1 }}>
                                  <span>{fmt(discountAmt)}</span>
                                  <span style={{ fontSize:10.5, color:MUTED }}>({Number(discountPct).toFixed(2)}%)</span>
                                </div>
                              ) : "—"}
                            </td>
                            <td style={{ ...tdStyle, textAlign:"right", fontWeight:700, color:DARK, whiteSpace:"nowrap", borderRight:"none" }}>{fmt(item.total)}</td>
                          </tr>
                        )
                      })}

                      {/* Sub Total row, like the edit page */}
                      <tr>
                        <td colSpan={4} style={{ ...tdStyle, borderBottom:"none" }}></td>
                        <td style={{ ...tdStyle, borderBottom:"none", textAlign:"right", fontSize:13, fontWeight:600, color:"#334155" }}>Sub Total</td>
                        <td style={{ ...tdStyle, borderBottom:"none", borderRight:"none", textAlign:"right", fontWeight:700, color:DARK, whiteSpace:"nowrap" }}>
                          {fmt(data.subtotal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Bottom: remarks (left) + totals table (right) */}
                <div style={{ padding:"24px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:40,
                  borderTop:`1px solid ${BORDER}` }}>
                  <div>
                    <span style={lbl}>Notes or Remarks</span>
                    <div style={{ minHeight:84, maxWidth:400, padding:"10px 13px", border:`1px solid ${BORDER}`,
                      borderRadius:9, background:LIGHT, fontSize:14, color: data.notes ? "#374151" : MUTED }}>
                      {data.notes || "No remarks"}
                    </div>
                  </div>

                  <div style={{ maxWidth:360, marginLeft:"auto", width:"100%" }}>
                    <div style={{ border:`1px solid ${BORDER}`, overflow:"hidden" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
                        <colgroup>
                          <col style={{ width:"46%" }}/>
                          <col style={{ width:"54%" }}/>
                        </colgroup>
                        <tbody>
                          <tr>
                            <td style={T_LABEL}>Sub Total</td>
                            <td style={T_VALUE}>{fmt(data.subtotal)}</td>
                          </tr>
                          {!!data.tax && (
                            <tr>
                              <td style={T_LABEL}>Tax</td>
                              <td style={T_VALUE}>{fmt(data.tax)}</td>
                            </tr>
                          )}
                          {!!data.discount_total && (
                            <tr>
                              <td style={T_LABEL}>Discount</td>
                              <td style={T_VALUE}>{fmt(data.discount_total)}</td>
                            </tr>
                          )}
                          <tr>
                            <td style={T_LABEL}>Total Amount</td>
                            <td style={T_VALUE}>{fmt(data.total)}</td>
                          </tr>
                          <tr>
                            <td style={T_LABEL}>{isInvoice ? "Received" : "Paid"} Amount</td>
                            <td style={T_VALUE}>{fmt(data.paid_amount)}</td>
                          </tr>
                          <tr>
                            <td style={{ ...T_LABEL, height:46, borderBottom:"none", fontWeight:700, color:DARK,
                              background: due > 0 ? "#fef2f2" : LIME_SOFT }}>
                              Amount Due
                            </td>
                            <td style={{ ...T_VALUE, height:46, borderBottom:"none", fontSize:17, fontWeight:800,
                              color: due > 0 ? RED : DARK, background: due > 0 ? "#fef2f2" : LIME_SOFT }}>
                              {fmt(due)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer actions */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 22px", borderTop:`1px solid ${BORDER}`, background:LIGHT, borderRadius:"0 0 14px 14px" }}>
                <div style={{ position:"relative" }}>
                  <button onClick={() => setMoreOpen(!moreOpen)}
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 12px", fontSize:12,
                      borderRadius:8, border:`1px solid ${BORDER}`, background:"#fff", color:GRAY, cursor:"pointer" }}>
                    More Actions <ChevronDown size={13}/>
                  </button>
                  {moreOpen && (
                    <div style={{ position:"absolute", bottom:"100%", left:0, marginBottom:4, background:"#fff",
                      border:`1px solid ${BORDER}`, borderRadius:10, boxShadow:"0 8px 20px rgba(0,0,0,0.1)", zIndex:5, overflow:"hidden", width:190 }}>
                      <button onClick={() => stub("Duplicate Transaction")}
                        style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"9px 14px", background:"none", border:"none", borderBottom:`1px solid ${LIGHT}`, cursor:"pointer", textAlign:"left", fontSize:12, color:"#374151" }}>
                        <Copy size={13} color={GRAY}/> Duplicate Transaction
                      </button>
                      <button onClick={() => stub(isInvoice ? "Convert to Sales Return" : "Convert to Purchase Return")}
                        style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"9px 14px", background:"none", border:"none", cursor:"pointer", textAlign:"left", fontSize:12, color:"#374151" }}>
                        <ArrowLeftRight size={13} color={GRAY}/> Convert to {isInvoice ? "Sales" : "Purchase"} Return
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={handleDelete} disabled={deleting}
                    style={{ padding:8, borderRadius:8, border:`1px solid #fecaca`, background:"#fff", color:RED, cursor: deleting?"wait":"pointer", opacity: deleting?0.6:1 }}>
                    <Trash2 size={14}/>
                  </button>
                  <button onClick={handleEdit}
                    style={{ padding:8, borderRadius:8, border:`1px solid ${BORDER}`, background:"#fff", color:GRAY, cursor:"pointer" }}>
                    <Edit2 size={14}/>
                  </button>
                  <button onClick={handlePrint}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:8, border:`1px solid ${BORDER}`, background:"#fff", color:GRAY, cursor:"pointer", fontSize:12, fontWeight:600 }}>
                    <Printer size={14}/> Print PDF
                  </button>
                  <button onClick={handlePrint}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:8, border:"none", background:NAVY, color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600 }}>
                    <Download size={14}/> Download PDF
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}