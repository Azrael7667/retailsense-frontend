import { useState } from "react"
import api from "../../lib/apiClient"
import { formatBS } from "../../utils/dateHelpers"
import { X } from "lucide-react"
import toast from "react-hot-toast"

const BLUE="#2563eb", DARK="#111827", GRAY="#6b7280", MUTED="#9ca3af",
      BORDER="#e5e7eb", LIGHT="#f9fafb", RED="#dc2626"

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

const inp = { width:"100%", padding:"8px 12px", fontSize:13, border:`1px solid ${BORDER}`,
              borderRadius:8, outline:"none", color:DARK, background:"#fff", boxSizing:"border-box" }
const lbl = { fontSize:11, fontWeight:600, color:GRAY, marginBottom:5, display:"block" }
const btn = (primary) => ({ display:"inline-flex", alignItems:"center", gap:5, padding:"8px 14px",
  fontSize:13, fontWeight:600, borderRadius:8, cursor:"pointer",
  background: primary?BLUE:"#fff", color: primary?"#fff":GRAY,
  border: primary?"none":`1px solid ${BORDER}` })

export default function PaymentInModal({ storeId, customer, onClose, onSaved }) {
  const [amount,    setAmount]    = useState("")
  const [method,    setMethod]    = useState("cash")
  const [payDate,   setPayDate]   = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes,     setNotes]     = useState("")
  const [saving,    setSaving]    = useState(false)

  const payAmt = parseFloat(amount) || 0
  const currentBalance = customer.balance || 0

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
    <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.3)" }}/>
      <div style={{ position:"relative", background:"#fff", borderRadius:14, width:"100%", maxWidth:480,
        border:`1px solid ${BORDER}`, boxShadow:"0 20px 40px rgba(0,0,0,0.12)" }}>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderBottom:"1px solid #f3f4f6" }}>
          <h2 style={{ fontSize:14, fontWeight:700, color:DARK }}>Add Payment In — {customer.name}</h2>
          <button onClick={onClose} style={{ padding:5, borderRadius:6, border:"none", background:"none", cursor:"pointer", color:MUTED }}>
            <X size={16}/>
          </button>
        </div>

        <div style={{ padding:20 }}>
          <div style={{ padding:"10px 14px", background:LIGHT, border:`1px solid ${BORDER}`, borderRadius:8, marginBottom:16 }}>
            <p style={{ fontSize:11, color:MUTED }}>Current balance</p>
            <p style={{ fontSize:16, fontWeight:700, color: currentBalance > 0 ? RED : DARK }}>{fmt(currentBalance)}</p>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <span style={lbl}>Amount received (Rs)</span>
              <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0" className="no-spin" style={{ ...inp, fontWeight:700, fontSize:15 }}/>
              {currentBalance > 0 && (
                <button onClick={() => setAmount(String(currentBalance))}
                  style={{ fontSize:11, color:BLUE, background:"none", border:"none", cursor:"pointer", padding:0, marginTop:5 }}>
                  Full amount: {fmt(currentBalance)}
                </button>
              )}
            </div>
            <div>
              <span style={lbl}>Date</span>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={inp}/>
              <p style={{ fontSize:11, color:MUTED, marginTop:5 }}>{formatBS(payDate)}</p>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
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

        <div style={{ display:"flex", justifyContent:"flex-end", gap:10, padding:"14px 20px",
          borderTop:"1px solid #f3f4f6", background:LIGHT, borderRadius:"0 0 14px 14px" }}>
          <button onClick={onClose} style={btn(false)}>Cancel</button>
          <button onClick={handleSave} disabled={saving || payAmt <= 0}
            style={{ ...btn(true), opacity: (saving || payAmt <= 0) ? 0.5 : 1 }}>
            {saving ? "Saving..." : payAmt > 0 ? `Receive ${fmt(payAmt)}` : "Receive Payment"}
          </button>
        </div>
      </div>
    </div>
  )
}
