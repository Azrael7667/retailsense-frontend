import { useEffect, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import {
  Plus, Search, X, Edit2, Trash2, Users, ChevronDown,
  FileText, BookOpen, Bell, Scale
} from "lucide-react"
import toast from "react-hot-toast"

const BLUE="#2563eb", DARK="#111827", GRAY="#6b7280", MUTED="#9ca3af",
      BORDER="#e5e7eb", LIGHT="#f9fafb", GREEN="#16a34a", RED="#dc2626"

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

const inp = { width:"100%", padding:"8px 12px", fontSize:13, border:`1px solid ${BORDER}`,
              borderRadius:8, outline:"none", color:DARK, background:"#fff", boxSizing:"border-box" }
const lbl = { fontSize:11, fontWeight:600, color:GRAY, marginBottom:5, display:"block" }
const btn = (primary) => ({ display:"inline-flex", alignItems:"center", gap:5, padding:"8px 14px",
  fontSize:13, fontWeight:600, borderRadius:8, cursor:"pointer",
  background: primary?BLUE:"#fff", color: primary?"#fff":GRAY,
  border: primary?"none":`1px solid ${BORDER}` })

const emptyForm = { name: "", phone: "", address: "", notes: "" }

// Single plain avatar style — light blue chip, blue initials. Not colorful.
function Avatar({ name, size = 36, fontSize = 12, radius = 8 }) {
  const initials = (name||"?").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()
  return (
    <div style={{ width:size, height:size, borderRadius:radius, background:"#eff6ff",
      border:"1px solid #dbeafe", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
      <span style={{ color:BLUE, fontSize, fontWeight:700 }}>{initials}</span>
    </div>
  )
}

export default function Customers() {
  const { storeId } = useStoreId()
  const navigate    = useNavigate()

  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState("")
  const [filter,    setFilter]    = useState("all")
  const [selected,  setSelected]  = useState(null)
  const [ledger,    setLedger]    = useState([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [txSearch,  setTxSearch]  = useState("")
  const [showModal, setShowModal] = useState(false)
  const [form,      setForm]      = useState(emptyForm)
  const [editing,   setEditing]   = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [addTxOpen, setAddTxOpen] = useState(false)
  const addTxRef = useRef(null)

  // Adjust Balance modal
  const [showAdjust,  setShowAdjust]  = useState(false)
  const [adjForm,     setAdjForm]     = useState({ direction: "debit", amount: "", note: "", date: new Date().toISOString().split("T")[0] })
  const [adjSaving,   setAdjSaving]   = useState(false)

  useEffect(() => { if (storeId) load() }, [storeId])

  useEffect(() => {
    function onClick(e) {
      if (addTxRef.current && !addTxRef.current.contains(e.target)) setAddTxOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  async function load(keepSelected = false) {
    setLoading(true)
    const { data } = await supabase.from("customers")
      .select("*").eq("store_id", storeId).order("name")
    setCustomers(data || [])
    setLoading(false)
    if (data?.length) {
      if (keepSelected && selected) {
        const updated = data.find(c => c.id === selected.id)
        if (updated) selectCustomer(updated)
      } else if (!selected) {
        selectCustomer(data[0])
      }
    }
  }

  async function selectCustomer(c) {
    setSelected(c)
    setLedgerLoading(true)
    setTxSearch("")

    const [{ data: invs }, { data: pays }, { data: khata }] = await Promise.all([
      supabase.from("invoices")
        .select("id, invoice_number, invoice_date, total, paid_amount, status, notes, created_at")
        .eq("customer_id", c.id),
      supabase.from("payments")
        .select("id, payment_date, amount, payment_method, reference, notes, created_at")
        .eq("customer_id", c.id),
      supabase.from("khata_entries")
        .select("id, entry_type, amount, description, entry_date, ref_id, created_at")
        .eq("party_id", c.id)
        .eq("party_type", "customer"),
    ])

    // Payment In allocations per invoice (to separate paid-at-sale vs paid-later)
    const invoiceIds = (invs || []).map(i => i.id)
    let allocByInvoice = {}
    if (invoiceIds.length) {
      const { data: allocs } = await supabase.from("payment_allocations")
        .select("invoice_id, amount").in("invoice_id", invoiceIds)
      for (const a of (allocs || [])) {
        allocByInvoice[a.invoice_id] = (allocByInvoice[a.invoice_id] || 0) + a.amount
      }
    }

    const events = []
    for (const inv of (invs || [])) {
      const allocated  = allocByInvoice[inv.id] || 0
      const paidAtSale = Math.max(0, inv.paid_amount - allocated)
      events.push({
        kind: "invoice", id: inv.id,
        label: `Sales Invoice ${inv.invoice_number}`,
        date: inv.invoice_date,
        sortKey: inv.invoice_date + "A" + (inv.created_at || ""),
        total: inv.total, status: inv.status,
        remarks: inv.notes || "",
        effect: inv.total - paidAtSale,
      })
    }
    for (const p of (pays || [])) {
      events.push({
        kind: "payment", id: p.id,
        label: "Payment In",
        date: p.payment_date,
        sortKey: p.payment_date + "B" + (p.created_at || ""),
        total: p.amount, status: null,
        remarks: [p.payment_method?.replace("_"," "), p.reference].filter(Boolean).join(" — "),
        effect: -p.amount,
      })
    }
    // Khata entries — skip ones tied to invoices (ref_id) to avoid double counting;
    // manual adjustments have no ref_id
    for (const k of (khata || [])) {
      if (k.ref_id) continue
      events.push({
        kind: "adjustment", id: k.id,
        label: "Balance Adjustment",
        date: k.entry_date,
        sortKey: k.entry_date + "C" + (k.created_at || ""),
        total: k.amount, status: null,
        remarks: k.description || (k.entry_type === "debit" ? "Added to receivable" : "Reduced from receivable"),
        effect: k.entry_type === "debit" ? k.amount : -k.amount,
      })
    }

    events.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    let running = 0
    for (const ev of events) {
      running += ev.effect
      ev.balance = running
    }
    events.reverse()
    setLedger(events)
    setLedgerLoading(false)
  }

  function openAdd()  { setEditing(null); setForm(emptyForm); setShowModal(true) }
  function openEdit(c) {
    setEditing(c.id)
    setForm({ name: c.name, phone: c.phone||"", address: c.address||"", notes: c.notes||"" })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Customer name is required")
    setSaving(true)
    const payload = { ...form, store_id: storeId }
    const { error } = editing
      ? await supabase.from("customers").update(payload).eq("id", editing)
      : await supabase.from("customers").insert({ ...payload, balance: 0 })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editing ? "Customer updated" : "Customer added")
    setShowModal(false)
    load(true)
  }

  async function handleDelete(c) {
    if (c.balance > 0) return toast.error("Cannot delete a customer with outstanding balance")
    if (!confirm(`Delete ${c.name}?`)) return
    await supabase.from("customers").delete().eq("id", c.id)
    toast.success("Customer deleted")
    setSelected(null)
    load()
  }

  async function handleAdjustSave() {
    const amt = parseFloat(adjForm.amount)
    if (!amt || amt <= 0) return toast.error("Enter a valid amount")
    setAdjSaving(true)
    try {
      const { error } = await supabase.from("khata_entries").insert({
        store_id:    storeId,
        party_type:  "customer",
        party_id:    selected.id,
        entry_type:  adjForm.direction,           // debit = customer owes more, credit = reduce
        amount:      amt,
        description: adjForm.note || "Manual balance adjustment",
        entry_date:  adjForm.date,
      })
      if (error) throw error

      // Update customer balance
      const delta = adjForm.direction === "debit" ? amt : -amt
      const newBalance = Math.max(0, (selected.balance || 0) + delta)
      await supabase.from("customers").update({ balance: newBalance }).eq("id", selected.id)

      toast.success("Balance adjusted")
      setShowAdjust(false)
      setAdjForm({ direction: "debit", amount: "", note: "", date: new Date().toISOString().split("T")[0] })
      load(true)
    } catch(e) {
      toast.error(e.message)
    } finally {
      setAdjSaving(false)
    }
  }

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !search || c.name.toLowerCase().includes(q) || (c.phone||"").includes(search)
    const matchF = filter === "all" ? true : filter === "due" ? c.balance > 0 : c.balance <= 0
    return matchQ && matchF
  })

  const shownLedger = ledger.filter(ev =>
    !txSearch || ev.label.toLowerCase().includes(txSearch.toLowerCase())
  )

  return (
    <div style={{ display:"flex", height:"100%", background:"#fff" }}>

      {/* LEFT — customer list */}
      <div style={{ width: 340, minWidth: 340, borderRight:`1px solid ${BORDER}`, display:"flex", flexDirection:"column", background:"#fff" }}>
        <div style={{ padding:"16px 16px 10px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <h1 style={{ fontSize:15, fontWeight:700, color:DARK }}>
              Customers <span style={{ fontSize:13, fontWeight:400, color:MUTED }}>({filtered.length})</span>
            </h1>
            <button onClick={openAdd} style={{ ...btn(true), padding:"6px 12px", fontSize:12 }}>
              <Plus size={13}/> Add
            </button>
          </div>

          <div style={{ position:"relative", marginBottom:8 }}>
            <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:MUTED }}/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search customers..." style={{ ...inp, paddingLeft:32 }}/>
            {search && (
              <button onClick={() => setSearch("")}
                style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:MUTED }}>
                <X size={13}/>
              </button>
            )}
          </div>

          <div style={{ display:"flex", gap:6 }}>
            {[["all","All"],["due","With Dues"],["clear","Settled"]].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                style={{
                  padding:"5px 12px", fontSize:12, fontWeight:600, borderRadius:20, cursor:"pointer",
                  background: filter===k ? "#eff6ff" : "#fff",
                  color: filter===k ? BLUE : GRAY,
                  border: `1px solid ${filter===k ? "#bfdbfe" : BORDER}`,
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex:1, overflowY:"auto", borderTop:"1px solid #f3f4f6" }}>
          {loading ? (
            <div style={{ padding:40, textAlign:"center" }}>
              <div style={{ width:20, height:20, border:`2px solid ${BLUE}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto" }}/>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:40, textAlign:"center" }}>
              <Users size={30} style={{ color:"#e5e7eb", margin:"0 auto 8px", display:"block" }}/>
              <p style={{ fontSize:12, color:MUTED }}>No customers found</p>
            </div>
          ) : filtered.map(c => {
            const isSel = selected?.id === c.id
            return (
              <button key={c.id} onClick={() => selectCustomer(c)}
                style={{
                  width:"100%", display:"flex", alignItems:"center", gap:11,
                  padding:"12px 16px", background: isSel ? LIGHT : "#fff",
                  border:"none", borderBottom:"1px solid #f3f4f6",
                  borderLeft: isSel ? `3px solid ${BLUE}` : "3px solid transparent",
                  cursor:"pointer", textAlign:"left",
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = LIGHT }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "#fff" }}>
                <Avatar name={c.name}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13, fontWeight:600, color:DARK, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</p>
                  <p style={{ fontSize:11, color:MUTED }}>{c.phone || "—"}</p>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  {c.balance > 0 ? (
                    <>
                      <p style={{ fontSize:12.5, fontWeight:700, color:RED }}>{fmt(c.balance)}</p>
                      <p style={{ fontSize:10.5, color:MUTED }}>To Receive</p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize:12.5, fontWeight:700, color:DARK }}>Rs. 0</p>
                      <p style={{ fontSize:10.5, color:MUTED }}>Settled</p>
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* RIGHT — detail */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, background:"#fff" }}>
        {!selected ? (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column" }}>
            <Users size={40} style={{ color:"#e5e7eb", marginBottom:10 }}/>
            <p style={{ fontSize:13, color:MUTED }}>Select a customer to view details</p>
          </div>
        ) : (
          <>
            <div style={{ padding:"18px 24px", borderBottom:"1px solid #f3f4f6" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  <Avatar name={selected.name} size={52} fontSize={17} radius={12}/>
                  <div>
                    <h2 style={{ fontSize:17, fontWeight:700, color:DARK }}>{selected.name}</h2>
                    <p style={{ fontSize:12, color:MUTED, marginTop:2 }}>
                      {[selected.phone, selected.address].filter(Boolean).join(" — ") || "No contact details"}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <p style={{ fontSize:11.5, color:MUTED }}>Receivable</p>
                  <p style={{ fontSize:20, fontWeight:700, color: selected.balance > 0 ? RED : DARK }}>
                    {fmt(Math.max(0, selected.balance))}
                  </p>
                </div>
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:14 }}>
                <button onClick={() => openEdit(selected)} style={{ ...btn(false), padding:"7px 12px", fontSize:12 }}>
                  <Edit2 size={12}/> Manage Customer
                </button>
                <button onClick={() => handleDelete(selected)} style={{ ...btn(false), padding:"7px 12px", fontSize:12, color:RED, borderColor:"#fecaca" }}>
                  <Trash2 size={12}/> Delete
                </button>
                <div style={{ flex:1 }}/>
                {selected.balance > 0 && (
                  <button
                    onClick={() => toast.success(`Reminder noted for ${selected.name} — SMS integration coming soon`)}
                    style={{ ...btn(false), padding:"7px 12px", fontSize:12 }}>
                    <Bell size={12}/> Send Reminder
                  </button>
                )}
              </div>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 24px", borderBottom:"1px solid #f3f4f6" }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:DARK }}>
                Transactions <span style={{ fontSize:12, fontWeight:400, color:MUTED }}>({ledger.length})</span>
              </h3>
              <div style={{ flex:1 }}/>
              <div style={{ position:"relative", width:180 }}>
                <Search size={12} style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:MUTED }}/>
                <input value={txSearch} onChange={e => setTxSearch(e.target.value)}
                  placeholder="Search..." style={{ ...inp, paddingLeft:28, padding:"6px 10px 6px 28px", fontSize:12 }}/>
              </div>

              <div style={{ position:"relative" }} ref={addTxRef}>
                <button onClick={() => setAddTxOpen(!addTxOpen)} style={{ ...btn(true), padding:"7px 12px", fontSize:12 }}>
                  <Plus size={13}/> Add Transaction <ChevronDown size={12}/>
                </button>
                {addTxOpen && (
                  <div style={{ position:"absolute", top:"100%", right:0, marginTop:4, background:"#fff",
                    border:`1px solid ${BORDER}`, borderRadius:10, boxShadow:"0 8px 20px rgba(0,0,0,0.1)",
                    zIndex:30, overflow:"hidden", width:190 }}>
                    <button onClick={() => navigate("/sales")}
                      style={{ width:"100%", display:"flex", alignItems:"center", gap:9, padding:"10px 14px",
                        background:"none", border:"none", borderBottom:"1px solid #f9fafb",
                        cursor:"pointer", textAlign:"left", fontSize:13, color:"#374151" }}
                      onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <FileText size={14} color={GRAY}/> Sales Invoice
                    </button>
                    <button onClick={() => navigate("/payment-in")}
                      style={{ width:"100%", display:"flex", alignItems:"center", gap:9, padding:"10px 14px",
                        background:"none", border:"none", borderBottom:"1px solid #f9fafb",
                        cursor:"pointer", textAlign:"left", fontSize:13, color:"#374151" }}
                      onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <BookOpen size={14} color={GRAY}/> Payment In
                    </button>
                    <button onClick={() => { setAddTxOpen(false); setShowAdjust(true) }}
                      style={{ width:"100%", display:"flex", alignItems:"center", gap:9, padding:"10px 14px",
                        background:"none", border:"none",
                        cursor:"pointer", textAlign:"left", fontSize:13, color:"#374151" }}
                      onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <Scale size={14} color={GRAY}/> Adjust Balance
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Ledger */}
            <div style={{ flex:1, overflowY:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead style={{ position:"sticky", top:0, zIndex:1 }}>
                  <tr style={{ borderBottom:`1px solid ${BORDER}`, background:"#fff" }}>
                    {["Type","Date","Total","Status","Balance","Remarks"].map(h => (
                      <th key={h} style={{ padding:"10px 24px", textAlign:"left", fontSize:10.5, fontWeight:700,
                        color:MUTED, textTransform:"uppercase", letterSpacing:"0.04em", background:"#fff", whiteSpace:"nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledgerLoading ? (
                    <tr><td colSpan={6} style={{ textAlign:"center", padding:40 }}>
                      <div style={{ width:20, height:20, border:`2px solid ${BLUE}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto" }}/>
                    </td></tr>
                  ) : shownLedger.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign:"center", padding:50 }}>
                      <p style={{ fontSize:13, color:MUTED }}>No transactions yet</p>
                    </td></tr>
                  ) : shownLedger.map(ev => (
                    <tr key={ev.kind + ev.id} style={{ borderBottom:"1px solid #f3f4f6" }}
                      onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                      onMouseLeave={e => e.currentTarget.style.background = "#fff"}>

                      <td style={{ padding:"13px 24px" }}>
                        <p style={{ fontSize:13, fontWeight:600, color:DARK }}>{ev.label}</p>
                      </td>

                      <td style={{ padding:"13px 24px" }}>
                        <p style={{ fontSize:12.5, color:"#374151" }}>{formatAD(ev.date)}</p>
                        <p style={{ fontSize:11, color:MUTED }}>{formatBS(ev.date)}</p>
                      </td>

                      <td style={{ padding:"13px 24px", fontSize:13, color:DARK }}>
                        {fmt(ev.total)}
                      </td>

                      <td style={{ padding:"13px 24px" }}>
                        {ev.status ? (
                          <span style={{ fontSize:10.5, fontWeight:700, padding:"2px 8px", borderRadius:4,
                            background: ev.status==="paid"?"#dcfce7":ev.status==="partial"?"#fef3c7":"#fee2e2",
                            color: ev.status==="paid"?"#15803d":ev.status==="partial"?"#92400e":"#dc2626" }}>
                            {ev.status.toUpperCase()}
                          </span>
                        ) : (
                          <span style={{ fontSize:12, color:MUTED }}>--</span>
                        )}
                      </td>

                      <td style={{ padding:"13px 24px", fontSize:13, fontWeight:600,
                        color: ev.balance > 0 ? RED : DARK }}>
                        {fmt(Math.max(0, ev.balance))}
                      </td>

                      <td style={{ padding:"13px 24px", fontSize:12, color:GRAY, textTransform:"capitalize" }}>
                        {ev.remarks || "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Customer Modal */}
      {showModal && (
        <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div onClick={() => setShowModal(false)} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.3)" }}/>
          <div style={{ position:"relative", background:"#fff", borderRadius:14, width:"100%", maxWidth:440,
            border:`1px solid ${BORDER}`, boxShadow:"0 20px 40px rgba(0,0,0,0.12)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderBottom:"1px solid #f3f4f6" }}>
              <h2 style={{ fontSize:14, fontWeight:700, color:DARK }}>{editing ? "Edit Customer" : "Add New Customer"}</h2>
              <button onClick={() => setShowModal(false)} style={{ padding:5, borderRadius:6, border:"none", background:"none", cursor:"pointer", color:MUTED }}>
                <X size={16}/>
              </button>
            </div>
            <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <span style={lbl}>Full name *</span>
                <input autoFocus value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="e.g. Ram Bahadur Thapa" style={inp}/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <span style={lbl}>Phone</span>
                  <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                    placeholder="98XXXXXXXX" style={inp}/>
                </div>
                <div>
                  <span style={lbl}>Address</span>
                  <input value={form.address} onChange={e => setForm({...form, address: e.target.value})}
                    placeholder="e.g. Kathmandu" style={inp}/>
                </div>
              </div>
              <div>
                <span style={lbl}>Notes (optional)</span>
                <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                  placeholder="Any remark" style={inp}/>
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10, padding:"14px 20px",
              borderTop:"1px solid #f3f4f6", background:LIGHT, borderRadius:"0 0 14px 14px" }}>
              <button onClick={() => setShowModal(false)} style={btn(false)}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btn(true), opacity: saving?0.6:1 }}>
                {saving ? "Saving..." : editing ? "Save Changes" : "Add Customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Balance Modal */}
      {showAdjust && selected && (
        <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div onClick={() => setShowAdjust(false)} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.3)" }}/>
          <div style={{ position:"relative", background:"#fff", borderRadius:14, width:"100%", maxWidth:420,
            border:`1px solid ${BORDER}`, boxShadow:"0 20px 40px rgba(0,0,0,0.12)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderBottom:"1px solid #f3f4f6" }}>
              <h2 style={{ fontSize:14, fontWeight:700, color:DARK }}>Adjust Balance — {selected.name}</h2>
              <button onClick={() => setShowAdjust(false)} style={{ padding:5, borderRadius:6, border:"none", background:"none", cursor:"pointer", color:MUTED }}>
                <X size={16}/>
              </button>
            </div>
            <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <span style={lbl}>Adjustment type</span>
                <div style={{ display:"flex", gap:8 }}>
                  {[
                    { val:"debit",  label:"To Receive", desc:"Customer owes more" },
                    { val:"credit", label:"To Give",    desc:"Reduce their dues" },
                  ].map(t => (
                    <button key={t.val} onClick={() => setAdjForm({...adjForm, direction:t.val})}
                      style={{
                        flex:1, padding:"10px 12px", borderRadius:8, cursor:"pointer", textAlign:"left",
                        background: adjForm.direction===t.val ? "#eff6ff" : "#fff",
                        border: `1px solid ${adjForm.direction===t.val ? "#bfdbfe" : BORDER}`,
                      }}>
                      <p style={{ fontSize:13, fontWeight:700, color: adjForm.direction===t.val ? BLUE : DARK }}>{t.label}</p>
                      <p style={{ fontSize:11, color:MUTED, marginTop:1 }}>{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <span style={lbl}>Amount (Rs)</span>
                  <input type="number" min="0" value={adjForm.amount}
                    onChange={e => setAdjForm({...adjForm, amount: e.target.value})}
                    placeholder="0" className="no-spin" style={{ ...inp, fontWeight:700, fontSize:15 }}/>
                </div>
                <div>
                  <span style={lbl}>Date</span>
                  <input type="date" value={adjForm.date}
                    onChange={e => setAdjForm({...adjForm, date: e.target.value})} style={inp}/>
                  <p style={{ fontSize:11, color:MUTED, marginTop:4 }}>{formatBS(adjForm.date)}</p>
                </div>
              </div>
              <div>
                <span style={lbl}>Note (optional)</span>
                <input value={adjForm.note} onChange={e => setAdjForm({...adjForm, note: e.target.value})}
                  placeholder="e.g. Opening balance, cash lent" style={inp}/>
              </div>
              {parseFloat(adjForm.amount) > 0 && (
                <p style={{ fontSize:12, color:GRAY, padding:"8px 12px", background:LIGHT, borderRadius:8, border:`1px solid ${BORDER}` }}>
                  New receivable will be <strong style={{ color:DARK }}>
                    {fmt(Math.max(0, (selected.balance||0) + (adjForm.direction==="debit" ? 1 : -1) * (parseFloat(adjForm.amount)||0)))}
                  </strong>
                </p>
              )}
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10, padding:"14px 20px",
              borderTop:"1px solid #f3f4f6", background:LIGHT, borderRadius:"0 0 14px 14px" }}>
              <button onClick={() => setShowAdjust(false)} style={btn(false)}>Cancel</button>
              <button onClick={handleAdjustSave} disabled={adjSaving} style={{ ...btn(true), opacity: adjSaving?0.6:1 }}>
                {adjSaving ? "Saving..." : "Save Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
