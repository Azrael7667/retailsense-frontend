import api from "../../lib/apiClient"
import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatBoth } from "../../utils/dateHelpers"
import {
  Plus, Search, Package, Edit2, Trash2,
  AlertTriangle, Download, Upload, Filter, RefreshCw,
  ChevronDown, X, CheckCircle, ArrowUpDown,
  MoreHorizontal
} from "lucide-react"
import toast from "react-hot-toast"

const UNITS = ["pcs","kg","g","litre","ml","box","dozen","packet","bag","metre","set","pair"]

const PRODUCT_TYPES = [
  { val: "fast",       label: "Fast Moving", reorder: "5", badge: "bg-blue-50 text-blue-600 border-blue-200" },
  { val: "moderate",   label: "Moderate",    reorder: "3", badge: "bg-amber-50 text-amber-600 border-amber-200" },
  { val: "slow",       label: "Slow Moving", reorder: "2", badge: "bg-gray-100 text-gray-500 border-gray-200" },
  { val: "dead_stock", label: "Dead Stock",  reorder: "2", badge: "bg-red-50 text-red-500 border-red-200" },
]
const typeMeta = (val) => PRODUCT_TYPES.find(t => t.val === val) || PRODUCT_TYPES[0]

const emptyForm = {
  name: "", sku: "", barcode: "", unit: "pcs",
  cost_price: "", selling_price: "", stock_quantity: "",
  reorder_level: "5", product_type: "fast",
  category_id: "", is_active: true,
}

export default function Inventory() {
  const { storeId, loading: storeLoading } = useStoreId()
  const [products,   setProducts]   = useState([])
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState("")
  const [catFilter,  setCatFilter]  = useState("")
  const [stockFilter,setStockFilter]= useState("all") // all | low | out | healthy
  const [typeFilter, setTypeFilter] = useState("all") // all | fast | moderate | slow | dead_stock
  const [showModal,  setShowModal]  = useState(false)
  const [form,       setForm]       = useState(emptyForm)
  const [editing,    setEditing]    = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [sortField,  setSortField]  = useState("name")
  const [sortDir,    setSortDir]    = useState("asc")
  const [selected,   setSelected]   = useState([])
  const [addingCat,  setAddingCat]  = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [savingCat,  setSavingCat]  = useState(false)
  const searchRef = useRef(null)

  useEffect(() => {
    if (!storeId) return
    Promise.all([loadProducts(storeId), loadCategories(storeId)])
      .finally(() => setLoading(false))
  }, [storeId])

  async function loadProducts(sid) {
    const { data } = await supabase
      .from("products")
      .select("*, categories(name)")
      .eq("store_id", sid)
      .eq("is_active", true)
      .order("name")
    setProducts(data || [])
  }

  async function loadCategories(sid) {
    const { data } = await supabase.from("categories").select("*").eq("store_id", sid).order("name")
    setCategories(data || [])
  }

  async function handleAddCategory() {
    const name = newCatName.trim()
    if (!name) return toast.error("Category name is required")
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      return toast.error("Category already exists")
    }
    setSavingCat(true)
    const { data, error } = await supabase
      .from("categories")
      .insert({ store_id: storeId, name })
      .select()
      .single()
    setSavingCat(false)
    if (error) return toast.error(error.message)
    toast.success(`Category "${name}" added`)
    setNewCatName("")
    setAddingCat(false)
    await loadCategories(storeId)
    setForm(f => ({ ...f, category_id: data.id }))
  }

  // Filter + sort
  const filtered = products
    .filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode || "").toLowerCase().includes(search.toLowerCase())
      const matchCat    = catFilter ? p.category_id === catFilter : true
      const matchType   = typeFilter !== "all" ? p.product_type === typeFilter : true
      const matchStock  =
        stockFilter === "all"     ? true :
        stockFilter === "out"     ? p.stock_quantity <= 0 :
        stockFilter === "low"     ? p.stock_quantity > 0 && p.stock_quantity <= p.reorder_level :
        stockFilter === "healthy" ? p.stock_quantity > p.reorder_level : true
      return matchSearch && matchCat && matchType && matchStock
    })
    .sort((a, b) => {
      let va = a[sortField], vb = b[sortField]
      if (typeof va === "string") va = va.toLowerCase()
      if (typeof vb === "string") vb = vb.toLowerCase()
      return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
    })

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setAddingCat(false)
    setNewCatName("")
    setShowModal(true)
  }

  function openEdit(p) {
    setEditing(p.id)
    setForm({
      name: p.name, sku: p.sku || "", barcode: p.barcode || "",
      unit: p.unit, cost_price: p.cost_price, selling_price: p.selling_price,
      stock_quantity: p.stock_quantity, reorder_level: p.reorder_level,
      product_type: p.product_type || "fast",
      category_id: p.category_id || "", is_active: p.is_active,
    })
    setAddingCat(false)
    setNewCatName("")
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Product name is required")
    setSaving(true)
    const payload = {
      ...form, store_id: storeId,
      cost_price:     parseFloat(form.cost_price)     || 0,
      selling_price:  parseFloat(form.selling_price)  || 0,
      stock_quantity: parseFloat(form.stock_quantity) || 0,
      reorder_level:  parseFloat(form.reorder_level)  || parseFloat(typeMeta(form.product_type).reorder),
      category_id:    form.category_id || null,
      product_type:   form.product_type || "fast",
    }
    const { error } = editing
      ? await supabase.from("products").update(payload).eq("id", editing)
      : await supabase.from("products").insert(payload)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success(editing ? "Product updated" : "Product added")
    setShowModal(false)
    setSaving(false)
    loadProducts(storeId)
  }

  async function handleDelete(id) {
    if (!confirm("Delete this product?")) return
    await supabase.from("products").update({ is_active: false }).eq("id", id)
    toast.success("Product removed")
    loadProducts(storeId)
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selected.length} products?`)) return
    for (const id of selected) {
      await supabase.from("products").update({ is_active: false }).eq("id", id)
    }
    toast.success(`${selected.length} products removed`)
    setSelected([])
    loadProducts(storeId)
  }

  async function handleRecalculateTypes() {
    setRecalculating(true)
    toast.loading("Classifying products by sales velocity…", { id: "classify" })
    try {
      const res = await api.post("/api/admin/classify-products")
      const { updated_count, total_checked, summary } = res.data
      toast.success(
        `Updated ${updated_count} of ${total_checked} — ` +
        `${summary.fast} Fast, ${summary.moderate} Moderate, ${summary.slow} Slow, ${summary.dead_stock} Dead Stock`,
        { id: "classify", duration: 6000 }
      )
      loadProducts(storeId)
    } catch (err) {
      toast.error("Could not classify — is backend running?", { id: "classify" })
    } finally {
      setRecalculating(false)
    }
  }

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    setSelected(prev => prev.length === filtered.length ? [] : filtered.map(p => p.id))
  }

  const fmt = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

  const stats = {
    total:   products.length,
    low:     products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.reorder_level).length,
    out:     products.filter(p => p.stock_quantity <= 0).length,
    healthy: products.filter(p => p.stock_quantity > p.reorder_level).length,
    value:   products.reduce((s, p) => s + (p.cost_price * p.stock_quantity), 0),
  }

  if (storeLoading || loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage your products and stock levels</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-md btn-outline btn-sm">
            <Upload size={14} /> Import
          </button>
          <button className="btn btn-md btn-outline btn-sm">
            <Download size={14} /> Export
          </button>
          <button onClick={openAdd} className="btn btn-md btn-primary">
            <Plus size={16} /> Add New Item
          </button>
        </div>
      </div>

      {/* Stat pills */}
      <div className="flex items-center gap-3 flex-wrap">
        {[
          { key: "all",     label: "All Items",    count: stats.total,   color: "bg-surface-100 text-gray-700" },
          { key: "healthy", label: "In Stock",     count: stats.healthy, color: "bg-green-50 text-green-700" },
          { key: "low",     label: "Low Stock",    count: stats.low,     color: "bg-amber-50 text-amber-700" },
          { key: "out",     label: "Out of Stock", count: stats.out,     color: "bg-red-50 text-red-700" },
        ].map(s => (
          <button key={s.key} onClick={() => setStockFilter(s.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              stockFilter === s.key
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : `${s.color} border-transparent hover:border-gray-200`
            }`}>
            {s.label}
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
              stockFilter === s.key ? "bg-blue-100 text-blue-700" : "bg-white text-gray-600"
            }`}>{s.count}</span>
          </button>
        ))}
        <div className="ml-auto text-sm text-gray-500">
          Stock value: <span className="font-semibold text-gray-800">{fmt(stats.value)}</span>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, SKU, barcode…"
            className="inp pl-9 py-2"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category filter */}
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="sel w-auto py-2">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Type filter */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="sel w-auto py-2">
          <option value="all">All Types</option>
          {PRODUCT_TYPES.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
        </select>

        {/* Recalculate types */}
        <button
          onClick={handleRecalculateTypes}
          disabled={recalculating}
          className="btn btn-md btn-outline btn-sm text-blue-600 border-blue-200 hover:bg-blue-50 disabled:opacity-50"
          title="Recalculate Fast/Moderate/Slow/Dead Stock based on last 90 days of sales"
        >
          <RefreshCw size={13} className={recalculating ? "animate-spin" : ""} />
          {recalculating ? "Recalculating…" : "Recalculate Types"}
        </button>

        {/* Bulk actions */}
        {selected.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-500">{selected.length} selected</span>
            <button onClick={handleBulkDelete} className="btn-md btn-danger btn-sm">
              <Trash2 size={13} /> Delete selected
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-10">
                  <input type="checkbox"
                    checked={selected.length === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
                </th>
                <th>
                  <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-gray-700">
                    Item Name <ArrowUpDown size={12} />
                  </button>
                </th>
                <th>Category</th>
                <th>Item Code</th>
                <th>Type</th>
                <th>
                  <button onClick={() => toggleSort("selling_price")} className="flex items-center gap-1 hover:text-gray-700">
                    Sale Price <ArrowUpDown size={12} />
                  </button>
                </th>
                <th>
                  <button onClick={() => toggleSort("cost_price")} className="flex items-center gap-1 hover:text-gray-700">
                    Purchase Price <ArrowUpDown size={12} />
                  </button>
                </th>
                <th>
                  <button onClick={() => toggleSort("stock_quantity")} className="flex items-center gap-1 hover:text-gray-700">
                    Quantity <ArrowUpDown size={12} />
                  </button>
                </th>
                <th>Stock Value</th>
                <th>Margin</th>
                <th>Status</th>
                <th className="w-16">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-16">
                    <Package size={40} className="mx-auto text-gray-200 mb-3" />
                    <p className="text-gray-400 text-sm font-medium">No products found</p>
                    <p className="text-gray-300 text-xs mt-1">Try adjusting your filters or add a new product</p>
                    <button onClick={openAdd} className="btn btn-md btn-primary btn-sm mt-4">
                      <Plus size={14} /> Add first product
                    </button>
                  </td>
                </tr>
              ) : filtered.map(p => {
                const isLow  = p.stock_quantity > 0 && p.stock_quantity <= p.reorder_level
                const isOut  = p.stock_quantity <= 0
                const margin = p.selling_price > 0
                  ? ((p.selling_price - p.cost_price) / p.selling_price * 100).toFixed(1)
                  : "0.0"
                const isSelected = selected.includes(p.id)
                const tMeta = typeMeta(p.product_type)

                return (
                  <tr key={p.id} className={isSelected ? "bg-blue-50" : ""}>
                    <td>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)}
                        className="rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          <Package size={14} className="text-blue-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 max-w-48 truncate" title={p.name}>{p.name}</p>
                          {p.barcode && <p className="text-2xs text-gray-400">{p.barcode}</p>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge bg-surface-100 text-gray-600">
                        {p.categories?.name || "—"}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-gray-500">{p.sku || "—"}</td>
                    <td>
                      <span className={`badge border ${tMeta.badge}`}>
                        {tMeta.label}
                      </span>
                    </td>
                    <td className="font-semibold text-gray-900">{fmt(p.selling_price)}</td>
                    <td className="text-gray-600">{fmt(p.cost_price)}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {(isLow || isOut) && (
                          <AlertTriangle size={13} className={isOut ? "text-red-500" : "text-amber-500"} />
                        )}
                        <span className={`font-semibold ${isOut ? "text-red-500" : isLow ? "text-amber-500" : "text-gray-900"}`}>
                          {p.stock_quantity} {p.unit}
                        </span>
                      </div>
                    </td>
                    <td className="text-gray-600">{fmt(p.cost_price * p.stock_quantity)}</td>                   
                    <td>
                      <span className={`text-sm font-semibold ${parseFloat(margin) >= 20 ? "text-green-600" : parseFloat(margin) >= 10 ? "text-amber-500" : "text-red-500"}`}>
                        {margin}%
                      </span>
                    </td>
                    <td>
                      {isOut ? (
                        <span className="badge badge-unpaid">Out of Stock</span>
                      ) : isLow ? (
                        <span className="badge badge-partial">Low Stock</span>
                      ) : (
                        <span className="badge badge-paid">In Stock</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(p)}
                          className="p-1.5 rounded-md hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(p.id)}
                          className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-surface-100 flex items-center justify-between bg-surface-50">
            <p className="text-xs text-gray-400">
              Showing <span className="font-semibold text-gray-600">{filtered.length}</span> of{" "}
              <span className="font-semibold text-gray-600">{products.length}</span> products
            </p>
            <p className="text-xs text-gray-400">
              Total stock value:{" "}
              <span className="font-semibold text-gray-700">
                {fmt(filtered.reduce((s, p) => s + p.cost_price * p.stock_quantity, 0))}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] flex flex-col border border-surface-200">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
              <h2 className="text-base font-semibold text-gray-900">
                {editing ? "Edit Product" : "Add New Product"}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-surface-100 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

              {/* Product name */}
              <div>
                <label className="lbl">Product name *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="e.g. Brake Pad TVS (Front)" className="inp" autoFocus />
              </div>

              {/* Category + Unit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="lbl">Category</label>
                  <select
                    value={addingCat ? "__new__" : form.category_id}
                    onChange={e => {
                      if (e.target.value === "__new__") {
                        setAddingCat(true)
                      } else {
                        setAddingCat(false)
                        setForm({ ...form, category_id: e.target.value })
                      }
                    }}
                    className="sel">
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value="__new__">+ Add new category</option>
                  </select>

                  {addingCat && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleAddCategory() }}
                        placeholder="e.g. Brake System"
                        className="inp py-2"
                        autoFocus
                      />
                      <button type="button" onClick={handleAddCategory} disabled={savingCat}
                        className="btn btn-md btn-primary btn-sm shrink-0">
                        {savingCat ? "Adding…" : "Add"}
                      </button>
                      <button type="button"
                        onClick={() => { setAddingCat(false); setNewCatName("") }}
                        className="p-1.5 rounded-md hover:bg-surface-100 text-gray-400 hover:text-gray-600 shrink-0">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="lbl">Unit</label>
                  <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} className="sel">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Product type */}
              <div>
                <label className="lbl">
                  Product type
                  <span className="ml-1 text-gray-400 font-normal">
                    (manual — or use "Recalculate Types" to auto-classify from sales)
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {PRODUCT_TYPES.map(t => (
                    <button key={t.val} type="button"
                      onClick={() => setForm({ ...form, product_type: t.val, reorder_level: t.reorder })}
                      className={`px-4 py-3 rounded-xl border-2 text-left transition-all ${
                        form.product_type === t.val
                          ? "border-blue-500 bg-blue-50"
                          : "border-surface-200 hover:border-gray-300"
                      }`}>
                      <p className={`text-sm font-semibold ${form.product_type === t.val ? "text-blue-700" : "text-gray-800"}`}>
                        {t.label}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Reorder alert at {t.reorder} {form.unit}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="lbl">Purchase price (Rs)</label>
                  <input type="number" min="0" step="1"
                    value={form.cost_price} onChange={e => setForm({...form, cost_price: e.target.value})}
                    placeholder="0" className="inp [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
                <div>
                  <label className="lbl">Sale price (Rs)</label>
                  <input type="number" min="0" step="1"
                    value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})}
                    placeholder="0" className="inp [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
              </div>

              {/* Stock */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="lbl">Opening stock</label>
                  <input type="number" min="0" step="1"
                    value={form.stock_quantity} onChange={e => setForm({...form, stock_quantity: e.target.value})}
                    placeholder="0" className="inp [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
                <div>
                  <label className="lbl">
                    Reorder level
                    <span className="ml-1 text-gray-400 font-normal">
                      (auto: {typeMeta(form.product_type).reorder})
                    </span>
                  </label>
                  <input type="number" min="0" step="1"
                    value={form.reorder_level} onChange={e => setForm({...form, reorder_level: e.target.value})}
                    className="inp [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
              </div>

              {/* SKU + Barcode */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="lbl">SKU / Item code</label>
                  <input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})}
                    placeholder="e.g. BP-TVS-001" className="inp" />
                </div>
                <div>
                  <label className="lbl">Barcode</label>
                  <input value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})}
                    placeholder="Optional" className="inp" />
                </div>
              </div>

              {/* Live margin preview */}
              {form.selling_price && form.cost_price && parseFloat(form.selling_price) > 0 && (
                <div className={`rounded-xl px-4 py-3 flex items-center justify-between border ${
                  parseFloat(form.selling_price) >= parseFloat(form.cost_price)
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Profit per unit</p>
                    <p className={`text-base font-bold ${parseFloat(form.selling_price) >= parseFloat(form.cost_price) ? "text-green-700" : "text-red-600"}`}>
                      Rs {(parseFloat(form.selling_price || 0) - parseFloat(form.cost_price || 0)).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-gray-500">Margin</p>
                    <p className={`text-base font-bold ${parseFloat(form.selling_price) >= parseFloat(form.cost_price) ? "text-green-700" : "text-red-600"}`}>
                      {(((parseFloat(form.selling_price || 0) - parseFloat(form.cost_price || 0)) / parseFloat(form.selling_price || 1)) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-surface-100 flex items-center justify-between bg-surface-50 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="btn btn-md btn-outline">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn btn-md btn-primary">
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}