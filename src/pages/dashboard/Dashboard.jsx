import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "../../store/authStore"
import { supabase } from "../../lib/supabaseClient"
import { formatBoth, formatAD } from "../../utils/dateHelpers"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts"
import {
  TrendingUp, TrendingDown, ShoppingCart, AlertTriangle,
  Package, ArrowUpRight, ArrowDownRight, MoreHorizontal,
  RefreshCw
} from "lucide-react"

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function StatCard({ label, value, sub, trend, trendVal, color, onClick }) {
  const colors = {
    blue:   { bg: "bg-blue-50",   val: "text-blue-600", icon: "text-blue-600" },
    red:    { bg: "bg-red-50",    val: "text-red-600",     icon: "text-red-500" },
    green:  { bg: "bg-green-50",  val: "text-green-600",   icon: "text-green-500" },
    purple: { bg: "bg-purple-50", val: "text-purple-600",  icon: "text-purple-500" },
    amber:  { bg: "bg-amber-50",  val: "text-amber-600",   icon: "text-amber-500" },
  }
  const c = colors[color] || colors.blue
  return (
    <div onClick={onClick}
      className={`card p-5 ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        {trend !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trend >= 0 ? "text-green-600" : "text-red-500"}`}>
            {trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(trendVal || trend)}%
          </span>
        )}
      </div>
      <p className={`text-2xl font-bold ${c.val} mb-1`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const user     = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [storeId,    setStoreId]    = useState(null)
  const [stats,      setStats]      = useState({})
  const [chartData,  setChartData]  = useState([])
  const [lowStock,   setLowStock]   = useState([])
  const [recent,     setRecent]     = useState([])
  const [chartPeriod,setChartPeriod]= useState("monthly")
  const [loading,    setLoading]    = useState(true)
  const [lastUpdated,setLastUpdated]= useState(null)

  useEffect(() => { init() }, [user])

  async function init() {
    const { data: u } = await supabase.from("users").select("store_id").eq("id", user.id).single()
    if (!u) return
    setStoreId(u.store_id)
    await loadAll(u.store_id)
    setLoading(false)
    setLastUpdated(new Date())
  }

  async function loadAll(sid) {
    const today      = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
    const todayStr   = today.toISOString().split("T")[0]

    // Paginated invoice fetch
    const allInv = []
    let page = 0
    while (true) {
      const { data } = await supabase.from("invoices").select("id, total, paid_amount, status, invoice_date, invoice_number, customer_id")
        .eq("store_id", sid).range(page * 1000, (page + 1) * 1000 - 1)
      allInv.push(...(data || []))
      if ((data || []).length < 1000) break
      page++
    }

    const monthInv  = allInv.filter(i => i.invoice_date >= monthStart && i.invoice_date <= todayStr)
    const paidInv   = monthInv.filter(i => i.status === "paid")
    const unpaidInv = monthInv.filter(i => i.status === "unpaid")

    const { data: expData } = await supabase.from("expenses").select("amount, expense_date")
      .eq("store_id", sid).gte("expense_date", monthStart)

    const { count: custCount } = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("store_id", sid)
    const { data: products }   = await supabase.from("products").select("name, stock_quantity, reorder_level, unit, product_type").eq("store_id", sid).eq("is_active", true)

    const totalRevenue  = paidInv.reduce((s, i) => s + i.total, 0)
    const totalExpenses = (expData || []).reduce((s, e) => s + e.amount, 0)
    const toReceive     = unpaidInv.reduce((s, i) => s + (i.total - i.paid_amount), 0)

    setStats({
      revenue:   totalRevenue,
      expenses:  totalExpenses,
      profit:    totalRevenue - totalExpenses,
      customers: custCount || 0,
      invoices:  monthInv.length,
      toReceive,
    })

    setLowStock((products || []).filter(p => p.stock_quantity <= p.reorder_level).slice(0, 6))

    // Recent transactions (last 8)
    const sorted = [...allInv].sort((a, b) => new Date(b.invoice_date) - new Date(a.invoice_date)).slice(0, 8)
    setRecent(sorted)

    // Chart data — last 6 months
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d      = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0]
      const mEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0]
      const mInv   = allInv.filter(inv => inv.invoice_date >= mStart && inv.invoice_date <= mEnd && inv.status === "paid")
      months.push({
        month:   MONTHS[d.getMonth()],
        revenue: mInv.reduce((s, r) => s + r.total, 0),
      })
    }
    setChartData(months)
  }

  const fmt = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
  const fmtShort = (n) => {
    if (n >= 100000) return "Rs " + (n / 100000).toFixed(1) + "L"
    if (n >= 1000)   return "Rs " + (n / 1000).toFixed(1) + "K"
    return "Rs " + n.toFixed(0)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Welcome back, {user?.user_metadata?.full_name?.split(" ")[0] || "Solomon"} 👋
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {formatBoth(new Date())}
          </p>
        </div>
        <button onClick={() => { setLoading(true); init() }}
          className="btn-md btn-outline btn-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stat cards — row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="To Receive"      value={fmt(stats.toReceive)} color="green"
          sub="Outstanding from customers"
          onClick={() => navigate("/khata")} />
        <StatCard label="Monthly Revenue" value={fmt(stats.revenue)}   color="blue"
          sub={`${stats.invoices} invoices this month`} />
        <StatCard label="Monthly Expense" value={fmt(stats.expenses)}  color="red"
          sub="Operating expenses" />
        <StatCard label="Net Profit"      value={fmt(stats.profit)}
          color={stats.profit >= 0 ? "green" : "red"}
          sub="Revenue minus expenses" />
        <StatCard label="Total Customers" value={stats.customers}      color="purple"
          sub="Registered customers" onClick={() => navigate("/customers")} />
      </div>

      {/* Chart + Low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Revenue chart */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Revenue Overview</h2>
            <div className="flex gap-1 bg-surface-100 p-0.5 rounded-lg">
              {["monthly"].map(p => (
                <button key={p} onClick={() => setChartPeriod(p)}
                  className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${chartPeriod === p ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top:5, right:5, left:0, bottom:0 }}>
              <defs>
                <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#0a54dd" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#0a54dd" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize:12, fill:"#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize:11, fill:"#9ca3af" }} axisLine={false} tickLine={false}
                tickFormatter={v => fmtShort(v)} />
              <Tooltip
                formatter={(v) => [fmt(v), "Revenue"]}
                contentStyle={{ fontSize:12, borderRadius:8, border:"1px solid #e5e7eb", boxShadow:"0 4px 6px -1px rgb(0 0 0 / 0.08)" }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#0a54dd" strokeWidth={2.5} fill="url(#gBlue)" dot={false} activeDot={{ r:4, fill:"#0a54dd" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Low stock */}
        <div className="card p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-500" />
              Low Stock Alert
            </h2>
            <button onClick={() => navigate("/inventory")}
              className="text-xs text-blue-600 hover:underline font-medium">
              View all
            </button>
          </div>
          {lowStock.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
              <Package size={32} className="text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">All stock levels healthy</p>
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {lowStock.map(item => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate max-w-36">{item.name}</p>
                    <p className="text-xs text-gray-400">Reorder at {item.reorder_level} {item.unit}</p>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ml-2 ${item.stock_quantity <= 0 ? "text-red-500" : "text-amber-500"}`}>
                    {item.stock_quantity} {item.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h2 className="text-sm font-semibold text-gray-900">Recent Transactions</h2>
          <button onClick={() => navigate("/sales")}
            className="text-xs text-blue-600 hover:underline font-medium">
            View all
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ShoppingCart size={36} className="text-gray-200 mb-3" />
            <p className="text-sm text-gray-400 mb-3">No transactions yet</p>
            <button onClick={() => navigate("/pos")} className="btn-md btn-primary btn-sm">
              Make first sale
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Invoice No</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(inv => (
                  <tr key={inv.id}>
                    <td className="font-semibold text-blue-600">{inv.invoice_number}</td>
                    <td>
                      <div className="text-xs">
                        <div className="text-gray-700">{formatAD(inv.invoice_date)}</div>
                        <div className="text-gray-400" style={{ fontSize: "10px" }}>
                          {/* BS date would show here */}
                        </div>
                      </div>
                    </td>
                    <td className="font-medium">{fmt(inv.total)}</td>
                    <td className="text-green-600">{fmt(inv.paid_amount)}</td>
                    <td className={inv.total - inv.paid_amount > 0 ? "text-red-500 font-medium" : "text-gray-400"}>
                      {fmt(inv.total - inv.paid_amount)}
                    </td>
                    <td>
                      <span className={`badge ${inv.status === "paid" ? "badge-paid" : inv.status === "partial" ? "badge-partial" : "badge-unpaid"}`}>
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
