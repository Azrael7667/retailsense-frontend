import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Trash2, ShoppingBag, Receipt, ScanLine, Search, X, ChevronDown } from "lucide-react"
import toast from "react-hot-toast"
import ScanBill from "./ScanBill"
import DateRangeDropdown from "../../components/common/DateRangeDropdown"

const emptyRow = () => ({ product_id: null, product_name: "", quantity: 1, unit_price: 0, discount_percent: 0, total: 0 })

const netUnitPrice = (row) => {
  const price = parseFloat(row.unit_price) || 0
  const disc = parseFloat(row.discount_percent) || 0
  return price * (1 - disc / 100)
}

export default function Purchase() {
  const { storeId } = useStoreId()
  const navigate = useNavigate()
  const [tab,       setTab]       = useState("purchases") // purchases | expenses | scan
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

  // Purchases filters
  const [pSearch,   setPSearch]   = useState("")
  const [pStatus,   setPStatus]   = useState("all")
  const [pDateFrom, setPDateFrom] = useState("")
  const [pDateTo,   setPDateTo]   = useState("")

  // Expenses filters
  const [eSearch,    setESearch]    = useState("")
  const [eCategory,  setECategory]  = useState("all")
  const [eDateFrom,  setEDateFrom]  = useState("")
  const [eDateTo,    setEDateTo]    = useState("")

  const EXPENSE_CATS = ["Rent","Electricity","Water","Salary","Transport","Marketing","Maintenance","Telephone","Miscellaneous"]

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
      const status = paidNow >= roundedTotal ? "paid" : paidNow > 0 ? "partial" : "unpaid"

      const { data: pur, error } = await supabase.from("purchases").insert({
        store_id: storeId, supplier_id: header.supplier_id||null,
        bill_number: header.bill_number||null, purchase_date: header.purchase_date,
        subtotal: Math.round(purchaseSubtotal*100)/100, tax: parseFloat(header.tax)||0,
        discount_total: Math.round((purchaseGross - purchaseSubtotal)*100)/100,
        total: roundedTotal, paid_amount: paidNow,
        status, notes: header.notes,
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

  const filteredPurchases = purchases.filter(p => {
    const q = pSearch.toLowerCase()
    return (
      (!pSearch || p.bill_number?.toLowerCase().includes(q) || p.suppliers?.name?.toLowerCase().includes(q)) &&
      (pStatus === "all" || p.status === pStatus) &&
      (!pDateFrom || p.purchase_date >= pDateFrom) &&
      (!pDateTo   || p.purchase_date <= pDateTo)
    )
  })

  const filteredExpenses = expenses.filter(e => {
    const q = eSearch.toLowerCase()
    return (
      (!eSearch || e.description?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q)) &&
      (eCategory === "all" || e.category === eCategory) &&
      (!eDateFrom || e.expense_date >= eDateFrom) &&
      (!eDateTo   || e.expense_date <= eDateTo)
    )
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Purchase & Expense</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track purchases from suppliers and business expenses</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowExpenseForm(true)} className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg">
            <Receipt size={15} /> Add Expense
          </button>
          <button onClick={() => navigate("/purchase/create")} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
            <Plus size={15} /> Add Purchase
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {["purchases","expenses","scan"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-md capitalize transition-colors ${tab===t ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
            {t === "scan" && <ScanLine size={14} />}
            {t === "scan" ? "Scan Bill" : t}
          </button>
        ))}
      </div>

      {tab === "purchases" && (
        <>
          <div className="flex items-center gap-2.5 mb-3 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input value={pSearch} onChange={e => setPSearch(e.target.value)}
                placeholder="Search bill no or supplier..."
                className="pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white w-64 focus:outline-none focus:border-blue-400"/>
              {pSearch && <button onClick={() => setPSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X size={12}/></button>}
            </div>

            <div className="relative">
              <select value={pStatus} onChange={e => setPStatus(e.target.value)}
                className="appearance-none pl-3 pr-7 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-blue-400 cursor-pointer">
                <option value="all">All Status</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
            </div>

            <DateRangeDropdown
              from={pDateFrom}
              to={pDateTo}
              onApply={({ from, to }) => { setPDateFrom(from); setPDateTo(to) }}
            />

            <span className="text-xs text-gray-400 ml-1">{filteredPurchases.length} of {purchases.length}</span>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>{["Bill no","Date","Supplier","Total","Status"].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {filteredPurchases.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12"><ShoppingBag size={40} className="mx-auto text-gray-200 dark:text-gray-700 mb-2" /><p className="text-gray-400">{purchases.length === 0 ? "No purchases yet" : "No purchases match your filters"}</p></td></tr>
                ) : filteredPurchases.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 font-medium text-blue-600">{p.bill_number||"—"}</td>
                    <td className="px-4 py-3 text-gray-500">{p.purchase_date}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{p.suppliers?.name||"Direct purchase"}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{fmt(p.total)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.status === "paid" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" :
                        p.status === "partial" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" :
                        "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                      }`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "scan" && <ScanBill />}

      {tab === "expenses" && (
        <>
          <div className="flex items-center gap-2.5 mb-3 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input value={eSearch} onChange={e => setESearch(e.target.value)}
                placeholder="Search category or note..."
                className="pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white w-64 focus:outline-none focus:border-blue-400"/>
              {eSearch && <button onClick={() => setESearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X size={12}/></button>}
            </div>

            <div className="relative">
              <select value={eCategory} onChange={e => setECategory(e.target.value)}
                className="appearance-none pl-3 pr-7 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-blue-400 cursor-pointer">
                <option value="all">All Categories</option>
                {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
            </div>

            <DateRangeDropdown
              from={eDateFrom}
              to={eDateTo}
              onApply={({ from, to }) => { setEDateFrom(from); setEDateTo(to) }}
            />

            <span className="text-xs text-gray-400 ml-1">{filteredExpenses.length} of {expenses.length}</span>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>{["Date","Category","Description","Amount",""].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {filteredExpenses.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12"><Receipt size={40} className="mx-auto text-gray-200 dark:text-gray-700 mb-2" /><p className="text-gray-400">{expenses.length === 0 ? "No expenses recorded" : "No expenses match your filters"}</p></td></tr>
                ) : filteredExpenses.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 text-gray-500">{e.expense_date}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 rounded-full text-xs">{e.category||"Other"}</span></td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{e.description||"—"}</td>
                    <td className="px-4 py-3 font-medium text-red-500">{fmt(e.amount)}</td>
                    <td className="px-4 py-3"><button onClick={() => deleteExpense(e.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Purchase form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-4xl border border-gray-200 dark:border-gray-800 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">New Purchase Bill</h2>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Supplier</label>
                  <select value={header.supplier_id} onChange={e => setHeader({...header, supplier_id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none">
                    <option value="">Select supplier</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Bill number</label>
                  <input value={header.bill_number} onChange={e => setHeader({...header, bill_number: e.target.value})} placeholder="Optional"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Purchase date</label>
                  <input type="date" value={header.purchase_date} onChange={e => setHeader({...header, purchase_date: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none" />
                </div>
              </div>

              <table className="w-full text-sm mb-3">
                <thead><tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="text-left px-3 py-2 text-gray-500 font-medium rounded-l-lg">Item</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-medium w-20">Qty</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-medium w-28">Rate (Rs)</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-medium w-20">Disc %</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-medium w-28 rounded-r-lg">Net Amount</th>
                  <th className="w-8"></th>
                </tr></thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-800">
                      <td className="px-2 py-2">
                        <select value={row.product_id||""} onChange={e => { const p = products.find(p=>p.id===e.target.value); updateRow(i,"product_id",e.target.value); if(p) updateRow(i,"product_name",p.name) }}
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none">
                          <option value="">Select product</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2"><input type="number" value={row.quantity} onChange={e => updateRow(i,"quantity",e.target.value)} min="1" className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-right focus:outline-none" /></td>
                      <td className="px-2 py-2"><input type="number" value={row.unit_price} onChange={e => updateRow(i,"unit_price",e.target.value)} min="0" className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-right focus:outline-none" /></td>
                      <td className="px-2 py-2"><input type="number" value={row.discount_percent} onChange={e => updateRow(i,"discount_percent",e.target.value)} min="0" max="100" className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-right focus:outline-none" /></td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">Rs {parseFloat(row.total||0).toLocaleString("en-IN")}</td>
                      <td className="px-1 py-2">{rows.length>1 && <button onClick={() => setRows(rows.filter((_,j)=>j!==i))} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => setRows([...rows, emptyRow()])} className="flex items-center gap-2 text-sm text-blue-600 hover:text-orange-600 mb-4"><Plus size={14}/> Add item</button>

              <div className="flex justify-end gap-6">
                <div className="space-y-2 w-64">
                  <div className="flex justify-between text-sm text-gray-500"><span>Gross subtotal</span><span>Rs {grossSubtotal.toLocaleString("en-IN")}</span></div>
                  <div className="flex justify-between text-sm text-red-500"><span>Discount</span><span>− Rs {discountAmt.toLocaleString("en-IN")}</span></div>
                  <div className="flex justify-between text-sm text-gray-500"><span>Taxable amount</span><span>Rs {subtotal.toLocaleString("en-IN")}</span></div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Tax (Rs)</span>
                    <input type="number" value={header.tax} onChange={e => setHeader({...header, tax: e.target.value})} min="0" className="w-20 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded text-right text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none" />
                  </div>
                  <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white border-t border-gray-200 dark:border-gray-700 pt-2"><span>Total</span><span>Rs {total.toLocaleString("en-IN")}</span></div>

                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 pt-2">
                    <input type="checkbox" checked={header.fullyPaid}
                      onChange={e => setHeader({...header, fullyPaid: e.target.checked})}/>
                    Fully paid now
                  </label>
                  {!header.fullyPaid && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Paid now (Rs)</span>
                      <input type="number" value={header.paidAmount} onChange={e => setHeader({...header, paidAmount: e.target.value})} min="0" placeholder="0"
                        className="w-24 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded text-right text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none" />
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
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300">Cancel</button>
              <button onClick={savePurchase} disabled={saving} className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50">{saving ? "Saving…" : "Save Purchase"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Expense form modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowExpenseForm(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Record Expense</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category *</label>
                <select value={expense.category} onChange={e => setExpense({...expense, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select category</option>
                  {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (Rs) *</label>
                <input type="number" value={expense.amount} onChange={e => setExpense({...expense, amount: e.target.value})} placeholder="0.00" min="0"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input value={expense.description} onChange={e => setExpense({...expense, description: e.target.value})} placeholder="Optional note"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                <input type="date" value={expense.expense_date} onChange={e => setExpense({...expense, expense_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowExpenseForm(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300">Cancel</button>
              <button onClick={saveExpense} disabled={saving} className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50">{saving ? "Saving…" : "Record Expense"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
