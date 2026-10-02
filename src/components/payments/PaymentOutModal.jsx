import { useState } from "react"
import apiClient from "../../lib/apiClient"
import { formatBS } from "../../utils/dateHelpers"
import { X } from "lucide-react"
import toast from "react-hot-toast"

const fmt = (n) => "Rs " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

// ---- Shared theme classes (navy + soft lime, same as the rest of the app) ----
const PRIMARY_BTN = "bg-slate-900 hover:bg-slate-800 text-white dark:bg-lime-300 dark:hover:bg-lime-400 dark:text-slate-900"
const INPUT = "w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-200 dark:focus:ring-lime-900 transition-all"
const LABEL = "block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5"

export default function PaymentOutModal({ storeId, supplier, onClose, onSaved }) {
  const [amount,    setAmount]    = useState("")
  const [method,    setMethod]    = useState("cash")
  const [payDate,   setPayDate]   = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes,     setNotes]     = useState("")
  const [saving,    setSaving]    = useState(false)

  const payAmt = parseFloat(amount) || 0
  const currentBalance = supplier.balance || 0

  async function handleSave() {
    if (payAmt <= 0) return toast.error("Enter a valid amount")
    setSaving(true)
    try {
      await apiClient.post("/api/payments-out/", {
        supplier_id: supplier.id,
        payment_date: payDate,
        amount: payAmt,
        payment_method: method,
        reference: reference || null,
        notes: notes || null,
      })
      toast.success(`Payment of ${fmt(payAmt)} recorded`)
      onSaved?.()
    } catch(e) {
      toast.error(e.response?.data?.detail || e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <style>{`@keyframes cardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose}/>
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-800"
        style={{ animation: "cardIn 0.2s ease-out both" }}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Add Payment Out — {supplier.name}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={18}/></button>
        </div>

        <div className="p-6">
          {/* Current balance: soft lime card, red amount when money is owed */}
          <div className="p-3.5 bg-lime-50 dark:bg-lime-950/30 border border-lime-200 dark:border-lime-900 rounded-xl mb-5">
            <p className="text-xs text-gray-500 dark:text-gray-400">Current balance</p>
            <p className={`text-lg font-bold tabular-nums ${currentBalance > 0 ? "text-red-500" : "text-slate-900 dark:text-white"}`}>
              {fmt(currentBalance)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={LABEL}>Amount paid (Rs)</label>
              <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
                className={`${INPUT} no-spin !text-base font-bold`} />
              {currentBalance > 0 && (
                <button onClick={() => setAmount(String(currentBalance))}
                  className="text-xs text-lime-700 dark:text-lime-400 hover:text-lime-800 dark:hover:text-lime-300 hover:underline mt-1.5 transition-colors">
                  Full amount: {fmt(currentBalance)}
                </button>
              )}
            </div>
            <div>
              <label className={LABEL}>Date</label>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={INPUT} />
              <p className="text-xs text-gray-400 mt-1.5">{formatBS(payDate)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={LABEL}>Payment mode</label>
              <select value={method} onChange={e => setMethod(e.target.value)} className={`${INPUT} capitalize cursor-pointer`}>
                {["cash","esewa","khalti","bank_transfer","card","cheque"].map(x => (
                  <option key={x} value={x}>{x.replace("_"," ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Reference (optional)</label>
              <input value={reference} onChange={e => setReference(e.target.value)} placeholder="Cheque no / txn ID" className={INPUT} />
            </div>
          </div>

          <div>
            <label className={LABEL}>Remarks (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Enter remarks here..." className={INPUT} />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900 rounded-b-2xl">
          <button onClick={onClose}
            className="px-5 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-full bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || payAmt <= 0}
            className={`px-6 py-2 text-sm rounded-full font-semibold active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 ${PRIMARY_BTN}`}>
            {saving ? "Saving…" : payAmt > 0 ? `Pay ${fmt(payAmt)}` : "Pay Supplier"}
          </button>
        </div>
      </div>
    </div>
  )
}