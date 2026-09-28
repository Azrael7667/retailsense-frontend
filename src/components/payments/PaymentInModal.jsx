import { useState } from "react"
import api from "../../lib/apiClient"
import { formatBS } from "../../utils/dateHelpers"
import { X } from "lucide-react"
import toast from "react-hot-toast"

// ---- Theme (same palette as Adjust Balance: navy + soft lime) ----
const NAVY="#0f172a", DARK="#0f172a", GRAY="#64748b", MUTED="#94a3b8",
      BORDER="#e5e7eb", LIGHT="#f8fafc", RED="#dc2626",
      LIME_SOFT="#f7fee7", LIME_BORDER="#d9f99d"

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

const inp = { width:"100%", padding:"10px 14px", fontSize:14, border:`1px solid ${BORDER}`,
              borderRadius:12, outline:"none", color:DARK, background:"#fff", boxSizing:"border-box" }
const lbl = { fontSize:13, fontWeight:600, color:DARK, marginBottom:6, display:"block" }
const btn = (primary) => ({ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, padding:"10px 20px",
  fontSize:14, fontWeight:600, borderRadius:999, cursor:"pointer",
  background: primary?NAVY:"#fff", color: primary?"#fff":DARK,
  border: primary?"none":`1px solid ${BORDER}` })

// Inline styles can't do :focus, so the lime focus ring lives here once
const FocusStyle = () => (
  <style>{`
    .pim input:focus, .pim select:focus {
      border-color: #84cc16 !important;
      box-shadow: 0 0 0 3px #ecfccb;
    }
  `}</style>
)

export default function PaymentInModal({ storeId, customer, onClose, onSaved }) {
  const [amount,    setAmount]    = useState("")
  const [method,    setMethod]    = useState("cash")
  const [payDate,   setPayDate]   = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes,     setNotes]     = useState("")
  const [saving,    setSaving]    = useState(false)

  const payAmt = parseFloat(amount) || 0
  const currentBalance = customer.balance || 0
  const disabled = saving || payAmt <= 0

  async function handleSave() {
    if (payAmt <= 0) return toast.error("Enter a valid amount")
    setSaving(true)
    try {
      await api.post("/api/payments/", {
        customer_id: customer.id,
        payment_date: payDate,
        amount: payAmt,
        payment_method: method,
        reference: reference || null,
        notes: notes || null,
      })
      toast.success(`Payment of ${fmt(payAmt)} recorded`)
      onSaved?.()
    } catch(e) {
      toast.error(e.response?.data?.detail || e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pim" style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <FocusStyle />
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(15,23,42,0.4)", backdropFilter:"blur(2px)" }}/>
      <div style={{ position:"relative", background:"#fff", borderRadius:20, width:"100%", maxWidth:500,
        border:`1px solid ${BORDER}`, boxShadow:"0 24px 48px rgba(15,23,42,0.18)" }}>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", borderBottom:"1px solid #f1f5f9" }}>
          <h2 style={{ fontSize:17, fontWeight:700, color:DARK }}>Add Payment In — {customer.name}</h2>
          <button onClick={onClose} style={{ padding:6, borderRadius:8, border:"none", background:"none", cursor:"pointer", color:MUTED }}>
            <X size={18}/>
          </button>
        </div>

        <div style={{ padding:24 }}>
          <div style={{ padding:"12px 16px", background:LIME_SOFT, border:`1px solid ${LIME_BORDER}`, borderRadius:12, marginBottom:18 }}>
            <p style={{ fontSize:12, color:GRAY }}>Current balance</p>
            <p style={{ fontSize:18, fontWeight:700, color: currentBalance > 0 ? RED : DARK }}>{fmt(currentBalance)}</p>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
            <div>
              <span style={lbl}>Amount received (Rs)</span>
              <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0" className="no-spin" style={{ ...inp, fontWeight:700, fontSize:16 }}/>
              {currentBalance > 0 && (
                <button onClick={() => setAmount(String(currentBalance))}
                  style={{ fontSize:12, fontWeight:600, color:NAVY, textDecoration:"underline", background:"none", border:"none", cursor:"pointer", padding:0, marginTop:6 }}>
                  Full amount: {fmt(currentBalance)}
                </button>
              )}
            </div>
            <div>
              <span style={lbl}>Date</span>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={inp}/>
              <p style={{ fontSize:12, color:MUTED, marginTop:6 }}>{formatBS(payDate)}</p>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
            <div>
              <span style={lbl}>Payment mode</span>
              <select value={method} onChange={e => setMethod(e.target.value)} style={{ ...inp, cursor:"pointer", textTransform:"capitalize" }}>
                {["cash","esewa","khalti","bank_transfer","card","cheque"].map(x => (
                  <option key={x} value={x}>{x.replace("_"," ")}</option>
                ))}
              </select>
            </div>
            <div>
              <span style={lbl}>Reference (optional)</span>
              <input value={reference} onChange={e => setReference(e.target.value)}
                placeholder="Receipt no / eSewa ID" style={inp}/>
            </div>
          </div>

          <div>
            <span style={lbl}>Remarks (optional)</span>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Enter remarks here..." style={inp}/>
          </div>
        </div>

        <div style={{ display:"flex", justifyContent:"flex-end", gap:10, padding:"16px 24px",
          borderTop:"1px solid #f1f5f9", background:LIGHT, borderRadius:"0 0 20px 20px" }}>
          <button onClick={onClose} style={btn(false)}>Cancel</button>
          <button onClick={handleSave} disabled={disabled}
            style={{ ...btn(true), opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
            {saving ? "Saving..." : payAmt > 0 ? `Receive ${fmt(payAmt)}` : "Receive Payment"}
          </button>
        </div>
      </div>
    </div>
  )
}