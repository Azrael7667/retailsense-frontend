import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { useNavigate, useLocation } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import {
  Plus, Search, Truck, Edit2, Trash2, Phone, Mail, MapPin, ArrowUpDown,
  ShoppingBag, ChevronDown, CreditCard, Scale, X, MoreVertical, FileText
} from "lucide-react"
import toast from "react-hot-toast"
import PaymentOutModal from "../../components/payments/PaymentOutModal"
import InvoicePurchaseDetailModal from "../../components/transactions/InvoicePurchaseDetailModal"
import PaymentDetailModal from "../../components/transactions/PaymentDetailModal"

const fmt = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

// Shared styles (same look as Dashboard / Inventory / Customers)
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

const STATUS_STYLE = {
  paid:    "bg-green-50 text-green-700",
  partial: "bg-amber-50 text-amber-700",
  unpaid:  "bg-red-50 text-red-600",
}

const empty = { name: "", phone: "", email: "", address: "", pan_number: "" }
const SORTS = ["Latest", "Oldest", "Amount: High to Low", "Amount: Low to High"]
const FILTERS = [
  "All", "Sales", "Purchase", "Payment In", "Payment Out",
  "Sales Return", "Purchase Return", "Quotation", "Add Balance", "Reduce Balance",
]

function matchesSupplierFilter(ev, filterBy) {
  if (filterBy === "All") return true
  if (filterBy === "Purchase") return ev.kind === "purchase"
  if (filterBy === "Payment Out") return ev.kind === "payment_out"
  if (filterBy === "Add Balance") return ev.kind === "adjustment" && ev.entryType === "debit"
  if (filterBy === "Reduce Balance") return ev.kind === "adjustment" && ev.entryType === "credit"
  // Sales / Payment In / Sales Return / Quotation are customer-side concepts and
  // never appear here; Purchase Return isn't wired into this ledger yet
  return false
}

// Initials tile. One neutral colour everywhere; dark when it is the active item.
function Avatar({ name, active = false, className = "w-10 h-10 text-xs rounded-lg" }) {
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
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

export default function Suppliers() {
  const { storeId } = useStoreId()
  const navigate = useNavigate()
  const location = useLocation()

  const [suppliers,   setSuppliers]   = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [selected,    setSelected]    = useState(null)
  const [search,      setSearch]      = useState("")
  const [filter,      setFilter]      = useState("all")
  const [showModal,   setShowModal]   = useState(false)
  const [form,        setForm]        = useState(empty)
  const [editing,     setEditing]     = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [history,     setHistory]     = useState([])
  const [loadingHist, setLoadingHist] = useState(false)
  const [txSearch,    setTxSearch]    = useState("")
  const [sortBy,      setSortBy]      = useState("Latest")
  const [filterBy,    setFilterBy]    = useState("All")
  const [sortOpen,    setSortOpen]    = useState(false)
  const sortFilterRef = useRef(null)

  const [addTxOpen, setAddTxOpen] = useState(false)
  const addTxRef = useRef(null)

  const [showPaymentOut, setShowPaymentOut] = useState(false)

  const [showAdjust, setShowAdjust] = useState(false)
  const [adjForm,    setAdjForm]    = useState({ direction: "debit", amount: "", note: "", date: new Date().toISOString().split("T")[0] })
  const [adjSaving,  setAdjSaving]  = useState(false)

  const [openMenuId, setOpenMenuId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [viewingTx,  setViewingTx]  = useState(null)
  const [menuPos,    setMenuPos]    = useState({ top: 0, left: 0 })
  const ledgerScrollRef = useRef(null)

  useEffect(() => { if (storeId) load(storeId) }, [storeId])
  useEffect(() => { if (selected) loadHistory(selected.id); else setHistory([]) }, [selected])

  // Arriving here from another page (e.g. PurchaseCreate.jsx returning after a
  // purchase was created or edited for this supplier) can ask us to re-select a
  // specific supplier, same pattern Customers.jsx uses for selectCustomerId.
  useEffect(() => {
    if (location.state?.selectSupplierId && suppliers.length) {
      const target = suppliers.find(s => s.id === location.state.selectSupplierId)
      if (target) setSelected(target)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, suppliers])

  useEffect(() => {
    function onClick(e) {
      if (addTxRef.current && !addTxRef.current.contains(e.target)) setAddTxOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  useEffect(() => {
    function onClick(e) {
      if (sortFilterRef.current && !sortFilterRef.current.contains(e.target)) setSortOpen(false)
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
  // away from the row it belongs to (same fix applied on Customers.jsx).
  useEffect(() => {
    const el = ledgerScrollRef.current
    if (!el) return
    function onScroll() { setOpenMenuId(null) }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [selected])

  async function load(sid, keepSelected = false) {
    setListLoading(true)
    const { data } = await supabase.from("suppliers").select("*").eq("store_id", sid).order("name")
    setSuppliers(data || [])
    setListLoading(false)
    if (data?.length) {
      if (keepSelected && selected) {
        const updated = data.find(s => s.id === selected.id)
        if (updated) setSelected(updated)
      } else if (!selected) {
        setSelected(data[0])
      }
    }
  }

  async function loadHistory(supplierId) {
    setLoadingHist(true)

    const [{ data: purchases }, { data: paymentsOut }, { data: khata }] = await Promise.all([
      supabase.from("purchases")
        .select("id, bill_number, purchase_date, total, paid_amount, status, created_at")
        .eq("supplier_id", supplierId),
      supabase.from("payments_out")
        .select("id, payment_date, amount, payment_method, reference, notes, receipt_number, created_by_name, created_at")
        .eq("supplier_id", supplierId),
      supabase.from("khata_entries")
        .select("id, entry_type, amount, description, entry_date, ref_id, created_at")
        .eq("party_id", supplierId)
        .eq("party_type", "supplier"),
    ])

    // Payment Out allocations per purchase (to separate paid-at-purchase vs paid-later),
    // mirroring the customer-side invoice/payment_allocations handling
    const purchaseIds = (purchases || []).map(p => p.id)
    let allocByPurchase = {}
    if (purchaseIds.length) {
      const { data: allocs } = await supabase.from("payment_out_allocations")
        .select("purchase_id, amount").in("purchase_id", purchaseIds)
      for (const a of (allocs || [])) {
        allocByPurchase[a.purchase_id] = (allocByPurchase[a.purchase_id] || 0) + a.amount
      }
    }

    const events = []
    for (const p of (purchases || [])) {
      const allocated = allocByPurchase[p.id] || 0
      const paidAtPurchase = Math.max(0, (p.paid_amount || 0) - allocated)
      events.push({
        kind: "purchase", id: p.id,
        label: p.bill_number ? `Purchase ${p.bill_number}` : "Purchase",
        date: p.purchase_date,
        sortKey: p.purchase_date + "A" + (p.created_at || ""),
        total: p.total, status: p.status,
        remarks: "",
        effect: p.total - paidAtPurchase,
      })
    }
    for (const po of (paymentsOut || [])) {
      events.push({
        kind: "payment_out", id: po.id,
        label: "Payment Out",
        date: po.payment_date,
        sortKey: po.payment_date + "B" + (po.created_at || ""),
        total: po.amount, status: null,
        remarks: [po.payment_method?.replace("_", " "), po.reference].filter(Boolean).join(" - "),
        paymentMethod: po.payment_method,
        reference: po.reference,
        notes: po.notes,
        receiptNumber: po.receipt_number,
        createdByName: po.created_by_name,
        effect: -po.amount,
      })
    }
    // Khata entries: skip ones tied to purchases (ref_id) to avoid double counting;
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
        remarks: k.description || (k.entry_type === "debit" ? "Added to payable" : "Reduced from payable"),
        effect: k.entry_type === "debit" ? k.amount : -k.amount,
      })
    }

    events.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    setHistory(events)
    setLoadingHist(false)
  }

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase()
    const matchQ = !search || s.name.toLowerCase().includes(q) || (s.phone || "").includes(search)
    const matchF = filter === "all" ? true : filter === "due" ? (s.balance || 0) > 0 : (s.balance || 0) <= 0
    return matchQ && matchF
  })

  // Running balance: cumulative effect across purchases, Payment Out, and
  // adjustments, same pattern as the party-statement report on the customer side.
  const historyWithBalance = (() => {
    let running = 0
    return history.map(ev => {
      running += ev.effect
      return { ...ev, runningBalance: running }
    })
  })()

  const totalPurchased = history.filter(ev => ev.kind === "purchase").reduce((s, ev) => s + (ev.total || 0), 0)

  const visibleHistory = (() => {
    let out = [...historyWithBalance].reverse() // newest first by default
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase()
      out = out.filter(ev => ev.label.toLowerCase().includes(q))
    }
    out = out.filter(ev => matchesSupplierFilter(ev, filterBy))
    if (sortBy === "Oldest") out = [...out].reverse()
    else if (sortBy === "Amount: High to Low") out.sort((a, b) => b.total - a.total)
    else if (sortBy === "Amount: Low to High") out.sort((a, b) => a.total - b.total)
    return out
  })()

  function openAdd() { setEditing(null); setForm(empty); setShowModal(true) }
  function openEdit(s) {
    setEditing(s.id)
    setForm({ name: s.name, phone: s.phone || "", email: s.email || "", address: s.address || "", pan_number: s.pan_number || "" })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Supplier name is required")
    setSaving(true)
    const payload = { ...form, store_id: storeId }
    if (editing) {
      const { error } = await supabase.from("suppliers").update(payload).eq("id", editing)
      setSaving(false)
      if (error) return toast.error(error.message)
      toast.success("Supplier updated")
    } else {
      const { error } = await supabase.from("suppliers").insert(payload)
      setSaving(false)
      if (error) return toast.error(error.message)
      toast.success("Supplier added")
    }
    setShowModal(false)
    load(storeId, true)
  }

  async function handleDelete(id) {
    if (!confirm("Delete this supplier?")) return
    await supabase.from("suppliers").delete().eq("id", id)
    toast.success("Supplier deleted")
    setSelected(null)
    load(storeId)
  }

  async function handleAdjustSave() {
    const amt = parseFloat(adjForm.amount)
    if (!amt || amt <= 0) return toast.error("Enter a valid amount")
    setAdjSaving(true)
    try {
      const { error } = await supabase.from("khata_entries").insert({
        store_id:    storeId,
        party_type:  "supplier",
        party_id:    selected.id,
        entry_type:  adjForm.direction,     // debit = we owe more, credit = reduce payable
        amount:      amt,
        description: adjForm.note || "Manual balance adjustment",
        entry_date:  adjForm.date,
      })
      if (error) throw error

      const delta = adjForm.direction === "debit" ? amt : -amt
      const newBalance = Math.max(0, (selected.balance || 0) + delta)
      await supabase.from("suppliers").update({ balance: newBalance }).eq("id", selected.id)

      toast.success("Balance adjusted")
      setShowAdjust(false)
      setAdjForm({ direction: "debit", amount: "", note: "", date: new Date().toISOString().split("T")[0] })
      load(storeId, true)
    } catch (e) {
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

    const noun = ev.kind === "purchase" ? "purchase" : "payment"
    const warning = ev.kind === "purchase"
      ? "Delete this purchase? This reverses its balance and stock effects, and removes any linked payment allocations."
      : "Delete this payment? This reverses its balance effect and un-applies it from any purchases it was allocated to."
    if (!confirm(warning)) return

    setDeletingId(ev.id)
    try {
      await apiClient.delete(`/api/${ev.kind === "purchase" ? "purchases" : "payments-out"}/${ev.id}`)
      toast.success(`${noun[0].toUpperCase()}${noun.slice(1)} deleted`)
      await load(storeId, true)
      await loadHistory(selected.id)
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Failed to delete ${noun}`)
    } finally {
      setDeletingId(null)
    }
  }

  const contactBits = selected ? [
    selected.phone && { icon: Phone, text: selected.phone },
    selected.email && { icon: Mail, text: selected.email },
    selected.address && { icon: MapPin, text: selected.address },
  ].filter(Boolean) : []

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden bg-gray-50">

      {/* LEFT: supplier list */}
      <div className="w-[340px] min-w-[340px] flex flex-col bg-white border-r border-gray-100">
        <div className="px-4 pt-4 pb-3 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold text-gray-900">
              Suppliers <span className="text-sm font-normal text-gray-400">({filtered.length})</span>
            </h1>
            <button onClick={openAdd} className={BTN_DARK}>
              <Plus size={14} /> Add
            </button>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search suppliers…" className={`${FIELD} pl-9 ${search ? "pr-9" : "pr-3"}`} />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {[["all", "All"], ["due", "With Dues"], ["clear", "Settled"]].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filter === k ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Supplier list (slim scrollbar) */}
        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll border-t border-gray-100">
          {listLoading ? (
            <div className="py-10"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <Truck size={24} className="text-gray-300" />
              </div>
              <p className="text-sm text-gray-400">No suppliers found</p>
            </div>
          ) : filtered.map(s => {
            const isSel = selected?.id === s.id
            const due = (s.balance || 0) > 0
            return (
              <button key={s.id} onClick={() => setSelected(s)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-100 border-l-[3px] transition-colors ${
                  isSel ? "bg-lime-50/70 border-l-lime-500" : "border-l-transparent hover:bg-gray-50"
                }`}>
                <Avatar name={s.name} active={isSel} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                  <p className="text-[11px] text-gray-400">{s.phone || "No phone"}</p>
                </div>
                <div className="text-right shrink-0">
                  {due ? (
                    <>
                      <p className="text-xs font-semibold text-red-600 tabular-nums">{fmt(s.balance)}</p>
                      <p className="text-[10px] text-gray-400">To Pay</p>
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
              <Truck size={24} className="text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">Select a supplier to view details</p>
          </div>
        ) : (
          <>
            {/* Supplier header */}
            <div className="bg-white border-b border-gray-100 px-6 py-5 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <Avatar name={selected.name} className="w-12 h-12 text-base rounded-xl" />
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-gray-900 truncate">{selected.name}</h2>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {history.length} transaction{history.length !== 1 ? "s" : ""} · {fmt(totalPurchased)} total purchased
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Payable</p>
                  <p className={`text-xl font-bold tabular-nums ${(selected.balance || 0) > 0 ? "text-red-600" : "text-gray-900"}`}>
                    {fmt(Math.max(0, selected.balance || 0))}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <button onClick={() => openEdit(selected)} className={BTN_OUTLINE}>
                  <Edit2 size={13} /> Manage Supplier
                </button>
                <button onClick={() => handleDelete(selected.id)}
                  className={`${BTN_OUTLINE} !text-red-600 !border-red-200 hover:!bg-red-50`}>
                  <Trash2 size={13} /> Delete
                </button>
                <div className="flex-1" />
                <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500">
                  {contactBits.length === 0 && !selected.pan_number && <span className="text-gray-400">No contact details</span>}
                  {contactBits.map(({ icon: Icon, text }, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5">
                      <Icon size={13} className="text-gray-400" /> {text}
                    </span>
                  ))}
                  {selected.pan_number && <span className="text-gray-500">PAN: {selected.pan_number}</span>}
                </div>
              </div>
            </div>

            {/* Transactions: toolbar + table card */}
            <div className="flex-1 min-h-0 flex flex-col gap-4 p-5">

              <div className="flex items-center gap-2.5 shrink-0">
                <h3 className="text-sm font-bold text-gray-900">
                  Transactions <span className="text-xs font-normal text-gray-400">({history.length})</span>
                </h3>
                <div className="flex-1" />

                <div className="relative w-44">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={txSearch} onChange={e => setTxSearch(e.target.value)}
                    placeholder="Search…" className={`${FIELD} pl-8 pr-3`} />
                </div>

                <div className="relative" ref={sortFilterRef}>
                  <button onClick={() => setSortOpen(v => !v)} className={BTN_OUTLINE}>
                    <ArrowUpDown size={13} /> {sortBy}{filterBy !== "All" ? ` · ${filterBy}` : ""} <ChevronDown size={13} />
                  </button>
                  {sortOpen && (
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
                      <div className="border-t border-gray-100 mt-1" />
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
                  <button onClick={() => setAddTxOpen(v => !v)} className={BTN_DARK}>
                    <Plus size={14} /> Add Transaction <ChevronDown size={13} />
                  </button>
                  {addTxOpen && (
                    <div className={`${MENU} w-48`}>
                      <button onClick={() => { setAddTxOpen(false); navigate("/purchase/create", { state: { supplierId: selected.id } }) }}
                        className={`${MENU_ITEM} border-b border-gray-50`}>
                        <ShoppingBag size={14} className="text-gray-400" /> Purchase
                      </button>
                      <button onClick={() => { setAddTxOpen(false); setShowPaymentOut(true) }}
                        className={`${MENU_ITEM} border-b border-gray-50`}>
                        <CreditCard size={14} className="text-gray-400" /> Payment Out
                      </button>
                      <button onClick={() => { setAddTxOpen(false); setShowAdjust(true) }} className={MENU_ITEM}>
                        <Scale size={14} className="text-gray-400" /> Adjust Balance
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Ledger table: same card + sticky header as Inventory / Customers */}
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
                      {loadingHist ? (
                        <tr><td colSpan={7} className="py-12"><Spinner /></td></tr>
                      ) : visibleHistory.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-16">
                            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                              <FileText size={24} className="text-gray-300" />
                            </div>
                            <p className="text-sm font-medium text-gray-500">
                              {history.length === 0 ? "No transactions yet" : "No matches"}
                            </p>
                            {history.length === 0 && (
                              <p className="text-xs text-gray-400 mt-1">Use Add Transaction to create one</p>
                            )}
                          </td>
                        </tr>
                      ) : visibleHistory.map(p => (
                        <tr key={p.kind + p.id}
                          className={`transition-colors hover:bg-gray-50/70 ${p.kind !== "adjustment" ? "cursor-pointer" : ""}`}
                          onClick={(e) => {
                            if (e.target.closest("[data-row-menu]")) return
                            if (p.kind === "adjustment") return
                            setViewingTx(p)
                          }}>

                          <td className="px-5 py-4 whitespace-nowrap font-medium text-gray-900">
                            {p.label}
                          </td>

                          <td className="px-5 py-4 whitespace-nowrap">
                            <p className="text-[13px] text-gray-700">{formatAD(p.date)}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{formatBS(p.date)}</p>
                          </td>

                          <td className="px-5 py-4 whitespace-nowrap text-right tabular-nums text-gray-900">
                            {fmt(p.total)}
                          </td>

                          <td className="px-5 py-4 whitespace-nowrap">
                            {p.status ? (
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLE[p.status] || STATUS_STYLE.unpaid}`}>
                                {p.status.toUpperCase()}
                              </span>
                            ) : (
                              <span className="text-gray-400">--</span>
                            )}
                          </td>

                          <td className={`px-5 py-4 whitespace-nowrap text-right tabular-nums font-medium ${
                            p.runningBalance > 0 ? "text-red-600" : "text-gray-900"
                          }`}>
                            {fmt(Math.max(0, p.runningBalance))}
                          </td>

                          <td className="px-5 py-4 text-[13px] text-gray-500 capitalize">
                            <span className="block max-w-[14rem] truncate" title={p.remarks || ""}>
                              {p.remarks || <span className="text-gray-400">--</span>}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-right" data-row-menu>
                            {p.kind === "adjustment" ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <>
                                <button
                                  onClick={(e) => {
                                    const open = openMenuId === (p.kind + p.id)
                                    if (!open) {
                                      const rect = e.currentTarget.getBoundingClientRect()
                                      setMenuPos({ top: rect.bottom + 4, left: rect.right - 130 })
                                    }
                                    setOpenMenuId(open ? null : p.kind + p.id)
                                  }}
                                  disabled={deletingId === p.id}
                                  className={`p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-800 transition-colors ${
                                    deletingId === p.id ? "cursor-wait" : ""
                                  }`}>
                                  <MoreVertical size={15} />
                                </button>
                                {openMenuId === (p.kind + p.id) && createPortal(
                                  <div data-row-menu
                                    style={{ top: menuPos.top, left: menuPos.left }}
                                    className="fixed z-[999] w-[130px] bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
                                    <button onClick={() => handleDeleteTransaction(p)}
                                      className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[13px] text-red-600 hover:bg-red-50 text-left transition-colors">
                                      <Trash2 size={13} /> Delete
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
                {!loadingHist && history.length > 0 && (
                  <div className="shrink-0 px-5 py-2.5 border-t border-gray-100 bg-gray-50/70 text-xs text-gray-500">
                    Showing <span className="font-semibold text-gray-700">{visibleHistory.length}</span> of{" "}
                    <span className="font-semibold text-gray-700">{history.length}</span> transactions
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Supplier Modal */}
      {showModal && (
        <div className={MODAL_WRAP}>
          <div onClick={() => setShowModal(false)} className={MODAL_BACK} />
          <div className={`${MODAL_CARD} max-w-md`}>
            <div className={MODAL_HEAD}>
              <h2 className="text-base font-semibold text-gray-900">{editing ? "Edit Supplier" : "Add New Supplier"}</h2>
              <button onClick={() => setShowModal(false)} className={MODAL_X}><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={LABEL}>Supplier name *</label>
                <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Nepal Traders" className={FIELD} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Phone</label>
                  <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="98XXXXXXXX" className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="supplier@email.com" className={FIELD} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Address</label>
                  <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                    placeholder="e.g. Kathmandu" className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>PAN number</label>
                  <input value={form.pan_number} onChange={e => setForm({ ...form, pan_number: e.target.value })}
                    placeholder="Optional" className={FIELD} />
                </div>
              </div>
            </div>
            <div className={MODAL_FOOT}>
              <button onClick={() => setShowModal(false)} className={BTN_OUTLINE}>Cancel</button>
              <button onClick={handleSave} disabled={saving} className={BTN_DARK}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Supplier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Out Modal */}
      {showPaymentOut && selected && (
        <PaymentOutModal
          storeId={storeId}
          supplier={selected}
          onClose={() => setShowPaymentOut(false)}
          onSaved={() => { setShowPaymentOut(false); load(storeId, true) }}
        />
      )}

      {/* Adjust Balance Modal */}
      {showAdjust && selected && (
        <div className={MODAL_WRAP}>
          <div onClick={() => setShowAdjust(false)} className={MODAL_BACK} />
          <div className={`${MODAL_CARD} max-w-[420px]`}>
            <div className={MODAL_HEAD}>
              <h2 className="text-base font-semibold text-gray-900">Adjust Balance: {selected.name}</h2>
              <button onClick={() => setShowAdjust(false)} className={MODAL_X}><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={LABEL}>Adjustment type</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { val: "debit",  label: "To Pay",    desc: "We owe more" },
                    { val: "credit", label: "To Reduce", desc: "Reduce payable" },
                  ].map(t => (
                    <button key={t.val} onClick={() => setAdjForm({ ...adjForm, direction: t.val })}
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
                    onChange={e => setAdjForm({ ...adjForm, amount: e.target.value })}
                    placeholder="0" className={`${FIELD} no-spin font-bold`} />
                </div>
                <div>
                  <label className={LABEL}>Date</label>
                  <input type="date" value={adjForm.date}
                    onChange={e => setAdjForm({ ...adjForm, date: e.target.value })} className={FIELD} />
                  <p className="text-[11px] text-gray-400 mt-1">{formatBS(adjForm.date)}</p>
                </div>
              </div>
              <div>
                <label className={LABEL}>Note (optional)</label>
                <input value={adjForm.note} onChange={e => setAdjForm({ ...adjForm, note: e.target.value })}
                  placeholder="e.g. Opening balance" className={FIELD} />
              </div>
              {parseFloat(adjForm.amount) > 0 && (
                <p className="text-xs text-gray-500 px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                  New payable will be{" "}
                  <strong className="text-gray-900">
                    {fmt(Math.max(0, (selected.balance || 0) + (adjForm.direction === "debit" ? 1 : -1) * (parseFloat(adjForm.amount) || 0)))}
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

      {/* Transaction Detail Modals: opened by clicking a ledger row */}
      {viewingTx && viewingTx.kind === "purchase" && (
        <InvoicePurchaseDetailModal
          kind="purchase"
          id={viewingTx.id}
          partyLabel={selected.name}
          partyBalance={selected.balance}
          onClose={() => setViewingTx(null)}
          onDeleted={() => { load(storeId, true); loadHistory(selected.id) }}
          onEdit={() => navigate("/purchase/create", { state: { editId: viewingTx.id, supplierId: selected.id } })}
        />
      )}
      {viewingTx && viewingTx.kind === "payment_out" && (
        <PaymentDetailModal
          kind="payment_out"
          event={viewingTx}
          partyLabel={selected.name}
          onClose={() => setViewingTx(null)}
          onDeleted={() => { load(storeId, true); loadHistory(selected.id) }}
        />
      )}
    </div>
  )
}