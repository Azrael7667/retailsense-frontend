import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { Plus, Search, X, ChevronDown, CheckCircle } from "lucide-react"
import toast from "react-hot-toast"

const BLUE="#2563eb", DARK="#111827", GRAY="#6b7280", MUTED="#9ca3af",
      BORDER="#e5e7eb", LIGHT="#f9fafb", GREEN="#16a34a", RED="#dc2626", AMBER="#d97706"

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

const inp = { width:"100%", padding:"8px 12px", fontSize:13, border:`1px solid ${BORDER}`,
              borderRadius:8, outline:"none", color:DARK, background:"#fff", boxSizing:"border-box" }
const lbl = { fontSize:11, fontWeight:600, color:GRAY, marginBottom:5, display:"block" }
const btn = (primary) => ({ display:"inline-flex", alignItems:"center", gap:5, padding:"8px 14px",
  fontSize:13, fontWeight:600, borderRadius:8, cursor:"pointer",
  background: primary?BLUE:"#fff", color: primary?"#fff":GRAY,
  border: primary?"none":`1px solid ${BORDER}` })

export default function PaymentIn() {
  const { storeId } = useStoreId()
  const [view,        setView]        = useState("list")
  const [payments,    setPayments]    = useState([])
  const [customers,   setCustomers]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState("")

  // Form state
  const [custOpen,    setCustOpen]    = useState(false)
  const [custSearch,  setCustSearch]  = useState("")
  const [selCustomer, setSelCustomer] = useState(null)
  const [unpaidInvs,  setUnpaidInvs]  = useState([])
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

  async function pickCustomer(c) {
    setSelCustomer(c)
    setCustOpen(false)
    setCustSearch("")
    setAmount("")
    const { data } = await supabase.from("invoices")
      .select("id, invoice_number, invoice_date, total, paid_amount, status")
      .eq("store_id", storeId)
      .eq("customer_id", c.id)
      .neq("status", "paid")
      .order("invoice_date", { ascending: true })
    setUnpaidInvs(data || [])
  }

  const totalDue = unpaidInvs.reduce((s, i) => s + (i.total - i.paid_amount), 0)
  const payAmt   = parseFloat(amount) || 0

  function allocationPreview() {
    let remaining = payAmt
    return unpaidInvs.map(inv => {
      const due     = inv.total - inv.paid_amount
      const applied = Math.min(due, Math.max(0, remaining))
      remaining    -= applied
      return { ...inv, due, applied, willBe: applied >= due ? "paid" : applied > 0 ? "partial" : inv.status }
    })
  }

  async function handleSave() {
    if (!selCustomer)      return toast.error("Select a customer")
    if (payAmt <= 0)       return toast.error("Enter a valid amount")
    if (payAmt > totalDue) return toast.error(`Amount exceeds total due (${fmt(totalDue)})`)
    setSaving(true)
    try {
      const { data: pay, error: payErr } = await supabase.from("payments").insert({
        store_id: storeId, customer_id: selCustomer.id,
        payment_date: payDate, amount: payAmt,
        payment_method: method, reference: reference || null, notes: notes || null,
      }).select().single()
      if (payErr) throw payErr

      let remaining = payAmt
      const allocations = []
      for (const inv of unpaidInvs) {
        if (remaining <= 0) break
        const due     = inv.total - inv.paid_amount
        const applied = Math.min(due, remaining)
        remaining    -= applied
        allocations.push({ payment_id: pay.id, invoice_id: inv.id, amount: applied })
        const newPaid = inv.paid_amount + applied
        await supabase.from("invoices").update({
          paid_amount: newPaid,
          status: newPaid >= inv.total ? "paid" : "partial",
        }).eq("id", inv.id)
      }
      if (allocations.length) await supabase.from("payment_allocations").insert(allocations)

      const { data: stillUnpaid } = await supabase.from("invoices")
        .select("total, paid_amount")
        .eq("customer_id", selCustomer.id)
        .neq("status", "paid")
      const newBalance = (stillUnpaid || []).reduce((s, i) => s + (i.total - i.paid_amount), 0)
      await supabase.from("customers").update({ balance: newBalance }).eq("id", selCustomer.id)

      toast.success(`Payment of ${fmt(payAmt)} recorded`)
      setSelCustomer(null); setUnpaidInvs([]); setAmount(""); setReference(""); setNotes("")
      setView("list")
      loadAll()
    } catch(e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredCusts = customers.filter(c =>
    (c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone||"").includes(custSearch)) && c.balance > 0
  )
  const filteredPays = payments.filter(p =>
    !search || p.customers?.name?.toLowerCase().includes(search.toLowerCase())
  )
  const totalReceived = filteredPays.reduce((s, p) => s + p.amount, 0)

  // ── New payment ──
  if (view === "new") {
    const preview = allocationPreview()
    return (
      <div style={{ padding: 24, maxWidth: 720 }}>
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
              <div style={{ display:"flex", gap:10, marginTop:14 }}>
                <div style={{ flex:1, padding:"10px 14px", background:LIGHT, border:`1px solid ${BORDER}`, borderRadius:8 }}>
                  <p style={{ fontSize:11, color:MUTED }}>Total outstanding</p>
                  <p style={{ fontSize:16, fontWeight:700, color:RED }}>{fmt(totalDue)}</p>
                </div>
                <div style={{ flex:1, padding:"10px 14px", background:LIGHT, border:`1px solid ${BORDER}`, borderRadius:8 }}>
                  <p style={{ fontSize:11, color:MUTED }}>Unpaid invoices</p>
                  <p style={{ fontSize:16, fontWeight:700, color:DARK }}>{unpaidInvs.length}</p>
                </div>
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
                    <button onClick={() => setAmount(String(totalDue))}
                      style={{ fontSize:11, color:BLUE, background:"none", border:"none", cursor:"pointer", padding:0, marginTop:5 }}>
                      Full amount: {fmt(totalDue)}
                    </button>
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

              {/* Section 3 — allocation preview */}
              {payAmt > 0 && (
                <div style={{ padding:"18px 20px", borderBottom:`1px solid #f3f4f6` }}>
                  <span style={lbl}>This payment will settle (oldest invoice first)</span>
                  <div style={{ border:`1px solid ${BORDER}`, borderRadius:8, overflow:"hidden", marginTop:4 }}>
                    {preview.map(inv => (
                      <div key={inv.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        padding:"9px 14px", borderBottom:"1px solid #f3f4f6",
                        background: inv.applied > 0 ? "#f0fdf4" : "#fff" }}>
                        <div>
                          <p style={{ fontSize:12.5, fontWeight:600, color:DARK }}>{inv.invoice_number}</p>
                          <p style={{ fontSize:11, color:MUTED }}>{formatAD(inv.invoice_date)} — due {fmt(inv.due)}</p>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          {inv.applied > 0 ? (
                            <>
                              <p style={{ fontSize:12.5, fontWeight:700, color:GREEN }}>{fmt(inv.applied)}</p>
                              <p style={{ fontSize:11, fontWeight:600, color: inv.willBe === "paid" ? GREEN : AMBER }}>
                                {inv.willBe === "paid" ? "PAID" : "PARTIAL"}
                              </p>
                            </>
                          ) : (
                            <p style={{ fontSize:12, color:MUTED }}>—</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
            placeholder="Search by customer..." style={{ ...inp, paddingLeft:32 }}/>
        </div>
        <div style={{ marginLeft:"auto", fontSize:12, color:GRAY }}>
          Total received: <strong style={{ color:DARK }}>{fmt(totalReceived)}</strong>
        </div>
      </div>

      <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:10, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${BORDER}`, background:LIGHT }}>
              {["Date","Customer","Amount","Mode","Reference","Notes"].map(h => (
                <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontSize:10.5, fontWeight:700, color:MUTED, textTransform:"uppercase", letterSpacing:"0.04em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign:"center", padding:40 }}>
                <div style={{ width:20, height:20, border:`2px solid ${BLUE}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto" }}/>
              </td></tr>
            ) : filteredPays.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign:"center", padding:50 }}>
                <p style={{ fontSize:13, color:MUTED, marginBottom:10 }}>No payments recorded yet</p>
                <button onClick={() => setView("new")} style={btn(true)}><Plus size={13}/> Receive first payment</button>
              </td></tr>
            ) : filteredPays.map(p => (
              <tr key={p.id} style={{ borderBottom:"1px solid #f3f4f6" }}
                onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
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
    </div>
  )
}
