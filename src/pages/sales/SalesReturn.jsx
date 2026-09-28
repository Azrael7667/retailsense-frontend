import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Search, ChevronDown, X, Trash2 } from "lucide-react"
import toast from "react-hot-toast"

const BLUE="#2563eb", DARK="#111827", GRAY="#6b7280", MUTED="#9ca3af",
      BORDER="#e5e7eb", LIGHT="#f9fafb", RED="#dc2626", GREEN="#16a34a"

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
const r2  = (n) => Math.round((Number(n)||0) * 100) / 100
const r4  = (n) => Math.round((Number(n)||0) * 10000) / 10000

const inp = { width:"100%", padding:"8px 12px", fontSize:13, border:`1px solid ${BORDER}`,
              borderRadius:8, outline:"none", color:DARK, background:"#fff", boxSizing:"border-box" }
const lbl = { fontSize:11, fontWeight:600, color:GRAY, marginBottom:5, display:"block" }
const btn = (primary) => ({ display:"inline-flex", alignItems:"center", gap:5, padding:"8px 14px",
  fontSize:13, fontWeight:600, borderRadius:8, cursor:"pointer",
  background: primary?BLUE:"#fff", color: primary?"#fff":GRAY,
  border: primary?"none":`1px solid ${BORDER}` })

const WALK_IN = { id: null, name: "Walk-in / no customer" }

// ───────────────────────── Detail modal ─────────────────────────
function ReturnDetailModal({ ret, invoiceNo, customerName, onClose, onDeleted }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiClient.get(`/api/sales-returns/${ret.id}`)
      .then(res => { if (!cancelled) setItems(res.data?.items || []) })
      .catch(e => { if (!cancelled) toast.error(e?.response?.data?.detail || "Failed to load return") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ret.id])

  async function handleDelete() {
    if (!confirm("Delete this return? Stock it added back is taken out again, and the customer's balance is restored.")) return
    setDeleting(true)
    try {
      await apiClient.delete(`/api/sales-returns/${ret.id}`)
      toast.success("Sales return deleted")
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
          <h2 style={{ fontSize:18, fontWeight:700, color:DARK }}>Sales Return</h2>
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
            <div><p style={cap}>Customer</p><div style={box}>{customerName || "Walk-in"}</div></div>
            <div><p style={cap}>Against Invoice</p><div style={box}>{invoiceNo || "—"}</div></div>
          </div>

          <div>
            <p style={cap}>Returned Items</p>
            <div style={{ border:`1px solid ${BORDER}`, borderRadius:10, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:LIGHT }}>
                    {["Item","Qty","Rate","Amount","Stock"].map((h, i) => (
                      <th key={h} style={{ padding:"9px 12px", textAlign: i===0?"left":"right", fontSize:10.5, fontWeight:700, color:MUTED, textTransform:"uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} style={{ padding:24, textAlign:"center", color:MUTED }}>Loading…</td></tr>
                  ) : items.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding:24, textAlign:"center", color:MUTED }}>No items</td></tr>
                  ) : items.map(it => (
                    <tr key={it.id} style={{ borderTop:`1px solid ${BORDER}` }}>
                      <td style={{ padding:"10px 12px", fontWeight:500, color:DARK }}>{it.product_name}</td>
                      <td style={{ padding:"10px 12px", textAlign:"right" }}>{it.quantity_returned}</td>
                      <td style={{ padding:"10px 12px", textAlign:"right" }}>{fmt(it.unit_price)}</td>
                      <td style={{ padding:"10px 12px", textAlign:"right", fontWeight:600 }}>{fmt(it.line_refund_amount)}</td>
                      <td style={{ padding:"10px 12px", textAlign:"right", fontSize:11, color: it.restock_flag ? GREEN : MUTED }}>
                        {it.restock_flag ? "Restocked" : "Not restocked"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginLeft:"auto", width:290, fontSize:13 }}>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0" }}>
              <span style={{ color:GRAY }}>Total Refund</span><strong style={{ color:DARK }}>{fmt(ret.total_refund_amount)}</strong>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0" }}>
              <span style={{ color:GRAY }}>Reduced from balance</span><span>{fmt(ret.credit_applied_amount)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0" }}>
              <span style={{ color:GRAY }}>Refunded in cash</span><span>{fmt(ret.cash_refunded_amount)}</span>
            </div>
          </div>

          <div>
            <p style={cap}>Reason</p>
            <div style={{ ...box, minHeight:48, background:LIGHT, color: ret.reason ? "#374151" : MUTED, fontSize:14 }}>
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
export default function SalesReturn() {
  const { storeId } = useStoreId()
  const [view,      setView]      = useState("list")
  const [returns,   setReturns]   = useState([])
  const [invMap,    setInvMap]    = useState({})
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState("")
  const [selected,  setSelected]  = useState(null)

  // Create form
  const [custOpen,   setCustOpen]   = useState(false)
  const [custSearch, setCustSearch] = useState("")
  const [selCust,    setSelCust]    = useState(null)
  const [invoices,   setInvoices]   = useState([])
  const [invLoading, setInvLoading] = useState(false)
  const [selInvId,   setSelInvId]   = useState("")
  const [lines,      setLines]      = useState([])
  const [linesLoading, setLinesLoading] = useState(false)
  const [priorCredit,  setPriorCredit]  = useState(0)
  const [retDate,    setRetDate]    = useState(new Date().toISOString().split("T")[0])
  const [reason,     setReason]     = useState("")
  const [saving,     setSaving]     = useState(false)
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
    const [{ data: rets }, { data: custs }] = await Promise.all([
      supabase.from("sales_returns")
        .select("*, customers(name, phone)")
        .eq("store_id", storeId)
        .order("return_date", { ascending: false })
        .limit(500),
      supabase.from("customers").select("id, name, phone, balance").eq("store_id", storeId).order("name"),
    ])
    const list = rets || []

    // Look up the invoice numbers in small chunks (keeps the request URL short)
    const ids = [...new Set(list.map(r => r.invoice_id).filter(Boolean))]
    const map = {}
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from("invoices")
        .select("id, invoice_number, invoice_date").in("id", ids.slice(i, i + 100))
      for (const inv of (data || [])) map[inv.id] = inv
    }

    setReturns(list)
    setInvMap(map)
    setCustomers(custs || [])
    setLoading(false)
  }

  function invoiceNoFor(r) {
    const inv = invMap[r.invoice_id]
    return inv ? shortDocNumber(inv.invoice_number, inv.invoice_date) : ""
  }

  function resetForm() {
    setSelCust(null); setInvoices([]); setSelInvId(""); setLines([]); setPriorCredit(0)
    setReason(""); setRetDate(new Date().toISOString().split("T")[0])
  }

  async function pickCustomer(c) {
    setSelCust(c); setCustOpen(false); setCustSearch("")
    setSelInvId(""); setLines([]); setPriorCredit(0)
    setInvLoading(true)
    let q = supabase.from("invoices")
      .select("id, invoice_number, invoice_date, total, paid_amount, status")
      .eq("store_id", storeId)
      .order("invoice_date", { ascending: false })
      .limit(200)
    q = c.id ? q.eq("customer_id", c.id) : q.is("customer_id", null)
    const { data, error } = await q
    if (error) toast.error(error.message)
    setInvoices(data || [])
    setInvLoading(false)
  }

  async function pickInvoice(id) {
    setSelInvId(id); setLines([]); setPriorCredit(0)
    if (!id) return
    setLinesLoading(true)
    const [{ data: items }, { data: prior }] = await Promise.all([
      supabase.from("invoice_items").select("id, product_id, product_name, quantity, unit_price").eq("invoice_id", id),
      supabase.from("sales_returns").select("id, credit_applied_amount").eq("invoice_id", id),
    ])

    const priorIds = (prior || []).map(r => r.id)
    const returned = {}
    if (priorIds.length) {
      const { data: ri } = await supabase.from("sales_return_items")
        .select("product_id, quantity_returned").in("return_id", priorIds)
      for (const r of (ri || [])) {
        if (r.product_id) returned[r.product_id] = (returned[r.product_id] || 0) + r.quantity_returned
      }
    }

    setPriorCredit((prior || []).reduce((s, r) => s + (r.credit_applied_amount || 0), 0))
    setLines((items || []).map(it => ({
      ...it,
      returnable: it.product_id ? Math.max(0, r4(it.quantity - (returned[it.product_id] || 0))) : it.quantity,
      qty: "",
      restock: true,
    })))
    setLinesLoading(false)
  }

  function updateLine(i, patch) {
    setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  }

  const selInvoice = invoices.find(i => i.id === selInvId)
  const chosen = lines.filter(l => (parseFloat(l.qty) || 0) > 0)
  const totalRefund = r2(chosen.reduce((s, l) => s + (parseFloat(l.qty) || 0) * l.unit_price, 0))
  const unpaidOnInvoice = selInvoice
    ? Math.max(0, r2(selInvoice.total - (selInvoice.paid_amount || 0) - priorCredit))
    : 0
  const creditApplied = r2(Math.min(unpaidOnInvoice, totalRefund))
  const cashRefunded  = r2(totalRefund - creditApplied)

  async function handleSave() {
    if (!selInvId) return toast.error("Select an invoice")
    if (!chosen.length) return toast.error("Enter a return quantity for at least one item")
    for (const l of chosen) {
      const q = parseFloat(l.qty)
      if (q > l.returnable) return toast.error(`Only ${l.returnable} of "${l.product_name}" can be returned`)
    }
    setSaving(true)
    try {
      await apiClient.post("/api/sales-returns/", {
        invoice_id: selInvId,
        return_date: retDate,
        reason: reason.trim() || null,
        items: chosen.map(l => ({
          product_id: l.product_id || null,
          invoice_item_id: l.id,
          quantity_returned: parseFloat(l.qty),
          restock_flag: l.restock,
        })),
      })
      toast.success(`Return of ${fmt(totalRefund)} recorded`)
      resetForm()
      setView("list")
      loadAll()
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredCusts = customers.filter(c =>
    c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone || "").includes(custSearch)
  )

  const filteredRets = returns.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    const inv = invMap[r.invoice_id]
    return r.customers?.name?.toLowerCase().includes(q) ||
      (r.return_number || "").toLowerCase().includes(q) ||
      shortDocNumber(r.return_number, r.return_date).toLowerCase().includes(q) ||
      (inv?.invoice_number || "").toLowerCase().includes(q) ||
      invoiceNoFor(r).toLowerCase().includes(q)
  })
  const totalReturned = filteredRets.reduce((s, r) => s + (r.total_refund_amount || 0), 0)

  // ── Create ──
  if (view === "new") {
    return (
      <div style={{ padding:24, maxWidth:820 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button onClick={() => { resetForm(); setView("list") }} style={{ ...btn(false), padding:"6px 12px" }}>← Back</button>
          <h1 style={{ fontSize:15, fontWeight:700, color:DARK }}>Create Sales Return</h1>
        </div>

        <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:10 }}>

          {/* Step 1 — customer + invoice */}
          <div style={{ padding:"18px 20px", borderBottom:"1px solid #f3f4f6", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
            <div style={{ position:"relative" }} ref={custRef}>
              <span style={lbl}>Customer</span>
              <button onClick={() => setCustOpen(!custOpen)}
                style={{ ...inp, display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", textAlign:"left" }}>
                <span style={{ color: selCust ? DARK : MUTED, fontWeight: selCust ? 600 : 400 }}>
                  {selCust ? selCust.name : "Select customer"}
                </span>
                <ChevronDown size={14} color={MUTED}/>
              </button>
              {custOpen && (
                <div style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:4, background:"#fff",
                  border:`1px solid ${BORDER}`, borderRadius:10, boxShadow:"0 8px 20px rgba(0,0,0,0.08)", zIndex:30, overflow:"hidden" }}>
                  <div style={{ padding:8, borderBottom:"1px solid #f3f4f6" }}>
                    <input autoFocus value={custSearch} onChange={e => setCustSearch(e.target.value)}
                      placeholder="Type name or phone..." style={{ ...inp, padding:"6px 10px", fontSize:12 }}/>
                  </div>
                  <div style={{ maxHeight:220, overflowY:"auto" }}>
                    <button onClick={() => pickCustomer(WALK_IN)}
                      style={{ width:"100%", padding:"9px 12px", background:"none", border:"none", borderBottom:"1px solid #f9fafb",
                        cursor:"pointer", textAlign:"left", fontSize:13, fontWeight:600, color:GRAY }}
                      onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      Walk-in / no customer
                    </button>
                    {filteredCusts.map(c => (
                      <button key={c.id} onClick={() => pickCustomer(c)}
                        style={{ width:"100%", padding:"9px 12px", background:"none", border:"none", borderBottom:"1px solid #f9fafb",
                          cursor:"pointer", textAlign:"left" }}
                        onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <p style={{ fontSize:13, fontWeight:600, color:DARK }}>{c.name}</p>
                        {c.phone && <p style={{ fontSize:11, color:MUTED }}>{c.phone}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ gridColumn:"span 2" }}>
              <span style={lbl}>Invoice</span>
              <select value={selInvId} onChange={e => pickInvoice(e.target.value)} disabled={!selCust || invLoading}
                style={{ ...inp, cursor: selCust ? "pointer" : "not-allowed", background: selCust ? "#fff" : LIGHT }}>
                <option value="">
                  {!selCust ? "Select a customer first" : invLoading ? "Loading…" : invoices.length ? "Select invoice" : "No invoices found"}
                </option>
                {invoices.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {shortDocNumber(inv.invoice_number, inv.invoice_date)} · {formatAD(inv.invoice_date)} · {fmt(inv.total)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Step 2 — items */}
          {selInvId && (
            <>
              <div style={{ padding:"18px 20px", borderBottom:"1px solid #f3f4f6" }}>
                <div style={{ border:`1px solid ${BORDER}`, borderRadius:10, overflow:"hidden" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead>
                      <tr style={{ background:LIGHT }}>
                        {["Item","Sold","Can return","Rate","Return qty","Put back in stock"].map((h, i) => (
                          <th key={h} style={{ padding:"9px 12px", textAlign: i===0?"left":"right", fontSize:10.5, fontWeight:700, color:MUTED, textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {linesLoading ? (
                        <tr><td colSpan={6} style={{ padding:24, textAlign:"center", color:MUTED }}>Loading items…</td></tr>
                      ) : lines.map((l, i) => (
                        <tr key={l.id} style={{ borderTop:`1px solid ${BORDER}`, opacity: l.returnable <= 0 ? 0.5 : 1 }}>
                          <td style={{ padding:"10px 12px", fontWeight:500, color:DARK }}>{l.product_name}</td>
                          <td style={{ padding:"10px 12px", textAlign:"right" }}>{l.quantity}</td>
                          <td style={{ padding:"10px 12px", textAlign:"right" }}>{l.returnable}</td>
                          <td style={{ padding:"10px 12px", textAlign:"right" }}>{fmt(l.unit_price)}</td>
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
                          <td style={{ padding:"10px 12px", textAlign:"right" }}>
                            <input type="checkbox" checked={l.restock} disabled={l.returnable <= 0}
                              onChange={e => updateLine(i, { restock: e.target.checked })}/>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Step 3 — details + totals */}
              <div style={{ padding:"18px 20px", borderBottom:"1px solid #f3f4f6", display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div>
                    <span style={lbl}>Return date</span>
                    <input type="date" value={retDate} onChange={e => setRetDate(e.target.value)} style={inp}/>
                    <p style={{ fontSize:11, color:MUTED, marginTop:5 }}>{formatBS(retDate)}</p>
                  </div>
                  <div>
                    <span style={lbl}>Reason (optional)</span>
                    <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Wrong part, defective" style={inp}/>
                  </div>
                </div>

                <div style={{ fontSize:13 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0" }}>
                    <span style={{ color:GRAY }}>Total refund</span>
                    <strong style={{ color:DARK, fontSize:16 }}>{fmt(totalRefund)}</strong>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0" }}>
                    <span style={{ color:GRAY }}>Reduces customer's balance</span><span>{fmt(creditApplied)}</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0" }}>
                    <span style={{ color:GRAY }}>Refunded in cash</span><span>{fmt(cashRefunded)}</span>
                  </div>
                  <p style={{ fontSize:11, color:MUTED, marginTop:8, lineHeight:1.5 }}>
                    The return first cancels any unpaid amount on this invoice ({fmt(unpaidOnInvoice)} unpaid). Anything beyond that is refunded in cash.
                  </p>
                </div>
              </div>

              <div style={{ display:"flex", justifyContent:"flex-end", gap:10, padding:"14px 20px", background:LIGHT, borderRadius:"0 0 10px 10px" }}>
                <button onClick={() => { resetForm(); setView("list") }} style={btn(false)}>Cancel</button>
                <button onClick={handleSave} disabled={saving || totalRefund <= 0}
                  style={{ ...btn(true), opacity: (saving || totalRefund <= 0) ? 0.5 : 1 }}>
                  {saving ? "Saving..." : totalRefund > 0 ? `Return ${fmt(totalRefund)}` : "Create Return"}
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
          Sales Return <span style={{ fontSize:13, fontWeight:400, color:MUTED }}>({filteredRets.length})</span>
        </h1>
        <button onClick={() => setView("new")} style={btn(true)}>
          <Plus size={14}/> Create Sales Return
        </button>
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <div style={{ position:"relative", width:280 }}>
          <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:MUTED }}/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, return or invoice no..." style={{ ...inp, paddingLeft:32 }}/>
        </div>
        <div style={{ marginLeft:"auto", fontSize:12, color:GRAY }}>
          Total returned: <strong style={{ color:DARK }}>{fmt(totalReturned)}</strong>
        </div>
      </div>

      <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:10, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${BORDER}`, background:LIGHT }}>
              {["Return No","Date","Customer","Invoice No","Refund","Credit Applied","Cash Refunded","Reason"].map(h => (
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
                  {returns.length === 0 ? "No sales returns yet" : "No returns match your search"}
                </p>
                {returns.length === 0 && (
                  <button onClick={() => setView("new")} style={btn(true)}><Plus size={13}/> Create first sales return</button>
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
                <td style={{ padding:"11px 16px", fontSize:13, fontWeight:600, color:DARK }}>{r.customers?.name || "Walk-in"}</td>
                <td style={{ padding:"11px 16px", fontSize:13, color:"#374151", whiteSpace:"nowrap" }}>{invoiceNoFor(r) || "—"}</td>
                <td style={{ padding:"11px 16px", fontSize:13, fontWeight:700, color:DARK }}>{fmt(r.total_refund_amount)}</td>
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
          invoiceNo={invoiceNoFor(selected)}
          customerName={selected.customers?.name}
          onClose={() => setSelected(null)}
          onDeleted={() => { setSelected(null); loadAll() }}
        />
      )}
    </div>
  )
}
