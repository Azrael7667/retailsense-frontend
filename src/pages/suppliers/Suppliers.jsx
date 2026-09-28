import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { useNavigate, useLocation } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatAD } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { Plus, Search, Truck, Edit2, Trash2, Phone, Mail, MapPin, ArrowUpDown, ShoppingBag, ChevronDown, CreditCard, Scale, X, MoreVertical } from "lucide-react"
import Modal from "../../components/common/Modal"
import PaymentOutModal from "../../components/payments/PaymentOutModal"
import toast from "react-hot-toast"
import InvoicePurchaseDetailModal from "../../components/transactions/InvoicePurchaseDetailModal"
import PaymentDetailModal from "../../components/transactions/PaymentDetailModal"

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
  if (filterBy === "Purchase Return") return ev.kind === "purchase_return"
  if (filterBy === "Add Balance") return ev.kind === "adjustment" && ev.entryType === "debit"
  if (filterBy === "Reduce Balance") return ev.kind === "adjustment" && ev.entryType === "credit"
  // Sales / Payment In / Sales Return / Quotation are customer-side concepts and
  // never appear here
  return false
}

export default function Suppliers() {
  const { storeId } = useStoreId()
  const navigate = useNavigate()
  const location = useLocation()
  const [suppliers,  setSuppliers]  = useState([])
  const [selected,   setSelected]   = useState(null)
  const [search,     setSearch]     = useState("")
  const [showModal,  setShowModal]  = useState(false)
  const [form,       setForm]       = useState(empty)
  const [editing,    setEditing]    = useState(null)
  const [history,    setHistory]    = useState([])
  const [loadingHist,setLoadingHist]= useState(false)
  const [txSearch,   setTxSearch]   = useState("")
  const [sortBy,     setSortBy]     = useState("Latest")
  const [sortOpen,   setSortOpen]   = useState(false)
  const [filterBy,   setFilterBy]   = useState("All")
  const sortFilterRef = useRef(null)
  const [mounted,    setMounted]    = useState(false)

  const [addTxOpen,  setAddTxOpen]  = useState(false)
  const [addTxPos,   setAddTxPos]   = useState({ top: 0, left: 0 })
  const addTxRef    = useRef(null)
  const addTxBtnRef = useRef(null)

  function openAddTx() {
    const rect = addTxBtnRef.current.getBoundingClientRect()
    setAddTxPos({ top: rect.bottom + 6, left: rect.right - 192 }) // 192px = w-48
    setAddTxOpen(true)
  }

  const [showPaymentOut, setShowPaymentOut] = useState(false)

  const [showAdjust, setShowAdjust] = useState(false)
  const [adjForm,    setAdjForm]    = useState({ direction: "debit", amount: "", note: "", date: new Date().toISOString().split("T")[0] })
  const [adjSaving,  setAdjSaving]  = useState(false)

  const [openMenuId, setOpenMenuId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [viewingTx, setViewingTx] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const ledgerScrollRef = useRef(null)

  useEffect(() => { if (storeId) load(storeId) }, [storeId])
  useEffect(() => { if (selected) loadHistory(selected.id); else setHistory([]) }, [selected])
  useEffect(() => { setMounted(true) }, [])

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
      if (e.target.closest('[data-dropdown="supplier-add-tx"]')) return
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

  // A `position:fixed` row menu can't cheaply track its row while the panel
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
    const { data } = await supabase.from("suppliers").select("*").eq("store_id", sid).order("name")
    setSuppliers(data || [])
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

    // Purchase returns live in backend-only tables, so they come through the API
    const returnsPromise = apiClient.get("/api/purchase-returns/")
      .then(res => (res.data || []).filter(r => r.supplier_id === supplierId))
      .catch(() => [])

    const [{ data: purchases }, { data: paymentsOut }, { data: khata }, purchaseReturns] = await Promise.all([
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
      returnsPromise,
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
        label: p.bill_number ? `Purchase ${shortDocNumber(p.bill_number, p.purchase_date)}` : "Purchase",
        rawNumber: p.bill_number || "",
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
        label: po.receipt_number ? `Payment Out ${shortDocNumber(po.receipt_number, po.payment_date)}` : "Payment Out",
        rawNumber: po.receipt_number || "",
        date: po.payment_date,
        sortKey: po.payment_date + "B" + (po.created_at || ""),
        total: po.amount, status: null,
        remarks: [po.payment_method?.replace("_"," "), po.reference].filter(Boolean).join(" — "),
        paymentMethod: po.payment_method,
        reference: po.reference,
        notes: po.notes,
        receiptNumber: po.receipt_number,
        createdByName: po.created_by_name,
        effect: -po.amount,
      })
    }
    // Purchase returns — only the part that reduced payable moves the balance;
    // a cash refund from the supplier doesn't change what we owe. Remarks say
    // how the return was settled.
    const money = (n) => "Rs. " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })
    for (const r of (purchaseReturns || [])) {
      const credit = r.credit_applied_amount || 0
      const cash = r.cash_refunded_amount || 0
      const parts = []
      if (credit > 0) parts.push(`Reduced from payable ${money(credit)}`)
      if (cash > 0) parts.push(`Cash refunded ${money(cash)}`)
      events.push({
        kind: "purchase_return", id: r.id,
        label: r.return_number ? `Purchase Return ${shortDocNumber(r.return_number, r.return_date)}` : "Purchase Return",
        rawNumber: r.return_number || "",
        date: r.return_date,
        sortKey: r.return_date + "B" + (r.created_at || ""),
        total: r.total_return_amount, status: null,
        remarks: parts.join(" · "),
        effect: -credit,
      })
    }
    // Khata entries — skip ones tied to purchases (ref_id) to avoid double counting;
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
        remarks: k.description || (k.entry_type === "debit" ? "Added to payable" : "Reduced from payable"),
        effect: k.entry_type === "debit" ? k.amount : -k.amount,
      })
    }

    events.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    setHistory(events)
    setLoadingHist(false)
  }

  const filtered = suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.phone?.includes(search))

  // Running balance — cumulative effect across purchases, Payment Out, returns and
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
    let out = [...historyWithBalance].reverse() // show newest first by default
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase()
      out = out.filter(ev =>
        ev.label.toLowerCase().includes(q) ||
        (ev.rawNumber || "").toLowerCase().includes(q)
      )
    }
    out = out.filter(ev => matchesSupplierFilter(ev, filterBy))
    if (sortBy === "Oldest") out = [...out].reverse()
    else if (sortBy === "Amount: High to Low") out.sort((a, b) => b.total - a.total)
    else if (sortBy === "Amount: Low to High") out.sort((a, b) => a.total - b.total)
    return out
  })()

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Supplier name is required")
    const payload = { ...form, store_id: storeId }
    if (editing) {
      const { error } = await supabase.from("suppliers").update(payload).eq("id", editing)
      if (error) return toast.error(error.message)
      toast.success("Supplier updated")
    } else {
      const { error } = await supabase.from("suppliers").insert(payload)
      if (error) return toast.error(error.message)
      toast.success("Supplier added")
    }
    setShowModal(false); load(storeId)
  }

  async function handleDelete(id) {
    if (!confirm("Delete this supplier?")) return
    await supabase.from("suppliers").delete().eq("id", id)
    toast.success("Supplier deleted"); setSelected(null); load(storeId)
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

    const noun = ev.kind === "purchase" ? "purchase" : ev.kind === "purchase_return" ? "return" : "payment"
    const warning =
      ev.kind === "purchase"
        ? "Delete this purchase? This reverses its balance and stock effects, and removes any linked payment allocations."
      : ev.kind === "purchase_return"
        ? "Delete this return? The goods are added back to your stock and the supplier's payable is restored."
      : "Delete this payment? This reverses its balance effect and un-applies it from any purchases it was allocated to."
    if (!confirm(warning)) return

    const endpoint =
      ev.kind === "purchase" ? "purchases"
      : ev.kind === "purchase_return" ? "purchase-returns"
      : "payments-out"

    setDeletingId(ev.id)
    try {
      await apiClient.delete(`/api/${endpoint}/${ev.id}`)
      toast.success(`${noun[0].toUpperCase()}${noun.slice(1)} deleted`)
      await load(storeId, true)
      await loadHistory(selected.id)
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Failed to delete ${noun}`)
    } finally {
      setDeletingId(null)
    }
  }

  const fmt = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-NP", { month: "short", day: "numeric", year: "numeric" }) : "—"

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      <style>{`
        @keyframes cardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rowIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Sidebar list */}
      <div className="w-80 shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-bold text-gray-900 dark:text-white">Suppliers</h1>
            <button onClick={() => { setEditing(null); setForm(empty); setShowModal(true) }}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.97] text-white text-xs font-semibold rounded-lg shadow-sm transition-all duration-150">
              <Plus size={14} /> Add
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map((s, i) => (
            <div key={s.id} onClick={() => setSelected(s)}
              style={{ animation: mounted ? `rowIn 0.3s ease-out ${i * 25}ms both` : "none" }}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 dark:border-gray-800 transition-colors ${selected?.id === s.id ? "bg-indigo-50/70 dark:bg-indigo-950/30" : "hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
              <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{s.name[0].toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
                <p className="text-xs text-gray-400">{s.phone || "No phone"}</p>
              </div>
              {(s.balance || 0) > 0 && <span className="text-xs font-semibold text-red-500">{fmt(s.balance)}</span>}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Truck size={28} className="text-gray-200 dark:text-gray-700 mb-2" />
              <p className="text-sm text-gray-400">No suppliers yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div ref={ledgerScrollRef} className="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Truck size={56} className="text-gray-200 dark:text-gray-700 mb-4" />
            <p className="text-gray-400">Select a supplier to view details</p>
          </div>
        ) : (
          <div>

            {/* Header card */}
            <div className="border-b border-gray-100 dark:border-gray-800 px-6 py-5"
              style={{ animation: mounted ? "cardIn 0.35s ease-out both" : "none" }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center shrink-0">
                    <span className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">{selected.name[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selected.name}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {history.length} transaction{history.length !== 1 ? "s" : ""} · {fmt(totalPurchased)} total purchased
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">
                    {(selected.balance || 0) > 0 ? "Payable" : "Balance"}
                  </p>
                  <p className={`text-2xl font-bold tabular-nums ${(selected.balance||0) > 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                    {fmt(selected.balance || 0)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-5 flex-wrap">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <Phone size={13} className="text-gray-300 dark:text-gray-600" /> {selected.phone || "No phone"}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <Mail size={13} className="text-gray-300 dark:text-gray-600" /> {selected.email || "No email"}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <MapPin size={13} className="text-gray-300 dark:text-gray-600" /> {selected.address || "No address"}
                  </span>
                  {selected.pan_number && <span className="text-xs text-gray-400">PAN: {selected.pan_number}</span>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => { setEditing(selected.id); setForm({ name: selected.name, phone: selected.phone || "", email: selected.email || "", address: selected.address || "", pan_number: selected.pan_number || "" }); setShowModal(true) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 active:scale-[0.97] transition-all duration-150">
                    <Edit2 size={13} /> Edit
                  </button>

                  <div className="relative" ref={addTxRef}>
                    <button ref={addTxBtnRef} onClick={() => addTxOpen ? setAddTxOpen(false) : openAddTx()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:scale-[0.97] text-white rounded-lg shadow-sm transition-all duration-150">
                      <Plus size={13} /> Add Transaction <ChevronDown size={12}/>
                    </button>
                    {addTxOpen && createPortal(
                      <div data-dropdown="supplier-add-tx"
                        className="fixed w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg z-[999] overflow-hidden"
                        style={{ top: addTxPos.top, left: addTxPos.left, animation: "cardIn 0.15s ease-out both" }}>
                        <button onClick={() => { setAddTxOpen(false); navigate("/purchase/create", { state: { supplierId: selected.id } }) }}
                          className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800 transition-colors">
                          <ShoppingBag size={14} className="text-gray-400"/> Purchase
                        </button>
                        <button onClick={() => { setAddTxOpen(false); setShowPaymentOut(true) }}
                          className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800 transition-colors">
                          <CreditCard size={14} className="text-gray-400"/> Payment Out
                        </button>
                        <button onClick={() => { setAddTxOpen(false); setShowAdjust(true) }}
                          className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <Scale size={14} className="text-gray-400"/> Adjust Balance
                        </button>
                      </div>,
                      document.body
                    )}
                  </div>

                  <button onClick={() => handleDelete(selected.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 active:scale-[0.97] transition-all duration-150">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>

            {/* Transactions */}
            <div className="overflow-hidden"
              style={{ animation: mounted ? "cardIn 0.35s ease-out 80ms both" : "none" }}>
              <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white shrink-0">
                  Transactions <span className="text-gray-300 dark:text-gray-600 font-medium">({history.length})</span>
                </h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={txSearch} onChange={e => setTxSearch(e.target.value)} placeholder="Search…"
                      className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white w-36 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                  <div className="relative" ref={sortFilterRef}>
                    <button onClick={() => setSortOpen(v => !v)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-nowrap transition-colors">
                      <ArrowUpDown size={12} /> {sortBy}{filterBy !== "All" ? ` · ${filterBy}` : ""}
                    </button>
                    {sortOpen && (
                      <div className="absolute z-10 right-0 mt-1.5 w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg py-1"
                        style={{ animation: "cardIn 0.15s ease-out both" }}>
                        <div className="px-3 pt-1.5 pb-1 text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide">Sort By</div>
                        {SORTS.map(s => (
                          <button key={s} onClick={() => setSortBy(s)}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${sortBy===s ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}>
                            {s}
                          </button>
                        ))}
                        <div className="border-t border-gray-100 dark:border-gray-800 mt-1"/>
                        <div className="px-3 pt-1.5 pb-1 text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide">Filter By</div>
                        <div className="max-h-52 overflow-y-auto">
                          {FILTERS.map(f => (
                            <button key={f} onClick={() => setFilterBy(f)}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${filterBy===f ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}>
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {loadingHist ? (
                <div className="py-10 text-center">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : visibleHistory.length === 0 ? (
                <div className="py-10 text-center">
                  <ShoppingBag size={28} className="mx-auto text-gray-200 dark:text-gray-700 mb-2" />
                  <p className="text-sm text-gray-400">
                    {history.length === 0 ? "No transactions recorded with this supplier yet" : "No matches"}
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/80 dark:bg-gray-800/60">
                    <tr>
                      {["Type", "Date", "Total", "Status", "Balance", "Remarks", "Actions"].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/70">
                    {visibleHistory.map((p, i) => (
                      <tr key={p.kind + p.id}
                        style={{ animation: mounted ? `rowIn 0.3s ease-out ${i * 25}ms both` : "none" }}
                        onClick={(e) => {
                          if (e.target.closest("[data-row-menu]")) return
                          if (p.kind === "adjustment") return
                          if (p.kind === "purchase_return") { navigate("/purchase-return"); return }
                          setViewingTx(p)
                        }}
                        className={`hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors ${p.kind !== "adjustment" ? "cursor-pointer" : ""}`}>
                        <td className="px-5 py-3.5 font-medium text-blue-600 dark:text-blue-400">{p.label}</td>
                        <td className="px-5 py-3.5 text-gray-500">{fmtDate(p.date)}</td>
                        <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-white tabular-nums">{fmt(p.total)}</td>
                        <td className="px-5 py-3.5">
                          {p.status ? (
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                              p.status === "paid" ? "bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400" :
                              p.status === "partial" ? "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400" :
                              "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"
                            }`}>
                              {p.status}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">--</span>
                          )}
                        </td>
                        <td className={`px-5 py-3.5 font-medium tabular-nums ${p.runningBalance > 0 ? "text-red-500" : "text-gray-400"}`}>
                          {p.runningBalance > 0 ? fmt(p.runningBalance) : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">{p.remarks || "--"}</td>
                        <td className="px-5 py-3.5 text-right relative" data-row-menu>
                          {p.kind === "adjustment" ? (
                            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  const open = openMenuId === (p.kind+p.id)
                                  if (!open) {
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    setMenuPos({ top: rect.bottom + 4, left: rect.right - 128 })
                                  }
                                  setOpenMenuId(open ? null : p.kind+p.id)
                                }}
                                disabled={deletingId === p.id}
                                className={`p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${deletingId === p.id ? "cursor-wait" : "cursor-pointer"}`}>
                                <MoreVertical size={15}/>
                              </button>
                              {openMenuId === (p.kind+p.id) && createPortal(
                                <div data-row-menu
                                  className="fixed w-32 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-[999] overflow-hidden"
                                  style={{ top: menuPos.top, left: menuPos.left }}>
                                  <button onClick={() => handleDeleteTransaction(p)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
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
              )}
            </div>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit supplier" : "Add supplier"}>
        <div>
          {[
            { label: "Supplier name *", key: "name",       type: "text",  placeholder: "e.g. Nepal Traders" },
            { label: "Phone",           key: "phone",      type: "tel",   placeholder: "+977-98XXXXXXXX" },
            { label: "Email",           key: "email",      type: "email", placeholder: "supplier@email.com" },
            { label: "Address",         key: "address",    type: "text",  placeholder: "Kathmandu, Nepal" },
            { label: "PAN number",      key: "pan_number", type: "text",  placeholder: "Optional" },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{f.label}</label>
              <input type={f.type} value={form[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})} placeholder={f.placeholder}
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 active:scale-[0.97] text-white rounded-xl font-semibold transition-all duration-150">{editing ? "Save changes" : "Add supplier"}</button>
        </div>
      </Modal>

      {showPaymentOut && selected && (
        <PaymentOutModal
          storeId={storeId}
          supplier={selected}
          onClose={() => setShowPaymentOut(false)}
          onSaved={() => { setShowPaymentOut(false); load(storeId, true) }}
        />
      )}

      {showAdjust && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setShowAdjust(false)}/>
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-800"
            style={{ animation: "cardIn 0.2s ease-out both" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Adjust Balance — {selected.name}</h2>
              <button onClick={() => setShowAdjust(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"><X size={18}/></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Adjustment type</label>
                <div className="flex gap-2">
                  {[
                    { val: "debit",  label: "To Pay",   desc: "We owe more" },
                    { val: "credit", label: "To Reduce", desc: "Reduce payable" },
                  ].map(t => (
                    <button key={t.val} onClick={() => setAdjForm({...adjForm, direction: t.val})}
                      className={`flex-1 text-left px-3.5 py-2.5 rounded-xl border-2 transition-all duration-150 ${adjForm.direction===t.val ? "border-blue-500 bg-blue-50 dark:bg-blue-950/50" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`}>
                      <p className={`text-sm font-bold ${adjForm.direction===t.val ? "text-blue-700 dark:text-blue-400" : "text-gray-900 dark:text-white"}`}>{t.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Amount (Rs)</label>
                  <input type="number" min="0" value={adjForm.amount} onChange={e => setAdjForm({...adjForm, amount: e.target.value})} placeholder="0"
                    className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Date</label>
                  <input type="date" value={adjForm.date} onChange={e => setAdjForm({...adjForm, date: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Note (optional)</label>
                <input value={adjForm.note} onChange={e => setAdjForm({...adjForm, note: e.target.value})} placeholder="e.g. Opening balance"
                  className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
              </div>
              {parseFloat(adjForm.amount) > 0 && (
                <div className="flex items-start gap-2 bg-blue-50/60 dark:bg-blue-950/20 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    New payable will be <strong className="text-gray-900 dark:text-white">
                      {fmt(Math.max(0, (selected.balance||0) + (adjForm.direction==="debit" ? 1 : -1) * (parseFloat(adjForm.amount)||0)))}
                    </strong>
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowAdjust(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
              <button onClick={handleAdjustSave} disabled={adjSaving}
                className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 active:scale-[0.97] text-white rounded-xl font-semibold disabled:opacity-50 transition-all duration-150">
                {adjSaving ? "Saving…" : "Save Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Detail Modals — opened by clicking a ledger row */}
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
          event={{ ...viewingTx, date: formatAD(viewingTx.date), rawDate: viewingTx.date }}
          partyLabel={selected.name}
          onClose={() => setViewingTx(null)}
          onDeleted={() => { load(storeId, true); loadHistory(selected.id) }}
        />
      )}
    </div>
  )
}
