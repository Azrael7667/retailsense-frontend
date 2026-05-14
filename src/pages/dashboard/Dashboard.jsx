import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "../../store/authStore"
import { supabase } from "../../lib/supabaseClient"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts"
import {
  TrendingUp, TrendingDown, ShoppingCart,
  Users, Package, ArrowRight, AlertTriangle
} from "lucide-react"

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function StatCard({ label, value, sub, icon: Icon, color, trend }) {
  const colors = {
    green:  { bg: "bg-green-50  dark:bg-gray-900", icon: "bg-green-100 dark:bg-green-900  text-green-600 dark:text-green-400", val: "text-green-700 dark:text-green-300" },
    red:    { bg: "bg-red-50    dark:bg-gray-900", icon: "bg-red-100   dark:bg-red-900    text-red-600   dark:text-red-400",   val: "text-red-700   dark:text-red-300" },
    blue:   { bg: "bg-blue-50   dark:bg-gray-900", icon: "bg-blue-100  dark:bg-blue-900   text-blue-600  dark:text-blue-400",  val: "text-blue-700  dark:text-blue-300" },
    orange: { bg: "bg-orange-50 dark:bg-gray-900", icon: "bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-400", val: "text-orange-700 dark:text-orange-300" },
    purple: { bg: "bg-purple-50 dark:bg-gray-900", icon: "bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400", val: "text-purple-700 dark:text-purple-300" },
  }
  const c = colors[color] || colors.blue

  return (
    <div className={`${c.bg} rounded-xl p-5 border border-white dark:border-gray-800`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.icon}`}>
          <Icon size={20} />
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${trend >= 0 ? "text-green-600" : "text-red-500"}`}>
            {trend >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className={`text-2xl font-bold ${c.val}`}>{value}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const user     = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [stats, setStats]       = useState({ revenue: 0, expenses: 0, profit: 0, customers: 0, invoices: 0 })
  const [chartData, setChartData] = useState([])
  const [lowStock, setLowStock]   = useState([])
  const [recent, setRecent]       = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    try {
      const today      = new Date()
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
      const todayStr   = today.toISOString().split("T")[0]

      // Get user's store
      const { data: userData } = await supabase
        .from("users").select("store_id").eq("id", user.id).single()
      if (!userData) return
      const storeId = userData.store_id

      // Monthly invoices
      const { data: invoices } = await supabase
        .from("invoices").select("total, invoice_date, invoice_number, status")
        .eq("store_id", storeId)
        .gte("invoice_date", monthStart).lte("invoice_date", todayStr)
        .order("invoice_date", { ascending: false })

      // Monthly expenses
      const { data: expenses } = await supabase
        .from("expenses").select("amount")
        .eq("store_id", storeId)
        .gte("expense_date", monthStart)

      // Total customers
      const { count: custCount } = await supabase
        .from("customers").select("id", { count: "exact", head: true })
        .eq("store_id", storeId)

      // Low stock products
      const { data: products } = await supabase
        .from("products").select("name, stock_quantity, reorder_level, unit")
        .eq("store_id", storeId).eq("is_active", true)

      const lowStockItems = (products || []).filter(p => p.stock_quantity <= p.reorder_level)

      // Build 6-month chart data
      const chartMonths = []
      for (let i = 5; i >= 0; i--) {
        const d    = new Date(today.getFullYear(), today.getMonth() - i, 1)
        const mStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0]
        const mEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0]
        const { data: mInv } = await supabase
          .from("invoices").select("total").eq("store_id", storeId)
          .gte("invoice_date", mStart).lte("invoice_date", mEnd)
        const { data: mExp } = await supabase
          .from("expenses").select("amount").eq("store_id", storeId)
          .gte("expense_date", mStart).lte("expense_date", mEnd)
        chartMonths.push({
          month:    MONTHS[d.getMonth()],
          revenue:  (mInv  || []).reduce((s, r) => s + r.total,  0),
          expenses: (mExp  || []).reduce((s, r) => s + r.amount, 0),
        })
      }

      const totalRevenue  = (invoices  || []).reduce((s, r) => s + r.total,  0)
      const totalExpenses = (expenses  || []).reduce((s, r) => s + r.amount, 0)

      setStats({
        revenue:   totalRevenue,
        expenses:  totalExpenses,
        profit:    totalRevenue - totalExpenses,
        customers: custCount || 0,
        invoices:  (invoices || []).length,
      })
      setChartData(chartMonths)
      setLowStock(lowStockItems.slice(0, 5))
      setRecent((invoices || []).slice(0, 6))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n) => "Rs " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Welcome back, {user?.user_metadata?.full_name || user?.email?.split("@")[0]} 👋
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Here's what's happening with your store this month
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Monthly revenue"  value={fmt(stats.revenue)}   icon={TrendingUp}   color="green"  />
        <StatCard label="Monthly expenses" value={fmt(stats.expenses)}  icon={TrendingDown} color="red"    />
        <StatCard label="Net profit"       value={fmt(stats.profit)}    icon={TrendingUp}   color={stats.profit >= 0 ? "blue" : "red"} />
        <StatCard label="Total customers"  value={stats.customers}      icon={Users}        color="purple" />
        <StatCard label="Sales this month" value={stats.invoices}       icon={ShoppingCart} color="orange" />
      </div>

      {/* Chart + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Area chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Revenue vs Expenses</h2>
            <span className="text-xs text-gray-400">Last 6 months</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f97316" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
              <Tooltip
                formatter={(v, n) => ["Rs " + v.toLocaleString("en-IN"), n === "revenue" ? "Revenue" : "Expenses"]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
              <Area type="monotone" dataKey="revenue"  stroke="#f97316" strokeWidth={2} fill="url(#gRev)" />
              <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fill="url(#gExp)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Low stock alert */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-500" /> Low stock
            </h2>
            <button onClick={() => navigate("/inventory")} className="text-xs text-orange-500 hover:underline flex items-center gap-0.5">
              View all <ArrowRight size={12} />
            </button>
          </div>
          {lowStock.length === 0 ? (
            <div className="text-center py-8">
              <Package size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">All stock levels are healthy</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lowStock.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">{item.name}</p>
                    <p className="text-xs text-gray-400">Reorder at {item.reorder_level} {item.unit}</p>
                  </div>
                  <span className={`text-sm font-bold ${item.stock_quantity <= 0 ? "text-red-500" : "text-amber-500"}`}>
                    {item.stock_quantity} {item.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent transactions</h2>
          <button onClick={() => navigate("/sales")} className="text-xs text-orange-500 hover:underline flex items-center gap-0.5">
            View all <ArrowRight size={12} />
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="text-center py-10">
            <ShoppingCart size={36} className="mx-auto text-gray-200 dark:text-gray-700 mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">No transactions yet this month</p>
            <button
              onClick={() => navigate("/pos")}
              className="mt-3 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg transition-colors"
            >
              Make your first sale
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {["Invoice no", "Date", "Amount", "Status"].map((h) => (
                    <th key={h} className="pb-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {recent.map((inv) => (
                  <tr key={inv.invoice_number} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="py-3 font-medium text-gray-900 dark:text-white">{inv.invoice_number}</td>
                    <td className="py-3 text-gray-500">{inv.invoice_date}</td>
                    <td className="py-3 font-medium text-gray-900 dark:text-white">{fmt(inv.total)}</td>
                    <td className="py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        inv.status === "paid"
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
