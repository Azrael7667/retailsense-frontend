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
  RefreshCw, Tag, Receipt, CheckCircle2, ChevronRight
} from "lucide-react"

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

const COLOR_MAP = {
  primary:{ val: "text-primary-600 dark:text-primary-400", iconBg: "bg-primary-50 dark:bg-primary-950/50", icon: "text-primary-600 dark:text-primary-400" },
  red:    { val: "text-red-600 dark:text-red-400",         iconBg: "bg-red-50 dark:bg-red-950/50",         icon: "text-red-500 dark:text-red-400" },
  green:  { val: "text-green-600 dark:text-green-400",     iconBg: "bg-green-50 dark:bg-green-950/50",     icon: "text-green-600 dark:text-green-400" },
  purple: { val: "text-purple-600 dark:text-purple-400",   iconBg: "bg-purple-50 dark:bg-purple-950/50",   icon: "text-purple-600 dark:text-purple-400" },
  amber:  { val: "text-amber-600 dark:text-amber-400",     iconBg: "bg-amber-50 dark:bg-amber-950/50",     icon: "text-amber-600 dark:text-amber-400" },
}

function StatCard({ label, value, sub, trend, trendVal, icon: Icon, iconBg, iconColor, active, onMouseEnter, onMouseLeave, onClick, delay = 0 }) {
  return (
    <div onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`relative rounded-2xl px-5 py-4 border transition-colors duration-200 ${
        active
          ? "bg-gray-900 border-gray-900"
          : "bg-white border-gray-100"
      } ${onClick ? "cursor-pointer active:scale-[0.99]" : ""}`}
      style={{ animation: `cardIn 0.3s ease-out ${delay}ms both` }}>

      <div className="flex items-center justify-between mb-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
          {Icon && <Icon size={15} className={iconColor} />}
        </div>
        {onClick && (
          <div className={`w-6 h-6 rounded-full flex items-center justify-center border shrink-0 transition-colors duration-200 ${
            active ? "border-white/20 text-white" : "border-gray-200 text-gray-400"
          }`}>
            <ArrowUpRight size={12} />
          </div>
        )}
      </div>

      <p className={`text-sm mb-0.5 transition-colors duration-200 ${active ? "text-gray-300" : "text-gray-500"}`}>{label}</p>

      <p className={`text-xl font-bold mb-2 tabular-nums transition-colors duration-200 ${active ? "text-white" : "text-gray-900"}`}>{value}</p>

      <div className="flex items-center gap-1.5 text-xs">
        {trend !== undefined && (
          <span className={`flex items-center gap-0.5 font-semibold px-1.5 py-0.5 rounded-full ${
            trend >= 0 ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
          }`}>
            {trend >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {Math.abs(trendVal ?? trend)}%
          </span>
        )}
        <span className={`truncate transition-colors duration-200 ${active ? "text-gray-400" : "text-gray-400"}`}>{sub}</span>
      </div>
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
  const [refreshing, setRefreshing] = useState(false)
  const [activeCard, setActiveCard] = useState(0)
  const [stockFilter, setStockFilter] = useState("all")

  useEffect(() => { init() }, [user])

  async function init() {
    const { data: u } = await supabase.from("users").select("store_id").eq("id", user.id).single()
    if (!u) return
    setStoreId(u.store_id)
    await loadAll(u.store_id)
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

    setLowStock(
      (products || [])
        .filter(p => p.stock_quantity <= p.reorder_level)
        .sort((a, b) => a.stock_quantity - b.stock_quantity)
    )

    const sorted = [...allInv].sort((a, b) => new Date(b.invoice_date) - new Date(a.invoice_date)).slice(0, 8)
    setRecent(sorted)

    const months = []
    for (let i = 5; i >= 0; i--) {
      const d      = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0]
      const mEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0]
      const mInv   = allInv.filter(inv => inv.invoice_date >= mStart && inv.invoice_date <= mEnd)
      const mPur   = allPurc.filter(p => p.purchase_date >= mStart && p.purchase_date <= mEnd)
      months.push({
        month:   MONTHS[d.getMonth()],
        stockIn: mPur.reduce((s, r) => s + (r.total || 0), 0),
        consume: mInv.reduce((s, r) => s + (r.total || 0), 0),
      })
    }
    setChartData(months)
  }

    const STOCK_FILTERS = [
    { key: "all",         label: "All" },
    { key: "fast_moving",  label: "Fast Moving" },
    { key: "moderate",     label: "Moderate" },
    { key: "slow_moving",  label: "Slow Moving" },
    { key: "dead_stock",   label: "Dead Stock" },
  ]
  function handleRefresh() {
    setRefreshing(true)
    init()
  }

  const fmt = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
  const fmtShort = (n) => {
    if (n >= 100000) return "Rs " + (n / 100000).toFixed(1) + "L"
    if (n >= 1000)   return "Rs " + (n / 1000).toFixed(1) + "K"
    return "Rs " + n.toFixed(0)
  }

  const stockInTotal = chartData.reduce((s, m) => s + (m.stockIn || 0), 0)
  const consumeTotal = chartData.reduce((s, m) => s + (m.consume || 0), 0)

  const displayedLowStock = (stockFilter === "all" ? lowStock : lowStock.filter(p => p.product_type === stockFilter)).slice(0, 4)

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

      {/* Stat cards */}  
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="To Receive" value={fmt(stats.toReceive)}
          icon={ArrowDownRight} iconBg="bg-lime-100" iconColor="text-lime-700"
          sub="Outstanding from customers" delay={0}
          active={activeCard === 0}
          onMouseEnter={() => setActiveCard(0)}
          onMouseLeave={() => setActiveCard(0)}
          onClick={() => navigate("/khata")} />
        <StatCard label="To Give" value={fmt(stats.toGive)}
          icon={ArrowUpRight} iconBg="bg-red-100" iconColor="text-red-600"
          sub="Outstanding to suppliers" delay={40}
          active={activeCard === 1}
          onMouseEnter={() => setActiveCard(1)}
          onMouseLeave={() => setActiveCard(0)}
          onClick={() => navigate("/suppliers")} />
        <StatCard label={`Sales (${stats.monthLabel})`} value={fmt(stats.salesThisMonth)}
          icon={Tag} iconBg="bg-green-100" iconColor="text-green-600"
          sub={`${stats.invoices} invoices this month`} delay={80}
          active={activeCard === 2}
          onMouseEnter={() => setActiveCard(2)}
          onMouseLeave={() => setActiveCard(0)} />
        <StatCard label={`Purchase (${stats.monthLabel})`} value={fmt(stats.purchaseThisMonth)}
          icon={ShoppingCart} iconBg="bg-primary-100" iconColor="text-primary-600"
          sub="This month's purchase bills" delay={120}
          active={activeCard === 3}
          onMouseEnter={() => setActiveCard(3)}
          onMouseLeave={() => setActiveCard(0)} />
      </div>

      {/* Chart + Low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Stock chart */}
        <div className="lg:col-span-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5"
          style={{ animation: "cardIn 0.4s ease-out 200ms both" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Total Stock Volume vs Consume Rate</h2>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="w-2 h-2 rounded-full bg-lime-700" /> Stock In
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="w-2 h-2 rounded-full bg-lime-300" /> Consume
              </span>
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg">
                {["monthly"].map(p => (
                  <button key={p} onClick={() => setChartPeriod(p)}
                    className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-all duration-150 ${chartPeriod === p ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm": "text-gray-500 dark:text-gray-400"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top:5, right:5, left:0, bottom:0 }}>
              <defs>
                <linearGradient id="gConsume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#bef264" stopOpacity={0.35}/>
                  <stop offset="95%" stopColor="#bef264" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 6" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize:12, fill:"#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize:11, fill:"#9ca3af" }} axisLine={false} tickLine={false}
                tickFormatter={v => fmtShort(v)} />
              <Tooltip
                cursor={{ stroke: "#bef264", strokeWidth: 1.5, strokeDasharray: "4 4" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null
                  const stockIn = payload.find(p => p.dataKey === "stockIn")?.value ?? 0
                  const consume = payload.find(p => p.dataKey === "consume")?.value ?? 0
                  return (
                    <div className="bg-gray-900 rounded-xl px-4 py-2.5 shadow-lg space-y-1">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className="text-sm font-bold text-lime-400 tabular-nums">Stock In: {fmt(stockIn)}</p>
                      <p className="text-sm font-bold text-white tabular-nums">Consume: {fmt(consume)}</p>
                    </div>
                  )
                }}
                animationDuration={150}
              />
              <Area
                type="natural"
                dataKey="consume"
                stroke="#bef264"
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="url(#gConsume)"
                dot={false}
                activeDot={{ r:5, fill:"#bef264", stroke:"#fff", strokeWidth:2 }}
                isAnimationActive
                animationDuration={1100}
                animationEasing="ease-in-out"
              />
              <Area
                type="natural"
                dataKey="stockIn"
                stroke="#4d7c0f"
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="none"
                dot={false}
                activeDot={{ r:5, fill:"#4d7c0f", stroke:"#fff", strokeWidth:2 }}
                isAnimationActive
                animationDuration={1100}
                animationEasing="ease-in-out"
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Category pills — visual only for now, not wired to real filtering */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50 dark:border-gray-800 overflow-x-auto no-scrollbar">
            {["All", "Sipradi", "Rita", "Gautam Buddha", "BNH"].map((cat, i) => (
              <button key={cat} onClick={() => setChartPeriod(chartPeriod)}
                className={`shrink-0 px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors duration-150 ${
                  i === 0 ? "bg-gray-900 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Low stock */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 flex flex-col"
             style={{ animation: "cardIn 0.4s ease-out 240ms both" }}>
            <div className="flex items-center justify-between mb-0.5">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Low Stock Alert</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Classified by movement speed</p>
              </div>
              <button onClick={() => navigate("/inventory")}
                className="w-7 h-7 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 transition-colors shrink-0">
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 mt-4 mb-3 overflow-x-auto no-scrollbar">
              {STOCK_FILTERS.map(f => (
                <button key={f.key} onClick={() => setStockFilter(f.key)}
                  className={`shrink-0 px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors duration-150 ${
                    stockFilter === f.key
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            {displayedLowStock.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                <div className="w-14 h-14 rounded-2xl bg-green-50 dark:bg-green-950/40 flex items-center justify-center mb-3">
                  <CheckCircle2 size={24} className="text-green-400 dark:text-green-500" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">All stock levels healthy</p>
                <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">Nothing needs attention here</p>
              </div>
            ) : (
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left pb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Product</th>
                      <th className="text-right pb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Stock Qty</th>
                      <th className="text-right pb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Reorder At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/70">
                    {displayedLowStock.map((item, i) => {
                      const palette = ["bg-primary-100 text-primary-700", "bg-amber-100 text-amber-700", "bg-lime-100 text-lime-700", "bg-red-100 text-red-700", "bg-purple-100 text-purple-700", "bg-cyan-100 text-cyan-700"]
                      const initial = item.name?.charAt(0).toUpperCase() || "?"
                      return (
                        <tr key={item.name} style={{ animation: `rowIn 0.3s ease-out ${i * 40}ms both` }}>
                          <td className="py-2.5 pr-2">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${palette[i % palette.length]}`}>
                                {initial}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate max-w-28">{item.name}</p>
                                {item.product_type && (
                                  <p className="text-[11px] text-gray-400 dark:text-gray-500 capitalize truncate">{item.product_type.replace("_", " ")}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={`py-2.5 text-right text-sm font-bold ${item.stock_quantity <= 0 ? "text-red-500 dark:text-red-400" : "text-amber-500 dark:text-amber-400"}`}>
                            {item.stock_quantity} {item.unit}
                          </td>
                          <td className="py-2.5 text-right text-xs text-gray-400 dark:text-gray-500">
                            {item.reorder_level} {item.unit}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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
                    <td className="px-5 py-3 font-semibold text-primary-600 dark:text-primary-400">{inv.invoice_number}</td>
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
