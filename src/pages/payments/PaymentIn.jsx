import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Search, X, ChevronDown } from "lucide-react"
import toast from "react-hot-toast"
import PaymentDetailModal from "../../components/transactions/PaymentDetailModal"

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

// Maps a raw `payments` row to the event shape PaymentDetailModal expects
function toEvent(p) {
  return {
    id: p.id,
    receiptNumber: p.receipt_number || null,
    date: formatAD(p.payment_date),
    rawDate: p.payment_date,
    total: p.amount,
    paymentMethod: p.payment_method,
    reference: p.reference,
    notes: p.notes,
    createdByName: p.created_by_name || null,
  }
}

export default function PaymentIn() {
  const { storeId } = useStoreId()
  const [view,        setView]        = useState("list")
  const [payments,    setPayments]    = useState([])
  const [customers,   setCustomers]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState("")
  const [selected,    setSelected]    = useState(null)

  // Form state
  const [custOpen,    setCustOpen]    = useState(false)
  const [custSearch,  setCustSearch]  = useState("")
  const [selCustomer, setSelCustomer] = useState(null)
  const [amount,      setAmount]      = useState("")
  const [method,      setMethod]      = useState("cash")
  const [payDate,     setPayDate]     = useState(new Date().toISOString().split("T")[0])
  const [reference,   setReference]   = useState("")
  const [notes,       setNotes]       = useState("")
  const [saving,      setSaving]      = useState(false)
  const custRef = useRef(null)

  useEffect(() => { if (storeId) loadAll() }, [storeId])

  useEffect(() => {
    function onClick(e) {
      if (custRef.current && !custRef.current.contains(e.target)) setCustOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: pays }, { data: custs }] = await Promise.all([
      supabase.from("payments")
        .select("*, customers(name, phone)")
        .eq("store_id", storeId)
        .order("payment_date", { ascending: false })
        .limit(500),
      supabase.from("customers")
        .select("id, name, phone, balance")
        .eq("store_id", storeId)
        .order("name"),
    ])
    setPayments(pays || [])
    setCustomers(custs || [])
    setLoading(false)
  }

  function pickCustomer(c) {
    setSelCustomer(c)
    setCustOpen(false)
    setCustSearch("")
    setAmount("")
  }

  const payAmt = parseFloat(amount) || 0
  const currentBalance = selCustomer?.balance || 0

  async function handleSave() {
    if (!selCustomer) return toast.error("Select a customer")
    if (payAmt <= 0)  return toast.error("Enter a valid amount")
    setSaving(true)
    try {
      await apiClient.post("/api/payments/", {
        customer_id: selCustomer.id,
        payment_date: payDate,
        amount: payAmt,
        payment_method: method,
        reference: reference || null,
        notes: notes || null,
      })
      toast.success(`Payment of ${fmt(payAmt)} recorded`)
      setSelCustomer(null); setAmount(""); setReference(""); setNotes("")
      setView("list")
      loadAll()
    } catch(e) {
      toast.error(e.response?.data?.detail || e.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredCusts = customers.filter(c =>
    (c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone||"").includes(custSearch)) && c.balance > 0
  )
  const filteredPays = payments.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.customers?.name?.toLowerCase().includes(q) ||
      (p.receipt_number || "").toLowerCase().includes(q) ||
      shortDocNumber(p.receipt_number, p.payment_date).toLowerCase().includes(q)
  })
  const totalReceived = filteredPays.reduce((s, p) => s + p.amount, 0)

  // ── New payment ──
  if (view === "new") {
    return (
      <div style={{ padding: 24, maxWidth: 640 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button onClick={() => setView("list")} style={{ ...btn(false), padding:"6px 12px" }}>← Back</button>
          <h1 style={{ fontSize:15, fontWeight:700, color:DARK }}>Receive Payment</h1>
        </div>

        <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:10 }}>

          {/* Section 1 — customer */}
          <div style={{ padding:"18px 20px", borderBottom:`1px solid #f3f4f6` }}>
            <div style={{ maxWidth:320, position:"relative" }} ref={custRef}>
              <span style={lbl}>Customer</span>
              <button onClick={() => setCustOpen(!custOpen)}
                style={{ ...inp, display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", textAlign:"left" }}>
                <span style={{ color: selCustomer ? DARK : MUTED, fontWeight: selCustomer ? 600 : 400 }}>
                  {selCustomer ? selCustomer.name : "Search for customer with dues"}
                </span>
                <ChevronDown size={14} color={MUTED}/>
              </button>
              {custOpen && (
                <div style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:4, background:"#fff",
                  border:`1px solid ${BORDER}`, borderRadius:10, boxShadow:"0 8px 20px rgba(0,0,0,0.08)", zIndex:30, overflow:"hidden" }}>
                  <div style={{ padding:8, borderBottom:`1px solid #f3f4f6` }}>
                    <input autoFocus value={custSearch} onChange={e => setCustSearch(e.target.value)}
                      placeholder="Type name or phone..." style={{ ...inp, padding:"6px 10px", fontSize:12 }}/>
                  </div>
                  <div style={{ maxHeight:210, overflowY:"auto" }}>
                    {filteredCusts.length === 0 ? (
                      <p style={{ padding:14, fontSize:12, color:MUTED, textAlign:"center" }}>No customers with outstanding dues</p>
                    ) : filteredCusts.map(c => (
                      <button key={c.id} onClick={() => pickCustomer(c)}
                        style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
                          padding:"9px 12px", background:"none", border:"none", borderBottom:"1px solid #f9fafb",
                          cursor:"pointer", textAlign:"left" }}
                        onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <div>
                          <p style={{ fontSize:13, fontWeight:600, color:DARK }}>{c.name}</p>
                          {c.phone && <p style={{ fontSize:11, color:MUTED }}>{c.phone}</p>}
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color:RED }}>{fmt(c.balance)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selCustomer && (
              <div style={{ marginTop:14, padding:"10px 14px", background:LIGHT, border:`1px solid ${BORDER}`, borderRadius:8, maxWidth:260 }}>
                <p style={{ fontSize:11, color:MUTED }}>Current balance</p>
                <p style={{ fontSize:16, fontWeight:700, color: currentBalance > 0 ? RED : DARK }}>{fmt(currentBalance)}</p>
              </div>
            )}
          </div>

          {selCustomer && (
            <>
              {/* Section 2 — payment details */}
              <div style={{ padding:"18px 20px", borderBottom:`1px solid #f3f4f6` }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
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
                    <span style={lbl}>Payment date</span>
                    <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={inp}/>
                    <p style={{ fontSize:11, color:MUTED, marginTop:5 }}>{formatBS(payDate)}</p>
                  </div>
                  <div>
                    <span style={lbl}>Payment mode</span>
                    <select value={method} onChange={e => setMethod(e.target.value)} style={{ ...inp, cursor:"pointer", textTransform:"capitalize" }}>
                      {["cash","esewa","khalti","bank_transfer","card","cheque"].map(x => (
                        <option key={x} value={x}>{x.replace("_"," ")}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:12 }}>
                  <div>
                    <span style={lbl}>Reference (optional)</span>
                    <input value={reference} onChange={e => setReference(e.target.value)}
                      placeholder="Receipt no / eSewa ID" style={inp}/>
                  </div>
                  <div>
                    <span style={lbl}>Notes (optional)</span>
                    <input value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Any remark" style={inp}/>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display:"flex", justifyContent:"flex-end", gap:10, padding:"14px 20px", background:LIGHT, borderRadius:"0 0 10px 10px" }}>
                <button onClick={() => setView("list")} style={btn(false)}>Cancel</button>
                <button onClick={handleSave} disabled={saving || payAmt <= 0}
                  style={{ ...btn(true), opacity: (saving || payAmt <= 0) ? 0.5 : 1 }}>
                  {saving ? "Saving..." : payAmt > 0 ? `Receive ${fmt(payAmt)}` : "Receive Payment"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── List ──
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <h1 style={{ fontSize:15, fontWeight:700, color:DARK }}>
          Payment In <span style={{ fontSize:13, fontWeight:400, color:MUTED }}>({filteredPays.length})</span>
        </h1>
        <button onClick={() => setView("new")} style={btn(true)}>
          <Plus size={14}/> Receive Payment
        </button>
      </div>

      {/* Summary + search row */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <div style={{ position:"relative", width:260 }}>
          <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:MUTED }}/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search customer or receipt no..." style={{ ...inp, paddingLeft:32 }}/>
        </div>
        <div style={{ marginLeft:"auto", fontSize:12, color:GRAY }}>
          Total received: <strong style={{ color:DARK }}>{fmt(totalReceived)}</strong>
        </div>
      </div>

      <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:10, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${BORDER}`, background:LIGHT }}>
              {["Receipt No","Date","Customer","Amount","Mode","Reference","Notes"].map(h => (
                <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontSize:10.5, fontWeight:700, color:MUTED, textTransform:"uppercase", letterSpacing:"0.04em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign:"center", padding:40 }}>
                <div style={{ width:20, height:20, border:`2px solid ${BLUE}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto" }}/>
              </td></tr>
            ) : filteredPays.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign:"center", padding:50 }}>
                <p style={{ fontSize:13, color:MUTED, marginBottom:10 }}>No payments recorded yet</p>
                <button onClick={() => setView("new")} style={btn(true)}><Plus size={13}/> Receive first payment</button>
              </td></tr>
            ) : filteredPays.map(p => (
              <tr key={p.id} style={{ borderBottom:"1px solid #f3f4f6", cursor:"pointer" }}
                onClick={() => setSelected(p)}
                onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                <td style={{ padding:"11px 16px", fontSize:13, fontWeight:600, color:DARK, whiteSpace:"nowrap" }}>
                  {shortDocNumber(p.receipt_number, p.payment_date) || "—"}
                </td>
                <td style={{ padding:"11px 16px" }}>
                  <p style={{ fontSize:13, color:"#374151" }}>{formatAD(p.payment_date)}</p>
                  <p style={{ fontSize:11, color:MUTED }}>{formatBS(p.payment_date)}</p>
                </td>
                <td style={{ padding:"11px 16px" }}>
                  <p style={{ fontSize:13, fontWeight:600, color:DARK }}>{p.customers?.name || "—"}</p>
                  {p.customers?.phone && <p style={{ fontSize:11, color:MUTED }}>{p.customers.phone}</p>}
                </td>
                <td style={{ padding:"11px 16px", fontSize:13, fontWeight:700, color:DARK }}>{fmt(p.amount)}</td>
                <td style={{ padding:"11px 16px" }}>
                  <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:LIGHT, border:`1px solid ${BORDER}`, color:GRAY, textTransform:"capitalize" }}>
                    {p.payment_method?.replace("_"," ")}
                  </span>
                </td>
                <td style={{ padding:"11px 16px", fontSize:12, color:GRAY }}>{p.reference || "—"}</td>
                <td style={{ padding:"11px 16px", fontSize:12, color:GRAY }}>{p.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <PaymentDetailModal
          kind="payment"
          event={toEvent(selected)}
          partyLabel={selected.customers?.name || "—"}
          onClose={() => setSelected(null)}
          onDeleted={() => { setSelected(null); loadAll() }}
        />
      )}
    </div>
  )
}
