import { useEffect, useState } from "react"
import api from "../../lib/apiClient"
import {
  TrendingUp, TrendingDown, Users, Package,
  AlertTriangle, Shield, Brain, RefreshCw,
  ChevronDown, ChevronUp, CheckCircle, XCircle
} from "lucide-react"
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts"

// ── Reusable components ────────────────────────────────────────

function AICard({ title, subtitle, icon: Icon, color, children, loading }) {
  const colors = {
    blue:   "border-blue-200 dark:border-blue-800",
    green:  "border-green-200 dark:border-green-800",
    orange: "border-orange-200 dark:border-orange-800",
    purple: "border-purple-200 dark:border-purple-800",
    red:    "border-red-200 dark:border-red-800",
    teal:   "border-teal-200 dark:border-teal-800",
  }
  const iconColors = {
    blue:   "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400",
    green:  "bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400",
    orange: "bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-400",
    purple: "bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400",
    red:    "bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400",
    teal:   "bg-teal-100 dark:bg-teal-900 text-teal-600 dark:text-teal-400",
  }

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border-2 ${colors[color]} p-5`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColors[color]}`}>
          <Icon size={20} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : children}
    </div>
  )
}

function RiskBadge({ level }) {
  const styles = {
    high:   "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    low:    "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles[level] || styles.low}`}>
      {level}
    </span>
  )
}

function GradeBadge({ grade }) {
  const styles = {
    A: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
    B: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
    C: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    D: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
    F: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${styles[grade] || styles.C}`}>
      {grade}
    </span>
  )
}

const fmt = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0 })

// ── Main component ──────────────────────────────────────────────

export default function AIDashboard() {
  const [cashFlow,   setCashFlow]   = useState(null)
  const [inventory,  setInventory]  = useState(null)
  const [churn,      setChurn]      = useState(null)
  const [trend,      setTrend]      = useState(null)
  const [anomaly,    setAnomaly]    = useState(null)
  const [credit,     setCredit]     = useState(null)
  const [loading,    setLoading]    = useState({})
  const [errors,     setErrors]     = useState({})
  const [expanded,   setExpanded]   = useState({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    await Promise.all([
      load("cashFlow",  "/api/ai/cashflow/cash-flow-forecast",  setCashFlow),
      load("inventory", "/api/ai/inventory/inventory-demand",    setInventory),
      load("churn",     "/api/ai/churn/customer-churn",      setChurn),
      load("trend",     "/api/ai/trend/sales-trend",         setTrend),
      load("anomaly",   "/api/ai/anomaly/anomaly-detection",   setAnomaly),
      load("credit",    "/api/ai/credit/credit-scoring",      setCredit),
    ])
  }

  async function load(key, endpoint, setter) {
    setLoading(prev => ({ ...prev, [key]: true }))
    setErrors(prev => ({ ...prev, [key]: null }))
    try {
      const res = await api.get(endpoint)
      setter(res.data)
    } catch (e) {
      setErrors(prev => ({
        ...prev,
        [key]: e.response?.data?.detail || "Not trained yet"
      }))
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  async function trainModel(key, endpoint, setter) {
    try {
      await api.post(endpoint)
      setTimeout(() => load(key, endpoint.replace("/train", ""), setter), 5000)
    } catch (e) {
      console.error(e)
    }
  }

  function toggle(key) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Brain size={22} className="text-orange-500" />
            AI Insights
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            6 ML models analysing your business data
          </p>
        </div>
        <button onClick={loadAll}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <RefreshCw size={15} /> Refresh all
        </button>
      </div>

      {/* ── Row 1: Cash Flow + Sales Trend ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Cash Flow Forecast */}
        <AICard title="Cash Flow Forecast" subtitle="Prophet — 30-day prediction"
          icon={TrendingUp} color="green" loading={loading.cashFlow}>
          {errors.cashFlow ? (
            <NotTrained message={errors.cashFlow}
              onTrain={() => trainModel("cashFlow", "/api/ai/cashflow/cash-flow-forecast/train", setCashFlow)} />
          ) : cashFlow ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "30-day revenue",  value: fmt(cashFlow.summary?.total_expected_revenue),  color: "text-green-600 dark:text-green-400" },
                  { label: "30-day expenses", value: fmt(cashFlow.summary?.total_expected_expenses), color: "text-red-500" },
                  { label: "Net cash flow",   value: fmt(cashFlow.summary?.total_expected_net),      color: cashFlow.summary?.total_expected_net >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-500" },
                ].map(m => (
                  <div key={m.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                    <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={cashFlow.forecast?.slice(0, 30)} margin={{ top:5, right:5, left:0, bottom:0 }}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickFormatter={d => d?.slice(5)} axisLine={false} tickLine={false} interval={6} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip formatter={v => [fmt(v), "Revenue"]}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#gRev)" />
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Trained on: {cashFlow.trained_on} · Model: {cashFlow.model}
              </p>
            </>
          ) : null}
        </AICard>

        {/* Sales Trend */}
        <AICard title="Sales Trend Analysis" subtitle="Prophet + Optuna — 8-week forecast"
          icon={TrendingUp} color="blue" loading={loading.trend}>
          {errors.trend ? (
            <NotTrained message={errors.trend}
              onTrain={() => trainModel("trend", "/api/ai/trend/sales-trend/train", setTrend)} />
          ) : trend ? (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Trend</p>
                  <p className={`text-sm font-bold flex items-center gap-1 ${trend.insights?.trend_direction === "growing" ? "text-green-600" : "text-red-500"}`}>
                    {trend.insights?.trend_direction === "growing"
                      ? <TrendingUp size={14} />
                      : <TrendingDown size={14} />}
                    {trend.insights?.trend_direction} ({trend.insights?.trend_percent > 0 ? "+" : ""}{trend.insights?.trend_percent}%)
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Avg weekly</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{fmt(trend.insights?.avg_weekly_sales)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Best month</p>
                  <p className="text-sm font-bold text-green-600">{trend.insights?.best_month}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Worst month</p>
                  <p className="text-sm font-bold text-red-500">{trend.insights?.worst_month}</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={trend.forecast_8w} margin={{ top:5, right:5, left:0, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickFormatter={d => d?.slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => [fmt(v), "Revenue"]}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : null}
        </AICard>
      </div>

      {/* ── Row 2: Churn + Credit ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Customer Churn */}
        <AICard title="Customer Churn Prediction" subtitle="LightGBM + SHAP — 60-day inactivity"
          icon={Users} color="purple" loading={loading.churn}>
          {errors.churn ? (
            <NotTrained message={errors.churn}
              onTrain={() => trainModel("churn", "/api/ai/churn/customer-churn/train", setChurn)} />
          ) : churn ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "High risk",   value: churn.summary?.high_risk,   color: "text-red-500" },
                  { label: "Medium risk", value: churn.summary?.medium_risk,  color: "text-amber-500" },
                  { label: "Low risk",    value: churn.summary?.low_risk,     color: "text-green-600" },
                ].map(m => (
                  <div key={m.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                    <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {churn.predictions?.filter(p => p.risk_level === "high").slice(0, 5).map(p => (
                  <div key={p.customer_id} className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{p.customer_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{p.churn_percent}% risk</span>
                        <RiskBadge level={p.risk_level} />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">Last purchase: {p.recency_days} days ago</p>
                    {p.explanations?.[0] && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">→ {p.explanations[0]}</p>
                    )}
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-medium">✓ {p.action}</p>
                  </div>
                ))}
                {churn.predictions?.filter(p => p.risk_level === "high").length === 0 && (
                  <p className="text-sm text-center text-gray-400 py-4">No high-risk customers detected</p>
                )}
              </div>
            </>
          ) : null}
        </AICard>

        {/* Credit Scoring */}
        <AICard title="Credit Scoring" subtitle="LightGBM + SHAP + LR baseline"
          icon={Shield} color="teal" loading={loading.credit}>
          {errors.credit ? (
            <NotTrained message={errors.credit}
              onTrain={() => trainModel("credit", "/api/ai/credit/credit-scoring/train", setCredit)} />
          ) : credit ? (
            <>
              <div className="grid grid-cols-5 gap-2 mb-4">
                {["A","B","C","D","F"].map(g => {
                  const count = credit.summary?.grade_breakdown?.[g] || 0
                  return (
                    <div key={g} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-center">
                      <GradeBadge grade={g} />
                      <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{count}</p>
                    </div>
                  )
                })}
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {credit.scores?.slice(0, 8).map(s => (
                  <div key={s.customer_id} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.customer_name}</p>
                      <p className="text-xs text-gray-400">{s.decision}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
                        <div className="h-1.5 rounded-full"
                          style={{ width: `${s.credit_score}%`, background: s.credit_score >= 80 ? "#10b981" : s.credit_score >= 50 ? "#f59e0b" : "#ef4444" }} />
                      </div>
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-8 text-right">{s.credit_score}</span>
                      <GradeBadge grade={s.grade} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </AICard>
      </div>

      {/* ── Row 3: Inventory + Anomaly ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Inventory Demand */}
        <AICard title="Inventory Demand Forecast" subtitle="LightGBM — 4-week demand per product"
          icon={Package} color="orange" loading={loading.inventory}>
          {errors.inventory ? (
            <NotTrained message={errors.inventory}
              onTrain={() => trainModel("inventory", "/api/ai/inventory/inventory-demand/train", setInventory)} />
          ) : inventory ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Total products",  value: inventory.summary?.total_products, color: "text-gray-900 dark:text-white" },
                  { label: "Need restock",    value: inventory.summary?.needs_restock,  color: "text-red-500" },
                  { label: "Healthy stock",   value: inventory.summary?.healthy_stock,  color: "text-green-600" },
                ].map(m => (
                  <div key={m.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                    <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {inventory.recommendations?.filter(r => r.needs_restock).slice(0, 6).map(r => (
                  <div key={r.product_name} className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs">{r.product_name}</p>
                      <span className="text-xs text-red-500 font-bold shrink-0 ml-2">
                        {r.current_stock} {r.unit} left
                      </span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <p className="text-xs text-gray-500">4-week demand: {r.next_4w_demand} {r.unit}</p>
                      <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                        Order: {r.suggested_order} {r.unit}
                      </p>
                    </div>
                  </div>
                ))}
                {inventory.recommendations?.filter(r => r.needs_restock).length === 0 && (
                  <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <CheckCircle size={18} className="text-green-600 shrink-0" />
                    <p className="text-sm text-green-700 dark:text-green-400">All products have healthy stock levels</p>
                  </div>
                )}
              </div>

              {/* Show healthy products toggle */}
              <button onClick={() => toggle("inventory")}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mt-2">
                {expanded.inventory ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                {expanded.inventory ? "Hide" : "Show"} healthy products
              </button>
              {expanded.inventory && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {inventory.recommendations?.filter(r => !r.needs_restock).slice(0, 10).map(r => (
                    <div key={r.product_name} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
                      <p className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-xs">{r.product_name}</p>
                      <p className="text-xs text-green-600 shrink-0 ml-2">{r.current_stock} {r.unit} ({r.weeks_of_stock}w)</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </AICard>

        {/* Anomaly Detection */}
        <AICard title="Anomaly Detection" subtitle="Isolation Forest — unusual transactions"
          icon={AlertTriangle} color="red" loading={loading.anomaly}>
          {errors.anomaly ? (
            <NotTrained message={errors.anomaly}
              onTrain={() => trainModel("anomaly", "/api/ai/anomaly/anomaly-detection/train", setAnomaly)} />
          ) : anomaly ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Total transactions", value: anomaly.summary?.total_transactions, color: "text-gray-900 dark:text-white" },
                  { label: "Anomalies found",    value: anomaly.summary?.anomalies_detected, color: "text-red-500" },
                  { label: "Anomaly rate",       value: `${anomaly.summary?.anomaly_rate}%`,  color: "text-amber-500" },
                ].map(m => (
                  <div key={m.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                    <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {anomaly.anomalies?.slice(0, 8).map((a, i) => (
                  <div key={i} className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">{a.invoice_date}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-red-600">{fmt(a.total)}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                          a.payment_method === "credit"
                            ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}>{a.payment_method}</span>
                      </div>
                    </div>
                    {a.reasons?.map((r, j) => (
                      <p key={j} className="text-xs text-red-600 dark:text-red-400">⚠ {r}</p>
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </AICard>
      </div>

      {/* Model info footer */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Model Registry</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { name: "Cash Flow",    model: "Prophet",          status: !errors.cashFlow  && cashFlow },
            { name: "Sales Trend",  model: "Prophet+Optuna",   status: !errors.trend     && trend },
            { name: "Churn",        model: "LightGBM+SHAP",    status: !errors.churn     && churn },
            { name: "Credit",       model: "LightGBM+LR",      status: !errors.credit    && credit },
            { name: "Inventory",    model: "LightGBM×97",      status: !errors.inventory && inventory },
            { name: "Anomaly",      model: "Isolation Forest", status: !errors.anomaly   && anomaly },
          ].map(m => (
            <div key={m.name} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                {m.status
                  ? <CheckCircle size={12} className="text-green-500" />
                  : <XCircle size={12} className="text-red-400" />}
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{m.name}</span>
              </div>
              <p className="text-xs text-gray-400">{m.model}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function NotTrained({ message, onTrain }) {
  return (
    <div className="text-center py-6">
      <Brain size={32} className="mx-auto text-gray-200 dark:text-gray-700 mb-2" />
      <p className="text-xs text-gray-400 mb-3">{message}</p>
      <button onClick={onTrain}
        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs rounded-lg font-medium transition-colors">
        Train model
      </button>
    </div>
  )
}
