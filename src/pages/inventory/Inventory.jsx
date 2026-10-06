import api from "../../lib/apiClient"
import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import {
  Plus, Search, Package, Edit2, Trash2, AlertTriangle,
  Download, Upload, RefreshCw, ChevronDown, ArrowLeft,
  X, ArrowUpDown, Check
} from "lucide-react"
import toast from "react-hot-toast"
import { composeName, splitLocalNames } from "../../utils/productName"

const UNITS = ["pcs","kg","g","litre","ml","box","dozen","packet","bag","metre","set","pair"]

const PRODUCT_TYPES = [
  { val: "fast",       label: "Fast Moving", reorder: "5", badge: "bg-lime-100 text-lime-800" },
  { val: "moderate",   label: "Moderate",    reorder: "3", badge: "bg-amber-100 text-amber-700" },
  { val: "slow",       label: "Slow Moving", reorder: "2", badge: "bg-gray-100 text-gray-600" },
  { val: "dead_stock", label: "Dead Stock",  reorder: "2", badge: "bg-red-100 text-red-600" },
]
const typeMeta = (val) => PRODUCT_TYPES.find(t => t.val === val) || PRODUCT_TYPES[0]

const STOCK_TABS = [
  { key: "all",     label: "All Items" },
  { key: "healthy", label: "In Stock" },
  { key: "low",     label: "Low Stock" },
  { key: "out",     label: "Out of Stock" },
]

// Initials tile. One neutral colour everywhere; dark when it is the active item.
function Avatar({ name, active = false, className = "w-10 h-10 text-xs rounded-lg" }) {
  return (
    <div className={`flex items-center justify-center font-bold shrink-0 transition-colors ${
      active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
    } ${className}`}>
      {name?.slice(0, 2).toUpperCase() || "?"}
    </div>
  )
}

// Lowercase, turn every character that is not a letter or digit (brackets, dashes,
// slashes, dots, commas, quotes...) into a space, and collapse repeated spaces.
function normalizeText(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

// "Accelerator Cable End (Mahindra Bolero)" -> ["Accelerator Cable End", "(Mahindra Bolero)"]
function splitName(name = "") {
  const i = name.indexOf(" (")
  if (i === -1) return [name, ""]
  return [name.slice(0, i), name.slice(i + 1)]
}

// Full item name, never truncated. Same font size / weight / line height for one-line and
// two-line names, and a fixed minimum height (same as the 40px avatar) so every row matches.
function ItemName({ name, className = "" }) {
  const [main, rest] = splitName(name)
  return (
    <div
      className={`min-w-0 min-h-[2.5rem] flex flex-col justify-center text-sm leading-5 font-medium text-gray-900 ${className}`}
      title={name}>
      <p className="break-words">{main}</p>
      {rest && <p className="break-words">{rest}</p>}
    </div>
  )
}

// Rows rendered at a time; the next batch is added as you scroll down inside the table / list
const BATCH_SIZE = 50

// Shared styles (same look as the dashboard)
const FIELD  = "w-full px-3.5 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 focus:border-lime-500 transition-colors"
const NUM    = `${FIELD} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`
const LABEL  = "block text-xs font-medium text-gray-700 mb-1.5"
const HINT   = "ml-1 text-gray-400 font-normal"
const BTN_DARK    = "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50"
const BTN_OUTLINE = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"

const emptyForm = {
  name: "", local_names: "", sku: "", barcode: "", unit: "pcs",
  cost_price: "", list_price: "", previous_cost_price: "", selling_price: "", stock_quantity: "",
  reorder_level: "5", product_type: "fast",
  category_id: "", is_active: true,
}

// Native select — still used inside the Add/Edit modal
function SelectBox({ wrapClass = "", children, ...props }) {
  return (
    <div className={`relative ${wrapClass}`}>
      <select
        {...props}
        className="w-full appearance-none pl-3.5 pr-9 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-lime-400/40 focus:border-lime-500 cursor-pointer transition-colors truncate">
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  )
}

// Custom dropdown for the filter bar — same look as the customers sort/filter menu:
// white card, soft shadow, small uppercase heading, lime highlight on the active option.
function Dropdown({ value, onChange, options, heading, wrapClass = "", menuClass = "w-56" }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const current = options.find(o => o.value === value) || options[0]

  return (
    <div className={`relative ${wrapClass}`} ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 pl-3.5 pr-3 py-2 text-sm bg-white border rounded-lg text-gray-700 cursor-pointer transition-colors ${
          open ? "border-lime-500 ring-2 ring-lime-400/40" : "border-gray-200 hover:bg-gray-50"
        }`}>
        <span className="truncate">{current?.label}</span>
        <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className={`absolute left-0 top-full mt-1.5 z-30 bg-white border border-gray-100 rounded-xl shadow-lg py-1.5 ${menuClass}`}>
          {heading && (
            <p className="px-4 pt-1.5 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{heading}</p>
          )}
          <div className="max-h-64 overflow-y-auto slim-scroll">
            {options.map(o => {
              const active = o.value === value
              return (
                <button key={o.value} type="button"
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-sm text-left transition-colors ${
                    active ? "bg-lime-50 text-gray-900 font-semibold" : "text-gray-700 hover:bg-gray-50"
                  }`}>
                  <span className="truncate">{o.label}</span>
                  {active && <Check size={14} className="text-lime-600 shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// One label/value cell in the details panel
function Detail({ label, children }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <div className="text-sm font-medium text-gray-900">{children}</div>
    </div>
  )
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
  const [selected,   setSelected]   = useState([])      // ticked checkboxes (bulk actions)
  const [selectedId, setSelectedId] = useState(null)    // item open in the details panel
  const [addingCat,  setAddingCat]  = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [savingCat,  setSavingCat]  = useState(false)
  const [visible,    setVisible]    = useState(BATCH_SIZE)
  // { type: "single", id, name } | { type: "bulk", count }
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting,   setDeleting]   = useState(false)
  const searchRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!storeId) return
    Promise.all([loadProducts(storeId), loadCategories(storeId)])
      .finally(() => setLoading(false))
  }, [storeId])

  // Start again from the first batch (and the top of the list) whenever the list changes shape
  useEffect(() => {
    setVisible(BATCH_SIZE)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [search, catFilter, stockFilter, typeFilter, sortField, sortDir])

  async function loadProducts(sid) {
    // One request returns at most 1000 rows, so read the catalogue in pages
    const all = []
    for (let page = 0; ; page++) {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name)")
        .eq("store_id", sid)
        .eq("is_active", true)
        .order("name")
        .order("id")
        .range(page * 1000, (page + 1) * 1000 - 1)
      if (error || !data) break
      all.push(...data)
      if (data.length < 1000) break
    }
    setProducts(all)
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

  // Search words: punctuation such as ( ) - / . , is ignored on both sides,
  // and every word typed must appear somewhere in the name, item code or barcode.
  const searchTokens = normalizeText(search).split(" ").filter(Boolean)

  // Filter + sort
  const filtered = products
    .filter(p => {
      const haystack = normalizeText(`${p.name || ""} ${p.local_names || ""} ${p.sku || ""} ${p.barcode || ""}`)
      const matchSearch = searchTokens.every(t => haystack.includes(t))
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

  // Progressive rendering (no pages)
  const rows        = filtered.slice(0, visible)
  const hasMore     = visible < filtered.length
  const filteredIds = filtered.map(p => p.id)
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selected.includes(id))

  // The item shown in the details panel (looked up live so edits show immediately)
  const sel = selectedId ? products.find(p => p.id === selectedId) : null
  const split = !!sel

  // Add the next batch when you scroll near the bottom
  function handleTableScroll(e) {
    const el = e.currentTarget
    if (hasMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      setVisible(v => v + BATCH_SIZE)
    }
  }

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
      name: p.name, local_names: p.local_names || "", sku: p.sku || "", barcode: p.barcode || "",
      unit: p.unit, cost_price: p.cost_price, list_price: p.list_price ?? "",
      previous_cost_price: p.previous_cost_price ?? "", selling_price: p.selling_price,
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
    const previous = editing ? products.find(p => p.id === editing) : null
    const payload = {
      ...form, store_id: storeId,
      name: composeName(form.name, form.local_names, previous?.local_names),
      local_names: splitLocalNames(form.local_names).join(", ") || null,
      cost_price:     parseFloat(form.cost_price)     || 0,
      list_price:     form.list_price !== "" ? parseFloat(form.list_price) : null,
      previous_cost_price: form.previous_cost_price !== "" ? parseFloat(form.previous_cost_price) : null,
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

  // Open the confirm modal (single item)
  function askDelete(p) {
    setConfirmDelete({ type: "single", id: p.id, name: p.name })
  }

  // Open the confirm modal (bulk)
  function askBulkDelete() {
    setConfirmDelete({ type: "bulk", count: selected.length })
  }

  async function runDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      if (confirmDelete.type === "single") {
        const { error } = await supabase.from("products").update({ is_active: false }).eq("id", confirmDelete.id)
        if (error) return toast.error(error.message)
        toast.success("Product removed")
        if (confirmDelete.id === selectedId) setSelectedId(null)
        setSelected(prev => prev.filter(i => i !== confirmDelete.id))
      } else {
        // One request for all selected rows
        const { error } = await supabase.from("products").update({ is_active: false }).in("id", selected)
        if (error) return toast.error(error.message)
        toast.success(`${selected.length} products removed`)
        if (selected.includes(selectedId)) setSelectedId(null)
        setSelected([])
      }
      loadProducts(storeId)
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  async function handleRecalculateTypes() {
    setRecalculating(true)
    toast.loading("Classifying products by sales velocity…", { id: "classify" })
    try {
      const res = await api.post("/api/admin/classify-products")
      const { updated_count, total_checked, summary } = res.data
      toast.success(
        `Updated ${updated_count} of ${total_checked}: ` +
        `${summary.fast} Fast, ${summary.moderate} Moderate, ${summary.slow} Slow, ${summary.dead_stock} Dead Stock`,
        { id: "classify", duration: 6000 }
      )
      loadProducts(storeId)
    } catch (err) {
      toast.error("Could not classify. Is the backend running?", { id: "classify" })
    } finally {
      setRecalculating(false)
    }
  }

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  // Selects / unselects every product matching the current filters
  function toggleSelectAll() {
    setSelected(prev =>
      allSelected
        ? prev.filter(id => !filteredIds.includes(id))
        : [...new Set([...prev, ...filteredIds])]
    )
  }

  const fmt = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

  const stats = {
    total:   products.length,
    low:     products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.reorder_level).length,
    out:     products.filter(p => p.stock_quantity <= 0).length,
    healthy: products.filter(p => p.stock_quantity > p.reorder_level).length,
  }
  const countFor = (key) =>
    key === "all" ? stats.total : key === "healthy" ? stats.healthy : key === "low" ? stats.low : stats.out

  const sortBtn = (field, label) => (
    <button onClick={() => toggleSort(field)}
      className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-gray-900 ${sortField === field ? "text-gray-900" : ""}`}>
      {label} <ArrowUpDown size={13} />
    </button>
  )

  if (storeLoading || loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-lime-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // Search bar
  const searchBox = (
    <div className="relative w-full max-w-sm">
      <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        ref={searchRef}
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search name, local name, SKU, barcode…"
        className={`${FIELD} pl-9 ${search ? "pr-9" : "pr-3"}`}
      />
      {search && (
        <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      )}
    </div>
  )

  // Filter dropdowns (custom, styled like the customers sort menu)
  const stockSelect = (
    <Dropdown
      wrapClass={split ? "flex-1 min-w-0" : "w-44"}
      heading="Stock"
      value={stockFilter}
      onChange={setStockFilter}
      options={STOCK_TABS.map(s => ({ value: s.key, label: `${s.label} (${countFor(s.key)})` }))}
    />
  )
  const catSelect = (
    <Dropdown
      wrapClass={split ? "flex-1 min-w-0" : "w-44"}
      heading="Category"
      value={catFilter}
      onChange={setCatFilter}
      options={[{ value: "", label: "All Categories" }, ...categories.map(c => ({ value: c.id, label: c.name }))]}
    />
  )
  const typeSelect = (
    <Dropdown
      wrapClass={split ? "flex-1 min-w-0" : "w-40"}
      heading="Type"
      value={typeFilter}
      onChange={setTypeFilter}
      options={[{ value: "all", label: "All Types" }, ...PRODUCT_TYPES.map(t => ({ value: t.val, label: t.label }))]}
    />
  )

  // Details panel numbers
  const selIsLow = sel && sel.stock_quantity > 0 && sel.stock_quantity <= sel.reorder_level
  const selIsOut = sel && sel.stock_quantity <= 0
  const selMargin = sel && sel.selling_price > 0
    ? ((sel.selling_price - sel.cost_price) / sel.selling_price * 100).toFixed(1)
    : null

  // Live margin preview in the form (real number checks, so a 0 is never printed)
  const formSale = parseFloat(form.selling_price)
  const formCost = parseFloat(form.cost_price)
  const showMarginPreview = formSale > 0 && formCost > 0
  const marginOk = formSale >= formCost

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col gap-4 px-6 py-5 overflow-hidden">

      {/* Row 1: (back arrow in split view) + title + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div>
          {split && (
            <button onClick={() => setSelectedId(null)}
              className="mb-1.5 inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              title="Back to all items">
              <ArrowLeft size={16} />
            </button>
          )}
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRecalculateTypes}
            disabled={recalculating}
            className={BTN_OUTLINE}
            title="Recalculate Fast/Moderate/Slow/Dead Stock based on last 90 days of sales">
            <RefreshCw size={13} className={recalculating ? "animate-spin" : ""} />
            {recalculating ? "Recalculating…" : "Recalculate Types"}
          </button>
          <button className={BTN_OUTLINE}><Upload size={13} /> Import</button>
          <button className={BTN_OUTLINE}><Download size={13} /> Export</button>
          <button onClick={openAdd} className={BTN_DARK}><Plus size={14} /> Add New Item</button>
        </div>
      </div>

      {!split ? (
        <>
          {/* Row 2: dropdowns. Row 3: search bar (left) + selection strip (right) */}
          <div className="shrink-0 flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {stockSelect}
              {catSelect}
              {typeSelect}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {searchBox}

              {selected.length > 0 && (
                <div className="ml-auto inline-flex items-center h-9 gap-1 pl-3 pr-1 rounded-lg bg-gray-700 text-white text-[13px]">
                  <span className="font-medium tabular-nums">{selected.length} selected</span>
                  <span className="text-gray-400 mx-1">·</span>
                  <button onClick={() => setSelected([])}
                    className="px-2 py-1 rounded-md text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
                    Clear
                  </button>
                  <button onClick={askBulkDelete}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-500 hover:bg-red-600 text-white transition-colors">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Table card: fixed card, rows scroll inside it, header stays pinned, no pages */}
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div ref={scrollRef} onScroll={handleTableScroll} className="flex-1 min-h-0 overflow-auto slim-scroll">
              <table className="w-full text-sm min-w-[780px]">
                <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_0_#f3f4f6]">
                  <tr className="text-base font-medium text-gray-600 whitespace-nowrap">
                    <th className="pl-5 pr-2 py-5 w-10 text-left">
                      <input type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 accent-lime-600 cursor-pointer" />
                    </th>
                    <th className="px-3 py-5 text-left">{sortBtn("name", "Item Name")}</th>
                    <th className="px-4 py-5 text-left">Category</th>
                    <th className="px-4 py-5 text-left">Item Code</th>
                    <th className="px-4 py-5 text-right">{sortBtn("selling_price", "Sale Price")}</th>
                    <th className="px-4 py-5 text-right">{sortBtn("stock_quantity", "Quantity")}</th>
                    <th className="pl-16 pr-6 py-5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16">
                        <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                          <Package size={24} className="text-gray-300" />
                        </div>
                        <p className="text-gray-500 text-sm font-medium">No products found</p>
                        <p className="text-gray-400 text-xs mt-1">Try adjusting your filters or add a new product</p>
                        <button onClick={openAdd} className={`${BTN_DARK} mt-4`}>
                          <Plus size={14} /> Add first product
                        </button>
                      </td>
                    </tr>
                  ) : rows.map(p => {
                    const isLow  = p.stock_quantity > 0 && p.stock_quantity <= p.reorder_level
                    const isOut  = p.stock_quantity <= 0
                    const isTicked = selected.includes(p.id)

                    return (
                      <tr key={p.id}
                        onClick={() => setSelectedId(p.id)}
                        className={`cursor-pointer transition-colors ${isTicked ? "bg-lime-50/60" : "hover:bg-gray-50/70"}`}>
                        <td className="pl-5 pr-2 py-3" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={isTicked} onChange={() => toggleSelect(p.id)}
                            className="h-4 w-4 rounded border-gray-300 accent-lime-600 cursor-pointer" />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={p.name} />
                            <ItemName name={p.name} className="min-w-[14rem]" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {p.categories?.name || <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                          {p.sku || <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-gray-900">
                          {p.selling_price > 0 ? fmt(p.selling_price) : <span className="text-xs text-red-400">Not set</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 font-medium ${
                            isOut ? "text-red-500" : isLow ? "text-amber-600" : "text-gray-900"
                          }`}>
                            {(isLow || isOut) && <AlertTriangle size={12} />}
                            {p.stock_quantity} {p.unit}
                          </span>
                        </td>
                        <td className="pl-16 pr-6 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 whitespace-nowrap">
                            <span className={`w-1.5 h-1.5 rounded-full ${isOut ? "bg-red-500" : isLow ? "bg-amber-500" : "bg-green-500"}`} />
                            {isOut ? "Out of stock" : isLow ? "Low stock" : "In stock"}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer: filtered stock value (bottom right) */}
            <div className="shrink-0 px-5 py-2.5 border-t border-gray-100 bg-gray-50/70 text-xs text-gray-500 text-right">
              Filtered stock value:{" "}
              <span className="font-semibold text-gray-700 tabular-nums">
                {fmt(filtered.reduce((s, p) => s + p.cost_price * p.stock_quantity, 0))}
              </span>
            </div>
          </div>
        </>
      ) : (
        /* Split view: compact list on the left, item details on the right */
        <div className="flex-1 min-h-0 flex gap-4">

          {/* LEFT: compact list */}
          <div className="w-[380px] shrink-0 min-h-0 flex flex-col gap-3">
            <div className="shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                {stockSelect}
                {catSelect}
              </div>
              <div className="flex items-center gap-2">
                {typeSelect}
              </div>
              {searchBox}
            </div>

            <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div ref={scrollRef} onScroll={handleTableScroll} className="flex-1 min-h-0 overflow-y-auto slim-scroll divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-sm text-gray-400">No products found</p>
                  </div>
                ) : rows.map(p => {
                  const isLow = p.stock_quantity > 0 && p.stock_quantity <= p.reorder_level
                  const isOut = p.stock_quantity <= 0
                  const active = p.id === selectedId
                  return (
                    <button key={p.id} onClick={() => setSelectedId(p.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left border-l-[3px] transition-colors ${
                        active ? "bg-lime-50/70 border-l-lime-500" : "border-l-transparent hover:bg-gray-50"
                      }`}>
                      <Avatar name={p.name} active={active} />
                      <div className="flex-1 min-w-0">
                        <ItemName name={p.name} />
                        <p className="text-xs text-gray-400 truncate mt-0.5">{p.categories?.name || "—"}</p>
                      </div>
                      <span className={`text-xs font-medium tabular-nums shrink-0 ${
                        isOut ? "text-red-500" : isLow ? "text-amber-600" : "text-gray-600"
                      }`}>
                        {p.stock_quantity} {p.unit}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: item details */}
          <div className="flex-1 min-w-0 min-h-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-y-auto slim-scroll">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-4 min-w-0">
                <Avatar name={sel.name} className="w-14 h-14 text-base rounded-xl" />
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 break-words">{sel.name}</h2>
                  <p className="text-sm text-gray-400 mt-0.5">{sel.categories?.name || "No category"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => openEdit(sel)} className={BTN_OUTLINE}>
                  <Edit2 size={13} /> Edit
                </button>
                <button onClick={() => askDelete(sel)}
                  className={`${BTN_OUTLINE} !text-red-600 !border-red-200 hover:!bg-red-50`}>
                  <Trash2 size={13} /> Delete
                </button>
                <button onClick={() => setSelectedId(null)}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                  title="Close">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Key numbers */}
            <div className="grid grid-cols-3 gap-4 px-6 py-5 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 mb-1">Stock Quantity</p>
                <p className={`text-xl font-bold tabular-nums ${selIsOut ? "text-red-500" : selIsLow ? "text-amber-600" : "text-gray-900"}`}>
                  {sel.stock_quantity} {sel.unit}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Sale Price</p>
                <p className="text-xl font-bold tabular-nums text-gray-900">
                  {sel.selling_price > 0 ? fmt(sel.selling_price) : <span className="text-red-400 text-base">Not set</span>}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Stock Value</p>
                <p className="text-xl font-bold tabular-nums text-gray-900">{fmt(sel.cost_price * sel.stock_quantity)}</p>
              </div>
            </div>

            {/* Details */}
            <div className="px-6 py-5">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Item Details</h3>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-5">
                <Detail label="Type">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${typeMeta(sel.product_type).badge}`}>
                    {typeMeta(sel.product_type).label}
                  </span>
                </Detail>
                <Detail label="Status">
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <span className={`w-1.5 h-1.5 rounded-full ${selIsOut ? "bg-red-500" : selIsLow ? "bg-amber-500" : "bg-green-500"}`} />
                    {selIsOut ? "Out of stock" : selIsLow ? "Low stock" : "In stock"}
                  </span>
                </Detail>
                <Detail label="Local Names">
                  {sel.local_names ? <span className="text-sm">{sel.local_names}</span> : <span className="text-gray-400">—</span>}
                </Detail>
                <Detail label="Item Code">
                  {sel.sku ? <span className="font-mono text-[13px]">{sel.sku}</span> : <span className="text-gray-400">—</span>}
                </Detail>
                <Detail label="Purchase Price (net)"><span className="tabular-nums">{fmt(sel.cost_price)}</span></Detail>
                <Detail label="List Price (gross)">
                  {sel.list_price != null ? <span className="tabular-nums">{fmt(sel.list_price)}</span> : <span className="text-gray-400">—</span>}
                </Detail>
                <Detail label="Previous Cost">
                  {sel.previous_cost_price != null ? <span className="tabular-nums">{fmt(sel.previous_cost_price)}</span> : <span className="text-gray-400">—</span>}
                </Detail>
                <Detail label="Margin">
                  {selMargin != null
                    ? <span className={`tabular-nums ${parseFloat(selMargin) >= 20 ? "text-green-600" : parseFloat(selMargin) >= 10 ? "text-amber-600" : "text-red-500"}`}>{selMargin}%</span>
                    : <span className="text-gray-400">—</span>}
                </Detail>
                <Detail label="Reorder Level">{sel.reorder_level} {sel.unit}</Detail>
                <Detail label="Unit">{sel.unit}</Detail>
                <Detail label="Barcode">
                  {sel.barcode ? <span className="font-mono text-[13px]">{sel.barcode}</span> : <span className="text-gray-400">—</span>}
                </Detail>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => !deleting && setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                <Trash2 size={22} />
              </div>
              <div className="pt-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900">
                  {confirmDelete.type === "bulk" ? `Delete ${confirmDelete.count} products?` : "Delete product?"}
                </h2>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed break-words">
                  {confirmDelete.type === "bulk"
                    ? "The selected products will be removed from your inventory."
                    : <><span className="font-medium text-gray-700">{confirmDelete.name}</span> will be removed from your inventory.</>}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="px-5 py-2 text-sm border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={runDelete} disabled={deleting}
                className="px-5 py-2 text-sm rounded-xl font-semibold bg-red-600 hover:bg-red-700 text-white active:scale-[0.97] transition-all duration-150 disabled:opacity-50">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-100">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {editing ? "Edit Product" : "Add New Product"}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Modal body (slim, light scrollbar) */}
            <div className="overflow-y-auto slim-scroll flex-1 px-6 py-5 space-y-4">

              <div>
                <label className={LABEL}>Product name *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="e.g. Brake Pad TVS (Front)" className={FIELD} autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Category</label>
                  <SelectBox
                    value={addingCat ? "__new__" : form.category_id}
                    onChange={e => {
                      if (e.target.value === "__new__") {
                        setAddingCat(true)
                      } else {
                        setAddingCat(false)
                        setForm({ ...form, category_id: e.target.value })
                      }
                    }}>
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value="__new__">+ Add new category</option>
                  </SelectBox>

                  {addingCat && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleAddCategory() }}
                        placeholder="e.g. Brake System"
                        className={FIELD}
                        autoFocus
                      />
                      <button type="button" onClick={handleAddCategory} disabled={savingCat}
                        className={`${BTN_DARK} shrink-0`}>
                        {savingCat ? "Adding…" : "Add"}
                      </button>
                      <button type="button"
                        onClick={() => { setAddingCat(false); setNewCatName("") }}
                        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className={LABEL}>Unit</label>
                  <SelectBox value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </SelectBox>
                </div>
              </div>

              {/* Product type */}
              <div>
                <label className={LABEL}>
                  Product type
                  <span className={HINT}>(or auto-set with Recalculate Types)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {PRODUCT_TYPES.map(t => (
                    <button key={t.val} type="button"
                      onClick={() => setForm({ ...form, product_type: t.val, reorder_level: t.reorder })}
                      className={`px-4 py-3 rounded-xl border text-left transition-colors ${
                        form.product_type === t.val
                          ? "border-lime-500 bg-lime-50 ring-1 ring-lime-500"
                          : "border-gray-200 hover:border-gray-300"
                      }`}>
                      <p className={`text-sm font-semibold ${form.product_type === t.val ? "text-lime-800" : "text-gray-800"}`}>
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
                  <label className={LABEL}>
                    Purchase price (Rs)
                    <span className={HINT}>(net, used for stock value)</span>
                  </label>
                  <input type="number" min="0" step="1"
                    value={form.cost_price} onChange={e => setForm({...form, cost_price: e.target.value})}
                    placeholder="0" className={NUM} />
                </div>
                <div>
                  <label className={LABEL}>Sale price (Rs)</label>
                  <input type="number" min="0" step="1"
                    value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})}
                    placeholder="0" className={NUM} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>
                    List price (Rs)
                    <span className={HINT}>(gross, reference only)</span>
                  </label>
                  <input type="number" min="0" step="1"
                    value={form.list_price} onChange={e => setForm({...form, list_price: e.target.value})}
                    placeholder="0" className={NUM} />
                </div>
                <div>
                  <label className={LABEL}>
                    Previous cost (Rs)
                    <span className={HINT}>(last purchase, read only)</span>
                  </label>
                  <input type="number" step="1" readOnly
                    value={form.previous_cost_price}
                    placeholder="None" className={`${NUM} bg-gray-50 text-gray-500`} />
                </div>
              </div>

              {/* Stock */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Opening stock</label>
                  <input type="number" min="0" step="1"
                    value={form.stock_quantity} onChange={e => setForm({...form, stock_quantity: e.target.value})}
                    placeholder="0" className={NUM} />
                </div>
                <div>
                  <label className={LABEL}>
                    Reorder level
                    <span className={HINT}>(auto: {typeMeta(form.product_type).reorder})</span>
                  </label>
                  <input type="number" min="0" step="1"
                    value={form.reorder_level} onChange={e => setForm({...form, reorder_level: e.target.value})}
                    className={NUM} />
                </div>
              </div>

              {/* Local names */}
              <div>
                <label className={LABEL}>Local / shop names</label>
                <input value={form.local_names} onChange={e => setForm({...form, local_names: e.target.value})}
                  placeholder="e.g. patta, chhapo (separate with commas)" className={FIELD} />
              </div>

              {/* SKU + Barcode */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>SKU / Item code</label>
                  <input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})}
                    placeholder="e.g. BP-TVS-001" className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Barcode</label>
                  <input value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})}
                    placeholder="Optional" className={FIELD} />
                </div>
              </div>

              {/* Live margin preview (only when both prices are above 0) */}
              {showMarginPreview && (
                <div className={`rounded-xl px-4 py-3 flex items-center justify-between border ${
                  marginOk ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                }`}>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Profit per unit</p>
                    <p className={`text-base font-bold ${marginOk ? "text-green-700" : "text-red-600"}`}>
                      Rs {(formSale - formCost).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-gray-500">Margin</p>
                    <p className={`text-base font-bold ${marginOk ? "text-green-700" : "text-red-600"}`}>
                      {(((formSale - formCost) / formSale) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/70 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className={BTN_OUTLINE}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className={BTN_DARK}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}