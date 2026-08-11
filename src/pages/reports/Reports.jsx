import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"

const COLORS = ["#f97316","#3b82f6","#10b981","#8b5cf6","#ef4444","#f59e0b","#06b6d4","#ec4899"]

export default function Reports() {
  const { storeId } = useStoreId()
  const [topProducts,   setTopProducts]   = useState([])
  const [salesByMonth,  setSalesByMonth]  = useState([])
  const [expByCategory, setExpByCategory] = useState([])
  const [loading,       setLoading]       = useState(true)

  useEffect(() => { if (storeId) load() }, [storeId])

  async function load() {
    setLoading(true)
    const today = new Date()

    // Sales by last 6 months
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth()-i, 1)
      const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0]
      const end   = new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().split("T")[0]
      const { data } = await supabase.from("invoices").select("total").eq("store_id", storeId).gte("invoice_date", start).lte("invoice_date", end)
      months.push({ month: d.toLocaleString("default",{month:"short"}), total: (data||[]).reduce((s,r)=>s+r.total,0) })
    }
    setSalesByMonth(months)

    // Top products
    const { data: items } = await supabase.from("invoice_items").select("product_name, quantity, total")
    const agg = {}
    ;(items||[]).forEach(item => {
      if (!agg[item.product_name]) agg[item.product_name] = { revenue: 0, qty: 0 }
      agg[item.product_name].revenue += item.total
      agg[item.product_name].qty     += item.quantity
    })
    const sorted = Object.entries(agg).sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,8)
    setTopProducts(sorted.map(([name, v]) => ({ name, revenue: Math.round(v.revenue), qty: v.qty })))

    // Expenses by category (this month)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
    const { data: exps } = await supabase.from("expenses").select("category, amount").eq("store_id", storeId).gte("expense_date", monthStart)
    const expAgg = {}
    ;(exps||[]).forEach(e => { expAgg[e.category||"Other"] = (expAgg[e.category||"Other"]||0) + e.amount })
    setExpByCategory(Object.entries(expAgg).map(([name, value]) => ({ name, value: Math.round(value) })))

    setLoading(false)
  }

  const fmt = (n) => "Rs " + Number(n||0).toLocaleString("en-IN")

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Visual overview of your business performance</p>
      </div>

      {/* Sales trend */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Monthly sales trend</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={salesByMonth} margin={{ top:5,right:10,left:0,bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize:12, fill:"#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize:11, fill:"#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v} />
            <Tooltip formatter={v=>[fmt(v),"Revenue"]} contentStyle={{ fontSize:12, borderRadius:8, border:"1px solid #e5e7eb" }} />
            <Bar dataKey="total" fill="#f97316" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top products */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Top products by revenue</h2>
          {topProducts.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No sales data yet</div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => {
                const max = topProducts[0].revenue
                return (
                  <div key={p.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300 truncate max-w-xs">{p.name}</span>
                      <span className="text-gray-900 dark:text-white font-medium shrink-0 ml-2">{fmt(p.revenue)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full">
                      <div className="h-1.5 rounded-full" style={{ width: `${(p.revenue/max)*100}%`, background: COLORS[i%COLORS.length] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Expense breakdown */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Expense breakdown (this month)</h2>
          {expByCategory.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No expenses this month</div>
          ) : (
            <div className="flex items-center gap-4">
              <PieChart width={160} height={160}>
                <Pie data={expByCategory} cx={75} cy={75} innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>
                  {expByCategory.map((_, i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Pie>
              </PieChart>
              <div className="flex-1 space-y-2">
                {expByCategory.map((e, i) => (
                  <div key={e.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i%COLORS.length] }} />
                    <span className="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">{e.name}</span>
                    <span className="text-xs font-medium text-gray-900 dark:text-white">{fmt(e.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
