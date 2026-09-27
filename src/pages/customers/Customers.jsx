import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { useNavigate, useLocation } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import {
  Plus, Search, X, Edit2, Trash2, Users, ChevronDown,
  FileText, BookOpen, Bell, Scale, MoreVertical, ArrowUpDown
} from "lucide-react"
import toast from "react-hot-toast"
import PaymentInModal from "../../components/payments/PaymentInModal"
import InvoicePurchaseDetailModal from "../../components/transactions/InvoicePurchaseDetailModal"
import PaymentDetailModal from "../../components/transactions/PaymentDetailModal"

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

const SORTS = ["Latest", "Oldest", "Amount: High to Low", "Amount: Low to High"]
const FILTERS = [
  "All", "Sales", "Purchase", "Payment In", "Payment Out",
  "Sales Return", "Purchase Return", "Quotation", "Add Balance", "Reduce Balance",
]

function matchesFilter(ev, filterBy) {
  if (filterBy === "All") return true
  if (filterBy === "Sales") return ev.kind === "invoice"
  if (filterBy === "Payment In") return ev.kind === "payment"
  if (filterBy === "Add Balance") return ev.kind === "adjustment" && ev.entryType === "debit"
  if (filterBy === "Reduce Balance") return ev.kind === "adjustment" && ev.entryType === "credit"
  // Sales Return isn't wired into this ledger yet; Purchase / Purchase Return /
  // Payment Out / Quotation never appear on the customer side — all filter to empty for now
  return false
}

// Single plain avatar style — light blue chip, blue initials. Not colorful.
// fontSize/size here are decorative avatar-initial sizing, not body text —
// left out of the page-wide font-size convergence pass on purpose.
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
  const location    = useLocation()

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

  const [sortBy, setSortBy] = useState("Latest")
  const [filterBy, setFilterBy] = useState("All")
  const [sortFilterOpen, setSortFilterOpen] = useState(false)
  const sortFilterRef = useRef(null)

  // Row action menu (delete) for the transactions ledger
  const [openMenuId, setOpenMenuId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [viewingTx, setViewingTx] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const ledgerScrollRef = useRef(null)

  // Adjust Balance modal
  const [showAdjust,  setShowAdjust]  = useState(false)
  const [adjForm,     setAdjForm]     = useState({ direction: "debit", amount: "", note: "", date: new Date().toISOString().split("T")[0] })
  const [adjSaving,   setAdjSaving]   = useState(false)

  // Payment In modal
  const [showPaymentIn, setShowPaymentIn] = useState(false)

  useEffect(() => { if (storeId) load() }, [storeId])

  // Arriving here from another page (e.g. Sales.jsx returning after an invoice
  // was created/edited/cancelled from this customer's "Add Transaction" menu)
  // can ask us to re-select a specific customer, same pattern Sales.jsx uses
  // for openCreate/openEdit.
  useEffect(() => {
    if (location.state?.selectCustomerId && customers.length) {
      const target = customers.find(c => c.id === location.state.selectCustomerId)
      if (target) selectCustomer(target)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, customers])

  useEffect(() => {
    function onClick(e) {
      if (addTxRef.current && !addTxRef.current.contains(e.target)) setAddTxOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  useEffect(() => {
    function onClick(e) {
      if (!e.target.closest("[data-row-menu]")) setOpenMenuId(null)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  // A `position:fixed` row menu can't cheaply track its row while the ledger
  // scrolls underneath it, so close it on scroll instead of letting it drift
  // away from the row it belongs to (same fix applied on Suppliers.jsx).
  useEffect(() => {
    const el = ledgerScrollRef.current
    if (!el) return
    function onScroll() { setOpenMenuId(null) }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [selected])

  useEffect(() => {
    function onClick(e) {
      if (sortFilterRef.current && !sortFilterRef.current.contains(e.target)) setSortFilterOpen(false)
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
        .select("id, payment_date, amount, payment_method, reference, notes, receipt_number, created_by_name, created_at")
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
        paymentMethod: p.payment_method,
        reference: p.reference,
        notes: p.notes,
        receiptNumber: p.receipt_number,
        createdByName: p.created_by_name,
        effect: -p.amount,
      })
    }
    // Khata entries — skip ones tied to invoices (ref_id) to avoid double counting;
    // manual adjustments have no ref_id
    for (const k of (khata || [])) {
      if (k.ref_id) continue
      events.push({
        kind: "adjustment", id: k.id,
        entryType: k.entry_type,
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

  async function handleDeleteTransaction(ev) {
    setOpenMenuId(null)

    if (ev.kind === "adjustment") {
      toast.error("Deleting balance adjustments isn't supported yet")
      return
    }

    const noun = ev.kind === "invoice" ? "invoice" : "payment"
    const warning = ev.kind === "invoice"
      ? "Delete this invoice? This reverses its balance and stock effects, and also deletes any linked sales returns."
      : "Delete this payment? This reverses its balance effect and un-applies it from any invoices it was allocated to."
    if (!confirm(warning)) return

    setDeletingId(ev.id)
    try {
      await apiClient.delete(`/api/${ev.kind === "invoice" ? "invoices" : "payments"}/${ev.id}`)
      toast.success(`${noun[0].toUpperCase()}${noun.slice(1)} deleted`)
      await load(true)
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Failed to delete ${noun}`)
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !search || c.name.toLowerCase().includes(q) || (c.phone||"").includes(search)
    const matchF = filter === "all" ? true : filter === "due" ? c.balance > 0 : c.balance <= 0
    return matchQ && matchF
  })

  const shownLedger = (() => {
    let out = ledger.filter(ev =>
      (!txSearch || ev.label.toLowerCase().includes(txSearch.toLowerCase())) &&
      matchesFilter(ev, filterBy)
    )
    out = [...out]
    if (sortBy === "Oldest") out.reverse()
    else if (sortBy === "Amount: High to Low") out.sort((a, b) => b.total - a.total)
    else if (sortBy === "Amount: Low to High") out.sort((a, b) => a.total - b.total)
    // "Latest" uses the ledger's existing newest-first order
    return out
  })()

  return (
    <div style={{ display:"flex", height:"calc(100vh - 56px)", overflow:"hidden", background:"#fff" }}>

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
                  padding:"12px 16px", background: isSel ? "#eff6ff" : "#fff",
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
                      <p style={{ fontSize:12, fontWeight:700, color:RED }}>{fmt(c.balance)}</p>
                      <p style={{ fontSize:10, color:MUTED }}>To Receive</p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize:12, fontWeight:700, color:DARK }}>Rs. 0</p>
                      <p style={{ fontSize:10, color:MUTED }}>Settled</p>
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
                    <h2 style={{ fontSize:18, fontWeight:700, color:DARK }}>{selected.name}</h2>
                    <p style={{ fontSize:12, color:MUTED, marginTop:2 }}>
                      {[selected.phone, selected.address].filter(Boolean).join(" — ") || "No contact details"}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <p style={{ fontSize:11, color:MUTED }}>Receivable</p>
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

              <div style={{ position:"relative" }} ref={sortFilterRef}>
                <button onClick={() => setSortFilterOpen(!sortFilterOpen)}
                  style={{ ...btn(false), padding:"7px 12px", fontSize:12 }}>
                  <ArrowUpDown size={12}/> {sortBy}{filterBy !== "All" ? ` · ${filterBy}` : ""} <ChevronDown size={12}/>
                </button>
                {sortFilterOpen && (
                  <div style={{ position:"absolute", top:"100%", right:0, marginTop:4, background:"#fff",
                    border:`1px solid ${BORDER}`, borderRadius:10, boxShadow:"0 8px 20px rgba(0,0,0,0.1)",
                    zIndex:30, overflow:"hidden", width:200 }}>
                    <div style={{ padding:"8px 12px 4px", fontSize:10, fontWeight:700, color:MUTED, textTransform:"uppercase", letterSpacing:"0.04em" }}>
                      Sort By
                    </div>
                    {SORTS.map(s => (
                      <button key={s} onClick={() => setSortBy(s)}
                        style={{ width:"100%", display:"block", padding:"7px 14px",
                          background:"none", border:"none", cursor:"pointer", textAlign:"left",
                          fontSize:12, color: sortBy===s ? BLUE : "#374151", fontWeight: sortBy===s ? 700 : 400 }}
                        onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        {s}
                      </button>
                    ))}
                    <div style={{ borderTop:`1px solid ${BORDER}`, marginTop:4 }}/>
                    <div style={{ padding:"8px 12px 4px", fontSize:10, fontWeight:700, color:MUTED, textTransform:"uppercase", letterSpacing:"0.04em" }}>
                      Filter By
                    </div>
                    <div style={{ maxHeight:220, overflowY:"auto" }}>
                      {FILTERS.map(f => (
                        <button key={f} onClick={() => setFilterBy(f)}
                          style={{ width:"100%", display:"block", padding:"7px 14px",
                            background:"none", border:"none", cursor:"pointer", textAlign:"left",
                            fontSize:12, color: filterBy===f ? BLUE : "#374151", fontWeight: filterBy===f ? 700 : 400 }}
                          onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                          onMouseLeave={e => e.currentTarget.style.background = "none"}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ position:"relative" }} ref={addTxRef}>
                <button onClick={() => setAddTxOpen(!addTxOpen)} style={{ ...btn(true), padding:"7px 12px", fontSize:12 }}>
                  <Plus size={13}/> Add Transaction <ChevronDown size={12}/>
                </button>
                {addTxOpen && (
                  <div style={{ position:"absolute", top:"100%", right:0, marginTop:4, background:"#fff",
                    border:`1px solid ${BORDER}`, borderRadius:10, boxShadow:"0 8px 20px rgba(0,0,0,0.1)",
                    zIndex:30, overflow:"hidden", width:190 }}>
                    <button onClick={() => navigate("/sales", { state: { openCreate: true, customerId: selected.id } })}
                      style={{ width:"100%", display:"flex", alignItems:"center", gap:9, padding:"10px 14px",
                        background:"none", border:"none", borderBottom:"1px solid #f9fafb",
                        cursor:"pointer", textAlign:"left", fontSize:13, color:"#374151" }}
                      onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <FileText size={14} color={GRAY}/> Sales Invoice
                    </button>
                    <button onClick={() => { setAddTxOpen(false); setShowPaymentIn(true) }}
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
            <div ref={ledgerScrollRef} style={{ flex:1, overflowY:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead style={{ position:"sticky", top:0, zIndex:1 }}>
                  <tr style={{ borderBottom:`1px solid ${BORDER}`, background:"#fff" }}>
                    {["Type","Date","Total","Status","Balance","Remarks","Actions"].map(h => (
                      <th key={h} style={{ padding:"10px 24px", textAlign:"left", fontSize:10, fontWeight:700,
                        color:MUTED, textTransform:"uppercase", letterSpacing:"0.04em", background:"#fff", whiteSpace:"nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledgerLoading ? (
                    <tr><td colSpan={7} style={{ textAlign:"center", padding:40 }}>
                      <div style={{ width:20, height:20, border:`2px solid ${BLUE}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto" }}/>
                    </td></tr>
                  ) : shownLedger.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign:"center", padding:50 }}>
                      <p style={{ fontSize:13, color:MUTED }}>No transactions yet</p>
                    </td></tr>
                  ) : shownLedger.map(ev => (
                    <tr key={ev.kind + ev.id}
                      style={{ borderBottom:"1px solid #f3f4f6", cursor: ev.kind !== "adjustment" ? "pointer" : "default" }}
                      onClick={(e) => {
                        if (e.target.closest("[data-row-menu]")) return
                        if (ev.kind === "adjustment") return
                        setViewingTx(ev)
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                      onMouseLeave={e => e.currentTarget.style.background = "#fff"}>

                      <td style={{ padding:"13px 24px" }}>
                        <p style={{ fontSize:13, fontWeight:600, color:DARK }}>{ev.label}</p>
                      </td>

                      <td style={{ padding:"13px 24px" }}>
                        <p style={{ fontSize:12, color:"#374151" }}>{formatAD(ev.date)}</p>
                        <p style={{ fontSize:11, color:MUTED }}>{formatBS(ev.date)}</p>
                      </td>

                      <td style={{ padding:"13px 24px", fontSize:13, color:DARK }}>
                        {fmt(ev.total)}
                      </td>

                      <td style={{ padding:"13px 24px" }}>
                        {ev.status ? (
                          <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4,
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

                      <td style={{ padding:"13px 24px", textAlign:"right", position:"relative" }} data-row-menu>
                        {ev.kind === "adjustment" ? (
                          <span style={{ fontSize:11, color:MUTED }}>—</span>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                const open = openMenuId === (ev.kind+ev.id)
                                if (!open) {
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  setMenuPos({ top: rect.bottom + 4, left: rect.right - 130 })
                                }
                                setOpenMenuId(open ? null : ev.kind+ev.id)
                              }}
                              disabled={deletingId === ev.id}
                              style={{ padding:6, borderRadius:6, border:"none", background:"none",
                                cursor: deletingId === ev.id ? "wait" : "pointer", color:MUTED }}>
                              <MoreVertical size={15}/>
                            </button>
                            {openMenuId === (ev.kind+ev.id) && createPortal(
                              <div data-row-menu
                                style={{ position:"fixed", top:menuPos.top, left:menuPos.left, background:"#fff",
                                  border:`1px solid ${BORDER}`, borderRadius:8, boxShadow:"0 8px 20px rgba(0,0,0,0.1)",
                                  zIndex:999, overflow:"hidden", width:130 }}>
                                <button onClick={() => handleDeleteTransaction(ev)}
                                  style={{ width:"100%", display:"flex", alignItems:"center", gap:7, padding:"9px 12px",
                                    background:"none", border:"none", cursor:"pointer", textAlign:"left",
                                    fontSize:12, color:RED }}
                                  onMouseEnter={e => e.currentTarget.style.background = "#fef2f2"}
                                  onMouseLeave={e => e.currentTarget.style.background = "none"}>
                                  <Trash2 size={13}/> Delete
                                </button>
                              </div>,
                              document.body
                            )}
                          </>
                        )}
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

      {/* Payment In Modal */}
      {showPaymentIn && selected && (
        <PaymentInModal
          storeId={storeId}
          customer={selected}
          onClose={() => setShowPaymentIn(false)}
          onSaved={() => { setShowPaymentIn(false); load(true) }}
        />
      )}

      {/* Transaction Detail Modals — opened by clicking a ledger row */}
      {viewingTx && viewingTx.kind === "invoice" && (
        <InvoicePurchaseDetailModal
          kind="invoice"
          id={viewingTx.id}
          partyLabel={selected.name}
          partyBalance={selected.balance}
          onClose={() => setViewingTx(null)}
          onDeleted={() => load(true)}
          onEdit={() => navigate("/sales", { state: { openEdit: true, editId: viewingTx.id, customerId: selected.id } })}
        />
      )}
      {viewingTx && viewingTx.kind === "payment" && (
        <PaymentDetailModal
          kind="payment"
          event={viewingTx}
          partyLabel={selected.name}
          onClose={() => setViewingTx(null)}
          onDeleted={() => load(true)}
        />
      )}
    </div>
  )
}
