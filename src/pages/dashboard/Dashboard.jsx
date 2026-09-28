import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "../../store/authStore"
import { useStoreId } from "../../hooks/useStoreId"
import { supabase } from "../../lib/supabaseClient"
import { formatBoth, formatAD } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts"
import {
  TrendingUp, TrendingDown, ShoppingCart, AlertTriangle,
  Package, ArrowUpRight, ArrowDownRight, MoreHorizontal,
  RefreshCw, Tag, Receipt, CheckCircle2
} from "lucide-react"

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

const COLOR_MAP = {
  primary:{ val: "text-primary-600 dark:text-primary-400", iconBg: "bg-primary-50 dark:bg-primary-950/50", icon: "text-primary-600 dark:text-primary-400" },
  red:    { val: "text-red-600 dark:text-red-400",         iconBg: "bg-red-50 dark:bg-red-950/50",         icon: "text-red-500 dark:text-red-400" },
  green:  { val: "text-green-600 dark:text-green-400",     iconBg: "bg-green-50 dark:bg-green-950/50",     icon: "text-green-600 dark:text-green-400" },
  purple: { val: "text-purple-600 dark:text-purple-400",   iconBg: "bg-purple-50 dark:bg-purple-950/50",   icon: "text-purple-600 dark:text-purple-400" },
  amber:  { val: "text-amber-600 dark:text-amber-400",     iconBg: "bg-amber-50 dark:bg-amber-950/50",     icon: "text-amber-600 dark:text-amber-400" },
}

function StatCard({ label, value, sub, trend, trendVal, color, icon: Icon, onClick, delay = 0 }) {
  const c = COLOR_MAP[color] || COLOR_MAP.primary
  return (
    <div onClick={onClick}
      className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 ${onClick ? "cursor-pointer hover:shadow-md active:scale-[0.99] transition-all duration-150" : "transition-shadow duration-150 hover:shadow-md"}`}
      style={{ animation: `cardIn 0.3s ease-out ${delay}ms both` }}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className={`w-7 h-7 rounded-lg ${c.iconBg} flex items-center justify-center shrink-0`}>
          {Icon && <Icon size={13} className={c.icon} />}
        </div>
        <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide truncate">{label}</p>
        {trend !== undefined && (
          <span className={`ml-auto flex items-center gap-0.5 text-xs font-semibold shrink-0 ${trend >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
            {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trendVal || trend)}%
          </span>
        )}
      </div>
      <p className={`text-xl font-bold ${c.val} tabular-nums`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const user     = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const { storeId } = useStoreId()
  const [stats,      setStats]      = useState({})
  const [chartData,  setChartData]  = useState([])
  const [lowStock,   setLowStock]   = useState([])
  const [recent,     setRecent]     = useState([])
  const [chartPeriod,setChartPeriod]= useState("monthly")
  const [loading,    setLoading]    = useState(true)
  const [lastUpdated,setLastUpdated]= useState(null)
  const [refreshing, setRefreshing] = useState(false)

  // Was: fetched users.store_id directly via Supabase on every mount,
  // bypassing the store switcher entirely — this is why switching stores
  // never changed what Dashboard showed. Now driven by useStoreId(), same
  // as every other page, so it reacts to storeId changing.
  useEffect(() => { if (storeId) init() }, [storeId])

  async function init() {
    await loadAll(storeId)
    setLoading(false)
    setRefreshing(false)
    setLastUpdated(new Date())
  }

  async function fetchAllRows(table, columns, sid, dateCol) {
    const rows = []
    let page = 0
    while (true) {
      const { data } = await supabase.from(table).select(columns)
        .eq("store_id", sid).range(page * 1000, (page + 1) * 1000 - 1)
      rows.push(...(data || []))
      if ((data || []).length < 1000) break
      page++
    }
    return rows
  }

  async function loadAll(sid) {
    const today      = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
    const todayStr   = today.toISOString().split("T")[0]
    const monthLabel = MONTHS[today.getMonth()]

    const allInv  = await fetchAllRows("invoices",  "id, total, paid_amount, status, invoice_date, invoice_number, customer_id", sid)
    const allPurc = await fetchAllRows("purchases", "id, total, paid_amount, status, purchase_date, bill_number", sid)

    const monthInv  = allInv.filter(i => i.invoice_date >= monthStart && i.invoice_date <= todayStr)
    const monthPurc = allPurc.filter(p => p.purchase_date >= monthStart && p.purchase_date <= todayStr)

    const { data: expData } = await supabase.from("expenses").select("amount, expense_date")
      .eq("store_id", sid).gte("expense_date", monthStart)

    const { data: products } = await supabase.from("products").select("name, stock_quantity, reorder_level, unit, product_type").eq("store_id", sid).eq("is_active", true)

    // Accounts receivable / payable — outstanding balance across ALL invoices/purchases
    // regardless of month or exact status label (a "partial" invoice still owes money).
    const toReceive = allInv.reduce((s, i) => s + Math.max(0, (i.total || 0) - (i.paid_amount || 0)), 0)
    const toGive     = allPurc.reduce((s, p) => s + Math.max(0, (p.total || 0) - (p.paid_amount || 0)), 0)

    const salesThisMonth    = monthInv.reduce((s, i) => s + (i.total || 0), 0)
    const purchaseThisMonth = monthPurc.reduce((s, p) => s + (p.total || 0), 0)
    const totalExpenses     = (expData || []).reduce((s, e) => s + e.amount, 0)

    setStats({
      toReceive,
      toGive,
      salesThisMonth,
      purchaseThisMonth,
      expenses: totalExpenses,
      invoices: monthInv.length,
      monthLabel,
    })

    setLowStock((products || []).filter(p => p.stock_quantity <= p.reorder_level).slice(0, 6))

    const sorted = [...allInv].sort((a, b) => new Date(b.invoice_date) - new Date(a.invoice_date)).slice(0, 8)
    setRecent(sorted)

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

  function handleRefresh() {
    if (!storeId) return
    setRefreshing(true)
    init()
  }

  const fmt = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
  const fmtShort = (n) => {
    if (n >= 100000) return "Rs " + (n / 100000).toFixed(1) + "L"
    if (n >= 1000)   return "Rs " + (n / 1000).toFixed(1) + "K"
    return "Rs " + n.toFixed(0)
  }

  const chartTotal = chartData.reduce((s, m) => s + (m.revenue || 0), 0)

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 space-y-5">
      <style>{`
        @keyframes cardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rowIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Welcome back, {user?.user_metadata?.full_name?.split(" ")[0] || "Solomon"} 👋
          </h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {formatBoth(new Date())}
          </p>
        </div>
        <button onClick={handleRefresh}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95 transition-all duration-150">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Stat cards — matches Karobar's row: To Receive / To Give / Sales / Purchase / Expense */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="To Receive" value={fmt(stats.toReceive)} color="green" icon={ArrowDownRight}
          sub="Outstanding from customers" delay={0}
          onClick={() => navigate("/khata")} />
        <StatCard label="To Give" value={fmt(stats.toGive)} color="red" icon={ArrowUpRight}
          sub="Outstanding to suppliers" delay={40}
          onClick={() => navigate("/suppliers")} />
        <StatCard label={`Sales (${stats.monthLabel})`} value={fmt(stats.salesThisMonth)} color="green" icon={Tag}
          sub={`${stats.invoices} invoices this month`} delay={80} />
        <StatCard label={`Purchase (${stats.monthLabel})`} value={fmt(stats.purchaseThisMonth)} color="primary" icon={ShoppingCart}
          sub="This month's purchase bills" delay={120} />
        <StatCard label={`Expense (${stats.monthLabel})`} value={fmt(stats.expenses)} color="red" icon={Receipt}
          sub="Operating expenses" delay={160} />
      </div>

      {/* Chart + Low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Revenue chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5"
          style={{ animation: "cardIn 0.4s ease-out 200ms both" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Revenue Overview</h2>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg">
              {["monthly"].map(p => (
                <button key={p} onClick={() => setChartPeriod(p)}
                  className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-all duration-150 ${chartPeriod === p ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm": "text-gray-500 dark:text-gray-400"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top:5, right:5, left:0, bottom:0 }}>
              <defs>
                <linearGradient id="gIndigo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4f46e5" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 6" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize:12, fill:"#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize:11, fill:"#9ca3af" }} axisLine={false} tickLine={false}
                tickFormatter={v => fmtShort(v)} />
              <Tooltip
                formatter={(v) => [fmt(v), "Revenue"]}
                cursor={{ stroke: "#c7d2fe", strokeWidth: 1, strokeDasharray: "3 3" }}
                contentStyle={{ fontSize:12, borderRadius:10, border:"1px solid #e5e7eb", boxShadow:"0 8px 16px -4px rgb(0 0 0 / 0.1)" }}
                animationDuration={150}
              />
              <Area
                type="natural"
                dataKey="revenue"
                stroke="#4f46e5"
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="url(#gIndigo)"
                dot={false}
                activeDot={{ r:5, fill:"#4f46e5", stroke:"#fff", strokeWidth:2 }}
                isAnimationActive
                animationDuration={1100}
                animationEasing="ease-in-out"
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50 dark:border-gray-800">
            <span className="w-2 h-2 rounded-full bg-primary-600" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Total revenue (6 months)</span>
            <span className="text-xs font-semibold text-gray-900 dark:text-white ml-auto">{fmt(chartTotal)}</span>
          </div>
        </div>

        {/* Low stock */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 flex flex-col"
          style={{ animation: "cardIn 0.4s ease-out 240ms both" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center">
                <AlertTriangle size={13} className="text-amber-500" />
              </div>
              Low Stock Alert
            </h2>
            <button onClick={() => navigate("/inventory")}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">
              View all
            </button>
          </div>
          {lowStock.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
              <div className="w-14 h-14 rounded-2xl bg-green-50 dark:bg-green-950/40 flex items-center justify-center mb-3">
                <CheckCircle2 size={24} className="text-green-400 dark:text-green-500" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">All stock levels healthy</p>
              <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">Nothing needs attention right now</p>
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {lowStock.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between"
                  style={{ animation: `rowIn 0.3s ease-out ${i * 40}ms both` }}>
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.stock_quantity <= 0 ? "bg-red-500" : "bg-amber-500"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate max-w-36">{item.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Reorder at {item.reorder_level} {item.unit}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ml-2 ${item.stock_quantity <= 0 ? "text-red-500 dark:text-red-400" : "text-amber-500 dark:text-amber-400"}`}>
                    {item.stock_quantity} {item.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden"
        style={{ animation: "cardIn 0.4s ease-out 280ms both" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Transactions</h2>
          <button onClick={() => navigate("/sales")}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">
            View all
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-3">
              <ShoppingCart size={24} className="text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">No transactions yet</p>
            <button onClick={() => navigate("/pos")}
              className="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 active:scale-95 text-white rounded-lg transition-all duration-150">
              Make first sale
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/70 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                <tr>
                  {["Invoice No","Date","Amount","Paid","Balance","Status"].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/70">
                {recent.map((inv, i) => (
                  <tr key={inv.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors"
                    style={{ animation: `rowIn 0.3s ease-out ${i * 35}ms both` }}>
                    <td className="px-5 py-3 font-semibold text-primary-600 dark:text-primary-400 whitespace-nowrap">{shortDocNumber(inv.invoice_number, inv.invoice_date)}</td>
                    <td className="px-5 py-3">
                      <div className="text-xs text-gray-700 dark:text-gray-300">{formatAD(inv.invoice_date)}</div>
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{fmt(inv.total)}</td>
                    <td className="px-5 py-3 text-green-600 dark:text-green-400">{fmt(inv.paid_amount)}</td>
                    <td className={`px-5 py-3 ${inv.total - inv.paid_amount > 0 ? "text-red-500 dark:text-red-400 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
                      {fmt(inv.total - inv.paid_amount)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        inv.status === "paid" ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                        : inv.status === "partial" ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                        : "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
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
