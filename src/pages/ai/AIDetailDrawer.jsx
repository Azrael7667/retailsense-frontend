import { useMemo, useState } from "react"
import { X, Phone, Package, TrendingUp, BarChart3, Users, Shield, AlertTriangle } from "lucide-react"
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { formatAD } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"

const rs = (n) => "Rs " + Math.round(Number(n) || 0).toLocaleString("en-IN")
const num = (n) => Number(n || 0).toLocaleString("en-IN")
const compact = (v) => (v >= 10000000 ? (v / 10000000).toFixed(1) + "Cr" : v >= 100000 ? (v / 100000).toFixed(1) + "L" : v >= 1000 ? Math.round(v / 1000) + "k" : String(Math.round(v)))
const GRADE_CLS = {
  green: "bg-lime-100 text-lime-800", yellow: "bg-amber-100 text-amber-800", orange: "bg-orange-100 text-orange-800", red: "bg-red-100 text-red-700",
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1.5 px-5 pt-4 pb-3 flex-wrap border-b border-gray-100 dark:border-gray-800">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            active === t.key ? "bg-slate-900 text-white dark:bg-lime-300 dark:text-slate-900" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"}`}>
          {t.label} ({t.count})
        </button>
      ))}
    </div>
  )
}

function Note({ children }) {
  return <p className="mx-5 mt-4 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">{children}</p>
}

function Empty({ children }) {
  return <p className="px-5 py-12 text-center text-sm text-gray-400">{children}</p>
}

function Person({ name, phone }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{name || "Unnamed customer"}</p>
      {phone ? (
        <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-xs font-medium text-lime-700 hover:underline">
          <Phone size={12} /> {phone}
        </a>
      ) : (
        <span className="text-xs text-gray-400">No phone saved</span>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 px-3 py-2">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  )
}

/* ---------------- Customers Leaving ---------------- */
function ChurnView({ d }) {
  const preds = d.predictions || []
  const g = useMemo(() => ({
    stopped: preds.filter((p) => p.is_churned).sort((a, b) => b.monetary_total - a.monetary_total),
    slowing: preds.filter((p) => !p.is_churned && (p.risk_level === "high" || p.risk_level === "medium")).sort((a, b) => b.churn_probability - a.churn_probability),
    regular: preds.filter((p) => !p.is_churned && p.risk_level === "low"),
  }), [preds])
  const [tab, setTab] = useState("stopped")
  const list = g[tab]
  return (
    <>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: "stopped", label: "Stopped coming", count: g.stopped.length },
        { key: "slowing", label: "Slowing down", count: g.slowing.length },
        { key: "regular", label: "Buying regularly", count: g.regular.length },
      ]} />
      {tab === "stopped" && <Note>These customers have not bought for over 60 days. The biggest spenders are listed first, so call them first.</Note>}
      {tab === "slowing" && <Note>Still buying, but the model thinks they may stop within 60 days. The chance is an estimate, based on little history, so treat it as a hint.</Note>}
      {list.length === 0 ? <Empty>No customers in this group.</Empty> : (
        <ul>
          {list.map((p) => (
            <li key={p.customer_id} className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-start justify-between gap-3">
                <Person name={p.customer_name} phone={p.phone} />
                <div className="text-right text-xs shrink-0">
                  <p className="font-medium text-slate-800 dark:text-gray-200">Last bought {num(p.recency_days)} days ago</p>
                  <p className="text-gray-400">{num(p.frequency)} purchases, {rs(p.monetary_total)} in total</p>
                </div>
              </div>
              {tab !== "regular" && <p className="mt-2 text-xs text-slate-700 dark:text-gray-300">{p.action} <span className="text-gray-400">(estimated {p.churn_percent}% chance of leaving)</span></p>}
              {(p.explanations || []).length > 0 && <p className="mt-1 text-[11px] text-gray-400">Why: {p.explanations.join("; ")}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/* ---------------- Udharo Advisor ---------------- */
function CreditView({ d }) {
  const sc = d.scores || []
  const g = useMemo(() => ({
    risky: sc.filter((s) => s.grade === "F").sort((a, b) => b.current_balance - a.current_balance),
    middle: sc.filter((s) => ["B", "C", "D"].includes(s.grade)).sort((a, b) => a.credit_score - b.credit_score),
    safe: sc.filter((s) => s.grade === "A").sort((a, b) => b.credit_score - a.credit_score),
  }), [sc])
  const [tab, setTab] = useState("risky")
  const list = g[tab]
  return (
    <>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: "risky", label: "Risky (F)", count: g.risky.length },
        { key: "middle", label: "Review (B to D)", count: g.middle.length },
        { key: "safe", label: "Safe (A)", count: g.safe.length },
      ]} />
      {tab === "risky" && <Note>Prefer cash from these customers. Those who owe the most are listed first.</Note>}
      {tab === "middle" && <Note>Includes customers with no purchase in the last 6 months. There is too little recent history to judge them, so they get a neutral grade.</Note>}
      {list.length === 0 ? <Empty>No customers in this group.</Empty> : (
        <ul>
          {list.map((s) => (
            <li key={s.customer_id} className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-start justify-between gap-3">
                <Person name={s.customer_name} phone={s.phone} />
                <div className="text-right shrink-0">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${GRADE_CLS[s.color] || GRADE_CLS.yellow}`}>Grade {s.grade}</span>
                  <p className="text-[11px] text-gray-400 mt-1">Score {s.credit_score} / 100</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-700 dark:text-gray-300">
                {s.decision}. Owes {rs(s.current_balance)}{s.credit_limit > 0 ? ` of a ${rs(s.credit_limit)} limit` : ""}.
                {s.max_recommended_credit > 0 ? ` Suggested credit limit: ${rs(s.max_recommended_credit)}.` : ""}
              </p>
              <p className="mt-1 text-[11px] text-gray-400">
                {s.n_purchases > 0 ? `${s.n_purchases} purchases in the last 6 months, ${Math.round(s.unpaid_ratio * 100)}% of the value left unpaid. ` : ""}
                {(s.explanations || []).map((e) => `${e.factor}: ${e.value}`).join("; ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/* ---------------- Unusual Transactions ---------------- */
function AnomalyView({ d }) {
  const list = d.anomalies || []
  return (
    <>
      <Note>The system always flags the {d.summary?.anomaly_rate ?? 3}% of bills that stand out the most. They are leads to check, not proven mistakes.</Note>
      {list.length === 0 ? <Empty>No unusual bills.</Empty> : (
        <ul>
          {list.map((a) => (
            <li key={a.invoice_id} className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{shortDocNumber(a.invoice_number, a.invoice_date) || "Bill"}</p>
                  <p className="text-xs text-gray-400">{formatAD(a.invoice_date)}{a.customer_name ? `, ${a.customer_name}` : ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{rs(a.total)}</p>
                  <p className="text-[11px] text-gray-400">{a.payment_method}, {a.status}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 w-24 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden"><div className="h-full bg-slate-900 dark:bg-lime-300" style={{ width: `${Math.min(100, a.severity)}%` }} /></div>
                <span className="text-[11px] text-gray-400">How unusual: {a.severity} / 100</span>
              </div>
              <ul className="mt-2 list-disc pl-4 space-y-0.5 text-xs text-slate-700 dark:text-gray-300">
                {(a.reasons || []).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/* ---------------- Restock Advisor ---------------- */
function InventoryView({ d }) {
  const recs = d.recommendations || []
  const g = useMemo(() => ({
    need: recs.filter((r) => r.needs_restock),
    lowest: recs.filter((r) => r.next_4w_demand >= 1).sort((a, b) => a.weeks_of_stock - b.weeks_of_stock).slice(0, 25),
  }), [recs])
  const [tab, setTab] = useState(g.need.length > 0 ? "need" : "lowest")
  const list = g[tab]
  return (
    <>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: "need", label: "Needs ordering", count: g.need.length },
        { key: "lowest", label: "Lowest stock cover", count: g.lowest.length },
      ]} />
      <Note>{d.cover_rule}. Expected sales come from a model; the ordering rule is your shop policy.</Note>
      {tab === "need" && g.need.length === 0 && <Empty>Nothing is close to running out. Check the "Lowest stock cover" tab to see which products will run low first.</Empty>}
      {list.length > 0 && (
        <ul>
          {list.map((r, i) => (
            <li key={r.product_name + i} className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{r.product_name}</p>
                <p className="text-xs text-gray-400">{r.category || "No category"}</p>
              </div>
              <div className="text-right text-xs shrink-0">
                <p className="font-medium text-slate-800 dark:text-gray-200">{num(r.current_stock)} {r.unit} in stock</p>
                <p className="text-gray-400">sells about {(r.next_4w_demand / 4).toFixed(1)} a week, lasts {r.weeks_of_stock >= 99 ? "a long time" : `${r.weeks_of_stock} weeks`}</p>
                {r.needs_restock && <p className="font-semibold text-slate-900 dark:text-lime-300">Order about {num(r.suggested_order)}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/* ---------------- Cash Flow ---------------- */
function CashFlowView({ d }) {
  const rows = d.forecast || []
  const s = d.summary || {}
  return (
    <div className="pb-6">
      <div className="grid grid-cols-3 gap-2 px-5 pt-4">
        <Stat label="Expected sales" value={rs(s.total_expected_revenue)} />
        <Stat label="Expected expenses" value={rs(s.total_expected_expenses)} />
        <Stat label="Left in hand" value={rs(s.total_expected_net)} />
      </div>
      {d.meta && d.meta.include_purchases === false && <Note>Expenses are running costs only (rent, salaries, bills). Stock purchases are not counted, so "left in hand" is higher than real cash.</Note>}
      <div className="px-5 pt-4" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(v) => String(v).slice(5)} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} tickFormatter={compact} />
            <Tooltip formatter={(v) => rs(v)} />
            <Bar dataKey="revenue" name="Expected sales" fill="#84cc16" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="px-5 pt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-gray-400"><th className="py-2 font-medium">Day</th><th className="py-2 font-medium text-right">Expected sales</th><th className="py-2 font-medium text-right">Likely range</th><th className="py-2 font-medium text-right">Expenses</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className="border-t border-gray-100 dark:border-gray-800">
                <td className="py-1.5 text-slate-700 dark:text-gray-300">{formatAD(r.date)}</td>
                <td className="py-1.5 text-right font-medium text-slate-900 dark:text-white">{rs(r.revenue)}</td>
                <td className="py-1.5 text-right text-gray-400">{compact(r.revenue_lower)} to {compact(r.revenue_upper)}</td>
                <td className="py-1.5 text-right text-gray-500">{rs(r.expenses)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------------- Business Direction ---------------- */
function TrendView({ d }) {
  const ins = d.insights || {}
  const chart = useMemo(() => [
    ...(d.historical || []).slice(-26).map((h) => ({ week: h.week, actual: h.revenue })),
    ...(d.forecast_8w || []).map((f) => ({ week: f.week, forecast: f.revenue })),
  ], [d])
  const word = ins.trend_direction === "growing" ? "growing" : ins.trend_direction === "declining" ? "declining" : "stable"
  return (
    <div className="pb-6">
      <div className="grid grid-cols-2 gap-2 px-5 pt-4">
        <Stat label="Last 8 weeks vs the 8 before" value={`${ins.trend_percent > 0 ? "+" : ""}${ins.trend_percent}% (${word})`} />
        <Stat label="Average week" value={rs(ins.avg_weekly_sales)} />
        <Stat label="Best / weakest month" value={`${ins.best_month || "-"} / ${ins.worst_month || "-"}`} />
        <Stat label="Best / weakest week" value={`${compact(ins.best_week_ever)} / ${compact(ins.worst_week_ever)}`} />
      </div>
      {ins.trend_direction === "stable" && <Note>Weekly sales moved within a narrow band this year, so the forecast stays close to the recent average.</Note>}
      <div className="px-5 pt-4" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} tickFormatter={(v) => String(v).slice(5)} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} tickFormatter={compact} />
            <Tooltip formatter={(v) => rs(v)} />
            <Line type="monotone" dataKey="actual" name="Actual" stroke="#0f172a" strokeWidth={2} dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#84cc16" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="px-5 pt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-gray-400"><th className="py-2 font-medium">Week ending</th><th className="py-2 font-medium text-right">Expected sales</th><th className="py-2 font-medium text-right">Likely range</th></tr></thead>
          <tbody>
            {(d.forecast_8w || []).map((f) => (
              <tr key={f.week} className="border-t border-gray-100 dark:border-gray-800">
                <td className="py-1.5 text-slate-700 dark:text-gray-300">{formatAD(f.week)}</td>
                <td className="py-1.5 text-right font-medium text-slate-900 dark:text-white">{rs(f.revenue)}</td>
                <td className="py-1.5 text-right text-gray-400">{compact(f.revenue_lower)} to {compact(f.revenue_upper)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const VIEWS = {
  churn:     { title: "Customers to call", icon: Users, View: ChurnView, open: { label: "Open Customers page", to: "/customers" } },
  credit:    { title: "Who to give credit", icon: Shield, View: CreditView, open: { label: "Open Customers page", to: "/customers" } },
  anomaly:   { title: "Bills worth a second look", icon: AlertTriangle, View: AnomalyView, open: { label: "Open Sales page", to: "/sales" } },
  inventory: { title: "Stock and ordering", icon: Package, View: InventoryView, open: { label: "Open Inventory page", to: "/inventory" } },
  cashFlow:  { title: "Next 30 days of sales", icon: TrendingUp, View: CashFlowView, open: { label: "Open Reports", to: "/reports" } },
  trend:     { title: "Sales direction", icon: BarChart3, View: TrendView, open: { label: "Open Reports", to: "/reports" } },
}

export default function AIDetailDrawer({ viewKey, data, onClose, onOpen }) {
  const v = VIEWS[viewKey]
  const d = data && data[viewKey]
  if (!v || !d) return null
  const Icon = v.icon
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative h-full w-full max-w-xl bg-white dark:bg-gray-950 shadow-2xl flex flex-col">
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-lime-100 text-slate-900 flex items-center justify-center shrink-0"><Icon size={18} /></div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">{v.title}</h2>
              <p className="text-[11px] text-gray-400">Results from {d.trained_on || "the last training"}, using data up to {formatAD(d.data_through)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onOpen(v.open.to)} className="text-xs font-medium text-gray-500 hover:text-slate-900 dark:hover:text-white hidden sm:block">{v.open.label}</button>
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"><X size={18} /></button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto"><v.View d={d} /></div>
      </aside>
    </div>
  )
}
