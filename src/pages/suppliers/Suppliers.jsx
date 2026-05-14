import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Search, Truck, Edit2, Trash2 } from "lucide-react"
import Modal from "../../components/common/Modal"
import toast from "react-hot-toast"

const empty = { name: "", phone: "", email: "", address: "", pan_number: "" }

export default function Suppliers() {
  const { storeId, loading: storeLoading } = useStoreId()
  const [suppliers, setSuppliers] = useState([])
  const [selected,  setSelected]  = useState(null)
  const [search,    setSearch]    = useState("")
  const [showModal, setShowModal] = useState(false)
  const [form,      setForm]      = useState(empty)
  const [editing,   setEditing]   = useState(null)
  

  useEffect(() => { init() }, [])

  async function init() {
    if (!storeId) return
    
    
    load(storeId)
  }

  async function load(sid) {
    const { data } = await supabase.from("suppliers").select("*").eq("store_id", sid).order("name")
    setSuppliers(data || [])
    if (data?.length && !selected) setSelected(data[0])
  }

  const filtered = suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.phone?.includes(search))

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

  const fmt = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-bold text-gray-900 dark:text-white">Suppliers</h1>
            <button onClick={() => { setEditing(null); setForm(empty); setShowModal(true) }}
              className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg">
              <Plus size={14} /> Add
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map(s => (
            <div key={s.id} onClick={() => setSelected(s)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 dark:border-gray-800 ${selected?.id === s.id ? "bg-orange-50 dark:bg-orange-950 border-l-2 border-l-orange-500" : "hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
              <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{s.name[0].toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
                <p className="text-xs text-gray-400">{s.phone || "No phone"}</p>
              </div>
              {(s.balance || 0) > 0 && <span className="text-xs font-medium text-red-500">{fmt(s.balance)}</span>}
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

      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Truck size={56} className="text-gray-200 dark:text-gray-700 mb-4" />
            <p className="text-gray-400">Select a supplier to view details</p>
          </div>
        ) : (
          <div className="max-w-2xl">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{selected.name[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selected.name}</h2>
                    <p className="text-sm text-gray-400">Supplier</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(selected.id); setForm({ name: selected.name, phone: selected.phone || "", email: selected.email || "", address: selected.address || "", pan_number: selected.pan_number || "" }); setShowModal(true) }}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
                    <Edit2 size={14} /> Edit
                  </button>
                  <button onClick={() => handleDelete(selected.id)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-500">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                {[
                  { label: "Balance payable", value: fmt(selected.balance || 0), color: (selected.balance||0) > 0 ? "text-red-500" : "text-green-600" },
                  { label: "PAN number",      value: selected.pan_number || "—",  color: "text-gray-900 dark:text-white" },
                ].map(m => (
                  <div key={m.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                    <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>

              <dl className="divide-y divide-gray-100 dark:divide-gray-800">
                {[["Phone", selected.phone||"—"], ["Email", selected.email||"—"], ["Address", selected.address||"—"]].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2.5">
                    <dt className="text-sm text-gray-500">{k}</dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-white">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit supplier" : "Add supplier"}>
        <div className="space-y-4">
          {[
            { label: "Supplier name *", key: "name",       type: "text",  placeholder: "e.g. Nepal Traders" },
            { label: "Phone",           key: "phone",      type: "tel",   placeholder: "+977-98XXXXXXXX" },
            { label: "Email",           key: "email",      type: "email", placeholder: "supplier@email.com" },
            { label: "Address",         key: "address",    type: "text",  placeholder: "Kathmandu, Nepal" },
            { label: "PAN number",      key: "pan_number", type: "text",  placeholder: "Optional" },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
              <input type={f.type} value={form[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})} placeholder={f.placeholder}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium">{editing ? "Save changes" : "Add supplier"}</button>
        </div>
      </Modal>
    </div>
  )
}
