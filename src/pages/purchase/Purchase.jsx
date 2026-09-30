import { useEffect, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { shortDocNumber } from "../../utils/docNumber"
import { Plus, Trash2, ShoppingBag, Receipt, ScanLine, Search, X, ChevronDown, ArrowLeft, Check } from "lucide-react"
import toast from "react-hot-toast"
import ScanBill from "./ScanBill"
import DateRangeDropdown from "../../components/common/DateRangeDropdown"
import InvoicePurchaseDetailModal from "../../components/transactions/InvoicePurchaseDetailModal"

const emptyRow = () => ({ product_id: null, product_name: "", quantity: 1, unit_price: 0, discount_percent: 0, total: 0 })

const netUnitPrice = (row) => {
  const price = parseFloat(row.unit_price) || 0
  const disc = parseFloat(row.discount_percent) || 0
  return price * (1 - disc / 100)
}

// Lowercase, turn every character that is not a letter or digit into a space, collapse spaces
function normalizeText(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

// Punctuation-insensitive match: dashes, dots, brackets and commas are ignored on both sides.
// Every word typed must appear in the text, OR the typed characters (without spaces)
// must appear in the text (without spaces).
function matchesSearch(haystackRaw, query) {
  const tokens = normalizeText(query).split(" ").filter(Boolean)
  if (!tokens.length) return true
  const hay = normalizeText(haystackRaw)
  if (tokens.every(t => hay.includes(t))) return true
  return hay.replace(/ /g, "").includes(tokens.join(""))
}

// ---- Shared theme classes (new palette: navy + lime) ----
const PRIMARY_BTN = "bg-slate-900 hover:bg-slate-800 text-white dark:bg-lime-300 dark:hover:bg-lime-400 dark:text-slate-900"
const OUTLINE_BTN = "border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-slate-800 dark:text-gray-300"
const FIELD = "border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-200 dark:focus:ring-lime-900"

// ---- Filter dropdown sizing (all three filters share this) ----
const FILTER_W = "w-[150px]"

// ---- Inventory-style table look (slim-scroll = the thin, light scrollbar used across the app) ----
const CARD = "flex-1 min-h-0 flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"
const SCROLL = "flex-1 min-h-[200px] overflow-y-auto slim-scroll"
const THEAD = "sticky top-0 z-[1] bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800"
const TH = "text-left px-5 py-4 text-[15px] font-bold text-slate-700 dark:text-gray-200 whitespace-nowrap"
const TD = "px-5 py-4 text-[15px]"
const TROW = "hover:bg-lime-50 dark:hover:bg-gray-800 transition-colors"
const FOOTER = "shrink-0 px-5 py-3 border-t border-gray-100 dark:border-gray-800 text-right text-sm text-gray-500"

// Custom dropdown used by the Type / Status / Category filters — same look as the
// customers sort/filter menu: white card, soft shadow, small uppercase heading,
// lime highlight + check on the active option, lime ring on the button while open.
function FilterDropdown({ value, onChange, options, heading }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const current = options.find(o => o.value === value)?.label ?? ""

  return (
    <div ref={ref} className={`relative ${FILTER_W}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center justify-between gap-2 w-full pl-3.5 pr-3 py-2 text-sm text-left cursor-pointer border rounded-lg bg-white dark:bg-gray-800 text-slate-700 dark:text-white transition-colors ${
          open
            ? "border-lime-500 ring-2 ring-lime-400/40"
            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
        }`}
      >
        <span className="truncate">{current}</span>
        <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 min-w-[11rem] w-full z-30 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg py-1.5">
          {heading && (
            <p className="px-4 pt-1.5 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{heading}</p>
          )}
          <div className="max-h-64 overflow-y-auto slim-scroll">
            {options.map(o => {
              const active = value === o.value
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-sm text-left transition-colors ${
                    active
                      ? "bg-lime-50 dark:bg-gray-800 text-slate-900 dark:text-lime-300 font-semibold"
                      : "text-slate-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
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

const TYPE_OPTIONS = [
  { value: "purchases", label: "Purchase" },
  { value: "expenses",  label: "Expense" },
]

const STATUS_OPTIONS = [
  { value: "all",     label: "All Status" },
  { value: "paid",    label: "Paid" },
  { value: "unpaid",  label: "Unpaid" },
  { value: "partial", label: "Partial" },
]

const EXPENSE_CATS = ["Rent","Electricity","Water","Salary","Transport","Marketing","Maintenance","Telephone","Miscellaneous"]

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  ...EXPENSE_CATS.map(c => ({ value: c, label: c })),
]

export default function Purchase() {
  const { storeId } = useStoreId()
  const navigate = useNavigate()
  const [tab,       setTab]       = useState("purchases") // purchases | expenses
  const [scanOpen,  setScanOpen]  = useState(false)
  const [purchases, setPurchases] = useState([])
  const [expenses,  setExpenses]  = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products,  setProducts]  = useState([])
  const [showForm,  setShowForm]  = useState(false)
  const [rows,      setRows]      = useState([emptyRow()])
  const [header,    setHeader]    = useState({
    supplier_id: "", bill_number: "", purchase_date: new Date().toISOString().split("T")[0],
    tax: 0, notes: "", fullyPaid: true, paidAmount: "",
  })
  const [expense,   setExpense]   = useState({ category: "", amount: "", description: "", expense_date: new Date().toISOString().split("T")[0] })
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [saving,    setSaving]    = useState(false)

  // "Add New" dropdown in the page header
  const [showAddMenu, setShowAddMenu] = useState(false)

  // While the Scan Bill review screen is open, ScanBill registers its own "go back to the list"
  // action here. Otherwise the Back button closes Scan Bill and returns to the purchase list.
  const backHandlerRef = useRef(null)

  function handleBack() {
    if (backHandlerRef.current) backHandlerRef.current()
    else setScanOpen(false)
  }

  // Purchase detail modal — clicking a purchase row opens the same
  // InvoicePurchaseDetailModal used from the Suppliers page.
  const [viewingPurchase, setViewingPurchase] = useState(null)

  // Shared filters
  const [search,    setSearch]    = useState("")
  const [status,    setStatus]    = useState("all")
  const [eCategory, setECategory] = useState("all")
  const [dateFrom,  setDateFrom]  = useState("")
  const [dateTo,    setDateTo]    = useState("")

  useEffect(() => { if (storeId) { loadAll(); } }, [storeId])

  async function loadAll() {
    const [p, e, s, pr] = await Promise.all([
      supabase.from("purchases").select("*, suppliers(name)").eq("store_id", storeId).order("created_at", { ascending: false }),
      supabase.from("expenses").select("*").eq("store_id", storeId).order("expense_date", { ascending: false }),
      supabase.from("suppliers").select("id,name,balance").eq("store_id", storeId).order("name"),
      supabase.from("products").select("id,name,unit").eq("store_id", storeId).eq("is_active", true).order("name"),
    ])
    setPurchases(p.data || []); setExpenses(e.data || [])
    setSuppliers(s.data || []); setProducts(pr.data || [])
  }

  function updateRow(i, field, val) {
    const updated = [...rows]
    updated[i][field] = val
    if (field === "quantity" || field === "unit_price" || field === "discount_percent") {
      updated[i].total = (parseFloat(updated[i].quantity)||0) * netUnitPrice(updated[i])
    }
    setRows(updated)
  }

  const grossSubtotal = rows.reduce((s, r) => s + (parseFloat(r.quantity)||0) * (parseFloat(r.unit_price)||0), 0)
  const subtotal    = rows.reduce((s, r) => s + (parseFloat(r.total)||0), 0)
  const discountAmt = grossSubtotal - subtotal
  const total    = subtotal + (parseFloat(header.tax)||0)

  async function savePurchase() {
    const validRows = rows.filter(r => r.product_name.trim() && r.quantity > 0)
    if (!validRows.length) return toast.error("Add at least one item")
    setSaving(true)
    try {
      const purchaseSubtotal = validRows.reduce((s, r) => s + (parseFloat(r.quantity)||0) * netUnitPrice(r), 0)
      const purchaseTotal = purchaseSubtotal + (parseFloat(header.tax)||0)
      const purchaseGross = validRows.reduce((s, r) => s + (parseFloat(r.quantity)||0) * (parseFloat(r.unit_price)||0), 0)

      // NEW: paid amount is no longer forced to the full total. "Fully paid"
      // (default) still behaves exactly as before. Unchecking it lets a
      // custom amount be entered, producing a partial/unpaid purchase —
      // needed for Payment Out to have anything to settle.
      const roundedTotal = Math.round(purchaseTotal * 100) / 100
      const paidNow = header.fullyPaid
        ? roundedTotal
        : Math.min(roundedTotal, Math.max(0, parseFloat(header.paidAmount) || 0))
      const pStatus = paidNow >= roundedTotal ? "paid" : paidNow > 0 ? "partial" : "unpaid"

      const { data: pur, error } = await supabase.from("purchases").insert({
        store_id: storeId, supplier_id: header.supplier_id||null,
        bill_number: header.bill_number||null, purchase_date: header.purchase_date,
        subtotal: Math.round(purchaseSubtotal*100)/100, tax: parseFloat(header.tax)||0,
        discount_total: Math.round((purchaseGross - purchaseSubtotal)*100)/100,
        total: roundedTotal, paid_amount: paidNow,
        status: pStatus, notes: header.notes,
      }).select().single()
      if (error) throw error

      await supabase.from("purchase_items").insert(
        validRows.map(r => ({
          purchase_id: pur.id, product_id: r.product_id||null,
          product_name: r.product_name, quantity: parseFloat(r.quantity),
          unit_price: parseFloat(r.unit_price), discount_percent: parseFloat(r.discount_percent)||0,
          total: Math.round((parseFloat(r.quantity)||0) * netUnitPrice(r) * 100) / 100,
        }))
      )
      // Add stock + roll cost price forward (keep previous cost for reference)
      for (const r of validRows) {
        if (r.product_id) {
          const { data: p } = await supabase.from("products").select("stock_quantity, cost_price").eq("id", r.product_id).single()
          if (p) await supabase.from("products").update({
            stock_quantity: p.stock_quantity + parseFloat(r.quantity),
            previous_cost_price: p.cost_price,
            cost_price: Math.round(netUnitPrice(r) * 10000) / 10000,
            list_price: parseFloat(r.unit_price) || 0,
          }).eq("id", r.product_id)
        }
      }

      // NEW: if anything is left unpaid and a supplier is set, add it to
      // that supplier's payable balance so Payment Out has something to
      // settle later.
      const unpaid = roundedTotal - paidNow
      if (unpaid > 0 && header.supplier_id) {
        const supplier = suppliers.find(s => s.id === header.supplier_id)
        const newBalance = (supplier?.balance || 0) + unpaid
        await supabase.from("suppliers").update({ balance: newBalance }).eq("id", header.supplier_id)
      }

      toast.success("Purchase saved!")
      setShowForm(false); setRows([emptyRow()])
      setHeader({ supplier_id: "", bill_number: "", purchase_date: new Date().toISOString().split("T")[0], tax: 0, notes: "", fullyPaid: true, paidAmount: "" })
      loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function saveExpense() {
    if (!expense.amount || !expense.category) return toast.error("Fill category and amount")
    setSaving(true)
    const { error } = await supabase.from("expenses").insert({ ...expense, store_id: storeId, amount: parseFloat(expense.amount) })
    if (error) { toast.error(error.message) } else { toast.success("Expense recorded!"); setShowExpenseForm(false); setExpense({ category: "", amount: "", description: "", expense_date: new Date().toISOString().split("T")[0] }); loadAll() }
    setSaving(false)
  }

  async function deleteExpense(id) {
    if (!confirm("Delete this expense?")) return
    await supabase.from("expenses").delete().eq("id", id)
    toast.success("Deleted"); loadAll()
  }

  const fmt = (n) => "Rs " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })

  const inDateRange = (d) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo)

  // Search ignores punctuation: "bill20260301", "bill 2026 0301" and "BILL-2026-0301" all match
  const filteredPurchases = purchases.filter(p => {
    const hay = `${p.bill_number || ""} ${shortDocNumber(p.bill_number, p.purchase_date) || ""} ${p.suppliers?.name || ""}`
    return (
      matchesSearch(hay, search) &&
      (status === "all" || p.status === status) &&
      inDateRange(p.purchase_date)
    )
  })

  const filteredExpenses = expenses.filter(e => {
    const hay = `${e.description || ""} ${e.category || ""}`
    return (
      matchesSearch(hay, search) &&
      (eCategory === "all" || e.category === eCategory) &&
      inDateRange(e.expense_date)
    )
  })

  const purchasesTotal = filteredPurchases.reduce((s, p) => s + (Number(p.total) || 0), 0)
  const expensesTotal  = filteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  const StatusDot = ({ s }) => (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-gray-300 capitalize">
      <span className={`w-2 h-2 rounded-full ${
        s === "paid" ? "bg-green-500" :
        s === "partial" ? "bg-amber-500" :
        "bg-red-500"
      }`} />
      {s}
    </span>
  )

  // ---- Filter controls (all the same size) ----
  const typeSelect = <FilterDropdown heading="Type" value={tab} onChange={setTab} options={TYPE_OPTIONS} />
  const statusSelect = <FilterDropdown heading="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
  const categorySelect = <FilterDropdown heading="Category" value={eCategory} onChange={setECategory} options={CATEGORY_OPTIONS} />

  const dateFilter = (
    <div className="min-w-[150px] [&_button]:w-full">
      <DateRangeDropdown
        from={dateFrom}
        to={dateTo}
        onApply={({ from, to }) => { setDateFrom(from); setDateTo(to) }}
      />
    </div>
  )

  const searchBox = (placeholder) => (
    <div className="relative w-72 mb-4 shrink-0">
      <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"/>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder={placeholder}
        className={`w-full pl-10 pr-9 py-2 text-sm ${FIELD}`}/>
      {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14}/></button>}
    </div>
  )

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-72px)]">
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div>
          {/* The only Back button. Review screen -> scanned bills list -> purchase list */}
          {scanOpen && (
            <button onClick={handleBack}
              className="flex items-center gap-1.5 mb-1 text-sm font-medium text-gray-500 hover:text-slate-900 dark:hover:text-white transition-colors">
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Purchase & Expense</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Scan Bill (click again to go back to the list) */}
          <button onClick={() => setScanOpen(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg ${
              scanOpen
                ? "bg-lime-200 text-slate-900 border border-lime-300"
                : OUTLINE_BTN
            }`}>
            <ScanLine size={15} /> Scan Bill
          </button>

          {/* Add New dropdown */}
          <div className="relative">
            <button onClick={() => setShowAddMenu(v => !v)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg ${PRIMARY_BTN}`}>
              <Plus size={15} /> Add New
              <ChevronDown size={14} className={`transition-transform duration-150 ${showAddMenu ? "rotate-180" : ""}`} />
            </button>
            {showAddMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowAddMenu(false)} />
                <div className="absolute right-0 mt-2 w-48 z-20 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg py-1.5 overflow-hidden">
                  <button onClick={() => { setShowAddMenu(false); navigate("/purchase/create") }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left text-slate-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <ShoppingBag size={15} /> Purchase
                  </button>
                  <button onClick={() => { setShowAddMenu(false); setShowExpenseForm(true) }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left text-slate-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <Receipt size={15} /> Expense
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ───────── Scan Bill ───────── */}
      {scanOpen && (
        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll">
          <ScanBill registerBack={fn => { backHandlerRef.current = fn }} />
        </div>
      )}

      {/* ───────── Purchases ───────── */}
      {!scanOpen && tab === "purchases" && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-2.5 mb-3 flex-wrap shrink-0">
            {typeSelect}
            {statusSelect}
            {dateFilter}
            <span className="text-xs text-gray-400 ml-1">{filteredPurchases.length} of {purchases.length}</span>
          </div>
          {searchBox("Search bill no or supplier...")}

          <div className={CARD}>
            <div className={SCROLL}>
              <table className="w-full">
                <thead className={THEAD}>
                  <tr>{["Bill no","Date","Supplier","Total","Status"].map(h => <th key={h} className={TH}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredPurchases.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-14"><ShoppingBag size={44} className="mx-auto text-gray-200 dark:text-gray-700 mb-2" /><p className="text-gray-400">{purchases.length === 0 ? "No purchases yet" : "No purchases match your filters"}</p></td></tr>
                  ) : filteredPurchases.map(p => (
                    <tr key={p.id} onClick={() => setViewingPurchase(p)} className={`${TROW} cursor-pointer`}>
                      <td className={`${TD} font-semibold text-slate-900 dark:text-white whitespace-nowrap`}>{shortDocNumber(p.bill_number, p.purchase_date) || "—"}</td>
                      <td className={`${TD} text-gray-500`}>{p.purchase_date}</td>
                      <td className={`${TD} text-slate-900 dark:text-white`}>{p.suppliers?.name||"Direct purchase"}</td>
                      <td className={`${TD} font-medium text-slate-900 dark:text-white`}>{fmt(p.total)}</td>
                      <td className={TD}><StatusDot s={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={FOOTER}>
              Filtered total: <span className="font-bold text-slate-900 dark:text-white">{fmt(purchasesTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ───────── Expenses ───────── */}
      {!scanOpen && tab === "expenses" && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-2.5 mb-3 flex-wrap shrink-0">
            {typeSelect}
            {categorySelect}
            {dateFilter}
            <span className="text-xs text-gray-400 ml-1">{filteredExpenses.length} of {expenses.length}</span>
          </div>
          {searchBox("Search category or note...")}

          <div className={CARD}>
            <div className={SCROLL}>
              <table className="w-full">
                <thead className={THEAD}>
                  <tr>{["Date","Category","Description","Amount",""].map((h, i) => <th key={i} className={TH}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredExpenses.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-14"><Receipt size={44} className="mx-auto text-gray-200 dark:text-gray-700 mb-2" /><p className="text-gray-400">{expenses.length === 0 ? "No expenses recorded" : "No expenses match your filters"}</p></td></tr>
                  ) : filteredExpenses.map(e => (
                    <tr key={e.id} className={TROW}>
                      <td className={`${TD} text-gray-500`}>{e.expense_date}</td>
                      <td className={TD}><span className="px-2.5 py-1 bg-lime-100 dark:bg-lime-950 text-slate-800 dark:text-lime-300 rounded-full text-xs font-medium">{e.category||"Other"}</span></td>
                      <td className={`${TD} text-slate-700 dark:text-gray-300`}>{e.description||"—"}</td>
                      <td className={`${TD} font-medium text-red-500`}>{fmt(e.amount)}</td>
                      <td className={TD}><button onClick={() => deleteExpense(e.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={FOOTER}>
              Filtered total: <span className="font-bold text-slate-900 dark:text-white">{fmt(expensesTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Purchase form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowForm(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-4xl border border-gray-200 dark:border-gray-800 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Purchase Bill</h2>
            </div>
            <div className="overflow-y-auto slim-scroll flex-1 p-6">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Supplier</label>
                  <select value={header.supplier_id} onChange={e => setHeader({...header, supplier_id: e.target.value})}
                    className={`w-full px-3 py-2 text-sm ${FIELD}`}>
                    <option value="">Select supplier</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Bill number</label>
                  <input value={header.bill_number} onChange={e => setHeader({...header, bill_number: e.target.value})} placeholder="Optional"
                    className={`w-full px-3 py-2 text-sm ${FIELD}`} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Purchase date</label>
                  <input type="date" value={header.purchase_date} onChange={e => setHeader({...header, purchase_date: e.target.value})}
                    className={`w-full px-3 py-2 text-sm ${FIELD}`} />
                </div>
              </div>

              <table className="w-full text-sm mb-3">
                <thead><tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold rounded-l-lg">Item</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-semibold w-20">Qty</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-semibold w-28">Rate (Rs)</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-semibold w-20">Disc %</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-semibold w-28 rounded-r-lg">Net Amount</th>
                  <th className="w-8"></th>
                </tr></thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-800">
                      <td className="px-2 py-2">
                        <select value={row.product_id||""} onChange={e => { const p = products.find(p=>p.id===e.target.value); updateRow(i,"product_id",e.target.value); if(p) updateRow(i,"product_name",p.name) }}
                          className={`w-full px-2 py-1.5 text-sm ${FIELD}`}>
                          <option value="">Select product</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2"><input type="number" value={row.quantity} onChange={e => updateRow(i,"quantity",e.target.value)} min="1" className={`w-full px-2 py-1.5 text-sm text-right ${FIELD}`} /></td>
                      <td className="px-2 py-2"><input type="number" value={row.unit_price} onChange={e => updateRow(i,"unit_price",e.target.value)} min="0" className={`w-full px-2 py-1.5 text-sm text-right ${FIELD}`} /></td>
                      <td className="px-2 py-2"><input type="number" value={row.discount_percent} onChange={e => updateRow(i,"discount_percent",e.target.value)} min="0" max="100" className={`w-full px-2 py-1.5 text-sm text-right ${FIELD}`} /></td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900 dark:text-white">Rs {parseFloat(row.total||0).toLocaleString("en-IN")}</td>
                      <td className="px-1 py-2">{rows.length>1 && <button onClick={() => setRows(rows.filter((_,j)=>j!==i))} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => setRows([...rows, emptyRow()])} className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-lime-300 hover:text-lime-600 mb-4"><Plus size={14}/> Add item</button>

              <div className="flex justify-end gap-6">
                <div className="space-y-2 w-64">
                  <div className="flex justify-between text-sm text-gray-500"><span>Gross subtotal</span><span>Rs {grossSubtotal.toLocaleString("en-IN")}</span></div>
                  <div className="flex justify-between text-sm text-red-500"><span>Discount</span><span>− Rs {discountAmt.toLocaleString("en-IN")}</span></div>
                  <div className="flex justify-between text-sm text-gray-500"><span>Taxable amount</span><span>Rs {subtotal.toLocaleString("en-IN")}</span></div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Tax (Rs)</span>
                    <input type="number" value={header.tax} onChange={e => setHeader({...header, tax: e.target.value})} min="0" className={`w-20 px-2 py-1 rounded text-right text-sm ${FIELD}`} />
                  </div>
                  <div className="flex justify-between text-base font-bold text-slate-900 dark:text-white border-t border-gray-200 dark:border-gray-700 pt-2"><span>Total</span><span>Rs {total.toLocaleString("en-IN")}</span></div>

                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-300 pt-2">
                    <input type="checkbox" className="accent-lime-500" checked={header.fullyPaid}
                      onChange={e => setHeader({...header, fullyPaid: e.target.checked})}/>
                    Fully paid now
                  </label>
                  {!header.fullyPaid && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Paid now (Rs)</span>
                      <input type="number" value={header.paidAmount} onChange={e => setHeader({...header, paidAmount: e.target.value})} min="0" placeholder="0"
                        className={`w-24 px-2 py-1 rounded text-right text-sm ${FIELD}`} />
                    </div>
                  )}
                  {!header.fullyPaid && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Remaining Rs {Math.max(0, total - (parseFloat(header.paidAmount)||0)).toLocaleString("en-IN")} will be added to this supplier's payable balance.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className={`px-4 py-2 text-sm rounded-lg ${OUTLINE_BTN}`}>Cancel</button>
              <button onClick={savePurchase} disabled={saving} className={`px-6 py-2 text-sm rounded-lg font-medium disabled:opacity-50 ${PRIMARY_BTN}`}>{saving ? "Saving…" : "Save Purchase"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Expense form modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowExpenseForm(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Record Expense</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Category *</label>
                <select value={expense.category} onChange={e => setExpense({...expense, category: e.target.value})}
                  className={`w-full px-3 py-2 text-sm ${FIELD}`}>
                  <option value="">Select category</option>
                  {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Amount (Rs) *</label>
                <input type="number" value={expense.amount} onChange={e => setExpense({...expense, amount: e.target.value})} placeholder="0.00" min="0"
                  className={`w-full px-3 py-2 text-sm ${FIELD}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Description</label>
                <input value={expense.description} onChange={e => setExpense({...expense, description: e.target.value})} placeholder="Optional note"
                  className={`w-full px-3 py-2 text-sm ${FIELD}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Date</label>
                <input type="date" value={expense.expense_date} onChange={e => setExpense({...expense, expense_date: e.target.value})}
                  className={`w-full px-3 py-2 text-sm ${FIELD}`} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowExpenseForm(false)} className={`px-4 py-2 text-sm rounded-lg ${OUTLINE_BTN}`}>Cancel</button>
              <button onClick={saveExpense} disabled={saving} className={`px-6 py-2 text-sm rounded-lg font-medium disabled:opacity-50 ${PRIMARY_BTN}`}>{saving ? "Saving…" : "Record Expense"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Detail Modal — opened by clicking a purchase row */}
      {viewingPurchase && (
        <InvoicePurchaseDetailModal
          kind="purchase"
          id={viewingPurchase.id}
          partyLabel={viewingPurchase.suppliers?.name || "Direct purchase"}
          partyBalance={suppliers.find(s => s.id === viewingPurchase.supplier_id)?.balance || 0}
          onClose={() => setViewingPurchase(null)}
          onDeleted={() => { setViewingPurchase(null); loadAll() }}
          onEdit={() => navigate("/purchase/create", { state: { editId: viewingPurchase.id } })}
        />
      )}
    </div>
  )
}