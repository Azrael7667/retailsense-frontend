import { useEffect, useState } from "react"
import api from "../../lib/apiClient"
import {
  TrendingUp, TrendingDown, Users, Package, AlertTriangle,
  Shield, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, BarChart3, Info, Sparkles, Lightbulb, Loader2
} from "lucide-react"
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts"

const COLORS = {
  primary: "#4f46e5",   // indigo-600
  green:   "#16a34a",
  red:     "#dc2626",
  amber:   "#d97706",
}

const MODELS = [
  {
    key: "cashFlow", title: "Cash Flow Forecast", algo: "Prophet", icon: TrendingUp,
    simple: "How much money will come in during the next 30 days",
    what: "Predicts daily revenue for the next 30 days based on past sales patterns",
    why:  "Know in advance if you can afford new stock, rent, or supplier payments",
    how:  "Trained on your invoice history. Learns weekly rhythm and festival seasons (Dashain, Tihar) and monsoon slowdown.",
    get: "/api/ai/cashflow/cash-flow-forecast", train: "/api/ai/cashflow/cash-flow-forecast/train",
  },
  {
    key: "inventory", title: "Restock Advisor", algo: "LightGBM", icon: Package,
    simple: "Which products to order before they run out",
    what: "Predicts units each product will sell in the next 4 weeks and compares with current stock",
    why:  "Never lose a sale because a fast-moving part was out of stock",
    how:  "One model per product. Each learns that product's own selling speed and seasonality.",
    get: "/api/ai/inventory/inventory-demand", train: "/api/ai/inventory/inventory-demand/train",
  },
  {
    key: "churn", title: "Customers Leaving", algo: "LightGBM + SHAP", icon: Users,
    simple: "Which regular customers have stopped coming",
    what: "Flags customers who are likely to stop buying from your shop",
    why:  "A phone call or small discount can bring a valuable customer back before they switch to another shop",
    how:  "Looks at how recently, how often, and how much each customer buys. No purchase in 60 days = churned. SHAP explains each flag.",
    get: "/api/ai/churn/customer-churn", train: "/api/ai/churn/customer-churn/train",
  },
  {
    key: "trend", title: "Business Direction", algo: "Prophet + Optuna", icon: BarChart3,
    simple: "Is the business growing or shrinking",
    what: "Measures overall sales direction and forecasts the next 8 weeks",
    why:  "See the big picture — plan stock and staff for busy months, save cash for slow ones",
    how:  "Prophet model auto-tuned with Optuna trials on weekly sales totals.",
    get: "/api/ai/trend/sales-trend", train: "/api/ai/trend/sales-trend/train",
  },
  {
    key: "anomaly", title: "Unusual Transactions", algo: "Isolation Forest", icon: AlertTriangle,
    simple: "Bills that look strange and worth double-checking",
    what: "Flags transactions that do not fit your shop's normal pattern",
    why:  "Catch billing mistakes, suspicious discounts, or unusual credit sales early",
    how:  "Learns what a normal bill looks like from your transaction history, then flags the most unusual ones.",
    get: "/api/ai/anomaly/anomaly-detection", train: "/api/ai/anomaly/anomaly-detection/train",
  },
  {
    key: "credit", title: "Udharo Advisor", algo: "LightGBM vs Logistic Regression", icon: Shield,
    simple: "Which customers are safe to give credit",
    what: "Scores every customer 0-100 on how safely they repay credit",
    why:  "Give udharo confidently to grade A customers, ask for cash from grade F",
    how:  "Learns from payment history, outstanding balance, and khata repayment behavior. Two algorithms compared for reliability.",
    get: "/api/ai/credit/credit-scoring", train: "/api/ai/credit/credit-scoring/train",
  },
]

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { maximumFractionDigits: 0 })

function Stat({ label, value, sub, tone }) {
  const toneClass = tone === "green" ? "text-emerald-600" : tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-gray-900"
  return (
    <div className="flex-1 min-w-[120px] bg-gray-50 rounded-xl px-4 py-3 transition-colors">
      <p className="text-[11px] text-gray-400 font-medium mb-1">{label}</p>
      <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Row({ left, leftSub, right, rightSub, tone, delay = 0 }) {
  const toneClass = tone === "green" ? "text-emerald-600" : tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-gray-900"
  return (
    <div
      className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 animate-[fadeSlideIn_0.35s_ease-out_both]"
      style={{ animationDelay: `${delay}ms` }}>
      <div className="min-w-0 flex-1 pr-3">
        <p className="text-sm font-medium text-gray-900 truncate">{left}</p>
        {leftSub && <p className="text-xs text-gray-400 mt-0.5">{leftSub}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold ${toneClass}`}>{right}</p>
        {rightSub && <p className="text-xs text-gray-400 mt-0.5">{rightSub}</p>}
      </div>
    </div>
  )
}

// Skeleton placeholder shown while a card's data is loading — mirrors the
// shape of the real header so nothing "jumps" once data arrives.
function CardSkeleton() {
  return (
    <div className="flex items-center gap-3.5 px-5 py-4 animate-pulse">
      <div className="w-10 h-10 rounded-xl bg-gray-100 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3.5 w-40 bg-gray-100 rounded" />
        <div className="h-2.5 w-56 bg-gray-50 rounded" />
      </div>
      <div className="h-7 w-24 bg-gray-100 rounded-lg shrink-0" />
    </div>
  )
}

export default function AIDashboard() {
  const [data,     setData]     = useState({})
  const [loading,  setLoading]  = useState({})
  const [errors,   setErrors]   = useState({})
  const [expanded, setExpanded] = useState({})
  const [showInfo, setShowInfo] = useState({})
  const [training, setTraining] = useState({})
  const [trainingAll, setTrainingAll] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { loadAll(); setMounted(true) }, [])

  function loadAll() { MODELS.forEach(m => loadOne(m)) }

  async function loadOne(m) {
    setLoading(p => ({ ...p, [m.key]: true }))
    setErrors(p => ({ ...p, [m.key]: null }))
    try {
      const res = await api.get(m.get)
      setData(p => ({ ...p, [m.key]: res.data }))
    } catch(e) {
      setErrors(p => ({ ...p, [m.key]: e.response?.data?.detail || "Not trained" }))
    } finally {
      setLoading(p => ({ ...p, [m.key]: false }))
    }
  }

  async function trainOne(m) {
    setTraining(p => ({ ...p, [m.key]: true }))
    try {
      await api.post(m.train)
      setTimeout(() => { loadOne(m); setTraining(p => ({ ...p, [m.key]: false })) }, 12000)
    } catch { setTraining(p => ({ ...p, [m.key]: false })) }
  }

  async function trainAll() {
    setTrainingAll(true)
    MODELS.forEach(m => setTraining(p => ({...p, [m.key]: true})))
    try {
      await api.post("/api/admin/train-all")
      setTimeout(() => {
        loadAll()
        MODELS.forEach(m => setTraining(p => ({...p, [m.key]: false})))
        setTrainingAll(false)
      }, 60000)
    } catch { setTrainingAll(false) }
  }

  const d = data
  const trainedCount = MODELS.filter(m => !errors[m.key] && data[m.key]).length

  const actions = []
  if (d.inventory?.summary?.needs_restock > 0)
    actions.push({ text: `Order stock for ${d.inventory.summary.needs_restock} products before they run out`, tone: "amber" })
  if (d.churn?.summary?.high_risk > 0)
    actions.push({ text: `Call ${d.churn.summary.high_risk} customers who have not bought in a long time`, tone: "red" })
  if (d.anomaly?.summary?.anomalies_detected > 0)
    actions.push({ text: `Review ${d.anomaly.summary.anomalies_detected} unusual transactions flagged by the system`, tone: "amber" })
  if (d.credit?.summary?.grade_breakdown?.F > 0)
    actions.push({ text: `Avoid giving udharo to ${d.credit.summary.grade_breakdown.F} high-risk (Grade F) customers`, tone: "red" })
  if (d.cashFlow?.summary?.total_expected_revenue)
    actions.push({ text: `Expect around ${fmt(d.cashFlow.summary.total_expected_revenue)} revenue in the next 30 days`, tone: "green" })

  const toneDot = { amber: "bg-amber-500", red: "bg-red-500", green: "bg-emerald-500" }

  return (
    <div className="min-h-full bg-gray-50/60 p-6">
      <style>{`
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cardIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes expandIn { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 800px; } }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-600" />
            AI Insights
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Smart suggestions generated from your own sales data</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-sm text-gray-500 transition-all">
            <span className="font-semibold text-gray-900 tabular-nums">{trainedCount}/6</span> active
          </span>
          <button onClick={trainAll} disabled={trainingAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100 transition-all duration-150">
            {trainingAll ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {trainingAll ? "Training..." : "Train All"}
          </button>
          <button onClick={loadAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-[0.97] transition-all duration-150">
            <RefreshCw size={14} className={Object.values(loading).some(Boolean) ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* What to do today */}
      {actions.length > 0 && (
        <div
          className="bg-white border border-gray-200 rounded-2xl p-5 mb-5 shadow-sm"
          style={{ animation: mounted ? "cardIn 0.4s ease-out both" : "none" }}>
          <div className="flex items-center gap-2 mb-3.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Lightbulb size={14} className="text-indigo-600" />
            </div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">What to do today</p>
          </div>
          <div className="flex flex-col gap-2.5">
            {actions.map((a, i) => (
              <div key={i} className="flex items-start gap-2.5 animate-[fadeSlideIn_0.35s_ease-out_both]" style={{ animationDelay: `${i * 60}ms` }}>
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${toneDot[a.tone]}`} />
                <p className="text-sm text-gray-700 leading-snug">{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model cards */}
      <div className="flex flex-col gap-3">
        {MODELS.map((m, idx) => {
          const Icon = m.icon
          const isLoading  = loading[m.key]
          const hasData    = !errors[m.key] && !!data[m.key]
          const isExpanded = expanded[m.key]
          const infoOpen   = showInfo[m.key]
          const isTraining = training[m.key]
          const md         = data[m.key]

          return (
            <div key={m.key}
              className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200"
              style={{ animation: mounted ? `cardIn 0.4s ease-out ${idx * 50}ms both` : "none" }}>

              {isLoading && !hasData ? (
                <CardSkeleton />
              ) : (
                <>
                  {/* Header */}
                  <div className="flex items-center gap-3.5 px-5 py-4">
                    <div className={`w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 transition-transform duration-300 ${isTraining ? "animate-pulse" : ""}`}>
                      <Icon size={18} className="text-indigo-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{m.title}</span>
                        <span className="text-[10px] font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">{m.algo}</span>
                        {!isLoading && hasData && (
                          <span className="text-xs text-emerald-600 font-semibold inline-flex items-center gap-1 animate-[fadeSlideIn_0.3s_ease-out]">
                            <CheckCircle2 size={12} /> Active
                          </span>
                        )}
                        {!isLoading && !hasData && !isTraining && <span className="text-xs text-gray-400">Not trained</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{m.simple}</p>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setShowInfo(p => ({...p, [m.key]: !p[m.key]}))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 active:scale-95 transition-all duration-150">
                        <Info size={12} /> How it works
                      </button>
                      {hasData && (
                        <button onClick={() => setExpanded(p => ({...p, [m.key]: !p[m.key]}))}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 active:scale-95 transition-all duration-150">
                          <ChevronDown size={12} className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                          {isExpanded ? "Hide" : "Details"}
                        </button>
                      )}
                      {!hasData && !isTraining && !isLoading && (
                        <button onClick={() => trainOne(m)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all duration-150">
                          Train
                        </button>
                      )}
                      {isTraining && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-100 bg-indigo-50/60 text-indigo-500">
                          <Loader2 size={12} className="animate-spin" /> Training
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Plain-language summary */}
                  {!isLoading && hasData && (
                    <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/60 animate-[fadeSlideIn_0.3s_ease-out]">
                      <p className="text-[13px] text-gray-600 leading-relaxed">
                        {m.key==="cashFlow"  && <>Your shop should earn about <strong className="text-gray-900">{fmt(md?.summary?.total_expected_revenue)}</strong> in the next 30 days ({fmt(md?.summary?.avg_daily_revenue)} per day on average).</>}
                        {m.key==="inventory" && (md?.summary?.needs_restock > 0
                          ? <><strong className="text-amber-600">{md.summary.needs_restock} products</strong> will run out within 4 weeks — order them soon. {md?.summary?.healthy_stock} products are fine.</>
                          : <>All <strong className="text-gray-900">{md?.summary?.healthy_stock} products</strong> have enough stock for the next 4 weeks. Nothing to order right now.</>)}
                        {m.key==="churn"     && (md?.summary?.high_risk > 0
                          ? <><strong className="text-red-600">{md.summary.high_risk} customers</strong> have stopped coming — a phone call could bring them back. {md?.summary?.low_risk} customers are buying regularly.</>
                          : <>No customers at risk of leaving. {md?.summary?.low_risk} customers are buying regularly.</>)}
                        {m.key==="trend"     && <>Sales are <strong className="text-gray-900">{md?.insights?.trend_direction}</strong> ({md?.insights?.trend_percent}%). Best month is <strong className="text-gray-900">{md?.insights?.best_month}</strong>, weakest is <strong className="text-gray-900">{md?.insights?.worst_month}</strong>. Average week brings {fmt(md?.insights?.avg_weekly_sales)}.</>}
                        {m.key==="anomaly"   && <><strong className="text-gray-900">{md?.summary?.anomalies_detected} bills</strong> out of {md?.summary?.total_transactions} look unusual and are worth a quick review.</>}
                        {m.key==="credit"    && <><strong className="text-emerald-600">{md?.summary?.grade_breakdown?.A||0} customers</strong> are safe for udharo (Grade A). <strong className="text-red-600">{md?.summary?.grade_breakdown?.F||0} customers</strong> are risky (Grade F) — prefer cash from them.</>}
                      </p>
                    </div>
                  )}

                  {/* How it works */}
                  {infoOpen && (
                    <div className="px-5 py-4 bg-gray-50/60 border-t border-gray-50 overflow-hidden" style={{ animation: "expandIn 0.25s ease-out" }}>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {[["What it predicts", m.what], ["Why it matters", m.why], ["How it is trained", m.how]].map(([t, txt]) => (
                          <div key={t}>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{t}</p>
                            <p className="text-[13px] text-gray-600 leading-relaxed">{txt}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Details */}
                  {!isLoading && hasData && isExpanded && (
                    <div className="px-5 py-5 border-t border-gray-50 overflow-hidden" style={{ animation: "expandIn 0.3s ease-out" }}>

                      {m.key==="cashFlow" && (
                        <div>
                          <div className="flex flex-wrap gap-2.5 mb-4">
                            <Stat label="Money coming in (30 days)" value={fmt(md.summary?.total_expected_revenue)}/>
                            <Stat label="Expenses going out"        value={fmt(md.summary?.total_expected_expenses)}/>
                            <Stat label="Left in hand"              value={fmt(md.summary?.total_expected_net)} tone="green"/>
                            <Stat label="Per day average"           value={fmt(md.summary?.avg_daily_revenue)}/>
                          </div>
                          <ResponsiveContainer width="100%" height={150}>
                            <AreaChart data={md.forecast?.slice(0,30)}>
                              <defs>
                                <linearGradient id="cfg2" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%"  stopColor={COLORS.primary} stopOpacity={0.15}/>
                                  <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                              <XAxis dataKey="date" tick={{fontSize:10,fill:"#9ca3af"}} tickFormatter={v=>v?.slice(5)} axisLine={false} tickLine={false} interval={6}/>
                              <YAxis tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                              <Tooltip formatter={v=>[fmt(v),"Revenue"]} contentStyle={{fontSize:12,borderRadius:10,border:"1px solid #e5e7eb"}} animationDuration={150}/>
                              <Area type="monotone" dataKey="revenue" stroke={COLORS.primary} strokeWidth={2.5} fill="url(#cfg2)" animationDuration={800}/>
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {m.key==="inventory" && (
                        <div>
                          <div className="flex flex-wrap gap-2.5 mb-4">
                            <Stat label="Total products" value={md.summary?.total_products}/>
                            <Stat label="Order soon" value={md.summary?.needs_restock} tone={md.summary?.needs_restock > 0 ? "amber" : undefined}/>
                            <Stat label="Enough stock" value={md.summary?.healthy_stock} tone="green"/>
                          </div>
                          {md.recommendations?.filter(r=>r.needs_restock).length === 0 ? (
                            <p className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 size={15}/> Nothing to order right now</p>
                          ) : md.recommendations?.filter(r=>r.needs_restock).slice(0,6).map((r, i) => (
                            <Row key={r.product_name}
                              left={r.product_name}
                              leftSub={`Will sell about ${r.next_4w_demand} ${r.unit} in 4 weeks`}
                              right={`${r.current_stock} ${r.unit} left`}
                              rightSub={`Order ${r.suggested_order} ${r.unit}`}
                              tone="amber" delay={i * 40}/>
                          ))}
                        </div>
                      )}

                      {m.key==="churn" && (
                        <div>
                          <div className="flex flex-wrap gap-2.5 mb-4">
                            <Stat label="Stopped coming" value={md.summary?.high_risk} sub="Call them" tone={md.summary?.high_risk > 0 ? "red" : undefined}/>
                            <Stat label="Slowing down" value={md.summary?.medium_risk} sub="Send reminder"/>
                            <Stat label="Regular buyers" value={md.summary?.low_risk} sub="All good" tone="green"/>
                          </div>
                          {md.predictions?.filter(p=>p.risk_level==="high").slice(0,5).map((p, i) => (
                            <Row key={p.customer_id}
                              left={p.customer_name}
                              leftSub={`Last visit ${p.recency_days} days ago`}
                              right={`${p.churn_percent}%`}
                              rightSub="risk of leaving"
                              tone="red" delay={i * 40}/>
                          ))}
                        </div>
                      )}

                      {m.key==="trend" && (
                        <div>
                          <div className="flex flex-wrap gap-2.5 mb-4">
                            <Stat label="Direction" value={md.insights?.trend_direction} sub={`${md.insights?.trend_percent}%`} tone={md.insights?.trend_direction === "growing" ? "green" : md.insights?.trend_direction === "declining" ? "red" : undefined}/>
                            <Stat label="Weekly average" value={fmt(md.insights?.avg_weekly_sales)}/>
                            <Stat label="Best month" value={md.insights?.best_month} tone="green"/>
                            <Stat label="Weakest month" value={md.insights?.worst_month}/>
                          </div>
                          <ResponsiveContainer width="100%" height={140}>
                            <BarChart data={md.forecast_8w}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                              <XAxis dataKey="week" tick={{fontSize:10,fill:"#9ca3af"}} tickFormatter={v=>v?.slice(5)} axisLine={false} tickLine={false}/>
                              <YAxis tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                              <Tooltip formatter={v=>[fmt(v),"Revenue"]} contentStyle={{fontSize:12,borderRadius:10,border:"1px solid #e5e7eb"}} animationDuration={150}/>
                              <Bar dataKey="revenue" fill={COLORS.primary} radius={[4,4,0,0]} maxBarSize={40} animationDuration={600}/>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {m.key==="anomaly" && (
                        <div>
                          <div className="flex flex-wrap gap-2.5 mb-4">
                            <Stat label="Bills checked" value={md.summary?.total_transactions}/>
                            <Stat label="Look unusual" value={md.summary?.anomalies_detected} tone="amber"/>
                            <Stat label="Rate" value={`${md.summary?.anomaly_rate}%`}/>
                          </div>
                          {md.anomalies?.slice(0,5).map((a,i) => (
                            <Row key={i}
                              left={a.invoice_date}
                              leftSub={a.reasons?.join(", ")}
                              right={fmt(a.total)}
                              rightSub={a.payment_method} delay={i * 40}/>
                          ))}
                        </div>
                      )}

                      {m.key==="credit" && (
                        <div>
                          <div className="flex flex-wrap gap-2.5 mb-4">
                            {["A","B","C","D","F"].map(g => {
                              const labels = {A:"Safe for udharo",B:"Good",C:"Be careful",D:"Risky",F:"Cash only"}
                              const tone = g==="A" ? "green" : g==="F" ? "red" : undefined
                              return <Stat key={g} label={`Grade ${g}`} value={md.summary?.grade_breakdown?.[g]||0} sub={labels[g]} tone={tone}/>
                            })}
                          </div>
                          {md.scores?.slice(0,6).map((s, i) => (
                            <Row key={s.customer_id}
                              left={s.customer_name}
                              leftSub={s.decision}
                              right={`${s.credit_score}/100`}
                              rightSub={`Grade ${s.grade}`}
                              tone={s.grade==="A"||s.grade==="B" ? "green" : s.grade==="F" ? "red" : undefined} delay={i * 40}/>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Technical summary */}
      <div
        className="bg-white border border-gray-200 rounded-2xl p-5 mt-4 shadow-sm"
        style={{ animation: mounted ? `cardIn 0.4s ease-out ${MODELS.length * 50 + 100}ms both` : "none" }}>
        <h3 className="text-sm font-bold text-gray-900 mb-3.5">Technical Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                {["Feature","Algorithm","Library","Task Type","Evaluation"].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Cash Flow Forecast", "Prophet (Additive Time Series)",  "Facebook Prophet",   "Forecasting",             "MAE, RMSE per week"],
                ["Restock Advisor",    "LightGBM (Gradient Boosting)",    "Microsoft LightGBM", "Regression (per-product)","MAE units/week"],
                ["Customers Leaving",  "LightGBM + SHAP",                 "LightGBM + SHAP",    "Binary Classification",    "AUC score"],
                ["Business Direction", "Prophet + Optuna",                "Prophet + Optuna",   "Time Series + Tuning",     "Optuna trial search"],
                ["Unusual Transactions","Isolation Forest",               "scikit-learn",       "Unsupervised Detection",   "Contamination rate"],
                ["Udharo Advisor",     "LightGBM vs Logistic Regression", "LightGBM + sklearn", "Binary Classification",    "AUC comparison"],
              ].map(([feat,...cols]) => (
                <tr key={feat} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                  <td className="px-3 py-3 font-semibold text-gray-900">{feat}</td>
                  {cols.map((c,i) => <td key={i} className="px-3 py-3 text-gray-600">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
