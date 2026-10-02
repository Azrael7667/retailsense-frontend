import { useState } from "react"
import { X, Trash2, Printer, Edit2, Calendar, ChevronDown } from "lucide-react"
import apiClient from "../../lib/apiClient"
import { shortDocNumber } from "../../utils/docNumber"
import toast from "react-hot-toast"

const DARK="#111827", GRAY="#6b7280", MUTED="#9ca3af", BORDER="#e5e7eb", LIGHT="#f9fafb", RED="#dc2626"

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

const fieldBox = { display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%",
  padding:"11px 14px", borderRadius:10, border:`1px solid ${BORDER}`, background:"#fff", fontSize:14.5, color:DARK }

/**
 * Shows detail for a Payment In / Payment Out row, styled to match Karobar's
 * boxed input-field layout. No fetch — uses the ledger event object the
 * parent already has.
 *
 * Props:
 *  kind        "payment" | "payment_out"
 *  event       { id, receiptNumber, date (display), rawDate (YYYY-MM-DD), total,
 *                paymentMethod, reference, notes, createdByName }
 *  partyLabel  display name of the customer/supplier
 *  onClose     () => void
 *  onDeleted   () => void
 */
export default function PaymentDetailModal({ kind, event, partyLabel, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const isIn = kind === "payment"
  const noun = isIn ? "Payment In" : "Payment Out"
  const endpoint = isIn ? "payments" : "payments-out"
  const receiptNo = shortDocNumber(event.receiptNumber, event.rawDate) || ""

  function stub(label) {
    toast(`${label} — coming soon`, { icon: "🚧" })
  }

  async function runDelete() {
    setDeleting(true)
    try {
      await apiClient.delete(`/api/${endpoint}/${event.id}`)
      toast.success(`${noun} deleted`)
      setShowConfirm(false)
      onDeleted?.()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Failed to delete ${noun.toLowerCase()}`)
    } finally {
      setDeleting(false)
    }
  }

  const remarksText = event.notes || event.reference || ""

  return (
    <div style={{ position:"fixed", inset:0, zIndex:60, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <style>{`@keyframes pdmCardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.35)" }}/>
      <div style={{ position:"relative", background:"#fff", borderRadius:14, width:"100%", maxWidth:560,
        border:`1px solid ${BORDER}`, boxShadow:"0 24px 48px rgba(0,0,0,0.18)" }}>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"20px 26px", borderBottom:`1px solid ${BORDER}` }}>
          <h2 style={{ fontSize:19, fontWeight:700, color:DARK }}>Edit {noun}</h2>
          <button onClick={onClose} style={{ padding:6, borderRadius:8, border:"none", background:"none", cursor:"pointer", color:MUTED }}>
            <X size={20}/>
          </button>
        </div>

        <div style={{ padding:26, display:"flex", flexDirection:"column", gap:18 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div>
              <p style={{ fontSize:12.5, fontWeight:600, color:GRAY, marginBottom:6 }}>Receipt Number</p>
              <div style={fieldBox}>
                <span>{receiptNo || "—"}</span>
              </div>
            </div>
            <div>
              <p style={{ fontSize:12.5, fontWeight:600, color:GRAY, marginBottom:6 }}>Date</p>
              <div style={fieldBox}>
                <span>{event.date}</span>
                <Calendar size={16} color={MUTED}/>
              </div>
            </div>
          </div>

          <div>
            <p style={{ fontSize:12.5, fontWeight:600, color:GRAY, marginBottom:6 }}>Party Name</p>
            <div style={fieldBox}>
              <span>{partyLabel}</span>
              <ChevronDown size={16} color={MUTED}/>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div>
              <p style={{ fontSize:12.5, fontWeight:600, color:GRAY, marginBottom:6 }}>{isIn ? "Received" : "Paid"} Amount</p>
              <div style={{ ...fieldBox, fontSize:17, fontWeight:700 }}>
                <span>{fmt(event.total)}</span>
              </div>
            </div>
            <div>
              <p style={{ fontSize:12.5, fontWeight:600, color:GRAY, marginBottom:6 }}>Payment Method</p>
              <div style={fieldBox}>
                <span style={{ textTransform:"capitalize" }}>{(event.paymentMethod || "—").replace("_"," ")}</span>
                <ChevronDown size={16} color={MUTED}/>
              </div>
            </div>
          </div>

          <div>
            <p style={{ fontSize:12.5, fontWeight:600, color:GRAY, marginBottom:6 }}>Remarks</p>
            <div style={{ minHeight:64, padding:"11px 14px", borderRadius:10, border:`1px solid ${BORDER}`,
              background:LIGHT, fontSize:14, color: remarksText ? "#374151" : MUTED }}>
              {remarksText || "No remarks"}
            </div>
          </div>

          <p style={{ fontSize:12.5, color:MUTED }}>Created by: {event.createdByName || "—"}</p>
        </div>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 26px", borderTop:`1px solid ${BORDER}`, background:LIGHT, borderRadius:"0 0 14px 14px" }}>
          <button onClick={() => setShowConfirm(true)} disabled={deleting}
            style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 18px", borderRadius:9, border:`1px solid #fecaca`,
              background:"#fff", color:RED, cursor: deleting?"wait":"pointer", fontSize:14, fontWeight:600, opacity: deleting?0.6:1 }}>
            <Trash2 size={16}/> Delete
          </button>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={() => stub("Print")}
              style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 18px", borderRadius:9, border:`1px solid ${BORDER}`,
                background:"#fff", color:GRAY, cursor:"pointer", fontSize:14, fontWeight:600 }}>
              <Printer size={16}/> Print
            </button>
            <button onClick={() => stub("Edit Details")}
              style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 18px", borderRadius:9, border:"none",
                background:"#16a34a", color:"#fff", cursor:"pointer", fontSize:14, fontWeight:600 }}>
              <Edit2 size={16}/> Edit Details
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showConfirm && (
        <div style={{ position:"fixed", inset:0, zIndex:70, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div onClick={() => !deleting && setShowConfirm(false)}
            style={{ position:"absolute", inset:0, background:"rgba(15,23,42,0.4)", backdropFilter:"blur(2px)" }} />
          <div style={{ position:"relative", background:"#fff", borderRadius:16, width:"100%", maxWidth:440,
            border:`1px solid ${BORDER}`, boxShadow:"0 25px 50px -12px rgba(15,23,42,0.25)", padding:24,
            animation:"pdmCardIn 0.2s ease-out both" }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:16 }}>
              <div style={{ width:48, height:48, borderRadius:"50%", background:"#fef2f2", color:"#ef4444",
                display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Trash2 size={22} />
              </div>
              <div style={{ paddingTop:4, minWidth:0 }}>
                <h2 style={{ fontSize:18, fontWeight:600, color:DARK, margin:0 }}>Delete payment?</h2>
                <p style={{ fontSize:14, color:GRAY, marginTop:4, lineHeight:1.55 }}>
                  {receiptNo && <><span style={{ fontWeight:600, color:"#374151" }}>{receiptNo}</span>{" "}</>}
                  will be permanently removed. Its balance effect will be reversed and it will be un-applied from any{" "}
                  {isIn ? "invoices" : "purchases"} it was allocated to.
                </p>
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:12, marginTop:24 }}>
              <button onClick={() => setShowConfirm(false)} disabled={deleting}
                style={{ padding:"8px 20px", fontSize:14, border:`1px solid ${BORDER}`, borderRadius:12,
                  background:"#fff", color:"#374151", cursor:"pointer", opacity: deleting ? 0.5 : 1 }}>
                Cancel
              </button>
              <button onClick={runDelete} disabled={deleting}
                style={{ padding:"8px 20px", fontSize:14, fontWeight:600, borderRadius:12, border:"none",
                  background:RED, color:"#fff", cursor: deleting ? "wait" : "pointer", opacity: deleting ? 0.5 : 1 }}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}