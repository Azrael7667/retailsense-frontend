import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X, Trash2, Edit2, Printer, Download, ChevronDown, Copy, ArrowLeftRight } from "lucide-react"
import apiClient from "../../lib/apiClient"
import { shortDocNumber } from "../../utils/docNumber"
import toast from "react-hot-toast"

const BLUE="#2563eb", DARK="#111827", GRAY="#6b7280", MUTED="#9ca3af",
      BORDER="#e5e7eb", LIGHT="#f9fafb", RED="#dc2626", GREEN="#16a34a"

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

function PrintableDocument({ data, docNumber, partyLabel, isInvoice }) {
  if (!data) return null
  const party = isInvoice ? data.customers : data.suppliers
  const store = data.stores || {}

  const taxPercent = data.subtotal > 0 && data.tax
    ? Math.round((data.tax / data.subtotal) * 100)
    : null

  return createPortal(
    <div className="print-area">
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 40px", fontFamily: "'Helvetica Neue', Arial, sans-serif", color: DARK }}>

        <div style={{ borderTop: `4px solid ${BLUE}`, paddingTop: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
                {store.name || "Bijeta Auto Parts"}
              </h1>
              <p style={{ fontSize: 12.5, color: GRAY, margin: "6px 0 0", lineHeight: 1.6 }}>
                {store.address || "Chabahil, Gangahiti"}<br/>
                Phone: {store.phone || "9841687441"}
                {store.vat_number && <>  &nbsp;•&nbsp; VAT No: {store.vat_number}</>}
              </p>
            </div>
            <div style={{
              background: isInvoice ? "#eff6ff" : "#fef2f2",
              color: isInvoice ? BLUE : RED,
              border: `1px solid ${isInvoice ? "#bfdbfe" : "#fecaca"}`,
              borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 800,
              letterSpacing: "0.06em", whiteSpace: "nowrap"
            }}>
              {isInvoice ? "TAX INVOICE" : "PURCHASE BILL"}
            </div>
          </div>
        </div>

        <div style={{
          display: "flex", justifyContent: "space-between", gap: 24,
          background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 10,
          padding: "16px 20px", marginBottom: 24, fontSize: 12.5
        }}>
          <div>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
              {isInvoice ? "Bill To" : "Purchased From"}
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{party?.name || partyLabel}</p>
            {party?.address && <p style={{ color: GRAY }}>{party.address}</p>}
            {party?.phone && <p style={{ color: GRAY }}>Phone: {party.phone}</p>}
          </div>
          <div style={{ textAlign: "right", minWidth: 190 }}>
            <Meta label={isInvoice ? "Invoice No" : "Bill No"} value={docNumber || "—"} strong/>
            <Meta label="Date" value={isInvoice ? data.invoice_date : data.purchase_date}/>
            <Meta label="Payment Mode" value={data.status === "paid" ? "Paid" : data.status === "partial" ? "Partial" : "Credit"}/>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 24, border: `1.5px solid ${DARK}` }}>
          <thead>
            <tr style={{ background: DARK, color: "#fff" }}>
              <th style={{ textAlign: "left", padding: "10px 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", border: `1px solid ${DARK}` }}>S.N.</th>
              <th style={{ textAlign: "left", padding: "10px 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", border: `1px solid ${DARK}` }}>Item</th>
              <th style={{ textAlign: "right", padding: "10px 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", border: `1px solid ${DARK}` }}>Qty</th>
              <th style={{ textAlign: "right", padding: "10px 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", border: `1px solid ${DARK}` }}>Rate</th>
              <th style={{ textAlign: "right", padding: "10px 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", border: `1px solid ${DARK}` }}>Discount</th>
              <th style={{ textAlign: "right", padding: "10px 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", border: `1px solid ${DARK}` }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(data.items || []).map((item, i) => {
              const gross = item.quantity * item.unit_price
              const discountAmt = isInvoice
                ? (item.discount || 0)
                : Math.max(0, gross - item.total)
              return (
                <tr key={item.id} style={{ background: i % 2 === 1 ? LIGHT : "#fff" }}>
                  <td style={{ padding: "9px 10px", color: GRAY, border: `1px solid ${BORDER}` }}>{i + 1}</td>
                  <td style={{ padding: "9px 10px", fontWeight: 600, border: `1px solid ${BORDER}` }}>{item.product_name}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", border: `1px solid ${BORDER}` }}>{item.quantity}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", border: `1px solid ${BORDER}` }}>{fmt(item.unit_price)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: GRAY, border: `1px solid ${BORDER}` }}>{discountAmt > 0 ? fmt(discountAmt) : "—"}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, border: `1px solid ${BORDER}` }}>{fmt(item.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 28 }}>
          <div style={{ width: 280, border: `1.5px solid ${DARK}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px 4px", fontSize: 12.5 }}>
              <PrintRow label="Sub Total" value={fmt(data.subtotal)} />
              {!!data.tax && (
                <PrintRow label={taxPercent ? `Tax (VAT ${taxPercent}%)` : "Tax"} value={fmt(data.tax)} />
              )}
              {!!data.discount_total && <PrintRow label="Discount" value={fmt(data.discount_total)} />}
              {isInvoice && !!data.delivery_charge && <PrintRow label="Delivery Charge" value={fmt(data.delivery_charge)} />}
              {!isInvoice && !!data.charges_amount && <PrintRow label="Charges" value={fmt(data.charges_amount)} />}
              <div style={{ borderTop: `1px solid ${BORDER}`, margin: "6px 0" }} />
              <PrintRow label="Total Amount" value={fmt(data.total)} bold />
              <PrintRow label={isInvoice ? "Received Amount" : "Paid Amount"} value={fmt(data.paid_amount)} />
            </div>
            <div style={{ background: "#fef2f2", padding: "10px 18px", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 800, fontSize: 13.5, color: RED }}>Amount Due</span>
              <span style={{ fontWeight: 800, fontSize: 13.5, color: RED }}>{fmt(data.total - (data.paid_amount || 0))}</span>
            </div>
          </div>
        </div>

        {data.notes && (
          <div style={{ marginBottom: 28, fontSize: 12.5, background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 18px" }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Remarks</p>
            <p>{data.notes}</p>
          </div>
        )}

        <p style={{ textAlign: "center", fontSize: 12, color: GRAY, fontStyle: "italic", marginBottom: 40 }}>
          Thank you for your business!
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
          <p style={{ borderTop: `1px solid ${DARK}`, paddingTop: 4, fontSize: 10.5, color: DARK, minWidth: 180, textAlign: "center" }}>
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
    <p style={{ marginBottom: 4 }}>
      <span style={{ color: MUTED }}>{label}: </span>
      <span style={{ fontWeight: strong ? 700 : 500 }}>{value}</span>
    </p>
  )
}

function PrintRow({ label, value, bold }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", padding: "4px 0",
      fontWeight: bold ? 700 : 400, fontSize: bold ? 13.5 : 12.5
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
    const warning = isInvoice
      ? "Delete this invoice? This reverses its balance and stock effects, and also deletes any linked sales returns."
      : "Delete this purchase? This reverses its balance and stock effects, and removes any linked payment allocations."
    if (!confirm(warning)) return
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

  return (
    <>
      <style>{`
        .print-area { display: none; }
        @media print {
          body > *:not(.print-area) { display: none !important; }
          .print-area { display: block !important; }
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

          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", borderBottom:`1px solid ${BORDER}`, position:"sticky", top:0, background:"#fff", zIndex:1 }}>
            <h2 style={{ fontSize:18, fontWeight:700, color:DARK }}>
              {noun} {docNumber}
            </h2>
            <button onClick={onClose} style={{ padding:6, borderRadius:8, border:"none", background:"none", cursor:"pointer", color:MUTED }}>
              <X size={18}/>
            </button>
          </div>

          {loading ? (
            <div style={{ padding:60, textAlign:"center" }}>
              <div style={{ width:24, height:24, border:`2px solid ${BLUE}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto" }}/>
            </div>
          ) : error ? (
            <div style={{ padding:40, textAlign:"center" }}>
              <p style={{ fontSize:13, color:RED }}>{error}</p>
            </div>
          ) : (
            <>
              <div style={{ padding:"18px 22px", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <p style={{ fontSize:12, color:MUTED, marginBottom:3 }}>{isInvoice ? "Party" : "Party"}:</p>
                  <p style={{ fontSize:16, fontWeight:700, color:DARK, marginBottom:14 }}>{partyLabel}</p>
                  <p style={{ fontSize:12, color:MUTED, marginBottom:3 }}>Balance:</p>
                  <p style={{ fontSize:17, fontWeight:700, color: partyBalance > 0 ? (isInvoice ? GREEN : RED) : DARK }}>
                    {fmt(Math.abs(partyBalance || 0))} {partyBalance > 0 ? (isInvoice ? "(To Receive)" : "(To Give)") : ""}
                  </p>
                </div>
                <div style={{ textAlign:"right", fontSize:13, color:"#374151" }}>
                  <p style={{ marginBottom:6 }}><span style={{ color:MUTED }}>{isInvoice ? "Invoice No" : "Bill No"}: </span><strong>{docNumber || "—"}</strong></p>
                  <p style={{ marginBottom:6 }}><span style={{ color:MUTED }}>{isInvoice ? "Invoice Date" : "Bill Date"}: </span>{isInvoice ? data.invoice_date : data.purchase_date}</p>
                  <p><span style={{ color:MUTED }}>Payment Mode: </span>{data.status === "paid" ? "Paid" : "Credit"}</p>
                </div>
              </div>

              <div style={{ padding:"0 22px", overflowX:"auto" }}>
                <table style={{ width:"100%", minWidth:720, borderCollapse:"collapse", fontSize:14, tableLayout:"fixed" }}>
                  <colgroup>
                    <col style={{ width:48 }}/>
                    <col/>
                    <col style={{ width:80 }}/>
                    <col style={{ width:110 }}/>
                    <col style={{ width:110 }}/>
                    <col style={{ width:130 }}/>
                  </colgroup>
                  <thead>
                    <tr style={{ background:"#f3f4f6" }}>
                      {["S.N.", "Name", "Quantity", "Rate", "Discount", "Amount"].map(h => (
                        <th key={h} style={{ padding:"12px 12px", textAlign: h==="S.N."?"left":h==="Name"?"left":"right", fontSize:11, fontWeight:700, color:GRAY, textTransform:"uppercase", letterSpacing:"0.02em", whiteSpace:"nowrap" }}>{h}</th>
                      ))}
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
                        <tr key={item.id} style={{ borderBottom:`1px solid ${BORDER}` }}>
                          <td style={{ padding:"14px 12px", color:"#374151" }}>{i + 1}</td>
                          <td style={{ padding:"14px 12px", color:DARK, fontWeight:500, wordBreak:"break-word" }}>{item.product_name}</td>
                          <td style={{ padding:"14px 12px", textAlign:"right", color:"#374151", whiteSpace:"nowrap" }}>{item.quantity}</td>
                          <td style={{ padding:"14px 12px", textAlign:"right", color:"#374151", whiteSpace:"nowrap" }}>{fmt(item.unit_price)}</td>
                          <td style={{ padding:"14px 12px", textAlign:"right", color:"#374151", whiteSpace:"nowrap" }}>
                            {discountAmt > 0 ? (
                              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:1 }}>
                                <span>{fmt(discountAmt)}</span>
                                <span style={{ fontSize:10.5, color:MUTED }}>({discountPct.toFixed(2)}%)</span>
                              </div>
                            ) : "—"}
                          </td>
                          <td style={{ padding:"14px 12px", textAlign:"right", color:DARK, fontWeight:600, whiteSpace:"nowrap" }}>{fmt(item.total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ padding:"22px", display:"flex", justifyContent:"flex-end" }}>
                <div style={{ width:280, fontSize:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0" }}>
                    <span style={{ color:MUTED }}>Sub Total:</span><span style={{ color:DARK }}>{fmt(data.subtotal)}</span>
                  </div>
                  {!!data.tax && (
                    <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0" }}>
                      <span style={{ color:MUTED }}>Tax:</span><span style={{ color:DARK }}>{fmt(data.tax)}</span>
                    </div>
                  )}
                  {!!data.discount_total && (
                    <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0" }}>
                      <span style={{ color:MUTED }}>Discount:</span><span style={{ color:DARK }}>{fmt(data.discount_total)}</span>
                    </div>
                  )}
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0" }}>
                    <span style={{ color:MUTED }}>Total Amount:</span><span style={{ color:DARK, fontWeight:600 }}>{fmt(data.total)}</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0" }}>
                    <span style={{ color:MUTED }}>{isInvoice ? "Received" : "Paid"} Amount:</span><span style={{ color:DARK }}>{fmt(data.paid_amount)}</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0 0", borderTop:`1px solid ${BORDER}`, marginTop:6 }}>
                    <span style={{ color:DARK, fontWeight:700, fontSize:15 }}>Amount Due:</span>
                    <span style={{ color: RED, fontWeight:700, fontSize:15 }}>{fmt(data.total - (data.paid_amount||0))}</span>
                  </div>
                </div>
              </div>

              {data.notes && (
                <div style={{ padding:"0 22px 16px" }}>
                  <p style={{ fontSize:11, fontWeight:700, color:DARK, marginBottom:2 }}>Remarks</p>
                  <p style={{ fontSize:13, color:"#374151" }}>{data.notes}</p>
                </div>
              )}

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
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:8, border:"none", background:BLUE, color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600 }}>
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
