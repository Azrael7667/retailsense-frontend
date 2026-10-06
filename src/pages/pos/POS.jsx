import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { useStoreId } from "../../hooks/useStoreId"
import { shortDocNumber } from "../../utils/docNumber"
import { Search, Plus, Minus, Trash2, ShoppingCart, Check, X, ChevronDown } from "lucide-react"
import toast from "react-hot-toast"

// ---- Shared theme classes (new palette: navy + soft lime) ----
const PRIMARY_BTN = "bg-slate-900 hover:bg-slate-800 text-white dark:bg-lime-300 dark:hover:bg-lime-400 dark:text-slate-900"
const CHIP_ACTIVE = "bg-lime-200 text-slate-900 shadow-sm dark:bg-lime-300"
const CHIP_IDLE   = "bg-gray-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400 hover:bg-lime-100 dark:hover:bg-gray-700"
const PAY_IDLE    = "border border-gray-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:bg-lime-50 dark:hover:bg-gray-800"
const FIELD       = "border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-200 dark:focus:ring-lime-900"

// "Accelerator Cable End (Mahindra Bolero)" -> ["Accelerator Cable End", "(Mahindra Bolero)"]
function splitName(name = "") {
  const i = name.indexOf(" (")
  if (i === -1) return [name, ""]
  return [name.slice(0, i), name.slice(i + 1)]
}

// Lowercase, turn every character that is not a letter or digit into a space, collapse spaces
function normalizeText(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

// Punctuation-insensitive match (same helper as Sales Return / Payment In).
// Brackets, dashes, dots and commas are ignored on both sides; every word typed must
// appear in the text, OR the typed characters (without spaces) must appear in the text
// (without spaces).
function matchesSearch(haystackRaw, query) {
  const tokens = normalizeText(query).split(" ").filter(Boolean)
  if (!tokens.length) return true
  const hay = normalizeText(haystackRaw)
  if (tokens.every(t => hay.includes(t))) return true
  return hay.replace(/ /g, "").includes(tokens.join(""))
}

export default function POS() {
  const { storeId } = useStoreId()
  const [products,   setProducts]   = useState([])
  const [categories, setCategories] = useState([])
  const [cart,       setCart]       = useState([])
  const [search,     setSearch]     = useState("")
  const [catFilter,  setCatFilter]  = useState("")
  const [customers,  setCustomers]  = useState([])
  const [customerId, setCustomerId] = useState("")
  const [payment,    setPayment]    = useState("cash")
  const [discount,   setDiscount]   = useState(0)
  const [saving,     setSaving]     = useState(false)
  const [success,    setSuccess]    = useState(null)
  const searchRef = useRef(null)

  // Customer picker (custom dropdown, opens upward because it sits at the bottom of the sidebar)
  const [custOpen,   setCustOpen]   = useState(false)
  const [custSearch, setCustSearch] = useState("")
  const custRef = useRef(null)

  async function loadData() {
    const [p, c, cu] = await Promise.all([
      supabase.from("products").select("*, categories(name)").eq("store_id", storeId).eq("is_active", true).order("name"),
      supabase.from("categories").select("*").eq("store_id", storeId).order("name"),
      supabase.from("customers").select("id, name, phone").eq("store_id", storeId).order("name"),
    ])
    setProducts(p.data || [])
    setCategories(c.data || [])
    setCustomers(cu.data || [])
  }

  useEffect(() => {
    if (!storeId) return
    loadData()
    searchRef.current?.focus()
  }, [storeId])

  // Close the customer list on outside click or Esc
  useEffect(() => {
    function onClick(e) {
      if (custRef.current && !custRef.current.contains(e.target)) setCustOpen(false)
    }
    function onKey(e) { if (e.key === "Escape") setCustOpen(false) }
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  // Product search ignores punctuation, so "accelerator cable end ma" finds "Accelerator Cable End (Mahindra …)"
  const filtered = products.filter(p =>
    matchesSearch(`${p.name || ""} ${p.local_names || ""}`, search) &&
    (catFilter ? p.category_id === catFilter : true)
  )

  // Quick lookups for the product grid (quantity in cart, product count per category)
  const cartQty  = Object.fromEntries(cart.map(i => [i.id, i.qty]))
  const catCount = products.reduce((m, p) => {
    if (p.category_id) m[p.category_id] = (m[p.category_id] || 0) + 1
    return m
  }, {})

  function addToCart(product) {
    if (product.stock_quantity <= 0) return toast.error("Out of stock!")
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) {
        if (existing.qty >= product.stock_quantity) return toast.error("Not enough stock") || prev
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1, total: (i.qty + 1) * i.price } : i)
      }
      return [...prev, { id: product.id, name: product.name, price: product.selling_price, qty: 1, total: product.selling_price, unit: product.unit, stock: product.stock_quantity }]
    })
  }

  function updateQty(id, delta) {
    setCart(prev => prev.map(i => {
      if (i.id !== id) return i
      const newQty = Math.max(1, i.qty + delta)
      if (newQty > i.stock) { toast.error("Not enough stock"); return i }
      return { ...i, qty: newQty, total: newQty * i.price }
    }))
  }

  function removeFromCart(id) { setCart(prev => prev.filter(i => i.id !== id)) }
  function clearCart() { setCart([]); setDiscount(0); setCustomerId(""); setPayment("cash") }

  function toggleCustList() {
    setCustOpen(o => !o)
    setCustSearch("")
  }
  function pickCustomer(id) {
    setCustomerId(id)
    setCustOpen(false)
    setCustSearch("")
  }

  const subtotal = cart.reduce((s, i) => s + i.total, 0)
  const discAmt  = parseFloat(discount) || 0
  const total    = Math.max(0, subtotal - discAmt)

  const selCustomer   = customers.find(c => c.id === customerId)
  const filteredCusts = customers.filter(c => matchesSearch(`${c.name || ""} ${c.phone || ""}`, custSearch))

  async function handleCheckout() {
    if (cart.length === 0) return toast.error("Cart is empty")
    const isCredit = payment === "credit"
    if (isCredit && !customerId) return toast.error("Select a customer for a credit sale")

    setSaving(true)
    try {
      // The backend assigns the invoice number, deducts stock, records cost
      // price at sale, and adds any unpaid amount to the customer's balance.
      const { data: inv } = await apiClient.post("/api/invoices/", {
        customer_id:    customerId || null,
        invoice_date:   new Date().toISOString().split("T")[0],
        payment_method: payment,
        paid_amount:    isCredit ? 0 : Math.round(total * 100) / 100,
        discount:       discAmt,
        tax:            0,
        items: cart.map(i => ({
          product_id:   i.id,
          product_name: i.name,
          quantity:     i.qty,
          unit_price:   i.price,
          discount:     0,
        })),
        invoice_number_mode: "auto",
      })

      setSuccess({
        invNum: shortDocNumber(inv.invoice_number, inv.invoice_date),
        total:  inv.total,
        credit: isCredit,
      })
      loadData() // refresh stock counts on the product grid
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message)
    } finally {
      setSaving(false)
    }
  }

  const fmt = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

  // Success screen
  if (success) return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 dark:bg-gray-950 p-8">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-10 text-center max-w-sm w-full">
        <div className="w-16 h-16 bg-lime-100 dark:bg-lime-950 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check size={32} className="text-lime-700 dark:text-lime-300" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Sale complete!</h2>
        <p className="text-sm text-gray-500 mb-1">{success.invNum}</p>
        {success.credit && <p className="text-xs text-amber-600 mb-1">Credit sale — added to customer balance</p>}
        <p className="text-3xl font-bold text-slate-900 dark:text-white mb-6">{fmt(success.total)}</p>
        <div className="flex gap-3">
          <button onClick={() => { setSuccess(null); clearCart() }}
            className={`flex-1 py-3 rounded-xl font-medium text-sm transition-colors ${PRIMARY_BTN}`}>
            New Sale
          </button>
          <button onClick={() => window.print()}
            className="flex-1 py-3 border border-gray-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 rounded-xl text-sm hover:bg-lime-50 dark:hover:bg-gray-800">
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Left: product grid ── */}
      <div className="flex-1 min-w-0 flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">

        {/* Search + category filter */}
        <div className="shrink-0 px-5 pt-4 pb-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search products by name… (Ctrl+F)"
              className="w-full pl-10 pr-10 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-200 dark:focus:ring-lime-900"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category chips: scrolls sideways, the fade on the right shows there is more */}
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-1 pr-10 no-scrollbar">
              <button onClick={() => setCatFilter("")}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${!catFilter ? CHIP_ACTIVE : CHIP_IDLE}`}>
                All <span className="opacity-60 tabular-nums">{products.length}</span>
              </button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setCatFilter(c.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${catFilter === c.id ? CHIP_ACTIVE : CHIP_IDLE}`}>
                  {c.name} <span className="opacity-60 tabular-nums">{catCount[c.id] || 0}</span>
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-12 bg-gradient-to-l from-white dark:from-gray-900 to-transparent" />
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <ShoppingCart size={48} className="text-gray-200 dark:text-gray-700 mb-3" />
              <p className="text-gray-400">No products found</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3">
                Showing <span className="font-semibold text-gray-600 dark:text-gray-300">{filtered.length}</span> of {products.length} products
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {filtered.map(p => {
                  const qtyInCart = cartQty[p.id]
                  const out = p.stock_quantity <= 0
                  const low = !out && p.stock_quantity <= p.reorder_level
                  const [main, variant] = splitName(p.name)
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      disabled={out}
                      title={p.name}
                      className={`h-full min-h-[136px] flex flex-col text-left p-3.5 rounded-xl border bg-white dark:bg-gray-900 transition-all active:scale-[0.98] ${
                        out
                          ? "border-gray-100 dark:border-gray-800 opacity-50 cursor-not-allowed"
                          : qtyInCart
                            ? "border-lime-400 dark:border-lime-600 bg-lime-50/50 dark:bg-lime-950/20 hover:shadow-md cursor-pointer"
                            : "border-gray-200 dark:border-gray-800 hover:border-lime-400 dark:hover:border-lime-600 hover:bg-lime-50/40 hover:shadow-md cursor-pointer"
                      }`}
                    >
                      {/* Category + how many are in the cart */}
                      <div className="flex items-center justify-between gap-2 min-h-[20px] mb-1.5">
                        <span className="text-[11px] font-medium text-gray-400 truncate">{p.categories?.name || ""}</span>
                        {qtyInCart && (
                          <span className="min-w-[20px] h-5 px-1 rounded-full bg-slate-900 dark:bg-lime-300 text-white dark:text-slate-900 text-[11px] font-bold flex items-center justify-center shrink-0">
                            {qtyInCart}
                          </span>
                        )}
                      </div>

                      {/* Name: full, never cut off. The variant in brackets goes on its own line */}
                      <p className="text-sm font-semibold text-slate-900 dark:text-white leading-5 break-words">{main}</p>
                      {variant && <p className="text-xs text-gray-500 dark:text-gray-400 leading-4 mt-0.5 break-words">{variant}</p>}

                      {/* Price + stock always sit at the bottom of the card */}
                      <div className="mt-auto pt-3">
                        {p.selling_price > 0 ? (
                          <p className="text-base font-bold text-slate-900 dark:text-lime-300 tabular-nums">Rs {p.selling_price.toLocaleString("en-IN")}</p>
                        ) : (
                          <p className="text-sm font-semibold text-red-400">Price not set</p>
                        )}
                        <p className={`mt-1 flex items-center gap-1.5 text-xs ${
                          out ? "text-red-500" : low ? "text-amber-600" : "text-gray-500"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${out ? "bg-red-500" : low ? "bg-amber-500" : "bg-green-500"}`} />
                          {out ? "Out of stock" : `${p.stock_quantity} ${p.unit}`}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Right: cart + checkout ── */}
      <div className="w-[340px] shrink-0 min-h-0 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 flex flex-col">

        {/* Cart header */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-lime-600" />
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Cart</span>
            {cart.length > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 bg-slate-900 dark:bg-lime-300 rounded-full text-white dark:text-slate-900 text-xs flex items-center justify-center font-bold">
                {cart.reduce((s, i) => s + i.qty, 0)}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-xs font-medium text-red-400 hover:text-red-600 transition-colors">Clear</button>
          )}
        </div>

        {/* Cart items (scrolls on its own, checkout below stays in view) */}
        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <ShoppingCart size={40} className="text-gray-200 dark:text-gray-700 mb-3" />
              <p className="text-sm text-gray-400">Cart is empty</p>
              <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Click products to add them</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {cart.map(item => {
                const [main, variant] = splitName(item.name)
                return (
                  <div key={item.id} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white leading-snug break-words">{main}</p>
                        {variant && <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug break-words">{variant}</p>}
                      </div>
                      <button onClick={() => removeFromCart(item.id)}
                        className="p-1 -mr-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-2.5">
                      <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <button onClick={() => updateQty(item.id, -1)}
                          className="w-7 h-7 flex items-center justify-center hover:bg-lime-50 dark:hover:bg-gray-800 transition-colors">
                          <Minus size={12} className="text-slate-600 dark:text-gray-400" />
                        </button>
                        <span className="w-9 text-center text-sm font-semibold text-slate-900 dark:text-white tabular-nums border-x border-gray-200 dark:border-gray-700 leading-7">{item.qty}</span>
                        <button onClick={() => updateQty(item.id, 1)}
                          className="w-7 h-7 flex items-center justify-center hover:bg-lime-50 dark:hover:bg-gray-800 transition-colors">
                          <Plus size={12} className="text-slate-600 dark:text-gray-400" />
                        </button>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                          Rs {item.total.toLocaleString("en-IN")}
                        </p>
                        {item.qty > 1 && (
                          <p className="text-[11px] text-gray-400 tabular-nums">Rs {item.price.toLocaleString("en-IN")} each</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Checkout section (always visible at the bottom) */}
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900 p-4 space-y-3.5">

          {/* Customer: custom dropdown that opens upward */}
          <div ref={custRef} className="relative">
            <label className={`block text-xs font-medium mb-1.5 ${payment === "credit" && !customerId ? "text-amber-600" : "text-gray-500"}`}>
              Customer {payment === "credit" ? "(required for credit)" : "(optional)"}
            </label>

            <button type="button" onClick={toggleCustList}
              className={`w-full flex items-center justify-between gap-2 pl-3 pr-3 py-2 text-sm text-left cursor-pointer ${FIELD} ${
                custOpen ? "!border-lime-500 ring-2 ring-lime-200 dark:ring-lime-900" : ""
              }`}>
              <span className={`truncate ${selCustomer ? "font-medium" : "text-gray-500 dark:text-gray-400"}`}>
                {selCustomer ? selCustomer.name : "Walk-in customer"}
              </span>
              <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${custOpen ? "rotate-180" : ""}`} />
            </button>

            {custOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 z-30 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl overflow-hidden">
                <div className="p-2.5 border-b border-gray-100 dark:border-gray-800">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input autoFocus value={custSearch} onChange={e => setCustSearch(e.target.value)}
                      placeholder="Type name or phone…"
                      className={`w-full pl-9 pr-3 py-2 text-sm ${FIELD}`} />
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto slim-scroll divide-y divide-gray-50 dark:divide-gray-800">
                  {!custSearch.trim() && (
                    <button onClick={() => pickCustomer("")}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors ${
                        !customerId ? "bg-lime-50/70 dark:bg-lime-950/20 text-slate-900 dark:text-white" : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}>
                      Walk-in customer
                      {!customerId && <Check size={14} className="text-lime-600" />}
                    </button>
                  )}
                  {filteredCusts.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-gray-400">No customers found</p>
                  ) : filteredCusts.map(c => {
                    const active = c.id === customerId
                    return (
                      <button key={c.id} onClick={() => pickCustomer(c.id)}
                        className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors ${
                          active ? "bg-lime-50/70 dark:bg-lime-950/20" : "hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">{c.name}</p>
                          {c.phone && <p className="text-[11px] text-gray-400">{c.phone}</p>}
                        </div>
                        {active && <Check size={14} className="text-lime-600 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Payment</label>
            <div className="grid grid-cols-3 gap-1.5">
              {["cash","card","esewa","khalti","credit","bank_transfer"].map(m => (
                <button key={m} onClick={() => setPayment(m)}
                  className={`py-2 rounded-lg text-xs font-medium capitalize transition-colors ${payment === m ? CHIP_ACTIVE : PAY_IDLE}`}>
                  {m === "bank_transfer" ? "bank" : m}
                </button>
              ))}
            </div>
          </div>

          {/* Discount */}
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-gray-500 shrink-0">Discount</label>
            <div className="relative w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rs</span>
              <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} min="0" max={subtotal}
                className={`no-spin w-full pl-8 pr-3 py-1.5 text-sm text-right tabular-nums ${FIELD}`} />
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-3 space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Subtotal ({cart.reduce((s,i)=>s+i.qty,0)} items)</span>
              <span className="tabular-nums">{fmt(subtotal)}</span>
            </div>
            {discAmt > 0 && (
              <div className="flex justify-between text-xs text-red-400">
                <span>Discount</span><span className="tabular-nums">- {fmt(discAmt)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-gray-100 dark:border-gray-700">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">Total</span>
              <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{fmt(total)}</span>
            </div>
          </div>

          {/* Checkout button */}
          <button
            onClick={handleCheckout}
            disabled={saving || cart.length === 0}
            className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${PRIMARY_BTN}`}
          >
            {saving ? "Processing…" : payment === "credit" ? `Sell on credit ${fmt(total)}` : `Charge ${fmt(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}