import { useEffect, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Search, ChevronDown, X, Check } from "lucide-react"
import toast from "react-hot-toast"
import PaymentDetailModal from "../../components/transactions/PaymentDetailModal"
import InvoicePurchaseDetailModal from "../../components/transactions/InvoicePurchaseDetailModal"

// ---- Theme (new palette: navy + soft lime) ----
const NAVY="#0f172a",          // primary buttons, spinner, links
      DARK="#0f172a",          // main text
      GRAY="#64748b",
      MUTED="#94a3b8",
      BORDER="#e5e7eb",
      LIGHT="#f8fafc",
      RED="#dc2626",
      LIME_SOFT="#f7fee7",     // row hover (lime-50)
      LIME_PILL="#ecfccb"      // pills (lime-100)

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

const inp = { width:"100%", padding:"10px 14px", fontSize:13, border:`1px solid ${BORDER}`,
              borderRadius:10, outline:"none", color:DARK, background:"#fff", boxSizing:"border-box" }
const btn = (primary) => ({ display:"inline-flex", alignItems:"center", gap:6, padding:"10px 16px",
  fontSize:13, fontWeight:600, borderRadius:10, cursor:"pointer",
  background: primary?NAVY:"#fff", color: primary?"#fff":DARK,
  border: primary?"none":`1px solid ${BORDER}` })

// ---- Tailwind classes for the "Make Payment" popup (same look as Receive Payment) ----
const T_FIELD       = "w-full px-3.5 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 focus:border-lime-500 transition-colors"
const T_LABEL       = "block text-xs font-medium text-gray-700 mb-1.5"
const T_BTN_DARK    = "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50"
const T_BTN_OUTLINE = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
const MODAL_WRAP    = "fixed inset-0 z-50 flex items-center justify-center p-4"
const MODAL_BACK    = "absolute inset-0 bg-black/30 backdrop-blur-sm"
const MODAL_CARD    = "relative bg-white rounded-2xl shadow-2xl w-full border border-gray-100"
const MODAL_HEAD    = "flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0"
const MODAL_FOOT    = "flex items-center justify-end gap-2.5 px-6 py-4 border-t border-gray-100 bg-gray-50/70 rounded-b-2xl shrink-0"
const MODAL_X       = "p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"

const METHODS = ["cash", "esewa", "khalti", "bank_transfer", "card", "cheque"]

// Options for the "All payments" filter dropdown
const TYPE_OPTIONS = [
  { value: "all",     label: "All payments" },
  { value: "payment", label: "Payments only" },
  { value: "bill",    label: "Paid with bill" },
]

// Lowercase, turn every character that is not a letter or digit into a space, collapse spaces
function normalizeText(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

// Punctuation-insensitive match (same helper as Sales Return / Payment In / POS).
// Dashes, dots, brackets and commas are ignored on both sides; every word typed must
// appear in the text, OR the typed characters (without spaces) must appear in the text
// (without spaces).
function matchesSearch(haystackRaw, query) {
  const tokens = normalizeText(query).split(" ").filter(Boolean)
  if (!tokens.length) return true
  const hay = normalizeText(haystackRaw)
  if (tokens.every(t => hay.includes(t))) return true
  return hay.replace(/ /g, "").includes(tokens.join(""))
}

// Focus ring (inline styles can't do :focus, so it's done here once)
const FocusStyle = () => (
  <style>{`
    .po-page input:focus, .po-page select:focus {
      border-color: #84cc16 !important;
      box-shadow: 0 0 0 3px #ecfccb;
    }
    .po-page .po-trigger:focus {
      outline: none;
      border-color: #84cc16 !important;
      box-shadow: 0 0 0 2px rgba(163,230,53,0.4);
    }
    .po-page .po-trigger:hover { background: #f9fafb; }
    .po-page .po-option:hover { background: #f9fafb; }
  `}</style>
)

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
  const [showForm,    setShowForm]    = useState(false)  // the "Make Payment" popup
  const [rows,        setRows]        = useState([])   // merged: real payments + paid-with-bill
  const [suppliers,   setSuppliers]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState("")
  const [typeFilter,  setTypeFilter]  = useState("all") // all | payment | bill
  const [typeOpen,    setTypeOpen]    = useState(false)  // "All payments" dropdown open state
  const [selected,    setSelected]    = useState(null)  // a row from `rows`

  // Popup form state
  const [suppOpen,    setSuppOpen]    = useState(false)
  const [suppSearch,  setSuppSearch]  = useState("")
  const [selSupplier, setSelSupplier] = useState(null)
  const [amount,      setAmount]      = useState("")
  const [method,      setMethod]      = useState("cash")
  const [payDate,     setPayDate]     = useState(new Date().toISOString().split("T")[0])
  const [reference,   setReference]   = useState("")
  const [notes,       setNotes]       = useState("")
  const [saving,      setSaving]      = useState(false)
  const pickerRef = useRef(null)
  const typeRef = useRef(null)

  useEffect(() => { if (storeId) loadAll() }, [storeId])

  // Close the supplier list / type dropdown when clicking anywhere outside them
  useEffect(() => {
    function onClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setSuppOpen(false)
      if (typeRef.current && !typeRef.current.contains(e.target)) setTypeOpen(false)
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

  function openForm() {
    setSelSupplier(null); setAmount(""); setReference(""); setNotes("")
    setMethod("cash"); setSuppSearch(""); setSuppOpen(false)
    setPayDate(new Date().toISOString().split("T")[0])
    setShowForm(true)
  }

  function toggleSuppList() {
    setSuppOpen(o => !o)
    setSuppSearch("")
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
      setShowForm(false)
      loadAll()
    } catch(e) {
      toast.error(e.response?.data?.detail || e.message)
    } finally {
      setSaving(false)
    }
  }

  // Suppliers with a payable only; search ignores punctuation
  const filteredSupps = suppliers.filter(s =>
    (s.balance || 0) > 0 && matchesSearch(`${s.name || ""} ${s.phone || ""}`, suppSearch)
  )

  // List search: ignores punctuation, so "BILL-2026-0222", "bill 2026 0222" and "bill20260222" all match.
  // Searches the supplier name, phone, the receipt / bill number (raw and short form).
  const shown = rows.filter(r => {
    if (typeFilter === "payment" && r.kind !== "payment") return false
    if (typeFilter === "bill" && r.kind !== "bill") return false
    return matchesSearch(
      `${r.supplierName || ""} ${r.supplierPhone || ""} ${r.rawNumber} ${r.number}`,
      search
    )
  })
  const totalPaid = shown.reduce((s, r) => s + r.amount, 0)

  const selectedSupplierBalance = selected
    ? (suppliers.find(s => s.id === selected.supplierId)?.balance || 0)
    : 0

  const typeLabel = TYPE_OPTIONS.find(o => o.value === typeFilter)?.label || "All payments"

  return (
    <div className="po-page" style={{ padding: 24 }}>
      <FocusStyle />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
        <h1 style={{ fontSize:24, fontWeight:700, color:DARK }}>
          Payment Out <span style={{ fontSize:14, fontWeight:400, color:MUTED }}>({shown.length})</span>
        </h1>
        <button onClick={openForm} style={btn(true)}>
          <Plus size={14}/> Create Payment Out
        </button>
      </div>

      {/* Summary + search row */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <div style={{ position:"relative", width:300 }}>
          <Search size={13} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:MUTED }}/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier, receipt or bill no..." style={{ ...inp, paddingLeft:34 }}/>
        </div>

        {/* "All payments" custom dropdown — same look as the inventory / sales filter menus */}
        <div ref={typeRef} style={{ position:"relative", width:180 }}>
          <button
            type="button"
            className="po-trigger"
            onClick={() => setTypeOpen(o => !o)}
            style={{
              width:"100%", boxSizing:"border-box",
              display:"flex", alignItems:"center", justifyContent:"space-between", gap:8,
              padding:"8px 12px 8px 14px", fontSize:14, textAlign:"left", cursor:"pointer",
              color:"#374151", background:"#fff", borderRadius:8,
              border:`1px solid ${typeOpen ? "#84cc16" : BORDER}`,
              boxShadow: typeOpen ? "0 0 0 2px rgba(163,230,53,0.4)" : "none",
              transition:"background 0.15s, border-color 0.15s",
            }}
          >
            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{typeLabel}</span>
            <ChevronDown size={14} style={{ color:"#9ca3af", flexShrink:0, transition:"transform 0.15s", transform: typeOpen ? "rotate(180deg)" : "none" }}/>
          </button>

          {typeOpen && (
            <div style={{
              position:"absolute", top:"100%", left:0, marginTop:6, width:"100%", minWidth:176, zIndex:30,
              background:"#fff", border:"1px solid #f3f4f6", borderRadius:12,
              boxShadow:"0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
              padding:"6px 0",
            }}>
              <p style={{ padding:"6px 16px 4px", margin:0, fontSize:10, fontWeight:600, color:"#9ca3af",
                textTransform:"uppercase", letterSpacing:"0.05em" }}>
                Type
              </p>
              {TYPE_OPTIONS.map(o => {
                const active = typeFilter === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    className="po-option"
                    onClick={() => { setTypeFilter(o.value); setTypeOpen(false) }}
                    style={{
                      display:"flex", alignItems:"center", justifyContent:"space-between", gap:12,
                      width:"100%", textAlign:"left", padding:"8px 16px", fontSize:14, cursor:"pointer",
                      border:"none", color: active ? DARK : "#374151",
                      background: active ? LIME_SOFT : "transparent",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{o.label}</span>
                    {active && <Check size={14} style={{ color:"#65a30d", flexShrink:0 }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ marginLeft:"auto", fontSize:12, color:GRAY }}>
          Total paid: <strong style={{ color:DARK }}>{fmt(totalPaid)}</strong>
        </div>
      </div>

      <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:12, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${BORDER}`, background:LIGHT }}>
              {["Receipt / Bill No","Date","Supplier","Amount","Mode","Reference","Notes"].map(h => (
                <th key={h} style={{ padding:"13px 16px", textAlign:"left", fontSize:11, fontWeight:600, color:GRAY, textTransform:"uppercase", letterSpacing:"0.05em", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign:"center", padding:40 }}>
                <div style={{ width:20, height:20, border:`2px solid ${NAVY}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto" }}/>
              </td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign:"center", padding:50 }}>
                <p style={{ fontSize:13, color:MUTED, marginBottom:10 }}>
                  {rows.length === 0 ? "No payments recorded yet" : "No payments match your filters"}
                </p>
                {rows.length === 0 && (
                  <button onClick={openForm} style={btn(true)}><Plus size={13}/> Create first payment out</button>
                )}
              </td></tr>
            ) : shown.map(r => (
              <tr key={r.kind + r.id} style={{ borderBottom:"1px solid #f1f5f9", cursor:"pointer" }}
                onClick={() => setSelected(r)}
                onMouseEnter={e => e.currentTarget.style.background = LIME_SOFT}
                onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                <td style={{ padding:"13px 16px", whiteSpace:"nowrap" }}>
                  <p style={{ fontSize:13, fontWeight:600, color:DARK }}>{r.number || "—"}</p>
                  {r.kind === "bill" && <p style={{ fontSize:11, color:MUTED }}>Paid with bill</p>}
                </td>
                <td style={{ padding:"13px 16px" }}>
                  <p style={{ fontSize:13, color:"#334155" }}>{formatAD(r.date)}</p>
                  <p style={{ fontSize:11, color:MUTED }}>{formatBS(r.date)}</p>
                </td>
                <td style={{ padding:"13px 16px" }}>
                  <p style={{ fontSize:13, fontWeight:600, color:DARK }}>{r.supplierName || "Direct purchase"}</p>
                  {r.supplierPhone && <p style={{ fontSize:11, color:MUTED }}>{r.supplierPhone}</p>}
                </td>
                <td style={{ padding:"13px 16px", fontSize:13, fontWeight:700, color:DARK }}>{fmt(r.amount)}</td>
                <td style={{ padding:"13px 16px" }}>
                  {r.mode ? (
                    <span style={{ fontSize:11, fontWeight:500, padding:"3px 9px", borderRadius:999, background:LIME_PILL, color:"#3f6212", textTransform:"capitalize" }}>
                      {r.mode}
                    </span>
                  ) : <span style={{ fontSize:12, color:MUTED }}>—</span>}
                </td>
                <td style={{ padding:"13px 16px", fontSize:12, color:GRAY }}>{r.reference || "—"}</td>
                <td style={{ padding:"13px 16px", fontSize:12, color:GRAY }}>{r.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Make Payment popup */}
      {showForm && (
        <div className={MODAL_WRAP}>
          <div onClick={() => setShowForm(false)} className={MODAL_BACK} />
          <div className={`${MODAL_CARD} max-w-xl max-h-[90vh] flex flex-col`}>
            <div className={MODAL_HEAD}>
              <h2 className="text-base font-semibold text-gray-900">Make Payment</h2>
              <button onClick={() => setShowForm(false)} className={MODAL_X}><X size={18} /></button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto slim-scroll px-6 py-5 space-y-4">

              {/* Supplier picker: opens inline below the field, same as Receive Payment */}
              <div ref={pickerRef} className="space-y-3">
                <div>
                  <label className={T_LABEL}>Supplier</label>
                  <button type="button" onClick={toggleSuppList}
                    className={`${T_FIELD} flex items-center justify-between text-left cursor-pointer ${suppOpen ? "!border-lime-500 ring-2 ring-lime-400/40" : ""}`}>
                    <span className={`truncate ${selSupplier ? "font-medium text-gray-900" : "text-gray-400"}`}>
                      {selSupplier ? selSupplier.name : "Search for supplier with payable"}
                    </span>
                    <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${suppOpen ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {suppOpen && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                    <div className="p-3 border-b border-gray-100 bg-white">
                      <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input autoFocus value={suppSearch} onChange={e => setSuppSearch(e.target.value)}
                          placeholder="Type name or phone…" className={`${T_FIELD} pl-9`} />
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto slim-scroll bg-white divide-y divide-gray-50">
                      {filteredSupps.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-gray-400">
                          {suppSearch.trim() ? "No suppliers found" : "No suppliers with outstanding payable"}
                        </p>
                      ) : filteredSupps.map(s => {
                        const active = selSupplier?.id === s.id
                        return (
                          <button key={s.id} type="button" onClick={() => pickSupplier(s)}
                            className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                              active ? "bg-lime-50/70" : "hover:bg-gray-50"
                            }`}>
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-gray-900 truncate">{s.name}</p>
                              {s.phone && <p className="text-[11px] text-gray-400">{s.phone}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[13px] font-semibold text-red-600 tabular-nums">{fmt(s.balance)}</span>
                              {active && <Check size={14} className="text-lime-600" />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {selSupplier && (
                <>
                  <div className="px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl inline-block">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Current payable</p>
                    <p className={`text-lg font-bold tabular-nums ${currentBalance > 0 ? "text-red-600" : "text-gray-900"}`}>
                      {fmt(currentBalance)}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={T_LABEL}>Amount paid (Rs)</label>
                      <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                        placeholder="0" className={`${T_FIELD} no-spin font-bold`} />
                      {currentBalance > 0 && (
                        <button onClick={() => setAmount(String(currentBalance))}
                          className="text-[11px] text-lime-700 hover:text-lime-800 hover:underline mt-1.5">
                          Full amount: {fmt(currentBalance)}
                        </button>
                      )}
                    </div>
                    <div>
                      <label className={T_LABEL}>Payment date</label>
                      <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={T_FIELD} />
                      <p className="text-[11px] text-gray-400 mt-1.5">{formatBS(payDate)}</p>
                    </div>
                    <div>
                      <label className={T_LABEL}>Payment mode</label>
                      <div className="relative">
                        <select value={method} onChange={e => setMethod(e.target.value)}
                          className={`${T_FIELD} appearance-none pr-9 cursor-pointer capitalize`}>
                          {METHODS.map(x => <option key={x} value={x}>{x.replace("_", " ")}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={T_LABEL}>Reference (optional)</label>
                      <input value={reference} onChange={e => setReference(e.target.value)}
                        placeholder="Cheque no / txn ID" className={T_FIELD} />
                    </div>
                    <div>
                      <label className={T_LABEL}>Notes (optional)</label>
                      <input value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="Any remark" className={T_FIELD} />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={MODAL_FOOT}>
              <button onClick={() => setShowForm(false)} className={T_BTN_OUTLINE}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !selSupplier || payAmt <= 0} className={T_BTN_DARK}>
                {saving ? "Saving…" : payAmt > 0 ? `Pay ${fmt(payAmt)}` : "Make Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

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