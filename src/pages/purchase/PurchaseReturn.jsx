import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Search, ChevronDown, X, Trash2, Check } from "lucide-react"
import toast from "react-hot-toast"
import { confirmDialog } from "../../components/common/ConfirmDialog"

// ---- Theme (new palette: navy + soft lime) ----
const NAVY="#0f172a",          // primary buttons, spinner, links
      DARK="#0f172a",          // main text
      GRAY="#64748b",
      MUTED="#94a3b8",
      BORDER="#e5e7eb",
      LIGHT="#f8fafc",
      RED="#dc2626",
      LIME_SOFT="#f7fee7"      // row hover (lime-50)

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
const r2  = (n) => Math.round((Number(n)||0) * 100) / 100

const inp = { width:"100%", padding:"10px 14px", fontSize:13, border:`1px solid ${BORDER}`,
              borderRadius:10, outline:"none", color:DARK, background:"#fff", boxSizing:"border-box" }
const btn = (primary) => ({ display:"inline-flex", alignItems:"center", gap:6, padding:"10px 16px",
  fontSize:13, fontWeight:600, borderRadius:10, cursor:"pointer",
  background: primary?NAVY:"#fff", color: primary?"#fff":DARK,
  border: primary?"none":`1px solid ${BORDER}` })

// ---- Tailwind classes for the "Create Purchase Return" popup (same look as Create Sales Return) ----
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
const TH_SM         = "px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"

// Lowercase, turn every character that is not a letter or digit into a space, collapse spaces
function normalizeText(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

// Punctuation-insensitive match (same helper as Sales Return / Payment In / Payment Out).
// Dashes, dots, brackets and commas are ignored on both sides; every word typed must
// appear in the text, OR the typed characters (without spaces) must appear in the text
// (without spaces), so "PR-2026-0002", "pr 2026 0002" and "pr20260002" all match.
function matchesSearch(haystackRaw, query) {
  const tokens = normalizeText(query).split(" ").filter(Boolean)
  if (!tokens.length) return true
  const hay = normalizeText(haystackRaw)
  if (tokens.every(t => hay.includes(t))) return true
  return hay.replace(/ /g, "").includes(tokens.join(""))
}

// Focus ring for the inline-styled list page and detail popup
const FocusStyle = () => (
  <style>{`
    .pr-page input:focus, .pr-page select:focus {
      border-color: #84cc16 !important;
      box-shadow: 0 0 0 3px #ecfccb;
    }
  `}</style>
)

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
    const ok = await confirmDialog({
      title: "Delete this return?",
      message: "The goods are added back to your stock and the supplier's payable is restored.",
      confirmText: "Delete",
      variant: "danger",
    })
    if (!ok) return

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
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(15,23,42,0.5)" }}/>
      <div style={{ position:"relative", background:"#fff", borderRadius:16, width:"100%", maxWidth:640, maxHeight:"90vh",
        overflowY:"auto", border:`1px solid ${BORDER}`, boxShadow:"0 24px 48px rgba(15,23,42,0.20)" }}>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", borderBottom:`1px solid ${BORDER}` }}>
          <h2 style={{ fontSize:20, fontWeight:700, color:DARK }}>Purchase Return</h2>
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
            <div style={{ border:`1px solid ${BORDER}`, borderRadius:12, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:LIGHT }}>
                    {["Item","Qty","Net Rate","Amount"].map((h, i) => (
                      <th key={h} style={{ padding:"10px 12px", textAlign: i===0?"left":"right", fontSize:11, fontWeight:600, color:GRAY, textTransform:"uppercase", letterSpacing:"0.05em" }}>{h}</th>
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
                      <td style={{ padding:"11px 12px", fontWeight:500, color:DARK }}>{it.product_name}</td>
                      <td style={{ padding:"11px 12px", textAlign:"right" }}>{it.quantity_returned}</td>
                      <td style={{ padding:"11px 12px", textAlign:"right" }}>{fmt(it.unit_price)}</td>
                      <td style={{ padding:"11px 12px", textAlign:"right", fontWeight:600 }}>{fmt(it.line_return_amount)}</td>
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
            <div style={{ ...box, minHeight:48, background:LIGHT, color: ret.reason ? "#334155" : MUTED }}>
              {ret.reason || "No reason given"}
            </div>
          </div>
          <p style={{ fontSize:12.5, color:MUTED }}>Created by: {ret.created_by_name || "—"}</p>
        </div>

        <div style={{ display:"flex", alignItems:"center", padding:"16px 24px", borderTop:`1px solid ${BORDER}`, background:LIGHT, borderRadius:"0 0 16px 16px" }}>
          <button onClick={handleDelete} disabled={deleting}
            style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 16px", borderRadius:10, border:"1px solid #fecaca",
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
  const [showForm,  setShowForm]  = useState(false)   // the "Create Purchase Return" popup
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
  const [billOpen,   setBillOpen]   = useState(false)
  const [billSearch, setBillSearch] = useState("")
  const [selBillId,  setSelBillId]  = useState("")
  const [supplierBalance, setSupplierBalance] = useState(0)
  const [lines,      setLines]      = useState([])
  const [linesLoading, setLinesLoading] = useState(false)
  const [retDate,    setRetDate]    = useState(new Date().toISOString().split("T")[0])
  const [reason,     setReason]     = useState("")
  const [saving,     setSaving]     = useState(false)
  const pickerRef = useRef(null)

  useEffect(() => { if (storeId) loadAll() }, [storeId])

  // Close the supplier / bill lists when clicking anywhere outside them
  useEffect(() => {
    function onClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setSuppOpen(false)
        setBillOpen(false)
      }
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
    setSuppSearch(""); setSuppOpen(false)
    setBillSearch(""); setBillOpen(false)
  }

  function openForm()  { resetForm(); setShowForm(true) }
  function closeForm() { resetForm(); setShowForm(false) }

  function toggleSuppList() {
    setSuppOpen(o => !o)
    setBillOpen(false)
    setSuppSearch("")
  }
  function toggleBillList() {
    setBillOpen(o => !o)
    setSuppOpen(false)
    setBillSearch("")
  }

  async function pickSupplier(s) {
    setSelSupp(s); setSuppOpen(false); setSuppSearch("")
    setSelBillId(""); setLines([]); setSupplierBalance(0)
    setBillSearch(""); setBillOpen(false)
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
    setBillOpen(false); setBillSearch("")
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
      closeForm()
      loadAll()
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message)
    } finally {
      setSaving(false)
    }
  }

  // Supplier search: punctuation-insensitive on name and phone
  const filteredSupps = suppliers.filter(s =>
    matchesSearch(`${s.name || ""} ${s.phone || ""}`, suppSearch)
  )

  // Bill search: punctuation-insensitive on bill number (short and full), date and amount
  const filteredBills = bills.filter(b =>
    matchesSearch(
      `${shortDocNumber(b.bill_number, b.purchase_date)} ${b.bill_number || ""} ` +
      `${formatAD(b.purchase_date)} ${b.purchase_date || ""} ${b.total ?? ""} ${fmt(b.total)}`,
      billSearch
    )
  )

  const selBill = bills.find(b => b.id === selBillId)
  const selBillLabel = selBill
    ? `${shortDocNumber(selBill.bill_number, selBill.purchase_date) || "No bill no"} · ${formatAD(selBill.purchase_date)} · ${fmt(selBill.total)}`
    : ""
  const billDisabled = !selSupp || billsLoading

  // List search: punctuation-insensitive on supplier, return number and bill number
  const filteredRets = returns.filter(r =>
    matchesSearch(
      `${r.suppliers?.name || ""} ${r.suppliers?.phone || ""} ${r.return_number || ""} ` +
      `${shortDocNumber(r.return_number, r.return_date)} ${r.purchases?.bill_number || ""} ${billNoOf(r)}`,
      search
    )
  )
  const totalReturned = filteredRets.reduce((s, r) => s + (r.total_return_amount || 0), 0)

  return (
    <div className="pr-page" style={{ padding:24 }}>
      <FocusStyle />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
        <h1 style={{ fontSize:24, fontWeight:700, color:DARK }}>
          Purchase Return <span style={{ fontSize:14, fontWeight:400, color:MUTED }}>({filteredRets.length})</span>
        </h1>
        <button onClick={openForm} style={btn(true)}>
          <Plus size={14}/> Create Purchase Return
        </button>
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <div style={{ position:"relative", width:300 }}>
          <Search size={13} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:MUTED }}/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier, return or bill no..." style={{ ...inp, paddingLeft:34 }}/>
        </div>
        <div style={{ marginLeft:"auto", fontSize:12, color:GRAY }}>
          Total returned: <strong style={{ color:DARK }}>{fmt(totalReturned)}</strong>
        </div>
      </div>

      <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:12, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${BORDER}`, background:LIGHT }}>
              {["Return No","Date","Supplier","Bill No","Returned","Reduced Payable","Cash Refunded","Reason"].map(h => (
                <th key={h} style={{ padding:"13px 16px", textAlign:"left", fontSize:11, fontWeight:600, color:GRAY, textTransform:"uppercase", letterSpacing:"0.05em", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign:"center", padding:40 }}>
                <div style={{ width:20, height:20, border:`2px solid ${NAVY}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto" }}/>
              </td></tr>
            ) : filteredRets.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign:"center", padding:50 }}>
                <p style={{ fontSize:13, color:MUTED, marginBottom:10 }}>
                  {returns.length === 0 ? "No purchase returns yet" : "No returns match your search"}
                </p>
                {returns.length === 0 && (
                  <button onClick={openForm} style={btn(true)}><Plus size={13}/> Create first purchase return</button>
                )}
              </td></tr>
            ) : filteredRets.map(r => (
              <tr key={r.id} style={{ borderBottom:"1px solid #f1f5f9", cursor:"pointer" }}
                onClick={() => setSelected(r)}
                onMouseEnter={e => e.currentTarget.style.background = LIME_SOFT}
                onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                <td style={{ padding:"13px 16px", fontSize:13, fontWeight:600, color:DARK, whiteSpace:"nowrap" }}>
                  {shortDocNumber(r.return_number, r.return_date) || "—"}
                </td>
                <td style={{ padding:"13px 16px" }}>
                  <p style={{ fontSize:13, color:"#334155" }}>{formatAD(r.return_date)}</p>
                  <p style={{ fontSize:11, color:MUTED }}>{formatBS(r.return_date)}</p>
                </td>
                <td style={{ padding:"13px 16px", fontSize:13, fontWeight:600, color:DARK }}>{r.suppliers?.name || "Direct purchase"}</td>
                <td style={{ padding:"13px 16px", fontSize:13, color:"#334155", whiteSpace:"nowrap" }}>{billNoOf(r) || "—"}</td>
                <td style={{ padding:"13px 16px", fontSize:13, fontWeight:700, color:DARK }}>{fmt(r.total_return_amount)}</td>
                <td style={{ padding:"13px 16px", fontSize:12, color:GRAY }}>{r.credit_applied_amount > 0 ? fmt(r.credit_applied_amount) : "—"}</td>
                <td style={{ padding:"13px 16px", fontSize:12, color:GRAY }}>{r.cash_refunded_amount > 0 ? fmt(r.cash_refunded_amount) : "—"}</td>
                <td style={{ padding:"13px 16px", fontSize:12, color:GRAY }}>{r.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Purchase Return popup */}
      {showForm && (
        <div className={MODAL_WRAP}>
          <div onClick={closeForm} className={MODAL_BACK} />
          <div className={`${MODAL_CARD} max-w-3xl max-h-[90vh] flex flex-col`}>
            <div className={MODAL_HEAD}>
              <h2 className="text-base font-semibold text-gray-900">Create Purchase Return</h2>
              <button onClick={closeForm} className={MODAL_X}><X size={18} /></button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto slim-scroll px-6 py-5 space-y-5">

              {/* Step 1: supplier + bill. Both lists open inline below the fields */}
              <div ref={pickerRef} className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={T_LABEL}>Supplier</label>
                    <button type="button" onClick={toggleSuppList}
                      className={`${T_FIELD} flex items-center justify-between text-left cursor-pointer ${suppOpen ? "!border-lime-500 ring-2 ring-lime-400/40" : ""}`}>
                      <span className={`truncate ${selSupp ? "font-medium text-gray-900" : "text-gray-400"}`}>
                        {selSupp ? selSupp.name : "Select supplier"}
                      </span>
                      <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${suppOpen ? "rotate-180" : ""}`} />
                    </button>
                  </div>

                  <div className="col-span-2">
                    <label className={T_LABEL}>Purchase bill</label>
                    <button type="button" onClick={toggleBillList} disabled={billDisabled}
                      className={`${T_FIELD} flex items-center justify-between text-left ${
                        billDisabled ? "cursor-not-allowed bg-gray-50" : "cursor-pointer"
                      } ${billOpen ? "!border-lime-500 ring-2 ring-lime-400/40" : ""}`}>
                      <span className={`truncate ${selBill ? "font-medium text-gray-900" : "text-gray-400"}`}>
                        {selBill
                          ? selBillLabel
                          : !selSupp ? "Select a supplier first"
                          : billsLoading ? "Loading…"
                          : bills.length ? "Select bill" : "No bills found"}
                      </span>
                      <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${billOpen ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                </div>

                {/* Inline supplier list */}
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
                      {!suppSearch.trim() && (
                        <button type="button" onClick={() => pickSupplier(DIRECT)}
                          className="w-full px-4 py-2.5 text-left text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                          Direct purchase / no supplier
                        </button>
                      )}
                      {filteredSupps.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-gray-400">No suppliers found</p>
                      ) : filteredSupps.map(s => (
                        <button key={s.id} type="button" onClick={() => pickSupplier(s)}
                          className="w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors">
                          <p className="text-[13px] font-medium text-gray-900">{s.name}</p>
                          {s.phone && <p className="text-[11px] text-gray-400">{s.phone}</p>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inline bill list with search */}
                {billOpen && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                    <div className="p-3 border-b border-gray-100 bg-white">
                      <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input autoFocus value={billSearch} onChange={e => setBillSearch(e.target.value)}
                          placeholder="Search bill no, date or amount…" className={`${T_FIELD} pl-9`} />
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto slim-scroll bg-white divide-y divide-gray-50">
                      {filteredBills.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-gray-400">No bills found</p>
                      ) : filteredBills.map(b => {
                        const active = b.id === selBillId
                        return (
                          <button key={b.id} type="button" onClick={() => pickBill(b.id)}
                            className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                              active ? "bg-lime-50/70" : "hover:bg-gray-50"
                            }`}>
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-gray-900">
                                {shortDocNumber(b.bill_number, b.purchase_date) || "No bill no"}
                              </p>
                              <p className="text-[11px] text-gray-400">
                                {formatAD(b.purchase_date)} · {formatBS(b.purchase_date)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[13px] font-medium text-gray-900 tabular-nums">{fmt(b.total)}</span>
                              {active && <Check size={14} className="text-lime-600" />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {selBillId && (
                <>
                  {/* Step 2: items */}
                  <div>
                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="overflow-x-auto slim-scroll">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className={`${TH_SM} text-left`}>Item</th>
                              <th className={`${TH_SM} text-right`}>Bought</th>
                              <th className={`${TH_SM} text-right`}>Can return</th>
                              <th className={`${TH_SM} text-right`}>Net rate</th>
                              <th className={`${TH_SM} text-right`}>Return qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {linesLoading ? (
                              <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">Loading items…</td></tr>
                            ) : lines.map((l, i) => (
                              <tr key={l.id} className={l.returnable <= 0 ? "opacity-50" : ""}>
                                <td className="px-4 py-3 font-medium text-gray-900">{l.product_name}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{l.quantity}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{l.returnable}</td>
                                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{fmt(l.net_price)}</td>
                                <td className="px-4 py-2 text-right">
                                  <div className="inline-flex items-center gap-2">
                                    <button type="button" onClick={() => updateLine(i, { qty: String(l.returnable) })} disabled={l.returnable <= 0}
                                      className="text-[11px] font-medium text-lime-700 hover:text-lime-800 hover:underline disabled:opacity-40">
                                      All
                                    </button>
                                    <input type="number" min="0" max={l.returnable} value={l.qty}
                                      disabled={l.returnable <= 0}
                                      onFocus={e => e.target.select()}
                                      onChange={e => updateLine(i, { qty: e.target.value })}
                                      placeholder="0"
                                      className={`${T_FIELD} no-spin !w-20 !py-1.5 text-right`} />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2">Returned goods are taken out of your stock.</p>
                  </div>

                  {/* Step 3: details + totals */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className={T_LABEL}>Return date</label>
                        <input type="date" value={retDate} onChange={e => setRetDate(e.target.value)} className={T_FIELD} />
                        <p className="text-[11px] text-gray-400 mt-1.5">{formatBS(retDate)}</p>
                      </div>
                      <div>
                        <label className={T_LABEL}>Reason (optional)</label>
                        <input value={reason} onChange={e => setReason(e.target.value)}
                          placeholder="e.g. Damaged, wrong part" className={T_FIELD} />
                      </div>
                    </div>

                    <div className="text-sm space-y-2 px-4 py-3 bg-lime-50/60 border border-lime-200 rounded-xl self-start">
                      <div className="flex justify-between items-center text-gray-500">
                        <span>Total returned</span>
                        <span className="text-base font-bold text-gray-900 tabular-nums">{fmt(totalReturn)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Reduces what you owe</span>
                        <span className="text-gray-900 tabular-nums">{fmt(creditApplied)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Cash refunded to you</span>
                        <span className="text-gray-900 tabular-nums">{fmt(cashRefunded)}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
                        The return first reduces everything you owe this supplier across all bills ({fmt(supplierBalance)} payable now). Anything beyond that is refunded to you in cash.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={MODAL_FOOT}>
              <button onClick={closeForm} className={T_BTN_OUTLINE}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !selBillId || totalReturn <= 0} className={T_BTN_DARK}>
                {saving ? "Saving…" : totalReturn > 0 ? `Return ${fmt(totalReturn)}` : "Create Return"}
              </button>
            </div>
          </div>
        </div>
      )}

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