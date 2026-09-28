import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Search, ChevronDown, X, Trash2 } from "lucide-react"
import toast from "react-hot-toast"

const BLUE="#2563eb", DARK="#111827", GRAY="#6b7280", MUTED="#9ca3af",
      BORDER="#e5e7eb", LIGHT="#f9fafb", RED="#dc2626"

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
const r2  = (n) => Math.round((Number(n)||0) * 100) / 100

const inp = { width:"100%", padding:"8px 12px", fontSize:13, border:`1px solid ${BORDER}`,
              borderRadius:8, outline:"none", color:DARK, background:"#fff", boxSizing:"border-box" }
const lbl = { fontSize:11, fontWeight:600, color:GRAY, marginBottom:5, display:"block" }
const btn = (primary) => ({ display:"inline-flex", alignItems:"center", gap:5, padding:"8px 14px",
  fontSize:13, fontWeight:600, borderRadius:8, cursor:"pointer",
  background: primary?BLUE:"#fff", color: primary?"#fff":GRAY,
  border: primary?"none":`1px solid ${BORDER}` })

const DIRECT = { id: null, name: "Direct purchase / no supplier" }

const billNoOf = (r) => shortDocNumber(r.purchases?.bill_number, r.purchases?.purchase_date)

// ───────────────────────── Detail modal ─────────────────────────
function ReturnDetailModal({ ret, onClose, onDeleted }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiClient.get(`/api/purchase-returns/${ret.id}`)
      .then(res => { if (!cancelled) setItems(res.data?.items || []) })
      .catch(e => { if (!cancelled) toast.error(e?.response?.data?.detail || "Failed to load return") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ret.id])

  async function handleDelete() {
    if (!confirm("Delete this return? The goods are added back to your stock and the supplier's payable is restored.")) return
    setDeleting(true)
    try {
      await apiClient.delete(`/api/purchase-returns/${ret.id}`)
      toast.success("Purchase return deleted")
      onDeleted?.()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to delete return")
    } finally {
      setDeleting(false)
    }
  }

  const box = { padding:"10px 14px", borderRadius:10, border:`1px solid ${BORDER}`, background:"#fff", fontSize:14, color:DARK }
  const cap = { fontSize:12, fontWeight:600, color:GRAY, marginBottom:6 }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:60, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.35)" }}/>
      <div style={{ position:"relative", background:"#fff", borderRadius:14, width:"100%", maxWidth:640, maxHeight:"90vh",
        overflowY:"auto", border:`1px solid ${BORDER}`, boxShadow:"0 24px 48px rgba(0,0,0,0.18)" }}>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", borderBottom:`1px solid ${BORDER}` }}>
          <h2 style={{ fontSize:18, fontWeight:700, color:DARK }}>Purchase Return</h2>
          <button onClick={onClose} style={{ padding:6, borderRadius:8, border:"none", background:"none", cursor:"pointer", color:MUTED }}>
            <X size={20}/>
          </button>
        </div>

        <div style={{ padding:24, display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div><p style={cap}>Return Number</p><div style={box}>{shortDocNumber(ret.return_number, ret.return_date) || "—"}</div></div>
            <div><p style={cap}>Date</p><div style={box}>{formatAD(ret.return_date)}</div></div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div><p style={cap}>Supplier</p><div style={box}>{ret.suppliers?.name || "Direct purchase"}</div></div>
            <div><p style={cap}>Against Bill</p><div style={box}>{billNoOf(ret) || "—"}</div></div>
          </div>

          <div>
            <p style={cap}>Returned Items</p>
            <div style={{ border:`1px solid ${BORDER}`, borderRadius:10, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:LIGHT }}>
                    {["Item","Qty","Net Rate","Amount"].map((h, i) => (
                      <th key={h} style={{ padding:"9px 12px", textAlign: i===0?"left":"right", fontSize:10.5, fontWeight:700, color:MUTED, textTransform:"uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} style={{ padding:24, textAlign:"center", color:MUTED }}>Loading…</td></tr>
                  ) : items.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding:24, textAlign:"center", color:MUTED }}>No items</td></tr>
                  ) : items.map(it => (
                    <tr key={it.id} style={{ borderTop:`1px solid ${BORDER}` }}>
                      <td style={{ padding:"10px 12px", fontWeight:500, color:DARK }}>{it.product_name}</td>
                      <td style={{ padding:"10px 12px", textAlign:"right" }}>{it.quantity_returned}</td>
                      <td style={{ padding:"10px 12px", textAlign:"right" }}>{fmt(it.unit_price)}</td>
                      <td style={{ padding:"10px 12px", textAlign:"right", fontWeight:600 }}>{fmt(it.line_return_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginLeft:"auto", width:300, fontSize:13 }}>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0" }}>
              <span style={{ color:GRAY }}>Total Returned</span><strong style={{ color:DARK }}>{fmt(ret.total_return_amount)}</strong>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0" }}>
              <span style={{ color:GRAY }}>Reduced from payable</span><span>{fmt(ret.credit_applied_amount)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0" }}>
              <span style={{ color:GRAY }}>Cash refunded to you</span><span>{fmt(ret.cash_refunded_amount)}</span>
            </div>
          </div>

          <div>
            <p style={cap}>Reason</p>
            <div style={{ ...box, minHeight:48, background:LIGHT, color: ret.reason ? "#374151" : MUTED }}>
              {ret.reason || "No reason given"}
            </div>
          </div>
          <p style={{ fontSize:12.5, color:MUTED }}>Created by: {ret.created_by_name || "—"}</p>
        </div>

        <div style={{ display:"flex", alignItems:"center", padding:"16px 24px", borderTop:`1px solid ${BORDER}`, background:LIGHT, borderRadius:"0 0 14px 14px" }}>
          <button onClick={handleDelete} disabled={deleting}
            style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 16px", borderRadius:9, border:"1px solid #fecaca",
              background:"#fff", color:RED, cursor: deleting?"wait":"pointer", fontSize:13, fontWeight:600, opacity: deleting?0.6:1 }}>
            <Trash2 size={15}/> Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── Page ─────────────────────────
export default function PurchaseReturn() {
  const { storeId } = useStoreId()
  const [view,      setView]      = useState("list")
  const [returns,   setReturns]   = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState("")
  const [selected,  setSelected]  = useState(null)

  // Create form
  const [suppOpen,   setSuppOpen]   = useState(false)
  const [suppSearch, setSuppSearch] = useState("")
  const [selSupp,    setSelSupp]    = useState(null)
  const [bills,      setBills]      = useState([])
  const [billsLoading, setBillsLoading] = useState(false)
  const [selBillId,  setSelBillId]  = useState("")
  const [supplierBalance, setSupplierBalance] = useState(0)
  const [lines,      setLines]      = useState([])
  const [linesLoading, setLinesLoading] = useState(false)
  const [retDate,    setRetDate]    = useState(new Date().toISOString().split("T")[0])
  const [reason,     setReason]     = useState("")
  const [saving,     setSaving]     = useState(false)
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
      const [{ data: rets }, { data: supps }] = await Promise.all([
        apiClient.get("/api/purchase-returns/"),
        supabase.from("suppliers").select("id, name, phone, balance").eq("store_id", storeId).order("name"),
      ])
      setReturns(rets || [])
      setSuppliers(supps || [])
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load purchase returns")
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setSelSupp(null); setBills([]); setSelBillId(""); setLines([]); setSupplierBalance(0)
    setReason(""); setRetDate(new Date().toISOString().split("T")[0])
  }

  async function pickSupplier(s) {
    setSelSupp(s); setSuppOpen(false); setSuppSearch("")
    setSelBillId(""); setLines([]); setSupplierBalance(0)
    setBillsLoading(true)
    let q = supabase.from("purchases")
      .select("id, bill_number, purchase_date, total, paid_amount")
      .eq("store_id", storeId)
      .order("purchase_date", { ascending: false })
      .limit(200)
    q = s.id ? q.eq("supplier_id", s.id) : q.is("supplier_id", null)
    const { data, error } = await q
    if (error) toast.error(error.message)
    setBills(data || [])
    setBillsLoading(false)
  }

  async function pickBill(id) {
    setSelBillId(id); setLines([]); setSupplierBalance(0)
    if (!id) return
    setLinesLoading(true)
    try {
      const { data } = await apiClient.get(`/api/purchase-returns/returnable/${id}`)
      setSupplierBalance(data.supplier_balance || 0)
      setLines((data.items || []).map(it => ({ ...it, qty: "" })))
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load bill items")
    } finally {
      setLinesLoading(false)
    }
  }

  function updateLine(i, patch) {
    setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  }

  const chosen = lines.filter(l => (parseFloat(l.qty) || 0) > 0)
  const totalReturn = r2(chosen.reduce((s, l) => s + (parseFloat(l.qty) || 0) * l.net_price, 0))
  // Rule: reduce everything owed to this supplier first; only the excess is cash.
  const creditApplied = r2(Math.min(supplierBalance, totalReturn))
  const cashRefunded  = r2(totalReturn - creditApplied)

  async function handleSave() {
    if (!selBillId) return toast.error("Select a bill")
    if (!chosen.length) return toast.error("Enter a return quantity for at least one item")
    for (const l of chosen) {
      if (parseFloat(l.qty) > l.returnable) return toast.error(`Only ${l.returnable} of "${l.product_name}" can be returned`)
    }
    setSaving(true)
    try {
      await apiClient.post("/api/purchase-returns/", {
        purchase_id: selBillId,
        return_date: retDate,
        reason: reason.trim() || null,
        items: chosen.map(l => ({ purchase_item_id: l.id, quantity_returned: parseFloat(l.qty) })),
      })
      toast.success(`Return of ${fmt(totalReturn)} recorded`)
      resetForm()
      setView("list")
      loadAll()
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredSupps = suppliers.filter(s =>
    s.name.toLowerCase().includes(suppSearch.toLowerCase()) || (s.phone || "").includes(suppSearch)
  )

  const filteredRets = returns.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.suppliers?.name?.toLowerCase().includes(q) ||
      (r.return_number || "").toLowerCase().includes(q) ||
      shortDocNumber(r.return_number, r.return_date).toLowerCase().includes(q) ||
      (r.purchases?.bill_number || "").toLowerCase().includes(q) ||
      billNoOf(r).toLowerCase().includes(q)
  })
  const totalReturned = filteredRets.reduce((s, r) => s + (r.total_return_amount || 0), 0)

  // ── Create ──
  if (view === "new") {
    return (
      <div style={{ padding:24, maxWidth:820 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button onClick={() => { resetForm(); setView("list") }} style={{ ...btn(false), padding:"6px 12px" }}>← Back</button>
          <h1 style={{ fontSize:15, fontWeight:700, color:DARK }}>Create Purchase Return</h1>
        </div>

        <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:10 }}>

          <div style={{ padding:"18px 20px", borderBottom:"1px solid #f3f4f6", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
            <div style={{ position:"relative" }} ref={suppRef}>
              <span style={lbl}>Supplier</span>
              <button onClick={() => setSuppOpen(!suppOpen)}
                style={{ ...inp, display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", textAlign:"left" }}>
                <span style={{ color: selSupp ? DARK : MUTED, fontWeight: selSupp ? 600 : 400 }}>
                  {selSupp ? selSupp.name : "Select supplier"}
                </span>
                <ChevronDown size={14} color={MUTED}/>
              </button>
              {suppOpen && (
                <div style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:4, background:"#fff",
                  border:`1px solid ${BORDER}`, borderRadius:10, boxShadow:"0 8px 20px rgba(0,0,0,0.08)", zIndex:30, overflow:"hidden" }}>
                  <div style={{ padding:8, borderBottom:"1px solid #f3f4f6" }}>
                    <input autoFocus value={suppSearch} onChange={e => setSuppSearch(e.target.value)}
                      placeholder="Type name or phone..." style={{ ...inp, padding:"6px 10px", fontSize:12 }}/>
                  </div>
                  <div style={{ maxHeight:220, overflowY:"auto" }}>
                    <button onClick={() => pickSupplier(DIRECT)}
                      style={{ width:"100%", padding:"9px 12px", background:"none", border:"none", borderBottom:"1px solid #f9fafb",
                        cursor:"pointer", textAlign:"left", fontSize:13, fontWeight:600, color:GRAY }}
                      onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      Direct purchase / no supplier
                    </button>
                    {filteredSupps.map(s => (
                      <button key={s.id} onClick={() => pickSupplier(s)}
                        style={{ width:"100%", padding:"9px 12px", background:"none", border:"none", borderBottom:"1px solid #f9fafb",
                          cursor:"pointer", textAlign:"left" }}
                        onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <p style={{ fontSize:13, fontWeight:600, color:DARK }}>{s.name}</p>
                        {s.phone && <p style={{ fontSize:11, color:MUTED }}>{s.phone}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ gridColumn:"span 2" }}>
              <span style={lbl}>Purchase bill</span>
              <select value={selBillId} onChange={e => pickBill(e.target.value)} disabled={!selSupp || billsLoading}
                style={{ ...inp, cursor: selSupp ? "pointer" : "not-allowed", background: selSupp ? "#fff" : LIGHT }}>
                <option value="">
                  {!selSupp ? "Select a supplier first" : billsLoading ? "Loading…" : bills.length ? "Select bill" : "No bills found"}
                </option>
                {bills.map(b => (
                  <option key={b.id} value={b.id}>
                    {shortDocNumber(b.bill_number, b.purchase_date) || "No bill no"} · {formatAD(b.purchase_date)} · {fmt(b.total)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selBillId && (
            <>
              <div style={{ padding:"18px 20px", borderBottom:"1px solid #f3f4f6" }}>
                <div style={{ border:`1px solid ${BORDER}`, borderRadius:10, overflow:"hidden" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead>
                      <tr style={{ background:LIGHT }}>
                        {["Item","Bought","Can return","Net rate","Return qty"].map((h, i) => (
                          <th key={h} style={{ padding:"9px 12px", textAlign: i===0?"left":"right", fontSize:10.5, fontWeight:700, color:MUTED, textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {linesLoading ? (
                        <tr><td colSpan={5} style={{ padding:24, textAlign:"center", color:MUTED }}>Loading items…</td></tr>
                      ) : lines.map((l, i) => (
                        <tr key={l.id} style={{ borderTop:`1px solid ${BORDER}`, opacity: l.returnable <= 0 ? 0.5 : 1 }}>
                          <td style={{ padding:"10px 12px", fontWeight:500, color:DARK }}>{l.product_name}</td>
                          <td style={{ padding:"10px 12px", textAlign:"right" }}>{l.quantity}</td>
                          <td style={{ padding:"10px 12px", textAlign:"right" }}>{l.returnable}</td>
                          <td style={{ padding:"10px 12px", textAlign:"right" }}>{fmt(l.net_price)}</td>
                          <td style={{ padding:"8px 12px", textAlign:"right" }}>
                            <div style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                              <button onClick={() => updateLine(i, { qty: String(l.returnable) })} disabled={l.returnable <= 0}
                                style={{ fontSize:11, color:BLUE, background:"none", border:"none", cursor:"pointer", padding:0 }}>All</button>
                              <input type="number" min="0" max={l.returnable} value={l.qty} className="no-spin"
                                disabled={l.returnable <= 0}
                                onFocus={e => e.target.select()}
                                onChange={e => updateLine(i, { qty: e.target.value })}
                                placeholder="0"
                                style={{ ...inp, width:80, padding:"6px 8px", textAlign:"right" }}/>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize:11, color:MUTED, marginTop:8 }}>Returned goods are taken out of your stock.</p>
              </div>

              <div style={{ padding:"18px 20px", borderBottom:"1px solid #f3f4f6", display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div>
                    <span style={lbl}>Return date</span>
                    <input type="date" value={retDate} onChange={e => setRetDate(e.target.value)} style={inp}/>
                    <p style={{ fontSize:11, color:MUTED, marginTop:5 }}>{formatBS(retDate)}</p>
                  </div>
                  <div>
                    <span style={lbl}>Reason (optional)</span>
                    <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Damaged, wrong part" style={inp}/>
                  </div>
                </div>

                <div style={{ fontSize:13 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0" }}>
                    <span style={{ color:GRAY }}>Total returned</span>
                    <strong style={{ color:DARK, fontSize:16 }}>{fmt(totalReturn)}</strong>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0" }}>
                    <span style={{ color:GRAY }}>Reduces what you owe</span><span>{fmt(creditApplied)}</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0" }}>
                    <span style={{ color:GRAY }}>Cash refunded to you</span><span>{fmt(cashRefunded)}</span>
                  </div>
                  <p style={{ fontSize:11, color:MUTED, marginTop:8, lineHeight:1.5 }}>
                    The return first reduces everything you owe this supplier across all bills ({fmt(supplierBalance)} payable now). Anything beyond that is refunded to you in cash.
                  </p>
                </div>
              </div>

              <div style={{ display:"flex", justifyContent:"flex-end", gap:10, padding:"14px 20px", background:LIGHT, borderRadius:"0 0 10px 10px" }}>
                <button onClick={() => { resetForm(); setView("list") }} style={btn(false)}>Cancel</button>
                <button onClick={handleSave} disabled={saving || totalReturn <= 0}
                  style={{ ...btn(true), opacity: (saving || totalReturn <= 0) ? 0.5 : 1 }}>
                  {saving ? "Saving..." : totalReturn > 0 ? `Return ${fmt(totalReturn)}` : "Create Return"}
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
    <div style={{ padding:24 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <h1 style={{ fontSize:15, fontWeight:700, color:DARK }}>
          Purchase Return <span style={{ fontSize:13, fontWeight:400, color:MUTED }}>({filteredRets.length})</span>
        </h1>
        <button onClick={() => setView("new")} style={btn(true)}>
          <Plus size={14}/> Create Purchase Return
        </button>
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <div style={{ position:"relative", width:280 }}>
          <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:MUTED }}/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier, return or bill no..." style={{ ...inp, paddingLeft:32 }}/>
        </div>
        <div style={{ marginLeft:"auto", fontSize:12, color:GRAY }}>
          Total returned: <strong style={{ color:DARK }}>{fmt(totalReturned)}</strong>
        </div>
      </div>

      <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:10, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${BORDER}`, background:LIGHT }}>
              {["Return No","Date","Supplier","Bill No","Returned","Reduced Payable","Cash Refunded","Reason"].map(h => (
                <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontSize:10.5, fontWeight:700, color:MUTED, textTransform:"uppercase", letterSpacing:"0.04em", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign:"center", padding:40 }}>
                <div style={{ width:20, height:20, border:`2px solid ${BLUE}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto" }}/>
              </td></tr>
            ) : filteredRets.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign:"center", padding:50 }}>
                <p style={{ fontSize:13, color:MUTED, marginBottom:10 }}>
                  {returns.length === 0 ? "No purchase returns yet" : "No returns match your search"}
                </p>
                {returns.length === 0 && (
                  <button onClick={() => setView("new")} style={btn(true)}><Plus size={13}/> Create first purchase return</button>
                )}
              </td></tr>
            ) : filteredRets.map(r => (
              <tr key={r.id} style={{ borderBottom:"1px solid #f3f4f6", cursor:"pointer" }}
                onClick={() => setSelected(r)}
                onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                <td style={{ padding:"11px 16px", fontSize:13, fontWeight:600, color:DARK, whiteSpace:"nowrap" }}>
                  {shortDocNumber(r.return_number, r.return_date) || "—"}
                </td>
                <td style={{ padding:"11px 16px" }}>
                  <p style={{ fontSize:13, color:"#374151" }}>{formatAD(r.return_date)}</p>
                  <p style={{ fontSize:11, color:MUTED }}>{formatBS(r.return_date)}</p>
                </td>
                <td style={{ padding:"11px 16px", fontSize:13, fontWeight:600, color:DARK }}>{r.suppliers?.name || "Direct purchase"}</td>
                <td style={{ padding:"11px 16px", fontSize:13, color:"#374151", whiteSpace:"nowrap" }}>{billNoOf(r) || "—"}</td>
                <td style={{ padding:"11px 16px", fontSize:13, fontWeight:700, color:DARK }}>{fmt(r.total_return_amount)}</td>
                <td style={{ padding:"11px 16px", fontSize:12, color:GRAY }}>{r.credit_applied_amount > 0 ? fmt(r.credit_applied_amount) : "—"}</td>
                <td style={{ padding:"11px 16px", fontSize:12, color:GRAY }}>{r.cash_refunded_amount > 0 ? fmt(r.cash_refunded_amount) : "—"}</td>
                <td style={{ padding:"11px 16px", fontSize:12, color:GRAY }}>{r.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <ReturnDetailModal
          ret={selected}
          onClose={() => setSelected(null)}
          onDeleted={() => { setSelected(null); loadAll() }}
        />
      )}
    </div>
  )
}
