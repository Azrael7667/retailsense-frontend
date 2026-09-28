import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { useStoreId } from "../../hooks/useStoreId"
import { shortDocNumber } from "../../utils/docNumber"
import { Search, Plus, Minus, Trash2, ShoppingCart, Check, X } from "lucide-react"
import toast from "react-hot-toast"

// ---- Shared theme classes (new palette: navy + soft lime) ----
const PRIMARY_BTN = "bg-slate-900 hover:bg-slate-800 text-white dark:bg-lime-300 dark:hover:bg-lime-400 dark:text-slate-900"
const CHIP_ACTIVE = "bg-lime-200 text-slate-900 shadow-sm dark:bg-lime-300"
const CHIP_IDLE   = "bg-gray-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400 hover:bg-lime-100 dark:hover:bg-gray-700"

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

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) &&
    (catFilter ? p.category_id === catFilter : true)
  )

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

  const subtotal = cart.reduce((s, i) => s + i.total, 0)
  const discAmt  = parseFloat(discount) || 0
  const total    = Math.max(0, subtotal - discAmt)

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
    <div className="flex h-full overflow-hidden">

      {/* ── Left: product grid ── */}
      <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">

        {/* Search + category filter */}
        <div className="p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search products by name… (Ctrl+F)"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-200 dark:focus:ring-lime-900"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button onClick={() => setCatFilter("")}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!catFilter ? CHIP_ACTIVE : CHIP_IDLE}`}>
              All
            </button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setCatFilter(c.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${catFilter === c.id ? CHIP_ACTIVE : CHIP_IDLE}`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <ShoppingCart size={48} className="text-gray-200 dark:text-gray-700 mb-3" />
              <p className="text-gray-400">No products found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  disabled={p.stock_quantity <= 0}
                  className={`relative bg-white dark:bg-gray-900 rounded-xl border text-left p-3 transition-all hover:shadow-md hover:border-lime-400 dark:hover:border-lime-600 hover:bg-lime-50/40 active:scale-95 ${
                    p.stock_quantity <= 0
                      ? "border-gray-100 dark:border-gray-800 opacity-50 cursor-not-allowed"
                      : "border-gray-200 dark:border-gray-800 cursor-pointer"
                  }`}
                >
                  {/* Category badge */}
                  {p.categories?.name && (
                    <span className="text-xs text-gray-500 mb-1 block truncate">{p.categories.name}</span>
                  )}
                  <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug mb-2 line-clamp-2">{p.name}</p>
                  <p className="text-base font-bold text-slate-900 dark:text-lime-300">Rs {p.selling_price.toLocaleString("en-IN")}</p>
                  <p className={`text-xs mt-1 ${p.stock_quantity <= p.reorder_level ? "text-red-500" : "text-gray-500"}`}>
                    Stock: {p.stock_quantity} {p.unit}
                  </p>
                  {/* Cart indicator */}
                  {cart.find(i => i.id === p.id) && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-slate-900 dark:bg-lime-300 rounded-full flex items-center justify-center">
                      <span className="text-white dark:text-slate-900 text-xs font-bold">{cart.find(i => i.id === p.id).qty}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: cart + checkout ── */}
      <div className="w-80 shrink-0 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 flex flex-col">

        {/* Cart header */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-lime-600" />
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Cart</span>
            {cart.length > 0 && (
              <span className="w-5 h-5 bg-slate-900 dark:bg-lime-300 rounded-full text-white dark:text-slate-900 text-xs flex items-center justify-center font-bold">
                {cart.reduce((s, i) => s + i.qty, 0)}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-600 transition-colors">Clear</button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <ShoppingCart size={40} className="text-gray-200 dark:text-gray-700 mb-3" />
              <p className="text-sm text-gray-400">Cart is empty</p>
              <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Click products to add them</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {cart.map(item => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-white leading-snug flex-1">{item.name}</p>
                    <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-500 transition-colors shrink-0 mt-0.5">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(item.id, -1)}
                        className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-lime-50 dark:hover:bg-gray-800 transition-colors">
                        <Minus size={12} className="text-slate-600 dark:text-gray-400" />
                      </button>
                      <span className="text-sm font-medium text-slate-900 dark:text-white w-6 text-center">{item.qty}</span>
                      <button onClick={() => updateQty(item.id, 1)}
                        className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-lime-50 dark:hover:bg-gray-800 transition-colors">
                        <Plus size={12} className="text-slate-600 dark:text-gray-400" />
                      </button>
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      Rs {item.total.toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Checkout section */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-3">
          {/* Customer */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Customer {payment === "credit" ? "(required for credit)" : "(optional)"}
            </label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-200 dark:focus:ring-lime-900">
              <option value="">Walk-in customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment</label>
            <div className="grid grid-cols-3 gap-1">
              {["cash","card","esewa"].map(m => (
                <button key={m} onClick={() => setPayment(m)}
                  className={`py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${payment===m ? CHIP_ACTIVE : "border border-gray-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:bg-lime-50 dark:hover:bg-gray-800"}`}>
                  {m}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {["khalti","credit","bank_transfer"].map(m => (
                <button key={m} onClick={() => setPayment(m)}
                  className={`py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${payment===m ? CHIP_ACTIVE : "border border-gray-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:bg-lime-50 dark:hover:bg-gray-800"}`}>
                  {m === "bank_transfer" ? "bank" : m}
                </button>
              ))}
            </div>
          </div>

          {/* Discount */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500 shrink-0">Discount (Rs)</label>
            <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} min="0" max={subtotal}
              className="flex-1 px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm text-right focus:outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-200 dark:focus:ring-lime-900" />
          </div>

          {/* Totals */}
          <div className="space-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-3">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Subtotal ({cart.reduce((s,i)=>s+i.qty,0)} items)</span>
              <span>{fmt(subtotal)}</span>
            </div>
            {discAmt > 0 && (
              <div className="flex justify-between text-xs text-red-400">
                <span>Discount</span><span>- {fmt(discAmt)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-slate-900 dark:text-white">
              <span>Total</span><span>{fmt(total)}</span>
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