import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { X } from "lucide-react"
import toast from "react-hot-toast"

const UNITS = ["pcs","kg","g","litre","ml","box","dozen","packet","bag","metre","set","pair"]

function genCode(name) {
  const letters = (name || "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3) || "ITM"
  const digits  = Math.floor(1000 + Math.random() * 9000)
  return `${letters}-${digits}`
}

export default function QuickAddItemModal({ storeId, initialName, onClose, onCreated }) {
  const [categories, setCategories] = useState([])
  const [addingCat,   setAddingCat]  = useState(false)
  const [newCatName,  setNewCatName] = useState("")
  const [savingCat,   setSavingCat]  = useState(false)

  const [form, setForm] = useState({
    name: initialName || "",
    category_id: "",
    unit: "pcs",
    selling_price: "",
    cost_price: "",
    sku: "",
    description: "",
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (storeId) loadCategories() }, [storeId])

  async function loadCategories() {
    const { data } = await supabase.from("categories").select("*").eq("store_id", storeId).order("name")
    setCategories(data || [])
  }

  async function handleAddCategory() {
    const name = newCatName.trim()
    if (!name) return toast.error("Category name is required")
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) return toast.error("Category already exists")
    setSavingCat(true)
    const { data, error } = await supabase.from("categories").insert({ store_id: storeId, name }).select().single()
    setSavingCat(false)
    if (error) return toast.error(error.message)
    toast.success(`Category "${name}" added`)
    setNewCatName(""); setAddingCat(false)
    await loadCategories()
    setForm(f => ({ ...f, category_id: data.id }))
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Item name is required")
    setSaving(true)
    const payload = {
      store_id: storeId,
      name: form.name.trim(),
      category_id: form.category_id || null,
      unit: form.unit,
      selling_price: parseFloat(form.selling_price) || 0,
      cost_price: parseFloat(form.cost_price) || 0,
      sku: form.sku || null,
      description: form.description || null,
      stock_quantity: 0, // this purchase will add the actual quantity on save
      reorder_level: 5,
      product_type: "fast",
      is_active: true,
    }
    const { data, error } = await supabase.from("products").insert(payload).select().single()
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(`"${data.name}" added to inventory`)
    onCreated(data)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <style>{`@keyframes cardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-800 max-h-[92vh] flex flex-col"
        style={{ animation: "cardIn 0.2s ease-out both" }}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Add New Item</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={18}/></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Item name *</label>
            <input autoFocus value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              placeholder="e.g. Brake Pad TVS (Front)"
              className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Category</label>
              <select
                value={addingCat ? "__new__" : form.category_id}
                onChange={e => {
                  if (e.target.value === "__new__") setAddingCat(true)
                  else { setAddingCat(false); setForm({...form, category_id: e.target.value}) }
                }}
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all">
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__new__">+ Add new category</option>
              </select>
              {addingCat && (
                <div className="flex items-center gap-2 mt-2">
                  <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAddCategory() }}
                    placeholder="e.g. Brake System" autoFocus
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none" />
                  <button type="button" onClick={handleAddCategory} disabled={savingCat}
                    className="px-3 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shrink-0 transition-colors">
                    {savingCat ? "Adding…" : "Add"}
                  </button>
                  <button type="button" onClick={() => { setAddingCat(false); setNewCatName("") }}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 shrink-0 transition-colors">
                    <X size={14}/>
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Primary unit</label>
              <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Sales price (Rs)</label>
              <input type="number" min="0" value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})}
                placeholder="0"
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Purchase price (Rs)</label>
              <input type="number" min="0" value={form.cost_price} onChange={e => setForm({...form, cost_price: e.target.value})}
                placeholder="0"
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Item code / SKU</label>
            <div className="flex gap-2">
              <input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} placeholder="Enter item code"
                className="flex-1 min-w-0 px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
              <button type="button" onClick={() => setForm({...form, sku: genCode(form.name)})}
                className="px-3.5 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 shrink-0 transition-colors">
                Generate
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              rows={3} placeholder="Write description here..."
              className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all resize-none" />
          </div>

          <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2.5">
            Opening stock is set to 0 — the quantity you enter on this purchase line will be added to stock automatically once the bill is saved.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 active:scale-[0.97] text-white rounded-xl font-semibold disabled:opacity-50 transition-all duration-150">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}
