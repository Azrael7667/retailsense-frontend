import { useEffect, useState } from "react"
import api from "../../lib/apiClient"
import {
  TrendingUp, Users, Package, AlertTriangle,
  Shield, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle, BarChart2, Info, Zap, Lightbulb
} from "lucide-react"
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts"

const BLUE   = "#2563eb"
const GREEN  = "#16a34a"
const RED    = "#dc2626"
const AMBER  = "#d97706"
const DARK   = "#111827"
const GRAY   = "#6b7280"
const MUTED  = "#9ca3af"
const BORDER = "#e5e7eb"
const LIGHT  = "#f9fafb"

const MODELS = [
  {
    key: "cashFlow", title: "Cash Flow Forecast", algo: "Prophet", icon: TrendingUp,
    simple: "How much money will come in during the next 30 days",
    what: "Predicts daily revenue for the next 30 days based on past sales patterns",
    why:  "Know in advance if you can afford new stock, rent, or supplier payments",
    how:  "Trained on 12 months of daily sales. Learns weekly rhythm and festival seasons (Dashain, Tihar) and monsoon slowdown.",
    get: "/api/ai/cashflow/cash-flow-forecast", train: "/api/ai/cashflow/cash-flow-forecast/train",
  },
  {
    key: "inventory", title: "Restock Advisor", algo: "LightGBM x 97", icon: Package,
    simple: "Which products to order before they run out",
    what: "Predicts units each product will sell in the next 4 weeks and compares with current stock",
    why:  "Never lose a sale because a fast-moving part was out of stock",
    how:  "One model per product (97 total). Each learns that product's own selling speed and seasonality.",
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
    key: "trend", title: "Business Direction", algo: "Prophet + Optuna", icon: BarChart2,
    simple: "Is the business growing or shrinking",
    what: "Measures overall sales direction and forecasts the next 8 weeks",
    why:  "See the big picture — plan stock and staff for busy months, save cash for slow ones",
    how:  "Prophet model auto-tuned with 30 Optuna trials on weekly sales totals.",
    get: "/api/ai/trend/sales-trend", train: "/api/ai/trend/sales-trend/train",
    note: "Trend may show declining because training data ends in December (post-festival slowdown). Will correct itself with ongoing real data.",
  },
  {
    key: "anomaly", title: "Unusual Transactions", algo: "Isolation Forest", icon: AlertTriangle,
    simple: "Bills that look strange and worth double-checking",
    what: "Flags transactions that do not fit your shop's normal pattern",
    why:  "Catch billing mistakes, suspicious discounts, or unusual credit sales early",
    how:  "Learns what a normal bill looks like from 3,504 transactions, then flags the most unusual 3%.",
    get: "/api/ai/anomaly/anomaly-detection", train: "/api/ai/anomaly/anomaly-detection/train",
  },
  {
    key: "credit", title: "Udharo Advisor", algo: "LightGBM vs Logistic Regression", icon: Shield,
    simple: "Which customers are safe to give credit",
    what: "Scores every customer 0-100 on how safely they repay credit",
    why:  "Give udharo confidently to grade A customers, ask for cash from grade F",
    how:  "Learns from payment history, outstanding balance, and khata repayment behavior. Two algorithms compared for reliability.",
    get: "/api/ai/credit/credit-scoring", train: "/api/ai/credit/credit-scoring/train",
    note: "Scores of exactly 100 reflect very clear patterns in current data. With more real transactions the scores become more nuanced.",
  },
]

const fmt = (n) => "Rs. " + Number(n||0).toLocaleString("en-IN", { maximumFractionDigits: 0 })

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, padding: "10px 14px", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
      <p style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 700, color: color || DARK }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{sub}</p>}
    </div>
  )
}

function Row({ left, leftSub, right, rightSub, rightColor }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{left}</p>
        {leftSub && <p style={{ fontSize: 11, color: GRAY, marginTop: 1 }}>{leftSub}</p>}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: rightColor || DARK }}>{right}</p>
        {rightSub && <p style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{rightSub}</p>}
      </div>
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

  useEffect(() => { loadAll() }, [])

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
    MODELS.forEach(m => setTraining(p => ({...p, [m.key]: true})))
    try {
      await api.post("/api/admin/train-all")
      setTimeout(() => { loadAll(); MODELS.forEach(m => setTraining(p => ({...p, [m.key]: false}))) }, 60000)
    } catch {}
  }

  const d = data
  const trainedCount = MODELS.filter(m => !errors[m.key] && data[m.key]).length

  // Build "today's actions" — the single most useful takeaway per model
  const actions = []
  if (d.inventory?.summary?.needs_restock > 0)
    actions.push({ text: `Order stock for ${d.inventory.summary.needs_restock} products before they run out`, tone: AMBER })
  if (d.churn?.summary?.high_risk > 0)
    actions.push({ text: `Call ${d.churn.summary.high_risk} customers who have not bought in a long time`, tone: RED })
  if (d.anomaly?.summary?.anomalies_detected > 0)
    actions.push({ text: `Review ${d.anomaly.summary.anomalies_detected} unusual transactions flagged by the system`, tone: AMBER })
  if (d.credit?.summary?.grade_breakdown?.F > 0)
    actions.push({ text: `Avoid giving udharo to ${d.credit.summary.grade_breakdown.F} high-risk (Grade F) customers`, tone: RED })
  if (d.cashFlow?.summary?.total_expected_revenue)
    actions.push({ text: `Expect around ${fmt(d.cashFlow.summary.total_expected_revenue)} revenue in the next 30 days`, tone: GREEN })

  const btn = (primary) => ({
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "7px 12px", fontSize: 12, fontWeight: 600,
    borderRadius: 8, cursor: "pointer",
    background: primary ? BLUE : "#fff",
    color: primary ? "#fff" : GRAY,
    border: primary ? "none" : `1px solid ${BORDER}`,
  })

  return (
    <div style={{ padding: 24, background: LIGHT, minHeight: "100%" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: DARK }}>AI Insights</h1>
          <p style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
            Smart suggestions from your own sales data — 2,944 invoices, Jan to Dec 2024
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: GRAY }}>
            <strong style={{ color: DARK }}>{trainedCount}/6</strong> active
          </span>
          <button onClick={trainAll} style={btn(true)}><Zap size={12}/> Train All</button>
          <button onClick={loadAll} style={btn(false)}><RefreshCw size={12}/> Refresh</button>
        </div>
      </div>

      {/* Today's actions — the shopkeeper summary */}
      {actions.length > 0 && (
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Lightbulb size={13} color={BLUE}/> What to do today
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {actions.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: a.tone, flexShrink: 0 }}/>
                <p style={{ fontSize: 13, color: "#374151" }}>{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {MODELS.map(m => {
          const Icon = m.icon
          const isLoading  = loading[m.key]
          const hasData    = !errors[m.key] && !!data[m.key]
          const isExpanded = expanded[m.key]
          const infoOpen   = showInfo[m.key]
          const isTraining = training[m.key]
          const md         = data[m.key]

          return (
            <div key={m.key} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px" }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={16} color={BLUE}/>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{m.title}</span>
                    <span style={{ fontSize: 10, color: MUTED, background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "1px 8px" }}>{m.algo}</span>
                    {isLoading && <span style={{ fontSize: 11, color: MUTED }}>Loading...</span>}
                    {!isLoading && hasData && (
                      <span style={{ fontSize: 11, color: GREEN, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <CheckCircle size={11}/> Active
                      </span>
                    )}
                    {!isLoading && !hasData && <span style={{ fontSize: 11, color: MUTED }}>Not trained</span>}
                  </div>
                  <p style={{ fontSize: 12, color: MUTED, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.simple}</p>
                </div>

                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setShowInfo(p => ({...p, [m.key]: !p[m.key]}))} style={btn(false)}>
                    <Info size={11}/> How it works
                  </button>
                  {hasData && (
                    <button onClick={() => setExpanded(p => ({...p, [m.key]: !p[m.key]}))}
                      style={{ ...btn(false), color: BLUE, borderColor: "#bfdbfe" }}>
                      {isExpanded ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                      {isExpanded ? "Hide" : "Details"}
                    </button>
                  )}
                  {!hasData && !isTraining && !isLoading && (
                    <button onClick={() => trainOne(m)} style={btn(true)}>Train</button>
                  )}
                  {isTraining && (
                    <span style={{ ...btn(false), cursor: "default" }}>
                      <span style={{ width: 11, height: 11, border: `2px solid ${BLUE}`, borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }}/>
                      Training
                    </span>
                  )}
                </div>
              </div>

              {/* Plain-language summary line — always visible when trained */}
              {!isLoading && hasData && (
                <div style={{ padding: "8px 18px", borderTop: "1px solid #f3f4f6", background: LIGHT }}>
                  <p style={{ fontSize: 12.5, color: "#374151" }}>
                    {m.key==="cashFlow"  && <>Your shop should earn about <strong>{fmt(md?.summary?.total_expected_revenue)}</strong> in the next 30 days ({fmt(md?.summary?.avg_daily_revenue)} per day on average).</>}
                    {m.key==="inventory" && (md?.summary?.needs_restock > 0
                      ? <><strong style={{color: AMBER}}>{md.summary.needs_restock} products</strong> will run out within 4 weeks — order them soon. {md?.summary?.healthy_stock} products are fine.</>
                      : <>All <strong>{md?.summary?.healthy_stock} products</strong> have enough stock for the next 4 weeks. Nothing to order right now.</>)}
                    {m.key==="churn"     && (md?.summary?.high_risk > 0
                      ? <><strong style={{color: RED}}>{md.summary.high_risk} customers</strong> have stopped coming — a phone call could bring them back. {md?.summary?.low_risk} customers are buying regularly.</>
                      : <>No customers at risk of leaving. {md?.summary?.low_risk} customers are buying regularly.</>)}
                    {m.key==="trend"     && <>Sales are <strong>{md?.insights?.trend_direction}</strong> ({md?.insights?.trend_percent}%). Best month is <strong>{md?.insights?.best_month}</strong>, weakest is <strong>{md?.insights?.worst_month}</strong>. Average week brings {fmt(md?.insights?.avg_weekly_sales)}.</>}
                    {m.key==="anomaly"   && <><strong>{md?.summary?.anomalies_detected} bills</strong> out of {md?.summary?.total_transactions} look unusual and are worth a quick review.</>}
                    {m.key==="credit"    && <><strong style={{color: GREEN}}>{md?.summary?.grade_breakdown?.A||0} customers</strong> are safe for udharo (Grade A). <strong style={{color: RED}}>{md?.summary?.grade_breakdown?.F||0} customers</strong> are risky (Grade F) — prefer cash from them.</>}
                  </p>
                </div>
              )}

              {/* How it works */}
              {infoOpen && (
                <div style={{ padding: "13px 18px", background: LIGHT, borderTop: "1px solid #f3f4f6" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                    {[["What it predicts", m.what], ["Why it matters", m.why], ["How it is trained", m.how]].map(([t, txt]) => (
                      <div key={t}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{t}</p>
                        <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.6 }}>{txt}</p>
                      </div>
                    ))}
                  </div>
                  {m.note && (
                    <p style={{ fontSize: 11.5, color: GRAY, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
                      Note: {m.note}
                    </p>
                  )}
                </div>
              )}

              {/* Details */}
              {!isLoading && hasData && isExpanded && (
                <div style={{ padding: "15px 18px", borderTop: "1px solid #f3f4f6" }}>

                  {m.key==="cashFlow" && (
                    <div>
                      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                        <Stat label="Money coming in (30 days)" value={fmt(md.summary?.total_expected_revenue)}/>
                        <Stat label="Expenses going out"        value={fmt(md.summary?.total_expected_expenses)}/>
                        <Stat label="Left in hand"              value={fmt(md.summary?.total_expected_net)} color={GREEN}/>
                        <Stat label="Per day average"           value={fmt(md.summary?.avg_daily_revenue)}/>
                      </div>
                      <ResponsiveContainer width="100%" height={140}>
                        <AreaChart data={md.forecast?.slice(0,30)}>
                          <defs>
                            <linearGradient id="cfg2" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={BLUE} stopOpacity={0.08}/>
                              <stop offset="95%" stopColor={BLUE} stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                          <XAxis dataKey="date" tick={{fontSize:10,fill:MUTED}} tickFormatter={v=>v?.slice(5)} axisLine={false} tickLine={false} interval={6}/>
                          <YAxis tick={{fontSize:10,fill:MUTED}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                          <Tooltip formatter={v=>[fmt(v),"Revenue"]} contentStyle={{fontSize:11,borderRadius:8}}/>
                          <Area type="monotone" dataKey="revenue" stroke={BLUE} strokeWidth={2} fill="url(#cfg2)"/>
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {m.key==="inventory" && (
                    <div>
                      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <Stat label="Total products" value={md.summary?.total_products}/>
                        <Stat label="Order soon" value={md.summary?.needs_restock} color={md.summary?.needs_restock > 0 ? AMBER : DARK}/>
                        <Stat label="Enough stock" value={md.summary?.healthy_stock} color={GREEN}/>
                      </div>
                      {md.recommendations?.filter(r=>r.needs_restock).length === 0 ? (
                        <p style={{ fontSize: 13, color: GREEN, display: "flex", alignItems: "center", gap: 6 }}>
                          <CheckCircle size={14}/> Nothing to order right now
                        </p>
                      ) : md.recommendations?.filter(r=>r.needs_restock).slice(0,6).map(r => (
                        <Row key={r.product_name}
                          left={r.product_name}
                          leftSub={`Will sell about ${r.next_4w_demand} ${r.unit} in 4 weeks`}
                          right={`${r.current_stock} ${r.unit} left`}
                          rightSub={`Order ${r.suggested_order} ${r.unit}`}
                          rightColor={AMBER}/>
                      ))}
                    </div>
                  )}

                  {m.key==="churn" && (
                    <div>
                      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <Stat label="Stopped coming" value={md.summary?.high_risk} sub="Call them" color={md.summary?.high_risk > 0 ? RED : DARK}/>
                        <Stat label="Slowing down" value={md.summary?.medium_risk} sub="Send reminder"/>
                        <Stat label="Regular buyers" value={md.summary?.low_risk} sub="All good" color={GREEN}/>
                      </div>
                      {md.predictions?.filter(p=>p.risk_level==="high").slice(0,5).map(p => (
                        <Row key={p.customer_id}
                          left={p.customer_name}
                          leftSub={`Last visit ${p.recency_days} days ago`}
                          right={`${p.churn_percent}%`}
                          rightSub="risk of leaving"
                          rightColor={RED}/>
                      ))}
                    </div>
                  )}

                  {m.key==="trend" && (
                    <div>
                      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                        <Stat label="Direction" value={md.insights?.trend_direction} sub={`${md.insights?.trend_percent}%`}/>
                        <Stat label="Weekly average" value={fmt(md.insights?.avg_weekly_sales)}/>
                        <Stat label="Best month" value={md.insights?.best_month} color={GREEN}/>
                        <Stat label="Weakest month" value={md.insights?.worst_month}/>
                      </div>
                      <ResponsiveContainer width="100%" height={130}>
                        <BarChart data={md.forecast_8w}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                          <XAxis dataKey="week" tick={{fontSize:10,fill:MUTED}} tickFormatter={v=>v?.slice(5)} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fontSize:10,fill:MUTED}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                          <Tooltip formatter={v=>[fmt(v),"Revenue"]} contentStyle={{fontSize:11,borderRadius:8}}/>
                          <Bar dataKey="revenue" fill={BLUE} radius={[3,3,0,0]} maxBarSize={38}/>
                        </BarChart>
                      </ResponsiveContainer>
                      {m.note && <p style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>{m.note}</p>}
                    </div>
                  )}

                  {m.key==="anomaly" && (
                    <div>
                      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <Stat label="Bills checked" value={md.summary?.total_transactions}/>
                        <Stat label="Look unusual" value={md.summary?.anomalies_detected} color={AMBER}/>
                        <Stat label="Rate" value={`${md.summary?.anomaly_rate}%`}/>
                      </div>
                      {md.anomalies?.slice(0,5).map((a,i) => (
                        <Row key={i}
                          left={a.invoice_date}
                          leftSub={a.reasons?.join(", ")}
                          right={fmt(a.total)}
                          rightSub={a.payment_method}/>
                      ))}
                    </div>
                  )}

                  {m.key==="credit" && (
                    <div>
                      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                        {["A","B","C","D","F"].map(g => {
                          const labels = {A:"Safe for udharo",B:"Good",C:"Be careful",D:"Risky",F:"Cash only"}
                          const color  = g==="A" ? GREEN : g==="F" ? RED : DARK
                          return <Stat key={g} label={`Grade ${g}`} value={md.summary?.grade_breakdown?.[g]||0} sub={labels[g]} color={color}/>
                        })}
                      </div>
                      {md.scores?.slice(0,6).map(s => (
                        <Row key={s.customer_id}
                          left={s.customer_name}
                          leftSub={s.decision}
                          right={`${s.credit_score}/100`}
                          rightSub={`Grade ${s.grade}`}
                          rightColor={s.grade==="A"||s.grade==="B" ? GREEN : s.grade==="F" ? RED : DARK}/>
                      ))}
                      {m.note && <p style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>{m.note}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Technical summary — for supervisor */}
      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 18, marginTop: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 12 }}>Technical Summary</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {["Feature","Algorithm","Library","Task Type","Evaluation"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Cash Flow Forecast", "Prophet (Additive Time Series)",  "Facebook Prophet",   "Forecasting",             "MAE, RMSE per week"],
              ["Restock Advisor",    "LightGBM (Gradient Boosting)",    "Microsoft LightGBM", "Regression (97 models)",   "MAE units/week"],
              ["Customers Leaving",  "LightGBM + SHAP",                 "LightGBM + SHAP",    "Binary Classification",    "AUC 0.875"],
              ["Business Direction", "Prophet + Optuna",                "Prophet + Optuna",   "Time Series + Tuning",     "30-trial search"],
              ["Unusual Transactions","Isolation Forest",               "scikit-learn",       "Unsupervised Detection",   "3% contamination"],
              ["Udharo Advisor",     "LightGBM vs Logistic Regression", "LightGBM + sklearn", "Binary Classification",    "AUC comparison"],
            ].map(([feat,...cols]) => (
              <tr key={feat} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "9px 10px", fontWeight: 600, color: DARK }}>{feat}</td>
                {cols.map((c,i) => <td key={i} style={{ padding: "9px 10px", color: "#374151" }}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
