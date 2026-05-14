import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Search, Users, Phone, Mail, MapPin, Edit2, Trash2, AlertTriangle } from "lucide-react"
import Modal from "../../components/common/Modal"
import toast from "react-hot-toast"

const empty = { name: "", phone: "", email: "", address: "", pan_number: "", credit_limit: "0" }

export default function Customers() {
  const { storeId, loading: storeLoading, error: storeError } = useStoreId()
  const [customers, setCustomers] = useState([])
  const [selected,  setSelected]  = useState(null)
  const [search,    setSearch]    = useState("")
  const [showModal, setShowModal] = useState(false)
  const [form,      setForm]      = useState(empty)
  const [editing,   setEditing]   = useState(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!storeId) return
    load(storeId).finally(() => setLoading(false))
  }, [storeId])

  async function load(sid) {
    const { data, error } = await supabase.from("customers").select("*").eq("store_id", sid).order("name")
    if (error) { toast.error("Failed to load: " + error.message); return }
    setCustomers(data || [])
    if (data?.length && !selected) setSelected(data[0])
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  )

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Customer name is required")
    const payload = { ...form, store_id: storeId, credit_limit: parseFloat(form.credit_limit)||0 }
    const { error } = editing
      ? await supabase.from("customers").update(payload).eq("id", editing)
      : await supabase.from("customers").insert(payload)
    if (error) return toast.error(error.message)
    toast.success(editing ? "Customer updated" : "Customer added")
    setShowModal(false); load(storeId)
  }

  async function handleDelete(id) {
    if (!confirm("Delete this customer?")) return
    await supabase.from("customers").delete().eq("id", id)
    toast.success("Customer deleted"); setSelected(null); load(storeId)
  }

  const fmt = (n) => "Rs " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

  if (storeLoading || loading) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Loading customers…</p>
    </div>
  )

  if (storeError) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
      <AlertTriangle size={40} className="text-red-500" />
      <p className="text-base font-semibold text-gray-900 dark:text-white">Store not found</p>
      <p className="text-sm text-gray-500">{storeError}</p>
    </div>
  )

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-bold text-gray-900 dark:text-white">Customers</h1>
            <button onClick={() => { setEditing(null); setForm(empty); setShowModal(true) }}
              className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg">
              <Plus size={14} /> Add
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
        </div>
        <div className="flex text-center border-b border-gray-100 dark:border-gray-800">
          <div className="flex-1 py-2">
            <p className="text-lg font-bold text-gray-900 dark:text-white">{customers.length}</p>
            <p className="text-xs text-gray-400">Total</p>
          </div>
          <div className="flex-1 py-2 border-x border-gray-100 dark:border-gray-800">
            <p className="text-lg font-bold text-red-500">{customers.filter(c=>(c.balance||0)>0).length}</p>
            <p className="text-xs text-gray-400">With balance</p>
          </div>
          <div className="flex-1 py-2">
            <p className="text-sm font-bold text-green-600">{fmt(customers.reduce((s,c)=>s+(c.balance||0),0))}</p>
            <p className="text-xs text-gray-400">Total due</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center p-6">
              <Users size={36} className="text-gray-200 dark:text-gray-700 mb-2" />
              <p className="text-sm text-gray-400">No customers yet</p>
            </div>
          ) : filtered.map(c => (
            <div key={c.id} onClick={() => setSelected(c)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 dark:border-gray-800 ${selected?.id===c.id ? "bg-orange-50 dark:bg-orange-950 border-l-2 border-l-orange-500" : "hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
              <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{c.name[0].toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                <p className="text-xs text-gray-400">{c.phone||"No phone"}</p>
              </div>
              {(c.balance||0)>0 && <span className="text-xs font-medium text-red-500 shrink-0">{fmt(c.balance)}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Users size={56} className="text-gray-200 dark:text-gray-700 mb-4" />
            <p className="text-gray-400">Select a customer to view details</p>
          </div>
        ) : (
          <div className="max-w-2xl">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                    <span className="text-xl font-bold text-orange-600 dark:text-orange-400">{selected.name[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selected.name}</h2>
                    <p className="text-sm text-gray-400">Customer since {new Date(selected.created_at).toLocaleDateString("en-NP")}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(selected.id); setForm({ name: selected.name, phone: selected.phone||"", email: selected.email||"", address: selected.address||"", pan_number: selected.pan_number||"", credit_limit: selected.credit_limit||"0" }); setShowModal(true) }}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
                    <Edit2 size={14} /> Edit
                  </button>
                  <button onClick={() => handleDelete(selected.id)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-red-200 dark:border-red-800 rounded-lg text-red-500">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { label: "Balance due",  value: fmt(selected.balance||0), color: (selected.balance||0)>0?"text-red-500":"text-green-600" },
                  { label: "Credit limit", value: fmt(selected.credit_limit||0), color: "text-gray-900 dark:text-white" },
                  { label: "Available",    value: fmt((selected.credit_limit||0)-(selected.balance||0)), color: "text-blue-600 dark:text-blue-400" },
                ].map(m => (
                  <div key={m.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                    <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>
              <dl className="divide-y divide-gray-100 dark:divide-gray-800">
                {[[<Phone size={14}/>, "Phone", selected.phone||"—"], [<Mail size={14}/>, "Email", selected.email||"—"], [<MapPin size={14}/>, "Address", selected.address||"—"], [null, "PAN", selected.pan_number||"—"]].map(([icon,k,v]) => (
                  <div key={k} className="flex items-center gap-3 py-2.5">
                    {icon && <span className="text-gray-400 shrink-0">{icon}</span>}
                    <dt className="text-sm text-gray-500 w-20 shrink-0">{k}</dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-white">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit customer" : "Add customer"}>
        <div className="space-y-4">
          {[
            { label: "Full name *",       key: "name",         type: "text",   ph: "Ram Bahadur Thapa" },
            { label: "Phone",             key: "phone",        type: "tel",    ph: "+977-98XXXXXXXX" },
            { label: "Email",             key: "email",        type: "email",  ph: "customer@email.com" },
            { label: "Address",           key: "address",      type: "text",   ph: "Kathmandu, Nepal" },
            { label: "PAN number",        key: "pan_number",   type: "text",   ph: "Optional" },
            { label: "Credit limit (Rs)", key: "credit_limit", type: "number", ph: "0" },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
              <input type={f.type} value={form[f.key]} onChange={e => setForm({...form,[f.key]:e.target.value})} placeholder={f.ph}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium">{editing ? "Save changes" : "Add customer"}</button>
        </div>
      </Modal>
    </div>
  )
}
