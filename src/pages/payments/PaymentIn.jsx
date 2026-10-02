import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Search, X, ChevronDown, FileText, Check } from "lucide-react"
import toast from "react-hot-toast"
import PaymentDetailModal from "../../components/transactions/PaymentDetailModal"

const fmt = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

// Lowercase, turn every character that is not a letter or digit (dashes, dots, commas,
// slashes, brackets...) into a space, and collapse repeated spaces.
function normalizeText(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

// Punctuation-insensitive match (same helper as Sales Return). Every word typed must appear
// in the text, OR the typed characters (without spaces) must appear in the text (without spaces).
function matchesSearch(haystackRaw, query) {
  const tokens = normalizeText(query).split(" ").filter(Boolean)
  if (!tokens.length) return true
  const hay = normalizeText(haystackRaw)
  if (tokens.every(t => hay.includes(t))) return true
  return hay.replace(/ /g, "").includes(tokens.join(""))
}

// Shared styles (same look as Dashboard / Inventory / Customers / Sales)
const FIELD       = "w-full px-3.5 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 focus:border-lime-500 transition-colors"
const LABEL       = "block text-xs font-medium text-gray-700 mb-1.5"
const BTN_DARK    = "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50"
const BTN_OUTLINE = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
const MODAL_WRAP  = "fixed inset-0 z-50 flex items-center justify-center p-4"
const MODAL_BACK  = "absolute inset-0 bg-black/30 backdrop-blur-sm"
const MODAL_CARD  = "relative bg-white rounded-2xl shadow-2xl w-full border border-gray-100"
const MODAL_HEAD  = "flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0"
const MODAL_FOOT  = "flex items-center justify-end gap-2.5 px-6 py-4 border-t border-gray-100 bg-gray-50/70 rounded-b-2xl shrink-0"
const MODAL_X     = "p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
const TH          = "px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"

const METHODS = ["cash", "esewa", "khalti", "bank_transfer", "card", "cheque"]

function Spinner() {
  return <div className="w-5 h-5 border-2 border-lime-600 border-t-transparent rounded-full animate-spin mx-auto" />
}

// Maps a raw `payments` row to the event shape PaymentDetailModal expects
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

export default function PaymentIn() {
  const { storeId } = useStoreId()
  const [showForm,  setShowForm]  = useState(false)
  const [payments,  setPayments]  = useState([])
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState("")
  const [selected,  setSelected]  = useState(null)

  // Form state
  const [custOpen,    setCustOpen]    = useState(false)
  const [custSearch,  setCustSearch]  = useState("")
  const [selCustomer, setSelCustomer] = useState(null)
  const [amount,      setAmount]      = useState("")
  const [method,      setMethod]      = useState("cash")
  const [payDate,     setPayDate]     = useState(new Date().toISOString().split("T")[0])
  const [reference,   setReference]   = useState("")
  const [notes,       setNotes]       = useState("")
  const [saving,      setSaving]      = useState(false)
  const pickerRef = useRef(null)

  useEffect(() => { if (storeId) loadAll() }, [storeId])

  // Close the customer list when clicking anywhere outside it
  useEffect(() => {
    function onClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setCustOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: pays }, { data: custs }] = await Promise.all([
      supabase.from("payments")
        .select("*, customers(name, phone)")
        .eq("store_id", storeId)
        .order("payment_date", { ascending: false })
        .limit(500),
      supabase.from("customers")
        .select("id, name, phone, balance")
        .eq("store_id", storeId)
        .order("name"),
    ])
    setPayments(pays || [])
    setCustomers(custs || [])
    setLoading(false)
  }

  function openForm() {
    setSelCustomer(null); setAmount(""); setReference(""); setNotes("")
    setMethod("cash"); setCustSearch(""); setCustOpen(false)
    setPayDate(new Date().toISOString().split("T")[0])
    setShowForm(true)
  }

  function toggleCustList() {
    setCustOpen(o => !o)
    setCustSearch("")
  }

  function pickCustomer(c) {
    setSelCustomer(c)
    setCustOpen(false)
    setCustSearch("")
    setAmount("")
  }

  const payAmt = parseFloat(amount) || 0
  const currentBalance = selCustomer?.balance || 0

  async function handleSave() {
    if (!selCustomer) return toast.error("Select a customer")
    if (payAmt <= 0)  return toast.error("Enter a valid amount")
    setSaving(true)
    try {
      await apiClient.post("/api/payments/", {
        customer_id: selCustomer.id,
        payment_date: payDate,
        amount: payAmt,
        payment_method: method,
        reference: reference || null,
        notes: notes || null,
      })
      toast.success(`Payment of ${fmt(payAmt)} recorded`)
      setShowForm(false)
      loadAll()
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message)
    } finally {
      setSaving(false)
    }
  }

  // Customers with dues only; search is punctuation-insensitive on name and phone
  const filteredCusts = customers.filter(c =>
    c.balance > 0 && matchesSearch(`${c.name || ""} ${c.phone || ""}`, custSearch)
  )
  const filteredPays = payments.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.customers?.name?.toLowerCase().includes(q) ||
      (p.receipt_number || "").toLowerCase().includes(q) ||
      shortDocNumber(p.receipt_number, p.payment_date).toLowerCase().includes(q)
  })
  const totalReceived = filteredPays.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col gap-4 px-6 py-5 overflow-hidden">

      {/* Title + action */}
      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <h1 className="text-xl font-bold text-gray-900">
          Payment In <span className="text-base font-normal text-gray-400">({filteredPays.length})</span>
        </h1>
        <button onClick={openForm} className={BTN_DARK}>
          <Plus size={14} /> Receive Payment
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <div className="relative w-full max-w-xs">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search customer or receipt no…"
            className={`${FIELD} pl-9 ${search ? "pr-9" : "pr-3"}`} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Table card: fixed card, rows scroll inside it, header stays pinned */}
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto slim-scroll">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_0_#f3f4f6]">
              <tr>
                <th className={TH}>Receipt No</th>
                <th className={TH}>Date</th>
                <th className={TH}>Customer</th>
                <th className={`${TH} text-right`}>Amount</th>
                <th className={TH}>Mode</th>
                <th className={TH}>Reference</th>
                <th className={TH}>Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="py-16"><Spinner /></td></tr>
              ) : filteredPays.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                      <FileText size={24} className="text-gray-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">No payments recorded yet</p>
                    <button onClick={openForm} className={`${BTN_DARK} mt-4`}>
                      <Plus size={14} /> Receive first payment
                    </button>
                  </td>
                </tr>
              ) : filteredPays.map(p => (
                <tr key={p.id}
                  onClick={() => setSelected(p)}
                  className="cursor-pointer transition-colors hover:bg-gray-50/70">

                  <td className="px-5 py-4 whitespace-nowrap font-medium text-gray-900">
                    {shortDocNumber(p.receipt_number, p.payment_date) || "—"}
                  </td>

                  <td className="px-5 py-4 whitespace-nowrap">
                    <p className="text-[13px] text-gray-700">{formatAD(p.payment_date)}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{formatBS(p.payment_date)}</p>
                  </td>

                  <td className="px-5 py-4">
                    <p className="text-[13px] font-medium text-gray-900">{p.customers?.name || "—"}</p>
                    {p.customers?.phone && <p className="text-[11px] text-gray-400 mt-0.5">{p.customers.phone}</p>}
                  </td>

                  <td className="px-5 py-4 whitespace-nowrap text-right tabular-nums font-medium text-gray-900">
                    {fmt(p.amount)}
                  </td>

                  <td className="px-5 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 capitalize">
                      {p.payment_method?.replace("_", " ")}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-[13px] text-gray-500">
                    <span className="block max-w-[12rem] truncate" title={p.reference || ""}>
                      {p.reference || <span className="text-gray-400">—</span>}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-[13px] text-gray-500">
                    <span className="block max-w-[14rem] truncate" title={p.notes || ""}>
                      {p.notes || <span className="text-gray-400">—</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filteredPays.length > 0 && (
          <div className="shrink-0 px-5 py-2.5 border-t border-gray-100 bg-gray-50/70 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <p>
              Showing <span className="font-semibold text-gray-700">{filteredPays.length}</span> of{" "}
              <span className="font-semibold text-gray-700">{payments.length}</span> payments
            </p>
            <p>
              Total received:{" "}
              <span className="font-semibold text-gray-700 tabular-nums">{fmt(totalReceived)}</span>
            </p>
          </div>
        )}
      </div>

      {/* Receive Payment popup */}
      {showForm && (
        <div className={MODAL_WRAP}>
          <div onClick={() => setShowForm(false)} className={MODAL_BACK} />
          <div className={`${MODAL_CARD} max-w-xl max-h-[90vh] flex flex-col`}>
            <div className={MODAL_HEAD}>
              <h2 className="text-base font-semibold text-gray-900">Receive Payment</h2>
              <button onClick={() => setShowForm(false)} className={MODAL_X}><X size={18} /></button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto slim-scroll px-6 py-5 space-y-4">

              {/* Customer picker: opens inline below the field, same as Sales Return */}
              <div ref={pickerRef} className="space-y-3">
                <div>
                  <label className={LABEL}>Customer</label>
                  <button onClick={toggleCustList}
                    className={`${FIELD} flex items-center justify-between text-left cursor-pointer ${custOpen ? "!border-lime-500 ring-2 ring-lime-400/40" : ""}`}>
                    <span className={`truncate ${selCustomer ? "font-medium text-gray-900" : "text-gray-400"}`}>
                      {selCustomer ? selCustomer.name : "Search for customer with dues"}
                    </span>
                    <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${custOpen ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {/* Inline customer list */}
                {custOpen && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                    <div className="p-3 border-b border-gray-100 bg-white">
                      <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input autoFocus value={custSearch} onChange={e => setCustSearch(e.target.value)}
                          placeholder="Type name or phone…" className={`${FIELD} pl-9`} />
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto slim-scroll bg-white divide-y divide-gray-50">
                      {filteredCusts.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-gray-400">
                          {custSearch.trim() ? "No customers found" : "No customers with outstanding dues"}
                        </p>
                      ) : filteredCusts.map(c => {
                        const active = selCustomer?.id === c.id
                        return (
                          <button key={c.id} onClick={() => pickCustomer(c)}
                            className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                              active ? "bg-lime-50/70" : "hover:bg-gray-50"
                            }`}>
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-gray-900 truncate">{c.name}</p>
                              {c.phone && <p className="text-[11px] text-gray-400">{c.phone}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[13px] font-semibold text-red-600 tabular-nums">{fmt(c.balance)}</span>
                              {active && <Check size={14} className="text-lime-600" />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {selCustomer && (
                <>
                  <div className="px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl inline-block">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Current balance</p>
                    <p className={`text-lg font-bold tabular-nums ${currentBalance > 0 ? "text-red-600" : "text-gray-900"}`}>
                      {fmt(currentBalance)}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={LABEL}>Amount received (Rs)</label>
                      <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                        placeholder="0" className={`${FIELD} no-spin font-bold`} />
                      {currentBalance > 0 && (
                        <button onClick={() => setAmount(String(currentBalance))}
                          className="text-[11px] text-lime-700 hover:text-lime-800 hover:underline mt-1.5">
                          Full amount: {fmt(currentBalance)}
                        </button>
                      )}
                    </div>
                    <div>
                      <label className={LABEL}>Payment date</label>
                      <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={FIELD} />
                      <p className="text-[11px] text-gray-400 mt-1.5">{formatBS(payDate)}</p>
                    </div>
                    <div>
                      <label className={LABEL}>Payment mode</label>
                      <div className="relative">
                        <select value={method} onChange={e => setMethod(e.target.value)}
                          className={`${FIELD} appearance-none pr-9 cursor-pointer capitalize`}>
                          {METHODS.map(x => <option key={x} value={x}>{x.replace("_", " ")}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL}>Reference (optional)</label>
                      <input value={reference} onChange={e => setReference(e.target.value)}
                        placeholder="Receipt no / eSewa ID" className={FIELD} />
                    </div>
                    <div>
                      <label className={LABEL}>Notes (optional)</label>
                      <input value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="Any remark" className={FIELD} />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={MODAL_FOOT}>
              <button onClick={() => setShowForm(false)} className={BTN_OUTLINE}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !selCustomer || payAmt <= 0} className={BTN_DARK}>
                {saving ? "Saving…" : payAmt > 0 ? `Receive ${fmt(payAmt)}` : "Receive Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment detail popup */}
      {selected && (
        <PaymentDetailModal
          kind="payment"
          event={toEvent(selected)}
          partyLabel={selected.customers?.name || "—"}
          onClose={() => setSelected(null)}
          onDeleted={() => { setSelected(null); loadAll() }}
        />
      )}
    </div>
  )
}