import { useEffect, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Search, ChevronDown } from "lucide-react"
import toast from "react-hot-toast"
import PaymentDetailModal from "../../components/transactions/PaymentDetailModal"
import InvoicePurchaseDetailModal from "../../components/transactions/InvoicePurchaseDetailModal"

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

// Maps a raw `payments_out` row to the event shape PaymentDetailModal expects
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

export default function PaymentOut() {
  const { storeId } = useStoreId()
  const navigate = useNavigate()
  const [view,        setView]        = useState("list")
  const [rows,        setRows]        = useState([])   // merged: real payments + paid-with-bill
  const [suppliers,   setSuppliers]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState("")
  const [typeFilter,  setTypeFilter]  = useState("all") // all | payment | bill
  const [selected,    setSelected]    = useState(null)  // a row from `rows`

  // Form state
  const [suppOpen,    setSuppOpen]    = useState(false)
  const [suppSearch,  setSuppSearch]  = useState("")
  const [selSupplier, setSelSupplier] = useState(null)
  const [amount,      setAmount]      = useState("")
  const [method,      setMethod]      = useState("cash")
  const [payDate,     setPayDate]     = useState(new Date().toISOString().split("T")[0])
  const [reference,   setReference]   = useState("")
  const [notes,       setNotes]       = useState("")
  const [saving,      setSaving]      = useState(false)
  const suppRef = useRef(null)

  useEffect(() => { if (storeId) loadAll() }, [storeId])

  useEffect(() => {
    function onClick(e) {
      if (suppRef.current && !suppRef.current.contains(e.target)) setSuppOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [{ data: pays }, { data: supps }] = await Promise.all([
        supabase.from("payments_out")
          .select("*, suppliers(name, phone)")
          .eq("store_id", storeId)
          .order("payment_date", { ascending: false })
          .limit(1000),
        supabase.from("suppliers")
          .select("id, name, phone, balance")
          .eq("store_id", storeId)
          .order("name"),
      ])

      // Purchases that were (partly) paid at the time the bill was entered
      const bills = []
      let page = 0
      while (true) {
        const { data } = await supabase.from("purchases")
          .select("id, bill_number, purchase_date, paid_amount, supplier_id, created_at, suppliers(name, phone)")
          .eq("store_id", storeId)
          .gt("paid_amount", 0)
          .order("purchase_date", { ascending: false })
          .range(page * 1000, (page + 1) * 1000 - 1)
        bills.push(...(data || []))
        if ((data || []).length < 1000) break
        page++
      }

      // Anything later paid through a separate Payment Out is already listed as its own
      // row, so take it off the bill's "paid with bill" amount to avoid counting it twice.
      const allocByPurchase = {}
      const ids = bills.map(b => b.id)
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from("payment_out_allocations")
          .select("purchase_id, amount").in("purchase_id", ids.slice(i, i + 100))
        for (const a of (data || [])) {
          allocByPurchase[a.purchase_id] = (allocByPurchase[a.purchase_id] || 0) + a.amount
        }
      }

      const merged = []
      for (const p of (pays || [])) {
        merged.push({
          kind: "payment", id: p.id, raw: p,
          number: shortDocNumber(p.receipt_number, p.payment_date),
          rawNumber: p.receipt_number || "",
          date: p.payment_date,
          sortKey: p.payment_date + (p.created_at || ""),
          supplierId: p.supplier_id,
          supplierName: p.suppliers?.name, supplierPhone: p.suppliers?.phone,
          amount: p.amount,
          mode: p.payment_method?.replace("_", " ") || "",
          reference: p.reference || "", notes: p.notes || "",
        })
      }
      for (const b of bills) {
        const amt = Math.round(((b.paid_amount || 0) - (allocByPurchase[b.id] || 0)) * 100) / 100
        if (amt <= 0) continue
        merged.push({
          kind: "bill", id: b.id, raw: b,
          number: shortDocNumber(b.bill_number, b.purchase_date),
          rawNumber: b.bill_number || "",
          date: b.purchase_date,
          sortKey: b.purchase_date + (b.created_at || ""),
          supplierId: b.supplier_id,
          supplierName: b.suppliers?.name, supplierPhone: b.suppliers?.phone,
          amount: amt,
          mode: "", reference: "", notes: "Paid at purchase",
        })
      }
      merged.sort((a, b) => b.sortKey.localeCompare(a.sortKey))

      setRows(merged)
      setSuppliers(supps || [])
    } catch (e) {
      toast.error(e?.message || "Failed to load payments")
    } finally {
      setLoading(false)
    }
  }

  function pickSupplier(s) {
    setSelSupplier(s)
    setSuppOpen(false)
    setSuppSearch("")
    setAmount("")
  }

  const payAmt = parseFloat(amount) || 0
  const currentBalance = selSupplier?.balance || 0

  async function handleSave() {
    if (!selSupplier) return toast.error("Select a supplier")
    if (payAmt <= 0)   return toast.error("Enter a valid amount")
    setSaving(true)
    try {
      await apiClient.post("/api/payments-out/", {
        supplier_id: selSupplier.id,
        payment_date: payDate,
        amount: payAmt,
        payment_method: method,
        reference: reference || null,
        notes: notes || null,
      })
      toast.success(`Payment of ${fmt(payAmt)} recorded`)
      setSelSupplier(null); setAmount(""); setReference(""); setNotes("")
      setView("list")
      loadAll()
    } catch(e) {
      toast.error(e.response?.data?.detail || e.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredSupps = suppliers.filter(s =>
    (s.name.toLowerCase().includes(suppSearch.toLowerCase()) || (s.phone||"").includes(suppSearch)) && s.balance > 0
  )

  const shown = rows.filter(r => {
    if (typeFilter === "payment" && r.kind !== "payment") return false
    if (typeFilter === "bill" && r.kind !== "bill") return false
    if (!search) return true
    const q = search.toLowerCase()
    return (r.supplierName || "").toLowerCase().includes(q) ||
      r.rawNumber.toLowerCase().includes(q) ||
      r.number.toLowerCase().includes(q)
  })
  const totalPaid = shown.reduce((s, r) => s + r.amount, 0)

  // ── New payment ──
  if (view === "new") {
    return (
      <div style={{ padding: 24, maxWidth: 640 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button onClick={() => setView("list")} style={{ ...btn(false), padding:"6px 12px" }}>← Back</button>
          <h1 style={{ fontSize:15, fontWeight:700, color:DARK }}>Make Payment</h1>
        </div>

        <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:10 }}>

          {/* Section 1 — supplier */}
          <div style={{ padding:"18px 20px", borderBottom:`1px solid #f3f4f6` }}>
            <div style={{ maxWidth:320, position:"relative" }} ref={suppRef}>
              <span style={lbl}>Supplier</span>
              <button onClick={() => setSuppOpen(!suppOpen)}
                style={{ ...inp, display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", textAlign:"left" }}>
                <span style={{ color: selSupplier ? DARK : MUTED, fontWeight: selSupplier ? 600 : 400 }}>
                  {selSupplier ? selSupplier.name : "Search for supplier with payable"}
                </span>
                <ChevronDown size={14} color={MUTED}/>
              </button>
              {suppOpen && (
                <div style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:4, background:"#fff",
                  border:`1px solid ${BORDER}`, borderRadius:10, boxShadow:"0 8px 20px rgba(0,0,0,0.08)", zIndex:30, overflow:"hidden" }}>
                  <div style={{ padding:8, borderBottom:`1px solid #f3f4f6` }}>
                    <input autoFocus value={suppSearch} onChange={e => setSuppSearch(e.target.value)}
                      placeholder="Type name or phone..." style={{ ...inp, padding:"6px 10px", fontSize:12 }}/>
                  </div>
                  <div style={{ maxHeight:210, overflowY:"auto" }}>
                    {filteredSupps.length === 0 ? (
                      <p style={{ padding:14, fontSize:12, color:MUTED, textAlign:"center" }}>No suppliers with outstanding payable</p>
                    ) : filteredSupps.map(s => (
                      <button key={s.id} onClick={() => pickSupplier(s)}
                        style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
                          padding:"9px 12px", background:"none", border:"none", borderBottom:"1px solid #f9fafb",
                          cursor:"pointer", textAlign:"left" }}
                        onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <div>
                          <p style={{ fontSize:13, fontWeight:600, color:DARK }}>{s.name}</p>
                          {s.phone && <p style={{ fontSize:11, color:MUTED }}>{s.phone}</p>}
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color:RED }}>{fmt(s.balance)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selSupplier && (
              <div style={{ marginTop:14, padding:"10px 14px", background:LIGHT, border:`1px solid ${BORDER}`, borderRadius:8, maxWidth:260 }}>
                <p style={{ fontSize:11, color:MUTED }}>Current payable</p>
                <p style={{ fontSize:16, fontWeight:700, color: currentBalance > 0 ? RED : DARK }}>{fmt(currentBalance)}</p>
              </div>
            )}
          </div>

          {selSupplier && (
            <>
              {/* Section 2 — payment details */}
              <div style={{ padding:"18px 20px", borderBottom:`1px solid #f3f4f6` }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                  <div>
                    <span style={lbl}>Amount paid (Rs)</span>
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
                      placeholder="Cheque no / txn ID" style={inp}/>
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
                  {saving ? "Saving..." : payAmt > 0 ? `Pay ${fmt(payAmt)}` : "Make Payment"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── List ──
  const selectedSupplierBalance = selected
    ? (suppliers.find(s => s.id === selected.supplierId)?.balance || 0)
    : 0

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <h1 style={{ fontSize:15, fontWeight:700, color:DARK }}>
          Payment Out <span style={{ fontSize:13, fontWeight:400, color:MUTED }}>({shown.length})</span>
        </h1>
        <button onClick={() => setView("new")} style={btn(true)}>
          <Plus size={14}/> Create Payment Out
        </button>
      </div>

      {/* Summary + search row */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <div style={{ position:"relative", width:280 }}>
          <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:MUTED }}/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier, receipt or bill no..." style={{ ...inp, paddingLeft:32 }}/>
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ ...inp, width:170, cursor:"pointer" }}>
          <option value="all">All payments</option>
          <option value="payment">Payments only</option>
          <option value="bill">Paid with bill</option>
        </select>
        <div style={{ marginLeft:"auto", fontSize:12, color:GRAY }}>
          Total paid: <strong style={{ color:DARK }}>{fmt(totalPaid)}</strong>
        </div>
      </div>

      <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:10, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${BORDER}`, background:LIGHT }}>
              {["Receipt / Bill No","Date","Supplier","Amount","Mode","Reference","Notes"].map(h => (
                <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontSize:10.5, fontWeight:700, color:MUTED, textTransform:"uppercase", letterSpacing:"0.04em", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign:"center", padding:40 }}>
                <div style={{ width:20, height:20, border:`2px solid ${BLUE}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto" }}/>
              </td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign:"center", padding:50 }}>
                <p style={{ fontSize:13, color:MUTED, marginBottom:10 }}>
                  {rows.length === 0 ? "No payments recorded yet" : "No payments match your filters"}
                </p>
                {rows.length === 0 && (
                  <button onClick={() => setView("new")} style={btn(true)}><Plus size={13}/> Create first payment out</button>
                )}
              </td></tr>
            ) : shown.map(r => (
              <tr key={r.kind + r.id} style={{ borderBottom:"1px solid #f3f4f6", cursor:"pointer" }}
                onClick={() => setSelected(r)}
                onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                <td style={{ padding:"11px 16px", whiteSpace:"nowrap" }}>
                  <p style={{ fontSize:13, fontWeight:600, color:DARK }}>{r.number || "—"}</p>
                  {r.kind === "bill" && <p style={{ fontSize:11, color:MUTED }}>Paid with bill</p>}
                </td>
                <td style={{ padding:"11px 16px" }}>
                  <p style={{ fontSize:13, color:"#374151" }}>{formatAD(r.date)}</p>
                  <p style={{ fontSize:11, color:MUTED }}>{formatBS(r.date)}</p>
                </td>
                <td style={{ padding:"11px 16px" }}>
                  <p style={{ fontSize:13, fontWeight:600, color:DARK }}>{r.supplierName || "Direct purchase"}</p>
                  {r.supplierPhone && <p style={{ fontSize:11, color:MUTED }}>{r.supplierPhone}</p>}
                </td>
                <td style={{ padding:"11px 16px", fontSize:13, fontWeight:700, color:DARK }}>{fmt(r.amount)}</td>
                <td style={{ padding:"11px 16px" }}>
                  {r.mode ? (
                    <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:LIGHT, border:`1px solid ${BORDER}`, color:GRAY, textTransform:"capitalize" }}>
                      {r.mode}
                    </span>
                  ) : <span style={{ fontSize:12, color:MUTED }}>—</span>}
                </td>
                <td style={{ padding:"11px 16px", fontSize:12, color:GRAY }}>{r.reference || "—"}</td>
                <td style={{ padding:"11px 16px", fontSize:12, color:GRAY }}>{r.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && selected.kind === "payment" && (
        <PaymentDetailModal
          kind="payment_out"
          event={toEvent(selected.raw)}
          partyLabel={selected.supplierName || "—"}
          onClose={() => setSelected(null)}
          onDeleted={() => { setSelected(null); loadAll() }}
        />
      )}
      {selected && selected.kind === "bill" && (
        <InvoicePurchaseDetailModal
          kind="purchase"
          id={selected.id}
          partyLabel={selected.supplierName || "Direct purchase"}
          partyBalance={selectedSupplierBalance}
          onClose={() => setSelected(null)}
          onDeleted={() => { setSelected(null); loadAll() }}
          onEdit={() => navigate("/purchase/create", { state: { editId: selected.id, supplierId: selected.supplierId } })}
        />
      )}
    </div>
  )
}
