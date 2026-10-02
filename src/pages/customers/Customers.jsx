import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { useNavigate, useLocation } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import {
  Plus, Search, X, Edit2, Trash2, Users, ChevronDown,
  FileText, BookOpen, Bell, Scale, MoreVertical, ArrowUpDown,
  Calendar, MessageCircle, Copy
} from "lucide-react"
import toast from "react-hot-toast"
import PaymentInModal from "../../components/payments/PaymentInModal"
import InvoicePurchaseDetailModal from "../../components/transactions/InvoicePurchaseDetailModal"
import PaymentDetailModal from "../../components/transactions/PaymentDetailModal"
import { confirmDialog } from "../../components/common/ConfirmDialog"

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

// Shared styles (same look as Dashboard / Inventory)
const FIELD  = "w-full px-3.5 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 focus:border-lime-500 transition-colors"
const LABEL  = "block text-xs font-medium text-gray-700 mb-1.5"
const BTN_DARK    = "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50"
const BTN_OUTLINE = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
const MENU        = "absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-30 overflow-hidden"
const MENU_ITEM   = "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 text-left transition-colors"
const MENU_HEAD   = "px-3.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400"
const MODAL_WRAP  = "fixed inset-0 z-50 flex items-center justify-center p-4"
const MODAL_BACK  = "absolute inset-0 bg-black/30 backdrop-blur-sm"
const MODAL_CARD  = "relative bg-white rounded-2xl shadow-2xl w-full border border-gray-100"
const MODAL_HEAD  = "flex items-center justify-between px-6 py-4 border-b border-gray-100"
const MODAL_FOOT  = "flex items-center justify-end gap-2.5 px-6 py-4 border-t border-gray-100 bg-gray-50/70 rounded-b-2xl"
const MODAL_X     = "p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
const TH          = "px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"

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
  // Payment Out / Quotation never appear on the customer side, so all filter to empty for now
  return false
}

function buildReminderMessage(customer) {
  return `Dear ${customer.name}, this is a reminder that you have an outstanding balance of ${fmt(Math.max(0, customer.balance))} with us. Please clear it at your earliest convenience. Thank you!`
}

// Initials tile. One neutral colour everywhere; dark when it is the active item.
function Avatar({ name, active = false, className = "w-10 h-10 text-xs rounded-lg" }) {
  const initials = (name||"?").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()
  return (
    <div className={`flex items-center justify-center font-bold shrink-0 transition-colors ${
      active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
    } ${className}`}>
      {initials}
    </div>
  )
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-lime-600 border-t-transparent rounded-full animate-spin mx-auto" />
}

const STATUS_STYLE = {
  paid:    "bg-green-50 text-green-700",
  partial: "bg-amber-50 text-amber-700",
  unpaid:  "bg-red-50 text-red-600",
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

  const [openMenuId, setOpenMenuId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [viewingTx, setViewingTx] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const ledgerScrollRef = useRef(null)

  const [showAdjust,  setShowAdjust]  = useState(false)
  const [adjForm,     setAdjForm]     = useState({ direction: "debit", amount: "", note: "", date: new Date().toISOString().split("T")[0] })
  const [adjSaving,   setAdjSaving]   = useState(false)

  const [showPaymentIn, setShowPaymentIn] = useState(false)

  const [reminderMenuOpen, setReminderMenuOpen] = useState(false)
  const reminderMenuRef = useRef(null)
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [reminderForm, setReminderForm] = useState({ date: new Date().toISOString().split("T")[0], note: "" })
  const [reminderSaving, setReminderSaving] = useState(false)

  useEffect(() => { if (storeId) load() }, [storeId])

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
      if (reminderMenuRef.current && !reminderMenuRef.current.contains(e.target)) setReminderMenuOpen(false)
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
        label: `Sales Invoice ${shortDocNumber(inv.invoice_number, inv.invoice_date)}`,
        rawNumber: inv.invoice_number || "",
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
        label: p.receipt_number ? `Payment In ${shortDocNumber(p.receipt_number, p.payment_date)}` : "Payment In",
        rawNumber: p.receipt_number || "",
        date: p.payment_date,
        sortKey: p.payment_date + "B" + (p.created_at || ""),
        total: p.amount, status: null,
        remarks: [p.payment_method?.replace("_"," "), p.reference].filter(Boolean).join(" - "),
        paymentMethod: p.payment_method,
        reference: p.reference,
        notes: p.notes,
        receiptNumber: p.receipt_number,
        createdByName: p.created_by_name,
        effect: -p.amount,
      })
    }
    // Khata entries: skip ones tied to invoices (ref_id) to avoid double counting;
    // manual adjustments have no ref_id
    for (const k of (khata || [])) {
      if (k.ref_id) continue
      events.push({
        kind: "adjustment", id: k.id,
        entryType: k.entry_type,
        label: "Balance Adjustment",
        rawNumber: "",
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
    const ok = await confirmDialog({
      title: "Delete customer?",
      message: `${c.name} will be permanently removed from your customers list.`,
      confirmText: "Delete",
      variant: "danger",
    })
    if (!ok) return
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
        entry_type:  adjForm.direction,
        amount:      amt,
        description: adjForm.note || "Manual balance adjustment",
        entry_date:  adjForm.date,
      })
      if (error) throw error

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
    const message = ev.kind === "invoice"
      ? "This reverses its balance and stock effects, and also deletes any linked sales returns."
      : "This reverses its balance effect and un-applies it from any invoices it was allocated to."
    const ok = await confirmDialog({
      title: `Delete this ${noun}?`,
      message,
      confirmText: "Delete",
      variant: "danger",
    })
    if (!ok) return

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

  function openReminderModal() {
    setReminderMenuOpen(false)
    setReminderForm({ date: new Date().toISOString().split("T")[0], note: "" })
    setShowReminderModal(true)
  }

  async function handleSaveReminder() {
    if (!reminderForm.date) return toast.error("Pick a date")
    setReminderSaving(true)
    try {
      await apiClient.post("/api/reminders/", {
        party_type: "customer",
        party_id: selected.id,
        remind_date: reminderForm.date,
        note: reminderForm.note || null,
      })
      toast.success(`Reminder set for ${formatAD(reminderForm.date)}`)
      setShowReminderModal(false)
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to set reminder")
    } finally {
      setReminderSaving(false)
    }
  }

  function handleWhatsApp() {
    setReminderMenuOpen(false)
    if (!selected.phone) return toast.error("This customer has no phone number saved")
    const digits = selected.phone.replace(/\D/g, "")
    const withCountryCode = digits.startsWith("977") ? digits : `977${digits}`
    const message = buildReminderMessage(selected)
    window.open(`https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`, "_blank")
  }

  async function handleCopyMessage() {
    setReminderMenuOpen(false)
    try {
      await navigator.clipboard.writeText(buildReminderMessage(selected))
      toast.success("Message copied")
    } catch {
      toast.error("Couldn't copy. Your browser may be blocking clipboard access")
    }
  }

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !search || c.name.toLowerCase().includes(q) || (c.phone||"").includes(search)
    const matchF = filter === "all" ? true : filter === "due" ? c.balance > 0 : c.balance <= 0
    return matchQ && matchF
  })

  const shownLedger = (() => {
    const tq = txSearch.toLowerCase()
    let out = ledger.filter(ev =>
      (!txSearch ||
        ev.label.toLowerCase().includes(tq) ||
        (ev.rawNumber || "").toLowerCase().includes(tq)) &&
      matchesFilter(ev, filterBy)
    )
    out = [...out]
    if (sortBy === "Oldest") out.reverse()
    else if (sortBy === "Amount: High to Low") out.sort((a, b) => b.total - a.total)
    else if (sortBy === "Amount: Low to High") out.sort((a, b) => a.total - b.total)
    return out
  })()

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden bg-gray-50">

      {/* LEFT: customer list */}
      <div className="w-[340px] min-w-[340px] flex flex-col bg-white border-r border-gray-100">
        <div className="px-4 pt-4 pb-3 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold text-gray-900">
              Customers <span className="text-sm font-normal text-gray-400">({filtered.length})</span>
            </h1>
            <button onClick={openAdd} className={BTN_DARK}>
              <Plus size={14}/> Add
            </button>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search customers…" className={`${FIELD} pl-9 ${search ? "pr-9" : "pr-3"}`}/>
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14}/>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {[["all","All"],["due","With Dues"],["clear","Settled"]].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filter === k ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Customer list (slim scrollbar) */}
        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll border-t border-gray-100">
          {loading ? (
            <div className="py-10"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <Users size={24} className="text-gray-300"/>
              </div>
              <p className="text-sm text-gray-400">No customers found</p>
            </div>
          ) : filtered.map(c => {
            const isSel = selected?.id === c.id
            return (
              <button key={c.id} onClick={() => selectCustomer(c)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-100 border-l-[3px] transition-colors ${
                  isSel ? "bg-lime-50/70 border-l-lime-500" : "border-l-transparent hover:bg-gray-50"
                }`}>
                <Avatar name={c.name} active={isSel}/>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                  <p className="text-[11px] text-gray-400">{c.phone || "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  {c.balance > 0 ? (
                    <>
                      <p className="text-xs font-semibold text-red-600 tabular-nums">{fmt(c.balance)}</p>
                      <p className="text-[10px] text-gray-400">To Receive</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-gray-900 tabular-nums">Rs. 0</p>
                      <p className="text-[10px] text-gray-400">Settled</p>
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* RIGHT: detail */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center mb-3 border border-gray-100">
              <Users size={24} className="text-gray-300"/>
            </div>
            <p className="text-sm text-gray-400">Select a customer to view details</p>
          </div>
        ) : (
          <>
            {/* Customer header */}
            <div className="bg-white border-b border-gray-100 px-6 py-5 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <Avatar name={selected.name} className="w-12 h-12 text-base rounded-xl"/>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-gray-900 truncate">{selected.name}</h2>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {[selected.phone, selected.address].filter(Boolean).join(" - ") || "No contact details"}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Receivable</p>
                  <p className={`text-xl font-bold tabular-nums ${selected.balance > 0 ? "text-red-600" : "text-gray-900"}`}>
                    {fmt(Math.max(0, selected.balance))}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4">
                <button onClick={() => openEdit(selected)} className={BTN_OUTLINE}>
                  <Edit2 size={13}/> Manage Customer
                </button>
                <button onClick={() => handleDelete(selected)}
                  className={`${BTN_OUTLINE} !text-red-600 !border-red-200 hover:!bg-red-50`}>
                  <Trash2 size={13}/> Delete
                </button>
                <div className="flex-1"/>
                {selected.balance > 0 && (
                  <div className="relative" ref={reminderMenuRef}>
                    <button onClick={() => setReminderMenuOpen(!reminderMenuOpen)} className={BTN_OUTLINE}>
                      <Bell size={13}/> Send Reminder <ChevronDown size={13}/>
                    </button>
                    {reminderMenuOpen && (
                      <div className={`${MENU} w-48`}>
                        <button onClick={openReminderModal} className={`${MENU_ITEM} border-b border-gray-50`}>
                          <Calendar size={14} className="text-gray-400"/> Set Reminder
                        </button>
                        <button onClick={handleWhatsApp} className={`${MENU_ITEM} border-b border-gray-50`}>
                          <MessageCircle size={14} className="text-gray-400"/> WhatsApp
                        </button>
                        <button onClick={handleCopyMessage} className={MENU_ITEM}>
                          <Copy size={14} className="text-gray-400"/> Copy Message
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Transactions: toolbar + table card */}
            <div className="flex-1 min-h-0 flex flex-col gap-4 p-5">

              <div className="flex items-center gap-2.5 shrink-0">
                <h3 className="text-sm font-bold text-gray-900">
                  Transactions <span className="text-xs font-normal text-gray-400">({ledger.length})</span>
                </h3>
                <div className="flex-1"/>

                <div className="relative w-44">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                  <input value={txSearch} onChange={e => setTxSearch(e.target.value)}
                    placeholder="Search…" className={`${FIELD} pl-8 pr-3`}/>
                </div>

                <div className="relative" ref={sortFilterRef}>
                  <button onClick={() => setSortFilterOpen(!sortFilterOpen)} className={BTN_OUTLINE}>
                    <ArrowUpDown size={13}/> {sortBy}{filterBy !== "All" ? ` · ${filterBy}` : ""} <ChevronDown size={13}/>
                  </button>
                  {sortFilterOpen && (
                    <div className={`${MENU} w-52 pb-1`}>
                      <div className={MENU_HEAD}>Sort By</div>
                      {SORTS.map(s => (
                        <button key={s} onClick={() => setSortBy(s)}
                          className={`w-full block px-3.5 py-2 text-left text-[13px] transition-colors hover:bg-gray-50 ${
                            sortBy === s ? "bg-lime-50 text-lime-800 font-semibold" : "text-gray-700"
                          }`}>
                          {s}
                        </button>
                      ))}
                      <div className="border-t border-gray-100 mt-1"/>
                      <div className={MENU_HEAD}>Filter By</div>
                      <div className="max-h-56 overflow-y-auto slim-scroll">
                        {FILTERS.map(f => (
                          <button key={f} onClick={() => setFilterBy(f)}
                            className={`w-full block px-3.5 py-2 text-left text-[13px] transition-colors hover:bg-gray-50 ${
                              filterBy === f ? "bg-lime-50 text-lime-800 font-semibold" : "text-gray-700"
                            }`}>
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative" ref={addTxRef}>
                  <button onClick={() => setAddTxOpen(!addTxOpen)} className={BTN_DARK}>
                    <Plus size={14}/> Add Transaction <ChevronDown size={13}/>
                  </button>
                  {addTxOpen && (
                    <div className={`${MENU} w-48`}>
                      <button onClick={() => navigate("/sales/create", { state: { openCreate: true, customerId: selected.id } })}
                        className={`${MENU_ITEM} border-b border-gray-50`}>
                        <FileText size={14} className="text-gray-400"/> Sales Invoice
                      </button>
                      <button onClick={() => { setAddTxOpen(false); setShowPaymentIn(true) }}
                        className={`${MENU_ITEM} border-b border-gray-50`}>
                        <BookOpen size={14} className="text-gray-400"/> Payment In
                      </button>
                      <button onClick={() => { setAddTxOpen(false); setShowAdjust(true) }} className={MENU_ITEM}>
                        <Scale size={14} className="text-gray-400"/> Adjust Balance
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Ledger table: same card + sticky header as Inventory / Recent Transaction */}
              <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div ref={ledgerScrollRef} className="flex-1 min-h-0 overflow-auto slim-scroll">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_0_#f3f4f6]">
                      <tr>
                        <th className={TH}>Type</th>
                        <th className={TH}>Date</th>
                        <th className={`${TH} text-right`}>Total</th>
                        <th className={TH}>Status</th>
                        <th className={`${TH} text-right`}>Balance</th>
                        <th className={TH}>Remarks</th>
                        <th className={`${TH} text-right`}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ledgerLoading ? (
                        <tr><td colSpan={7} className="py-12"><Spinner /></td></tr>
                      ) : shownLedger.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-16">
                            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                              <FileText size={24} className="text-gray-300"/>
                            </div>
                            <p className="text-sm font-medium text-gray-500">No transactions yet</p>
                            <p className="text-xs text-gray-400 mt-1">Use Add Transaction to create one</p>
                          </td>
                        </tr>
                      ) : shownLedger.map(ev => (
                        <tr key={ev.kind + ev.id}
                          className={`transition-colors hover:bg-gray-50/70 ${ev.kind !== "adjustment" ? "cursor-pointer" : ""}`}
                          onClick={(e) => {
                            if (e.target.closest("[data-row-menu]")) return
                            if (ev.kind === "adjustment") return
                            setViewingTx(ev)
                          }}>

                          <td className="px-5 py-4 whitespace-nowrap font-medium text-gray-900">
                            {ev.label}
                          </td>

                          <td className="px-5 py-4 whitespace-nowrap">
                            <p className="text-[13px] text-gray-700">{formatAD(ev.date)}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{formatBS(ev.date)}</p>
                          </td>

                          <td className="px-5 py-4 whitespace-nowrap text-right tabular-nums text-gray-900">
                            {fmt(ev.total)}
                          </td>

                          <td className="px-5 py-4 whitespace-nowrap">
                            {ev.status ? (
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLE[ev.status] || STATUS_STYLE.unpaid}`}>
                                {ev.status.toUpperCase()}
                              </span>
                            ) : (
                              <span className="text-gray-400">--</span>
                            )}
                          </td>

                          <td className={`px-5 py-4 whitespace-nowrap text-right tabular-nums font-medium ${
                            ev.balance > 0 ? "text-red-600" : "text-gray-900"
                          }`}>
                            {fmt(Math.max(0, ev.balance))}
                          </td>

                          <td className="px-5 py-4 text-[13px] text-gray-500 capitalize">
                            <span className="block max-w-[14rem] truncate" title={ev.remarks || ""}>
                              {ev.remarks || <span className="text-gray-400">--</span>}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-right" data-row-menu>
                            {ev.kind === "adjustment" ? (
                              <span className="text-gray-400">—</span>
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
                                  className={`p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-800 transition-colors ${
                                    deletingId === ev.id ? "cursor-wait" : ""
                                  }`}>
                                  <MoreVertical size={15}/>
                                </button>
                                {openMenuId === (ev.kind+ev.id) && createPortal(
                                  <div data-row-menu
                                    style={{ top: menuPos.top, left: menuPos.left }}
                                    className="fixed z-[999] w-[130px] bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
                                    <button onClick={() => handleDeleteTransaction(ev)}
                                      className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[13px] text-red-600 hover:bg-red-50 text-left transition-colors">
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

                {/* Footer */}
                {!ledgerLoading && ledger.length > 0 && (
                  <div className="shrink-0 px-5 py-2.5 border-t border-gray-100 bg-gray-50/70 text-xs text-gray-500">
                    Showing <span className="font-semibold text-gray-700">{shownLedger.length}</span> of{" "}
                    <span className="font-semibold text-gray-700">{ledger.length}</span> transactions
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {showModal && (
        <div className={MODAL_WRAP}>
          <div onClick={() => setShowModal(false)} className={MODAL_BACK}/>
          <div className={`${MODAL_CARD} max-w-md`}>
            <div className={MODAL_HEAD}>
              <h2 className="text-base font-semibold text-gray-900">{editing ? "Edit Customer" : "Add New Customer"}</h2>
              <button onClick={() => setShowModal(false)} className={MODAL_X}><X size={18}/></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={LABEL}>Full name *</label>
                <input autoFocus value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="e.g. Ram Bahadur Thapa" className={FIELD}/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Phone</label>
                  <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                    placeholder="98XXXXXXXX" className={FIELD}/>
                </div>
                <div>
                  <label className={LABEL}>Address</label>
                  <input value={form.address} onChange={e => setForm({...form, address: e.target.value})}
                    placeholder="e.g. Kathmandu" className={FIELD}/>
                </div>
              </div>
              <div>
                <label className={LABEL}>Notes (optional)</label>
                <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                  placeholder="Any remark" className={FIELD}/>
              </div>
            </div>
            <div className={MODAL_FOOT}>
              <button onClick={() => setShowModal(false)} className={BTN_OUTLINE}>Cancel</button>
              <button onClick={handleSave} disabled={saving} className={BTN_DARK}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdjust && selected && (
        <div className={MODAL_WRAP}>
          <div onClick={() => setShowAdjust(false)} className={MODAL_BACK}/>
          <div className={`${MODAL_CARD} max-w-[420px]`}>
            <div className={MODAL_HEAD}>
              <h2 className="text-base font-semibold text-gray-900">Adjust Balance: {selected.name}</h2>
              <button onClick={() => setShowAdjust(false)} className={MODAL_X}><X size={18}/></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={LABEL}>Adjustment type</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { val:"debit",  label:"To Receive", desc:"Customer owes more" },
                    { val:"credit", label:"To Give",    desc:"Reduce their dues" },
                  ].map(t => (
                    <button key={t.val} onClick={() => setAdjForm({...adjForm, direction:t.val})}
                      className={`px-4 py-3 rounded-xl border text-left transition-colors ${
                        adjForm.direction === t.val
                          ? "border-lime-500 bg-lime-50 ring-1 ring-lime-500"
                          : "border-gray-200 hover:border-gray-300"
                      }`}>
                      <p className={`text-sm font-semibold ${adjForm.direction === t.val ? "text-lime-800" : "text-gray-800"}`}>{t.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Amount (Rs)</label>
                  <input type="number" min="0" value={adjForm.amount}
                    onChange={e => setAdjForm({...adjForm, amount: e.target.value})}
                    placeholder="0" className={`${FIELD} no-spin font-bold`}/>
                </div>
                <div>
                  <label className={LABEL}>Date</label>
                  <input type="date" value={adjForm.date}
                    onChange={e => setAdjForm({...adjForm, date: e.target.value})} className={FIELD}/>
                  <p className="text-[11px] text-gray-400 mt-1">{formatBS(adjForm.date)}</p>
                </div>
              </div>
              <div>
                <label className={LABEL}>Note (optional)</label>
                <input value={adjForm.note} onChange={e => setAdjForm({...adjForm, note: e.target.value})}
                  placeholder="e.g. Opening balance, cash lent" className={FIELD}/>
              </div>
              {parseFloat(adjForm.amount) > 0 && (
                <p className="text-xs text-gray-500 px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                  New receivable will be{" "}
                  <strong className="text-gray-900">
                    {fmt(Math.max(0, (selected.balance||0) + (adjForm.direction==="debit" ? 1 : -1) * (parseFloat(adjForm.amount)||0)))}
                  </strong>
                </p>
              )}
            </div>
            <div className={MODAL_FOOT}>
              <button onClick={() => setShowAdjust(false)} className={BTN_OUTLINE}>Cancel</button>
              <button onClick={handleAdjustSave} disabled={adjSaving} className={BTN_DARK}>
                {adjSaving ? "Saving…" : "Save Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReminderModal && selected && (
        <div className={MODAL_WRAP}>
          <div onClick={() => setShowReminderModal(false)} className={MODAL_BACK}/>
          <div className={`${MODAL_CARD} max-w-[400px]`}>
            <div className={MODAL_HEAD}>
              <h2 className="text-base font-semibold text-gray-900">Set Reminder: {selected.name}</h2>
              <button onClick={() => setShowReminderModal(false)} className={MODAL_X}><X size={18}/></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={LABEL}>Remind on</label>
                <input type="date" value={reminderForm.date}
                  onChange={e => setReminderForm({...reminderForm, date: e.target.value})} className={FIELD}/>
                <p className="text-[11px] text-gray-400 mt-1">{formatBS(reminderForm.date)}</p>
              </div>
              <div>
                <label className={LABEL}>Note (optional)</label>
                <input value={reminderForm.note} onChange={e => setReminderForm({...reminderForm, note: e.target.value})}
                  placeholder="e.g. Call about outstanding balance" className={FIELD}/>
              </div>
            </div>
            <div className={MODAL_FOOT}>
              <button onClick={() => setShowReminderModal(false)} className={BTN_OUTLINE}>Cancel</button>
              <button onClick={handleSaveReminder} disabled={reminderSaving} className={BTN_DARK}>
                {reminderSaving ? "Saving…" : "Save Reminder"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentIn && selected && (
        <PaymentInModal
          storeId={storeId}
          customer={selected}
          onClose={() => setShowPaymentIn(false)}
          onSaved={() => { setShowPaymentIn(false); load(true) }}
        />
      )}

      {/* Transaction Detail Modals: opened by clicking a ledger row */}
      {viewingTx && viewingTx.kind === "invoice" && (
        <InvoicePurchaseDetailModal
          kind="invoice"
          id={viewingTx.id}
          partyLabel={selected.name}
          partyBalance={selected.balance}
          onClose={() => setViewingTx(null)}
          onDeleted={() => load(true)}
          onEdit={() => navigate("/sales/create", { state: { openEdit: true, editId: viewingTx.id, customerId: selected.id } })}
        />
      )}
      {viewingTx && viewingTx.kind === "payment" && (
        <PaymentDetailModal
          kind="payment"
          event={{ ...viewingTx, date: formatAD(viewingTx.date), rawDate: viewingTx.date }}
          partyLabel={selected.name}
          onClose={() => setViewingTx(null)}
          onDeleted={() => load(true)}
        />
      )}
    </div>
  )
}