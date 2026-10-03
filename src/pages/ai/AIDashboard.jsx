import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import api from "../../lib/apiClient"
import AIDetailDrawer from "./AIDetailDrawer"
import {
  TrendingUp, Users, Package, AlertTriangle, Shield, RefreshCw,
  ChevronDown, Info, Sparkles, Lightbulb, Loader2, Phone, ArrowRight, BarChart3
} from "lucide-react"

// ---- Theme: navy = needs attention, lime = good, gray = everything else ----
const PRIMARY_BTN = "bg-slate-900 hover:bg-slate-800 text-white dark:bg-lime-300 dark:hover:bg-lime-400 dark:text-slate-900"
const NAVY = "#0d1726"
const LIME = "#a3e635"
const GRAY = "#cbd5e1"
const NO_RESULTS_RE = /no ai results|not trained/i    // what the server says for a shop without results

// Order = the order of the cards on the page (3 columns x 2 rows)
const MODELS = [
  {
    key: "inventory", title: "Restock Advisor", question: "Will I run out of stock?", icon: Package,
    tech: "LightGBM (gradient boosting)", link: { label: "See products", to: "/ai?view=inventory" },
    trainHint: "Load the latest results to see which products to order before they run out.",
    what: "Predicts units each product will sell in the next 4 weeks and compares with current stock",
    why:  "Never lose a sale because a fast-moving part was out of stock",
    how:  "One model shared by all products. It learns from each product's recent weekly sales and its category's sales, then predicts the units to sell in the next 4 weeks. A shop rule turns that into an order list.",
    get: "/api/ai/inventory/inventory-demand", train: "/api/ai/inventory/inventory-demand/train",
  },
  {
    key: "cashFlow", title: "Cash Flow Forecast", question: "How much money is coming in?", icon: TrendingUp,
    tech: "Prophet (additive time series)", link: { label: "See details", to: "/ai?view=cashFlow" },
    trainHint: "Load the latest results to see how much money to expect over the next 30 days.",
    what: "Predicts daily revenue for the next 30 days based on past sales patterns",
    why:  "Know in advance if you can afford new stock, rent, or supplier payments",
    how:  "Trained on your weekly sales history. The weekly forecast is split across days using your usual weekday pattern. With about one year of data it cannot learn festival or monsoon seasons.",
    get: "/api/ai/cashflow/cash-flow-forecast", train: "/api/ai/cashflow/cash-flow-forecast/train",
  },
  {
    key: "trend", title: "Business Direction", question: "Is my business growing?", icon: BarChart3,
    tech: "Prophet + Optuna", link: { label: "See details", to: "/ai?view=trend" },
    trainHint: "Load the latest results to see whether your sales are going up or down.",
    what: "Measures overall sales direction and forecasts the next 8 weeks",
    why:  "See the big picture: plan stock and staff for busy months, save cash for slow ones",
    how:  "Prophet model on weekly sales totals. Optuna tunes how flexible the trend may be, checked on 6 rolling test windows.",
    get: "/api/ai/trend/sales-trend", train: "/api/ai/trend/sales-trend/train",
  },
  {
    key: "churn", title: "Customers Leaving", question: "Who is drifting away?", icon: Users,
    tech: "LightGBM + SHAP", link: { label: "See customers", to: "/ai?view=churn" },
    trainHint: "Load the latest results to see which regular customers have stopped coming.",
    what: "Flags customers who are likely to stop buying from your shop",
    why:  "A phone call or small discount can bring a valuable customer back before they switch to another shop",
    how:  "Looks at how recently and how often each customer bought in the last 90 days. A customer counts as leaving if they do not buy in the next 60 days. SHAP explains each flag.",
    get: "/api/ai/churn/customer-churn", train: "/api/ai/churn/customer-churn/train",
  },
  {
    key: "credit", title: "Udharo Advisor", question: "Who is safe to give credit?", icon: Shield,
    tech: "LightGBM vs Logistic Regression", link: { label: "See customers", to: "/ai?view=credit" },
    trainHint: "Load the latest results to see which customers are safe to give credit.",
    what: "Scores every customer 0-100 on how safely they repay credit",
    why:  "Give udharo confidently to grade A customers, ask for cash from grade F",
    how:  "Learns from how much of each customer's purchases in the last 6 months was left unpaid, how often they buy, and how big their bills are. Two algorithms are compared and the more reliable one is used.",
    get: "/api/ai/credit/credit-scoring", train: "/api/ai/credit/credit-scoring/train",
  },
  {
    key: "anomaly", title: "Unusual Transactions", question: "Anything strange in my bills?", icon: AlertTriangle,
    tech: "Isolation Forest (scikit-learn)", link: { label: "See bills", to: "/ai?view=anomaly" },
    trainHint: "Load the latest results to find bills that look strange and are worth double-checking.",
    what: "Flags transactions that do not fit your shop's normal pattern",
    why:  "Catch billing mistakes, suspicious discounts, or unusual credit sales early",
    how:  "Learns what a normal bill looks like from your transaction history, then flags the most unusual ones.",
    get: "/api/ai/anomaly/anomaly-detection", train: "/api/ai/anomaly/anomaly-detection/train",
  },
]

const TECH_ROWS = [
  ["Cash Flow Forecast",  "Prophet (Additive Time Series)",  "Facebook Prophet",   "Forecasting",              "MAE, RMSE vs naive baseline"],
  ["Restock Advisor",     "LightGBM (Gradient Boosting)",    "Microsoft LightGBM", "Regression (pooled)",      "MAE vs 13-week average"],
  ["Customers Leaving",   "LightGBM + SHAP",                 "LightGBM + SHAP",    "Binary Classification",    "AUC, time-based test"],
  ["Business Direction",  "Prophet + Optuna",                "Prophet + Optuna",   "Time Series + Tuning",     "Rolling cross-validation MAE"],
  ["Unusual Transactions","Isolation Forest",                "scikit-learn",       "Unsupervised Detection",   "Detection of hidden fake mistakes"],
  ["Udharo Advisor",      "LightGBM vs Logistic Regression", "LightGBM + sklearn", "Binary Classification",    "AUC, repeated cross-validation"],
]

const fmt = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })
const num = (n) => Number(n || 0).toLocaleString("en-IN")

// Turns a model's API response into what the card shows:
// big numbers, a proportion bar, a facts table, and one plain-language tip.
function buildView(key, md) {
  if (!md) return null
  const s = md.summary || {}

  if (key === "inventory") {
    const need = s.needs_restock || 0
    const ok = s.healthy_stock || 0
    return {
      stats: [{ num: num(need), label: need > 0 ? "products are close to running out" : "products need ordering right now" }],
      segs: [
        { n: need, c: NAVY, label: `${num(need)} need ordering` },
        { n: ok,   c: LIME, label: `${num(ok)} are fine` },
      ],
      tip: need > 0 ? "Order these soon so you never lose a sale." : "No product is close to running out.",
    }
  }

  if (key === "cashFlow") {
    return {
      stats: [{ num: fmt(s.total_expected_revenue), label: "expected in the next 30 days", small: true }],
      facts: [
        { k: "Per day average",   v: fmt(s.avg_daily_revenue) },
        { k: "Expenses going out", v: fmt(s.total_expected_expenses) },
        { k: "Left in hand",      v: fmt(s.total_expected_net) },
      ],
    }
  }

  if (key === "trend") {
    const ins = md.insights || {}
    const pct = Number(ins.trend_percent || 0)
    const declining = ins.trend_direction === "declining"
    return {
      stats: [{ num: `${pct > 0 ? "+" : ""}${pct}%`, label: `sales are ${ins.trend_direction || "steady"}`, tone: declining ? "red" : undefined }],
      facts: [
        { k: "Best month",    v: ins.best_month || "--" },
        { k: "Weakest month", v: ins.worst_month || "--" },
        { k: "Average week",  v: fmt(ins.avg_weekly_sales) },
      ],
    }
  }

  if (key === "churn") {
    const hi = s.high_risk || 0
    const mid = s.medium_risk || 0
    const lo = s.low_risk || 0
    return {
      stats: [{ num: num(hi), label: hi > 0 ? "customers have stopped coming" : "customers at risk of leaving" }],
      segs: [
        { n: hi,  c: NAVY, label: `${num(hi)} stopped coming` },
        { n: mid, c: GRAY, label: `${num(mid)} slowing down` },
        { n: lo,  c: LIME, label: `${num(lo)} buying regularly` },
      ],
      tip: hi > 0 ? "A phone call could bring them back." : "Everyone is buying regularly. Nothing to do here.",
    }
  }

  if (key === "credit") {
    const gb = s.grade_breakdown || {}
    const A = gb.A || 0
    const F = gb.F || 0
    const between = (gb.B || 0) + (gb.C || 0) + (gb.D || 0)
    return {
      stats: [
        { num: num(A), label: "safe (Grade A)" },
        { num: num(F), label: "risky (Grade F)" },
      ],
      segs: [
        { n: A,       c: LIME, label: "Grade A, safe" },
        { n: between, c: GRAY, label: "Grade B to D" },
        { n: F,       c: NAVY, label: "Grade F, risky" },
      ],
      tip: F > 0 ? "Prefer cash from Grade F customers." : "No high-risk customers right now.",
    }
  }

  if (key === "anomaly") {
    const det = s.anomalies_detected || 0
    const total = s.total_transactions || 0
    const normal = Math.max(total - det, 0)
    return {
      stats: [{ num: num(det), label: `of ${num(total)} bills stand out the most` }],
      segs: [
        { n: det,    c: NAVY, label: `${num(det)} worth a review` },
        { n: normal, c: LIME, label: `${num(normal)} look normal` },
      ],
      tip: det > 0 ? "Worth a quick look for mistakes or wrong prices." : "Every bill looks normal.",
    }
  }

  return null
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-4 flex-1 animate-pulse">
      <div className="h-9 w-24 bg-gray-100 rounded-lg" />
      <div className="h-2.5 w-full bg-gray-100 rounded-full" />
      <div className="h-10 w-full bg-gray-50 rounded-xl" />
    </div>
  )
}

export default function AIDashboard() {
  const navigate = useNavigate()
  const [data,        setData]        = useState({})
  const [loading,     setLoading]     = useState({})
  const [errors,      setErrors]      = useState({})
  const [searchParams] = useSearchParams()
  const drawerNav = useNavigate()
  const viewKey = searchParams.get("view")
  const [training,    setTraining]    = useState({})
  const [trainingAll, setTrainingAll] = useState(false)
  const [modalKey,    setModalKey]    = useState(null)
  const [techOpen,    setTechOpen]    = useState(false)
  const [mounted,     setMounted]     = useState(false)

  useEffect(() => { loadAll(); setMounted(true) }, [])

  // Close the "How it works" popup with Escape
  useEffect(() => {
    if (!modalKey) return
    const onKey = (e) => { if (e.key === "Escape") setModalKey(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [modalKey])

  function loadAll() { MODELS.forEach(m => loadOne(m)) }

  async function loadOne(m) {
    setLoading(p => ({ ...p, [m.key]: true }))
    setErrors(p => ({ ...p, [m.key]: null }))
    try {
      const res = await api.get(m.get)
      setData(p => ({ ...p, [m.key]: res.data }))
    } catch (e) {
      setErrors(p => ({ ...p, [m.key]: e.response?.data?.detail || "Not trained" }))
    } finally {
      setLoading(p => ({ ...p, [m.key]: false }))
    }
  }

  async function trainOne(m) {
    setTraining(p => ({ ...p, [m.key]: true }))
    try {
      await api.post(m.train)
      setTimeout(() => { loadOne(m); setTraining(p => ({ ...p, [m.key]: false })) }, 600)
    } catch { setTraining(p => ({ ...p, [m.key]: false })) }
  }

  async function trainAll() {
    setTrainingAll(true)
    MODELS.forEach(m => setTraining(p => ({ ...p, [m.key]: true })))
    try {
      await api.post("/api/admin/train-all")
      setTimeout(() => {
        loadAll()
        MODELS.forEach(m => setTraining(p => ({ ...p, [m.key]: false })))
        setTrainingAll(false)
      }, 800)
    } catch { setTrainingAll(false) }
  }

  const d = data
  const trainedCount = MODELS.filter(m => !errors[m.key] && data[m.key]).length
  const modalModel = MODELS.find(m => m.key === modalKey)

  // "What to do today" cards, built from the live results
  const actions = []
  const nStock = d.inventory?.summary?.needs_restock || 0
  const nCall  = d.churn?.summary?.high_risk || 0
  const nBills = d.anomaly?.summary?.anomalies_detected || 0
  const nF     = d.credit?.summary?.grade_breakdown?.F || 0
  // every helper that has results keeps its card, even at 0, so the row never shrinks
  if (d.inventory) actions.push({ icon: Package, title: "Order stock", num: num(nStock), calm: nStock === 0, text: "products are close to running out", cta: "See products", to: "/ai?view=inventory" })
  if (d.churn)     actions.push({ icon: Phone, title: "Call customers", num: num(nCall), calm: nCall === 0, text: "customers have not bought in a long time", cta: "See customers", to: "/ai?view=churn" })
  if (d.anomaly)   actions.push({ icon: AlertTriangle, title: "Review bills", num: num(nBills), calm: nBills === 0, text: "unusual transactions flagged by the system", cta: "See bills", to: "/ai?view=anomaly" })
  if (d.credit)    actions.push({ icon: Shield, title: "Limit udharo", num: num(nF), calm: nF === 0, text: nF === 0 ? "high-risk (Grade F) customers right now" : "high-risk (Grade F) customers. Avoid giving them credit.", cta: "See customers", to: "/ai?view=credit" })
  const attention = actions.filter((a) => !a.calm).length     // only real alerts are counted in the headline

  return (
    <div className="min-h-full bg-gray-50/60 p-6">
      <style>{`
        @keyframes cardIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>

      <div className="flex flex-col gap-7 w-full">

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <h1 className="text-[30px] leading-tight font-extrabold tracking-tight text-slate-900">AI Insights</h1>
            <p className="text-[15px] text-gray-500 leading-relaxed mt-1.5 max-w-xl">
              Your shop's own sales, purchase and customer records, turned into plain suggestions: what to do today, and why.
            </p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-[13px] font-bold text-slate-900">{trainedCount} of {MODELS.length} helpers ready</span>
              <div className="flex gap-1">
                {MODELS.map((m, i) => (
                  <span key={m.key} className={`w-[22px] h-1.5 rounded-full transition-colors duration-300 ${i < trainedCount ? "bg-lime-400" : "bg-gray-300"}`} />
                ))}
              </div>
            </div>
            <button onClick={trainAll} disabled={trainingAll}
              className={`inline-flex items-center gap-2 h-11 px-5 text-sm font-bold rounded-xl active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100 transition-all duration-150 ${PRIMARY_BTN}`}>
              {trainingAll ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {trainingAll ? "Refreshing..." : "Refresh all"}
            </button>
            <button onClick={loadAll}
              className="inline-flex items-center gap-2 h-11 px-4 text-sm font-bold rounded-xl border border-gray-300 bg-white text-slate-900 hover:bg-gray-50 active:scale-[0.97] transition-all duration-150">
              <RefreshCw size={16} className={Object.values(loading).some(Boolean) ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        {/* What to do today */}
        {actions.length > 0 && (
          <section
            className="bg-[#0d1726] rounded-3xl p-7 flex flex-col gap-5"
            style={{ animation: mounted ? "cardIn 0.4s ease-out both" : "none" }}>
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-lime-400 text-slate-900 flex items-center justify-center">
                <Lightbulb size={20} />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-white leading-tight">What to do today</h2>
                <p className="text-sm text-slate-300">
                  {attention === 0 ? "Nothing needs your attention right now" : `${attention} ${attention === 1 ? "thing" : "things"} worth your attention right now`}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {actions.map((a, i) => {
                const AIcon = a.icon
                return (
                  <div key={a.title}
                    className="bg-white rounded-[18px] p-5 flex flex-col gap-3.5"
                    style={{ animation: mounted ? `cardIn 0.4s ease-out ${i * 60}ms both` : "none" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-lime-100 text-slate-900 flex items-center justify-center shrink-0">
                        <AIcon size={20} />
                      </div>
                      <span className="text-[15px] font-extrabold text-slate-900">{a.title}</span>
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-[40px] leading-none font-extrabold tracking-tight text-slate-900 tabular-nums">{a.num}</span>
                      <span className="text-sm leading-relaxed text-gray-500">{a.text}</span>
                    </div>
                    <button onClick={() => navigate(a.to)}
                      className="flex items-center justify-between min-h-[44px] px-3.5 rounded-xl border border-gray-300 text-sm font-bold text-slate-900 hover:bg-gray-50 active:scale-[0.98] transition-all duration-150">
                      <span>{a.cta}</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Helpers */}
        <section className="flex flex-col gap-[18px]">
          <div>
            <h2 className="text-[22px] font-extrabold tracking-tight text-slate-900">Your {MODELS.length} AI helpers</h2>
            <p className="text-[15px] text-gray-500 leading-relaxed mt-1.5">
              Each helper answers one question about your shop. Open "How it works" to see what it looks at.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 auto-rows-fr gap-4">
            {MODELS.map((m, idx) => {
              const Icon = m.icon
              const isLoading  = loading[m.key]
              const hasData    = !errors[m.key] && !!data[m.key]
              const isTraining = training[m.key]
              const v          = hasData ? buildView(m.key, data[m.key]) : null

              const chip = isTraining
                ? { text: "Loading", cls: "bg-lime-100 text-lime-800" }
                : hasData
                  ? { text: "Ready", cls: "bg-lime-100 text-lime-800" }
                  : isLoading
                    ? { text: "Loading", cls: "bg-gray-100 text-gray-600" }
                    : { text: "Not trained", cls: "bg-gray-100 text-gray-600" }

              return (
                <article key={m.key}
                  className="bg-white border border-gray-200 rounded-[18px] p-5 flex flex-col gap-4 shadow-sm min-h-0"
                  style={{ animation: mounted ? `cardIn 0.4s ease-out ${idx * 50}ms both` : "none" }}>

                  {/* Header: same height on every card */}
                  <div className="flex items-start gap-3 min-h-[64px]">
                    <div className={`w-11 h-11 rounded-xl bg-lime-100 text-slate-900 flex items-center justify-center shrink-0 ${isTraining ? "animate-pulse" : ""}`}>
                      <Icon size={22} />
                    </div>
                    <div className="min-w-0 flex flex-col gap-1.5">
                      <h3 className="text-base font-extrabold leading-snug text-slate-900">{m.question}</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] text-gray-500">{m.title}</span>
                        <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${chip.cls}`}>{chip.text}</span>
                      </div>
                    </div>
                  </div>

                  {isLoading && !hasData ? (
                    <CardSkeleton />
                  ) : (
                    <>
                      {/* Big numbers */}
                      <div className="flex flex-wrap gap-x-7 gap-y-3 min-h-[84px] content-start">
                        {v ? v.stats.map((st, i) => (
                          <div key={i} className="flex flex-col gap-1">
                            <span className={`${st.small ? "text-[30px]" : "text-4xl"} leading-none font-extrabold tracking-tight tabular-nums ${st.tone === "red" ? "text-red-600" : "text-slate-900"}`}>{st.num}</span>
                            <span className="text-sm leading-snug text-slate-600 max-w-[200px]">{st.label}</span>
                          </div>
                        )) : (
                          <div className="flex flex-col gap-1">
                            <span className="text-4xl leading-none font-extrabold tracking-tight text-slate-300">--</span>
                            <span className="text-sm leading-snug text-slate-600">no result yet</span>
                          </div>
                        )}
                      </div>

                      {/* Detail area */}
                      <div className="flex flex-col gap-3 flex-1">
                        {v?.segs && (
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-[3px] h-2.5">
                              {v.segs.filter(s => s.n > 0).map((s, i) => (
                                <div key={i} className="h-2.5 rounded-full" style={{ flexGrow: s.n, minWidth: 8, background: s.c }} />
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                              {v.segs.filter(s => s.n > 0).map((s, i) => (
                                <span key={i} className="inline-flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full" style={{ background: s.c }} />
                                  {s.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {v?.tip && (
                          <p className="text-[13px] leading-relaxed text-slate-700 bg-gray-50 rounded-[10px] px-3 py-2.5">{v.tip}</p>
                        )}

                        {v?.facts && (
                          <div className="flex flex-col border border-gray-100 rounded-xl">
                            {v.facts.map((f, i) => (
                              <div key={i} className="flex items-center justify-between px-3.5 py-2.5 text-[13px] border-b border-gray-100 last:border-0">
                                <span className="text-gray-500">{f.k}</span>
                                <span className="font-extrabold text-slate-900">{f.v}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {!hasData && (
                          <div className="flex flex-col gap-3 border-[1.5px] border-dashed border-slate-300 rounded-xl p-3.5 bg-gray-50/70">
                            <p className="text-[13px] leading-relaxed text-slate-700">
                              {isTraining ? "Loading the latest results." : NO_RESULTS_RE.test(String(errors[m.key] || "")) ? "No AI results for this shop yet. The helpers need several months of this shop's own sales history, and each shop's results are set up separately." : m.trainHint}
                            </p>
                            {isTraining ? (
                              <span className="inline-flex items-center gap-2 self-start text-sm font-bold text-slate-700">
                                <Loader2 size={16} className="animate-spin" /> Loading...
                              </span>
                            ) : (
                              <button hidden={NO_RESULTS_RE.test(String(errors[m.key] || ""))} onClick={() => trainOne(m)}
                                className={`self-start h-11 px-5 text-sm font-bold rounded-xl active:scale-95 transition-all duration-150 ${PRIMARY_BTN}`}>
                                Load latest results
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-2">
                    <button onClick={() => setModalKey(m.key)} aria-haspopup="dialog"
                      className="inline-flex items-center gap-2 min-h-[44px] -ml-2.5 pl-2.5 pr-3 rounded-[10px] text-sm font-bold text-slate-900 hover:bg-gray-50 transition-colors">
                      <Info size={16} /> How it works
                    </button>
                    {hasData && (
                      <button onClick={() => navigate(m.link.to)}
                        className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-bold text-slate-900 hover:underline">
                        {m.link.label} <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        {viewKey && <AIDetailDrawer viewKey={viewKey} data={data} onClose={() => drawerNav("/ai")} onOpen={(to) => drawerNav(to)} />}

        {/* Technical summary (collapsed by default) */}
        <section className="bg-white border border-gray-200 rounded-[18px] shadow-sm"
          style={{ animation: mounted ? `cardIn 0.4s ease-out ${MODELS.length * 50 + 100}ms both` : "none" }}>
          <button onClick={() => setTechOpen(o => !o)} aria-expanded={techOpen}
            className="w-full flex items-center justify-between gap-4 min-h-[64px] px-6 text-left rounded-[18px]">
            <span className="flex flex-col gap-0.5">
              <span className="text-base font-extrabold text-slate-900">Technical summary</span>
              <span className="text-[13px] text-gray-500">For developers and reviewers: the algorithm, library and test used by each helper</span>
            </span>
            <ChevronDown size={20} className={`shrink-0 text-slate-700 transition-transform duration-200 ${techOpen ? "rotate-180" : ""}`} />
          </button>
          {techOpen && (
            <div className="px-6 pb-5 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-y border-gray-100">
                    {["Feature", "Algorithm", "Library", "Task type", "Evaluation"].map(h => (
                      <th key={h} className="text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider px-3 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TECH_ROWS.map(([feat, ...cols]) => (
                    <tr key={feat} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-3 font-extrabold text-slate-900">{feat}</td>
                      {cols.map((c, i) => <td key={i} className="px-3 py-3 text-slate-600">{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* How it works popup */}
      {modalModel && (() => {
        const MIcon = modalModel.icon
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm">
            <button aria-label="Close" tabIndex={-1} onClick={() => setModalKey(null)}
              className="absolute inset-0 w-full h-full cursor-default" />
            <div role="dialog" aria-modal="true" aria-label={`How ${modalModel.title} works`}
              className="relative w-full max-w-[560px] max-h-full overflow-y-auto bg-white rounded-[20px] p-7 flex flex-col gap-5 shadow-2xl"
              style={{ animation: "popIn 0.2s ease-out both" }}>
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-lime-100 text-slate-900 flex items-center justify-center shrink-0">
                  <MIcon size={22} />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-xl font-extrabold leading-snug text-slate-900">{modalModel.question}</h3>
                  <span className="text-[13px] text-gray-500">{modalModel.title}</span>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {[
                  ["What it predicts", modalModel.what],
                  ["Why it matters", modalModel.why],
                  ["How it is trained", modalModel.how],
                  ["Under the hood", modalModel.tech],
                ].map(([t, txt]) => (
                  <div key={t} className="flex flex-col gap-1">
                    <span className="text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">{t}</span>
                    <span className="text-[15px] leading-relaxed text-slate-800">{txt}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setModalKey(null)}
                className={`self-end h-11 px-6 text-sm font-bold rounded-xl active:scale-95 transition-all duration-150 ${PRIMARY_BTN}`}>
                Got it
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}