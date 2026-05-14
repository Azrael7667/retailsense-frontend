import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, BookOpen } from "lucide-react"
import toast from "react-hot-toast"
import Modal from "../../components/common/Modal"

export default function Khata() {
  const { storeId } = useStoreId()
  const [partyType, setPartyType] = useState("customer")
  const [parties,   setParties]   = useState([])
  const [selected,  setSelected]  = useState(null)
  const [entries,   setEntries]   = useState([])
  const [balance,   setBalance]   = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [form,      setForm]      = useState({ entry_type: "debit", amount: "", description: "", entry_date: new Date().toISOString().split("T")[0] })

  useEffect(() => { if (storeId) loadParties() }, [storeId, partyType])
  useEffect(() => { if (selected) loadEntries() }, [selected])

  async function loadParties() {
    const tbl = partyType === "customer" ? "customers" : "suppliers"
    const { data } = await supabase.from(tbl).select("id, name, balance").eq("store_id", storeId).order("name")
    setParties(data || [])
    setSelected(null); setEntries([])
  }

  async function loadEntries() {
    const { data } = await supabase.from("khata_entries")
      .select("*").eq("store_id", storeId).eq("party_id", selected.id).order("entry_date", { ascending: false })
    setEntries(data || [])
    const bal = (data||[]).reduce((s,e) => s + (e.entry_type==="debit" ? e.amount : -e.amount), 0)
    setBalance(bal)
  }

  async function addEntry() {
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error("Enter a valid amount")
    const { error } = await supabase.from("khata_entries").insert({
      store_id: storeId, party_type: partyType, party_id: selected.id,
      entry_type: form.entry_type, amount: parseFloat(form.amount),
      description: form.description, entry_date: form.entry_date,
    })
    if (error) return toast.error(error.message)
    // Update party balance
    const tbl = partyType === "customer" ? "customers" : "suppliers"
    const delta = form.entry_type === "debit" ? parseFloat(form.amount) : -parseFloat(form.amount)
    await supabase.from(tbl).update({ balance: (selected.balance||0) + delta }).eq("id", selected.id)
    toast.success("Entry added"); setShowModal(false)
    setForm({ entry_type:"debit", amount:"", description:"", entry_date: new Date().toISOString().split("T")[0] })
    loadParties(); loadEntries()
  }

  const fmt = (n) => "Rs " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

  return (
    <div className="flex h-full">
      {/* Left: party list */}
      <div className="w-72 shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <h1 className="text-base font-bold text-gray-900 dark:text-white mb-3">Khata / Udharo</h1>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            {["customer","supplier"].map(t => (
              <button key={t} onClick={() => setPartyType(t)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${partyType===t?"bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm":"text-gray-500"}`}>
                {t}s
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {parties.map(p => (
            <div key={p.id} onClick={() => setSelected(p)}
              className={`flex items-center justify-between px-4 py-3 cursor-pointer border-b border-gray-50 dark:border-gray-800 ${selected?.id===p.id?"bg-orange-50 dark:bg-orange-950 border-l-2 border-l-orange-500":"hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                  <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{p.name[0].toUpperCase()}</span>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</span>
              </div>
              <span className={`text-xs font-bold ${(p.balance||0)>0?"text-red-500":"text-green-600"}`}>
                {(p.balance||0)!==0 ? fmt(Math.abs(p.balance||0)) : "Clear"}
              </span>
            </div>
          ))}
          {parties.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-center p-4">
              <BookOpen size={28} className="text-gray-200 dark:text-gray-700 mb-2" />
              <p className="text-sm text-gray-400">No {partyType}s found</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: ledger */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full">
            <BookOpen size={56} className="text-gray-200 dark:text-gray-700 mb-4" />
            <p className="text-gray-400">Select a {partyType} to view their ledger</p>
          </div>
        ) : (
          <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selected.name}</h2>
                <p className="text-sm text-gray-400 capitalize">{partyType} ledger</p>
              </div>
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg">
                <Plus size={15} /> Add entry
              </button>
            </div>

            {/* Balance summary */}
            <div className={`rounded-xl p-5 mb-4 border ${balance>0?"bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800":"bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"}`}>
              <p className="text-xs text-gray-500 mb-1">Current balance</p>
              <p className={`text-2xl font-bold ${balance>0?"text-red-600 dark:text-red-400":"text-green-600 dark:text-green-400"}`}>
                {fmt(Math.abs(balance))}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {balance > 0 ? `${partyType === "customer" ? "They owe you" : "You owe them"}` : "Account is clear"}
              </p>
            </div>

            {/* Entries */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>{["Date","Description","Debit","Credit"].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {entries.length===0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-400">No entries yet</td></tr>
                  ) : entries.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3 text-gray-500">{e.entry_date}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{e.description||"—"}</td>
                      <td className="px-4 py-3 font-medium text-red-500">{e.entry_type==="debit"?fmt(e.amount):"—"}</td>
                      <td className="px-4 py-3 font-medium text-green-600">{e.entry_type==="credit"?fmt(e.amount):"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add khata entry">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Entry type</label>
            <div className="flex gap-2">
              {[{val:"debit",label:"Debit (they owe you)"},{val:"credit",label:"Credit (you received)"}].map(t=>(
                <button key={t.val} onClick={() => setForm({...form, entry_type:t.val})}
                  className={`flex-1 py-2 text-sm rounded-lg border font-medium transition-colors ${form.entry_type===t.val?"border-orange-500 bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400":"border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (Rs) *</label>
            <input type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00" min="0"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="e.g. Payment received, Goods sold on credit…"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input type="date" value={form.entry_date} onChange={e=>setForm({...form,entry_date:e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300">Cancel</button>
          <button onClick={addEntry} className="px-6 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium">Add entry</button>
        </div>
      </Modal>
    </div>
  )
}
