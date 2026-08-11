import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { Plus, Trash2, ShoppingBag, Receipt } from "lucide-react"
import toast from "react-hot-toast"

const emptyRow = () => ({ product_id: null, product_name: "", quantity: 1, unit_price: 0, total: 0 })

export default function Purchase() {
  const { storeId } = useStoreId()
  const [tab,       setTab]       = useState("purchases") // purchases | expenses
  const [purchases, setPurchases] = useState([])
  const [expenses,  setExpenses]  = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products,  setProducts]  = useState([])
  const [showForm,  setShowForm]  = useState(false)
  const [rows,      setRows]      = useState([emptyRow()])
  const [header,    setHeader]    = useState({ supplier_id: "", bill_number: "", purchase_date: new Date().toISOString().split("T")[0], tax: 0, notes: "" })
  const [expense,   setExpense]   = useState({ category: "", amount: "", description: "", expense_date: new Date().toISOString().split("T")[0] })
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [saving,    setSaving]    = useState(false)

  const EXPENSE_CATS = ["Rent","Electricity","Water","Salary","Transport","Marketing","Maintenance","Telephone","Miscellaneous"]

  useEffect(() => { if (storeId) { loadAll(); } }, [storeId])

  async function loadAll() {
    const [p, e, s, pr] = await Promise.all([
      supabase.from("purchases").select("*, suppliers(name)").eq("store_id", storeId).order("created_at", { ascending: false }),
      supabase.from("expenses").select("*").eq("store_id", storeId).order("expense_date", { ascending: false }),
      supabase.from("suppliers").select("id,name").eq("store_id", storeId).order("name"),
      supabase.from("products").select("id,name,unit").eq("store_id", storeId).eq("is_active", true).order("name"),
    ])
    setPurchases(p.data || []); setExpenses(e.data || [])
    setSuppliers(s.data || []); setProducts(pr.data || [])
  }

  function updateRow(i, field, val) {
    const updated = [...rows]
    updated[i][field] = val
    if (field === "quantity" || field === "unit_price") {
      updated[i].total = (parseFloat(updated[i].quantity)||0) * (parseFloat(updated[i].unit_price)||0)
    }
    setRows(updated)
  }

  const subtotal = rows.reduce((s, r) => s + (parseFloat(r.total)||0), 0)
  const total    = subtotal + (parseFloat(header.tax)||0)

  async function savePurchase() {
    const validRows = rows.filter(r => r.product_name.trim() && r.quantity > 0)
    if (!validRows.length) return toast.error("Add at least one item")
    setSaving(true)
    try {
      const { data: pur, error } = await supabase.from("purchases").insert({
        store_id: storeId, supplier_id: header.supplier_id||null,
        bill_number: header.bill_number||null, purchase_date: header.purchase_date,
        subtotal: Math.round(subtotal*100)/100, tax: parseFloat(header.tax)||0,
        total: Math.round(total*100)/100, paid_amount: Math.round(total*100)/100,
        status: "paid", notes: header.notes,
      }).select().single()
      if (error) throw error

      await supabase.from("purchase_items").insert(
        validRows.map(r => ({
          purchase_id: pur.id, product_id: r.product_id||null,
          product_name: r.product_name, quantity: parseFloat(r.quantity),
          unit_price: parseFloat(r.unit_price), total: parseFloat(r.total),
        }))
      )
      // Add stock
      for (const r of validRows) {
        if (r.product_id) {
          const { data: p } = await supabase.from("products").select("stock_quantity").eq("id", r.product_id).single()
          if (p) await supabase.from("products").update({ stock_quantity: p.stock_quantity + parseFloat(r.quantity) }).eq("id", r.product_id)
        }
      }
      toast.success("Purchase saved!"); setShowForm(false); setRows([emptyRow()]); loadAll()
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
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
            <Plus size={15} /> Add Purchase
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {["purchases","expenses"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 text-sm font-medium rounded-md capitalize transition-colors ${tab===t ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "purchases" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>{["Bill no","Date","Supplier","Total","Status"].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {purchases.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12"><ShoppingBag size={40} className="mx-auto text-gray-200 dark:text-gray-700 mb-2" /><p className="text-gray-400">No purchases yet</p></td></tr>
              ) : purchases.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3 font-medium text-blue-600">{p.bill_number||"—"}</td>
                  <td className="px-4 py-3 text-gray-500">{p.purchase_date}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{p.suppliers?.name||"Direct purchase"}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{fmt(p.total)}</td>
                  <td className="px-4 py-3"><span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "expenses" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>{["Date","Category","Description","Amount",""].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {expenses.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12"><Receipt size={40} className="mx-auto text-gray-200 dark:text-gray-700 mb-2" /><p className="text-gray-400">No expenses recorded</p></td></tr>
              ) : expenses.map(e => (
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
      )}

      {/* Purchase form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-3xl border border-gray-200 dark:border-gray-800 max-h-[90vh] flex flex-col">
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
                  <th className="text-right px-3 py-2 text-gray-500 font-medium w-28 rounded-r-lg">Amount</th>
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
                      <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">Rs {parseFloat(row.total||0).toLocaleString("en-IN")}</td>
                      <td className="px-1 py-2">{rows.length>1 && <button onClick={() => setRows(rows.filter((_,j)=>j!==i))} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => setRows([...rows, emptyRow()])} className="flex items-center gap-2 text-sm text-blue-600 hover:text-orange-600 mb-4"><Plus size={14}/> Add item</button>

              <div className="flex justify-end gap-6">
                <div className="space-y-2 w-52">
                  <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>Rs {subtotal.toLocaleString("en-IN")}</span></div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Tax (Rs)</span>
                    <input type="number" value={header.tax} onChange={e => setHeader({...header, tax: e.target.value})} min="0" className="w-20 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded text-right text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none" />
                  </div>
                  <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white border-t border-gray-200 dark:border-gray-700 pt-2"><span>Total</span><span>Rs {total.toLocaleString("en-IN")}</span></div>
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
