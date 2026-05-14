import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Search, Package, Edit2, Trash2, AlertTriangle } from "lucide-react"
import Modal from "../../components/common/Modal"
import toast from "react-hot-toast"

const UNITS = ["pcs", "kg", "g", "litre", "ml", "box", "dozen", "packet", "bag", "metre"]
const emptyForm = {
  name: "", sku: "", barcode: "", unit: "pcs",
  cost_price: "", selling_price: "", stock_quantity: "",
  reorder_level: "5", product_type: "fast",
  category_id: "", is_active: true,
}
export default function Inventory() {
  const { storeId, loading: storeLoading, error: storeError } = useStoreId()
  const [products,   setProducts]   = useState([])
  const [categories, setCategories] = useState([])
  const [selected,   setSelected]   = useState(null)
  const [search,     setSearch]     = useState("")
  const [catFilter,  setCatFilter]  = useState("")
  const [showModal,  setShowModal]  = useState(false)
  const [form,       setForm]       = useState(emptyForm)
  const [editing,    setEditing]    = useState(null)
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    if (!storeId) return
    Promise.all([loadProducts(storeId), loadCategories(storeId)])
      .finally(() => setLoading(false))
  }, [storeId])

  async function loadProducts(sid) {
    const { data, error } = await supabase.from("products")
      .select("*, categories(name)")
      .eq("store_id", sid).eq("is_active", true).order("name")
    if (error) { toast.error("Failed to load products: " + error.message); return }
    setProducts(data || [])
    if (data?.length) setSelected(data[0])
  }

  async function loadCategories(sid) {
    const { data } = await supabase.from("categories").select("*").eq("store_id", sid).order("name")
    setCategories(data || [])
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) &&
    (catFilter ? p.category_id === catFilter : true)
  )

  function openAdd() { setEditing(null); setForm(emptyForm); setShowModal(true) }
  function openEdit(p) {
    setEditing(p.id)
    setForm({ name: p.name, sku: p.sku||"", barcode: p.barcode||"", unit: p.unit,
      cost_price: p.cost_price, selling_price: p.selling_price,
      stock_quantity: p.stock_quantity, reorder_level: p.reorder_level,
      product_type: p.product_type||"fast",
      category_id: p.category_id||"", is_active: p.is_active })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Product name is required")
    const payload = { ...form, 
      store_id: storeId,
      cost_price:     parseFloat(form.cost_price)     || 0,
      selling_price:  parseFloat(form.selling_price)  || 0,
      stock_quantity: parseFloat(form.stock_quantity) || 0,
      reorder_level:  parseFloat(form.reorder_level)  || (form.product_type === "slow" ? 2 : 5),
      category_id:    form.category_id || null,
      product_type:   form.product_type || "fast", 
    }
    const { error } = editing
      ? await supabase.from("products").update(payload).eq("id", editing)
      : await supabase.from("products").insert(payload)
    if (error) return toast.error(error.message)
    toast.success(editing ? "Product updated" : "Product added")
    setShowModal(false); loadProducts(storeId)
  }

  async function handleDelete(id) {
    if (!confirm("Delete this product?")) return
    await supabase.from("products").update({ is_active: false }).eq("id", id)
    toast.success("Product removed"); setSelected(null); loadProducts(storeId)
  }

  const fmt = (n) => "Rs " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })

  if (storeLoading || loading) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Loading inventory…</p>
    </div>
  )

  if (storeError) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
      <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center mb-2">
        <AlertTriangle size={24} className="text-red-500" />
      </div>
      <p className="text-base font-semibold text-gray-900 dark:text-white">Store not found</p>
      <p className="text-sm text-gray-500 max-w-sm">{storeError}</p>
      <p className="text-xs text-gray-400 max-w-sm mt-1">
        This usually means your account was created but the store record wasn't saved to the database.
        Check the Supabase Table Editor → users table to see if your user row exists.
      </p>
    </div>
  )

  return (
    <div className="flex h-full">
      {/* ── Left panel ── */}
      <div className="w-80 shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-bold text-gray-900 dark:text-white">Inventory</h1>
            <button onClick={openAdd} className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors">
              <Plus size={14} /> Add item
            </button>
          </div>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none">
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="flex text-center border-b border-gray-100 dark:border-gray-800">
          <div className="flex-1 py-2">
            <p className="text-lg font-bold text-gray-900 dark:text-white">{products.length}</p>
            <p className="text-xs text-gray-400">Total items</p>
          </div>
          <div className="flex-1 py-2 border-x border-gray-100 dark:border-gray-800">
            <p className="text-lg font-bold text-amber-500">{products.filter(p => p.stock_quantity <= p.reorder_level).length}</p>
            <p className="text-xs text-gray-400">Low stock</p>
          </div>
          <div className="flex-1 py-2">
            <p className="text-lg font-bold text-green-600">{products.filter(p => p.stock_quantity > p.reorder_level).length}</p>
            <p className="text-xs text-gray-400">Healthy</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center p-6">
              <Package size={36} className="text-gray-200 dark:text-gray-700 mb-2" />
              <p className="text-sm text-gray-400">No products yet</p>
              <button onClick={openAdd} className="mt-2 text-xs text-orange-500 hover:underline">Add your first product</button>
            </div>
          ) : (
            filtered.map(p => (
              <div key={p.id} onClick={() => setSelected(p)}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer border-b border-gray-50 dark:border-gray-800 transition-colors ${
                  selected?.id === p.id ? "bg-orange-50 dark:bg-orange-950 border-l-2 border-l-orange-500" : "hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.categories?.name || "Uncategorised"}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className={`text-sm font-bold ${p.stock_quantity <= p.reorder_level ? "text-red-500" : "text-gray-700 dark:text-gray-300"}`}>
                    {p.stock_quantity} {p.unit}
                  </p>
                  {p.stock_quantity <= p.reorder_level && <AlertTriangle size={11} className="text-amber-500 ml-auto mt-0.5" />}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Package size={56} className="text-gray-200 dark:text-gray-700 mb-4" />
            <p className="text-gray-400 mb-2">Select a product to view details</p>
            <button onClick={openAdd} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg transition-colors">Add first product</button>
          </div>
        ) : (
          <div className="max-w-2xl">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selected.name}</h2>
                  <p className="text-sm text-gray-400 mt-0.5">{selected.categories?.name || "Uncategorised"} · SKU: {selected.sku || "—"}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(selected)} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors">
                    <Edit2 size={14} /> Edit
                  </button>
                  <button onClick={() => handleDelete(selected.id)} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-500 transition-colors">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Sale price",     value: fmt(selected.selling_price), color: "text-green-600 dark:text-green-400" },
                  { label: "Purchase price", value: fmt(selected.cost_price),    color: "text-gray-900 dark:text-white" },
                  { label: "Stock qty",      value: `${selected.stock_quantity} ${selected.unit}`,
                    color: selected.stock_quantity <= selected.reorder_level ? "text-red-500" : "text-gray-900 dark:text-white" },
                  { label: "Stock value",    value: fmt(selected.selling_price * selected.stock_quantity), color: "text-blue-600 dark:text-blue-400" },
                ].map(m => (
                  <div key={m.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                    <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>
              {selected.stock_quantity <= selected.reorder_level && (
                <div className="mt-4 flex items-center gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">Stock at or below reorder level ({selected.reorder_level} {selected.unit}). Consider restocking.</p>
                </div>
              )}
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Product details</h3>
              <dl className="divide-y divide-gray-100 dark:divide-gray-800">
                {[
                  ["Barcode",        selected.barcode||"—"],
                  ["Unit",           selected.unit],
                  ["Reorder level",  `${selected.reorder_level} ${selected.unit}`],
                  ["Category",       selected.categories?.name||"—"],
                  ["Profit per unit",fmt(selected.selling_price - selected.cost_price)],
                  ["Margin",         selected.selling_price > 0 ? ((selected.selling_price-selected.cost_price)/selected.selling_price*100).toFixed(1)+"%" : "—"],
                ].map(([k,v]) => (
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

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit product" : "Add new product"} width="max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Product name *</label>
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Basmati Rice 1kg"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
            <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none">
              <option value="">Select category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unit</label>
            <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none">
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Product type
            </label>
            <div className="flex gap-3">
              {[
                { val: "fast", label: "Fast moving", desc: "Alert at 5 pcs", icon: "⚡" },
                { val: "slow", label: "Slow moving", desc: "Alert at 2 pcs", icon: "🐢" },
              ].map(t => (
                <button
                  key={t.val}
                  type="button"
                  onClick={() => setForm({
                    ...form,
                    product_type: t.val,
                    reorder_level: t.val === "fast" ? "5" : "2"
                  })}
                  className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all ${
                    form.product_type === t.val
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                  }`}
                >
                  <span className="text-xl">{t.icon}</span>
                  <div>
                    <p className={`text-sm font-medium ${form.product_type === t.val ? "text-orange-600 dark:text-orange-400" : "text-gray-900 dark:text-white"}`}>
                      {t.label}
                    </p>
                    <p className="text-xs text-gray-400">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          
          {[
            { label: "Purchase price (Rs)", key: "cost_price",     ph: "0.00" },
            { label: "Sale price (Rs)",     key: "selling_price",  ph: "0.00" },
            { label: "Opening stock",       key: "stock_quantity", ph: "0" },
            { label: "Reorder level",       key: "reorder_level",  ph: "5" },
            { label: "SKU",                 key: "sku",            ph: "Optional" },
            { label: "Barcode",             key: "barcode",        ph: "Optional" },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
              <input type={f.key.includes("price")||f.key.includes("stock")||f.key.includes("level") ? "number" : "text"}
                value={form[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})} placeholder={f.ph} min="0" step="0.01"
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          ))}
        </div>
        {form.selling_price && form.cost_price && (
          <div className="mt-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3 flex justify-between">
            <span className="text-sm text-green-700 dark:text-green-400">Profit per unit</span>
            <span className="text-sm font-bold text-green-700 dark:text-green-400">
              Rs {(parseFloat(form.selling_price||0)-parseFloat(form.cost_price||0)).toFixed(2)}
              {form.selling_price > 0 ? ` (${(((form.selling_price-form.cost_price)/form.selling_price)*100).toFixed(1)}% margin)` : ""}
            </span>
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium">{editing ? "Save changes" : "Add product"}</button>
        </div>
      </Modal>
    </div>
  )
}
