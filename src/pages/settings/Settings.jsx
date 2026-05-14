import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { useThemeStore } from "../../store/themeStore"
import { useCalendarStore } from "../../store/calendarStore"
import { Plus, Trash2, Sun, Moon, CalendarDays } from "lucide-react"
import toast from "react-hot-toast"

export default function Settings() {
  const { storeId } = useStoreId()
  const { theme, toggleTheme }           = useThemeStore()
  const { calendarType, toggleCalendar } = useCalendarStore()
  const [store,      setStore]      = useState(null)
  const [categories, setCategories] = useState([])
  const [newCat,     setNewCat]     = useState("")
  const [saving,     setSaving]     = useState(false)
  const [tab,        setTab]        = useState("store")

  useEffect(() => { if (storeId) load() }, [storeId])

  async function load() {
    const [s, c] = await Promise.all([
      supabase.from("stores").select("*").eq("id", storeId).single(),
      supabase.from("categories").select("*").eq("store_id", storeId).order("name"),
    ])
    setStore(s.data); setCategories(c.data||[])
  }

  async function saveStore() {
    setSaving(true)
    const { error } = await supabase.from("stores").update({
      name: store.name, store_type: store.store_type,
      owner_name: store.owner_name, phone: store.phone, address: store.address, pan_number: store.pan_number,
    }).eq("id", storeId)
    if (error) toast.error(error.message)
    else toast.success("Store details saved!")
    setSaving(false)
  }

  async function addCategory() {
    if (!newCat.trim()) return
    const { error } = await supabase.from("categories").insert({ store_id: storeId, name: newCat.trim(), is_system: false })
    if (error) toast.error(error.message)
    else { toast.success("Category added"); setNewCat(""); load() }
  }

  async function deleteCategory(id) {
    if (!confirm("Delete this category?")) return
    await supabase.from("categories").delete().eq("id", id)
    toast.success("Category deleted"); load()
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your store preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {["store","categories","preferences"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 text-sm font-medium rounded-md capitalize transition-colors ${tab===t?"bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm":"text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Store profile */}
      {tab === "store" && store && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Store profile</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Store name",  key: "name",        type: "text" },
              { label: "Store type",  key: "store_type",  type: "text" },
              { label: "Owner name",  key: "owner_name",  type: "text" },
              { label: "Phone",       key: "phone",       type: "tel"  },
              { label: "PAN number",  key: "pan_number",  type: "text" },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                <input type={f.type} value={store[f.key]||""} onChange={e => setStore({...store, [f.key]: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            ))}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
              <input value={store.address||""} onChange={e => setStore({...store, address: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button onClick={saveStore} disabled={saving} className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg font-medium disabled:opacity-50">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {/* Categories */}
      {tab === "categories" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Product categories</h2>
          <div className="flex gap-2 mb-4">
            <input value={newCat} onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCategory()}
              placeholder="New category name…"
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            <button onClick={addCategory} className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg">
              <Plus size={15} /> Add
            </button>
          </div>
          <div className="space-y-2">
            {categories.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-900 dark:text-white">{c.name}</span>
                  {c.is_system && <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded">System</span>}
                </div>
                {!c.is_system && (
                  <button onClick={() => deleteCategory(c.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
            {categories.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No categories yet</p>}
          </div>
        </div>
      )}

      {/* Preferences */}
      {tab === "preferences" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Appearance</h2>
            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                {theme === "light" ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-blue-400" />}
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Theme</p>
                  <p className="text-xs text-gray-400">{theme === "light" ? "Light mode active" : "Dark mode active"}</p>
                </div>
              </div>
              <button onClick={toggleTheme} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors" style={{ background: theme === "dark" ? "#f97316" : "#d1d5db" }}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${theme === "dark" ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <CalendarDays size={18} className="text-green-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Calendar system</p>
                  <p className="text-xs text-gray-400">{calendarType === "BS" ? "Bikram Sambat (Nepali)" : "Anno Domini (English)"}</p>
                </div>
              </div>
              <button onClick={toggleCalendar} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors" style={{ background: calendarType === "BS" ? "#f97316" : "#d1d5db" }}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${calendarType === "BS" ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Currency</h2>
            <p className="text-sm text-gray-500 mb-3">Currency is fixed to Nepali Rupees throughout the application.</p>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
              <span className="text-lg font-bold text-orange-500">Rs</span>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Nepali Rupee (NPR)</p>
                <p className="text-xs text-gray-400">Indian numbering system — lakhs & crores</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
