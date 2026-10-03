import { useEffect, useRef, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { Package, Wallet, Calendar, ChevronDown } from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, Legend, LabelList, ReferenceLine,
} from "recharts"

// Reads local Y/M/D directly instead of toISOString() (which shifts the
// date backward for timezones ahead of UTC, e.g. Nepal's UTC+5:45).
function toLocalISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// ---- Theme (navy + soft lime) ----
const C = {
  navy:     "#0f172a", // slate-900
  lime:     "#a3e635", // lime-400
  limeSoft: "#d9f99d", // lime-200
  gray300:  "#d1d5db",
  gray400:  "#9ca3af",
  gray500:  "#6b7280",
  red:      "#ef4444",
  border:   "#e5e7eb",
}

// Donut palette — distinct hues, all mid-saturation so nothing shouts.
// Order is chosen so neighbouring slices never share a colour family.
const PIE_COLORS = [
  "#0f172a", // navy
  "#a3e635", // lime
  "#38bdf8", // sky
  "#f59e0b", // amber
  "#a78bfa", // violet
  "#fb7185", // rose
  "#2dd4bf", // teal
  "#64748b", // slate
  "#fb923c", // orange
  "#e879f9", // fuchsia
]

const PRIMARY_BTN = "bg-slate-900 hover:bg-slate-800 text-white dark:bg-lime-300 dark:hover:bg-lime-400 dark:text-slate-900"
const FIELD_FOCUS = "focus:outline-none focus:ring-2 focus:ring-lime-200 dark:focus:ring-lime-900 focus:border-lime-500"
const OPTION_ACTIVE = "bg-lime-50 dark:bg-gray-800 text-slate-900 dark:text-lime-300 font-semibold"
const OPTION_IDLE = "text-slate-700 dark:text-gray-300"
const CARD = "bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800"

function triggerClass(open) {
  const base =
    "flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg whitespace-nowrap border transition " +
    "bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-300 " +
    "focus:outline-none focus:border-lime-500 dark:focus:border-lime-500 focus:ring-2 focus:ring-lime-300 dark:focus:ring-lime-700"
  const state = open
    ? "border-lime-500 dark:border-lime-500 ring-2 ring-lime-300 dark:ring-lime-700"
    : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
  return `${base} ${state}`
}

const TOOLTIP_STYLE = { borderRadius: 10, fontSize: 12, border: `1px solid ${C.border}` }

export default function PnL() {
  const { storeId } = useStoreId()
  const [data,      setData]      = useState(null)
  const [itemData,  setItemData]  = useState([])
  const [period,    setPeriod]    = useState("this_month")
  const [loading,   setLoading]   = useState(false)
  const [tab,       setTab]       = useState("summary") // summary | itemwise
  const [periodOpen, setPeriodOpen] = useState(false)
  const periodRef = useRef(null)

  const today = new Date()
  const periods = {
    this_month: { label: "This month",  start: new Date(today.getFullYear(), today.getMonth(), 1),   end: today },
    last_month: { label: "Last month",  start: new Date(today.getFullYear(), today.getMonth()-1, 1), end: new Date(today.getFullYear(), today.getMonth(), 0) },
    this_year:  { label: "This year",   start: new Date(today.getFullYear(), 0, 1),                  end: today },
    custom:     { label: "Custom",      start: null, end: null },
  }
  const [customStart, setCustomStart] = useState("")
  const [customEnd,   setCustomEnd]   = useState("")
  const [draftStart,  setDraftStart]  = useState("")
  const [draftEnd,    setDraftEnd]    = useState("")

  useEffect(() => {
    function onClick(e) {
      if (periodRef.current && !periodRef.current.contains(e.target)) setPeriodOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  useEffect(() => { if (storeId) calculate() }, [storeId, period, customStart, customEnd])

  async function calculate() {
    if (!storeId) return
    setLoading(true)
    const p     = periods[period]
    const start = p.start ? toLocalISODate(p.start) : customStart
    const end   = p.end   ? toLocalISODate(p.end)   : customEnd
    if (!start || !end) { setLoading(false); return }

    const invoiceData = []
    for (let page = 0; ; page++) {
      const { data: part } = await supabase
        .from("invoices")
        .select("id, total")
        .eq("store_id", storeId)
        .gte("invoice_date", start)
        .lte("invoice_date", end)
        .order("id")
        .range(page * 1000, (page + 1) * 1000 - 1)
      invoiceData.push(...(part || []))
      if ((part || []).length < 1000) break
    }

    const invoiceIds = (invoiceData || []).map(i => i.id)
    const revenue    = (invoiceData || []).reduce((s, i) => s + i.total, 0)

    const itemData = []
    for (let k = 0; k < invoiceIds.length; k += 100) {
      const chunk = invoiceIds.slice(k, k + 100)
      for (let page = 0; ; page++) {
        const { data: part } = await supabase
          .from("invoice_items")
          .select("product_id, product_name, quantity, unit_price, total, cost_price_at_sale")
          .in("invoice_id", chunk)
          .order("id")
          .range(page * 1000, (page + 1) * 1000 - 1)
        itemData.push(...(part || []))
        if ((part || []).length < 1000) break
      }
    }

    const { data: expData } = await supabase
      .from("expenses")
      .select("amount, category")
      .eq("store_id", storeId)
      .gte("expense_date", start)
      .lte("expense_date", end)

    const { data: prodData } = await supabase
      .from("products")
      .select("id, name, cost_price")
      .eq("store_id", storeId)

    const liveCostMap = {}
    ;(prodData || []).forEach(p => {
      liveCostMap[p.id]   = p.cost_price
      liveCostMap[p.name] = p.cost_price
    })

    const resolveCost = (ii) => {
      if (ii.cost_price_at_sale != null) return ii.cost_price_at_sale
      return liveCostMap[ii.product_id] || liveCostMap[ii.product_name] || 0
    }

    const cogs = (itemData || []).reduce((s, ii) => s + (resolveCost(ii) * ii.quantity), 0)

    const expTotal = (expData || []).reduce((s, e) => s + e.amount, 0)
    const expByCategory = {}
    ;(expData || []).forEach(e => {
      expByCategory[e.category || "Other"] = (expByCategory[e.category || "Other"] || 0) + e.amount
    })

    const grossP = revenue - cogs
    const netP   = grossP - expTotal

    setData({
      revenue, cogs, grossP, expTotal, netP, expByCategory,
      invoiceCount: (invoiceData || []).length,
    })

    const productMap = {}
    ;(itemData || []).forEach(ii => {
      const key = ii.product_name
      if (!productMap[key]) {
        productMap[key] = { name: key, product_id: ii.product_id, revenue: 0, qty: 0, costSum: 0 }
      }
      productMap[key].revenue  += ii.total
      productMap[key].qty      += ii.quantity
      productMap[key].costSum  += resolveCost(ii) * ii.quantity
    })

    const itemRows = Object.values(productMap).map(item => {
      const totalCost = item.costSum
      const avgCost   = item.qty > 0 ? totalCost / item.qty : 0
      const profit    = item.revenue - totalCost
      const margin    = item.revenue > 0 ? (profit / item.revenue) * 100 : 0
      return { ...item, avgCost, totalCost, profit, margin }
    }).sort((a, b) => b.profit - a.profit)

    setItemData(itemRows)
    setLoading(false)
  }

  function pickPeriod(k) {
    if (k === "custom") {
      setDraftStart(customStart); setDraftEnd(customEnd)
      setPeriod("custom")
      return // keep dropdown open so dates can be picked
    }
    setPeriod(k)
    setPeriodOpen(false)
  }

  function applyCustom() {
    if (!draftStart || !draftEnd) return
    setCustomStart(draftStart); setCustomEnd(draftEnd)
    setPeriod("custom")
    setPeriodOpen(false)
  }

  const fmt      = (n) => "Rs " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
  const fmtShort = (n) => "Rs " + Number(n||0).toLocaleString("en-IN", { maximumFractionDigits: 0 })
  const pct      = (a, b) => b > 0 ? ((a/b)*100).toFixed(1)+"%" : "—"

  const periodLabel = period === "custom" && customStart && customEnd
    ? `${customStart} → ${customEnd}`
    : periods[period].label

  const breakdownData = data ? [
    { name: "Revenue",      value: data.revenue,  fill: C.navy },
    { name: "COGS",         value: data.cogs,     fill: C.gray300 },
    { name: "Gross Profit", value: data.grossP,   fill: data.grossP >= 0 ? C.lime : C.red },
    { name: "Expenses",     value: data.expTotal, fill: C.gray400 },
    { name: "Net Profit",   value: data.netP,     fill: data.netP >= 0 ? C.lime : C.red },
  ].map(row => ({
    ...row,
    pctOfRevenue: data.revenue > 0 ? (row.value / data.revenue) * 100 : 0,
  })) : []

  const expenseChartData = data ? Object.entries(data.expByCategory).map(([name, value]) => ({ name, value })) : []

  const totalRevenue = itemData.reduce((s,i)=>s+i.revenue,0)
  const totalCost    = itemData.reduce((s,i)=>s+i.totalCost,0)
  const totalProfit  = itemData.reduce((s,i)=>s+i.profit,0)

  const numCell = "px-5 py-3.5 text-right tabular-nums"

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <style>{`
        .thin-scroll { scrollbar-width: thin; scrollbar-color: #d1d5db transparent; }
        .thin-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .thin-scroll::-webkit-scrollbar-track { background: transparent; }
        .thin-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
        .thin-scroll::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Profit & Loss</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Financial performance summary</p>
        </div>

        <div className="relative" ref={periodRef}>
          <button onClick={() => setPeriodOpen(v => !v)} className={triggerClass(periodOpen)}>
            <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            {periodLabel}
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
          </button>
          {periodOpen && (
            <div className="absolute right-0 z-20 mt-1 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg p-3">
              <div className="space-y-0.5">
                {Object.entries(periods).map(([k, v]) => (
                  <button key={k} onClick={() => pickPeriod(k)}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-lime-50 dark:hover:bg-gray-800 ${period === k ? OPTION_ACTIVE : OPTION_IDLE}`}>
                    {v.label}
                  </button>
                ))}
              </div>
              {period === "custom" && (
                <>
                  <div className="border-t border-gray-100 dark:border-gray-800 mt-3 pt-3 flex items-center gap-2">
                    <input type="date" value={draftStart} onChange={e => setDraftStart(e.target.value)}
                      className={`text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 flex-1 min-w-0 bg-white dark:bg-gray-800 text-slate-900 dark:text-white ${FIELD_FOCUS}`} />
                    <span className="text-gray-400 dark:text-gray-500 text-xs">to</span>
                    <input type="date" value={draftEnd} onChange={e => setDraftEnd(e.target.value)}
                      className={`text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 flex-1 min-w-0 bg-white dark:bg-gray-800 text-slate-900 dark:text-white ${FIELD_FOCUS}`} />
                  </div>
                  <button onClick={applyCustom} disabled={!draftStart || !draftEnd}
                    className={`w-full mt-2 text-sm py-1.5 rounded-lg font-medium disabled:opacity-40 ${PRIMARY_BTN}`}>
                    Apply
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {[
          { key: "summary",  label: "P&L Summary" },
          { key: "itemwise", label: "Item-wise P&L" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${tab===t.key ? "bg-white dark:bg-gray-900 text-slate-900 dark:text-lime-300 shadow-sm" : "text-gray-500 hover:text-slate-900 dark:hover:text-gray-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-slate-900 dark:border-lime-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <div className="text-center py-20 text-gray-400 text-sm">Select a period to view P&L</div>
      ) : tab === "summary" ? (
        <div className="space-y-5">

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Total Revenue",      value: fmt(data.revenue) },
              { label: "Cost of Goods",      value: fmt(data.cogs) },
              { label: "Gross Profit",       value: fmt(data.grossP), sub: data.revenue > 0 ? pct(data.grossP, data.revenue) : null, negative: data.grossP < 0 },
              { label: "Operating Expenses", value: fmt(data.expTotal) },
              { label: "Net Profit",         value: fmt(data.netP),   sub: data.revenue > 0 ? pct(data.netP, data.revenue) : null, negative: data.netP < 0, highlight: true },
            ].map(k => (
              <div key={k.label} className={`${CARD} px-4 py-3.5`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] text-gray-500 font-medium">{k.label}</p>
                  {k.sub && (
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
                      k.negative
                        ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                        : "bg-lime-100 text-slate-800 dark:bg-lime-950/40 dark:text-lime-300"}`}>
                      {k.sub}
                    </span>
                  )}
                </div>
                <p className={`text-lg font-bold tabular-nums truncate ${k.negative ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                  {k.value}
                </p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className={`lg:col-span-3 ${CARD} p-5`}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">P&L Breakdown</h2>
                <span className="text-[11px] text-gray-400">% of revenue</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={breakdownData} layout="vertical" margin={{ left: 8, right: 56, top: 8, bottom: 8 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: C.gray400 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => fmtShort(v)} />
                  <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 12, fill: C.gray500, fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(163,230,53,0.08)" }}
                    formatter={(v, n, entry) => [`${fmt(v)}  (${entry.payload.pctOfRevenue.toFixed(1)}% of revenue)`, entry.payload.name]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <ReferenceLine x={0} stroke={C.border} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22}>
                    {breakdownData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    <LabelList dataKey="value" position="right" formatter={(v) => fmtShort(v)}
                      style={{ fontSize: 11, fontWeight: 600, fill: C.gray500 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-5 gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                {breakdownData.map(row => (
                  <div key={row.name} className="text-center">
                    <div className="w-full h-1 rounded-full mb-1.5" style={{ backgroundColor: row.fill }} />
                    <p className="text-[10px] text-gray-400 truncate">{row.name}</p>
                    <p className="text-[11px] font-semibold text-slate-700 dark:text-gray-300 tabular-nums">
                      {data.revenue > 0 ? `${row.pctOfRevenue.toFixed(0)}%` : "—"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className={`lg:col-span-2 ${CARD} p-5`}>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Expense Breakdown</h2>
              {expenseChartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[200px]">
                  <Wallet size={32} className="mb-2 text-gray-200 dark:text-gray-700" />
                  <p className="text-xs text-gray-400">No expenses recorded</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={expenseChartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2} stroke="none">
                      {expenseChartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v)} contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11, color: C.gray500 }} iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Income Statement */}
          <div className={`${CARD} p-6`}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Income Statement</h2>

            <div className="mb-4">
              <div className="flex justify-between items-center py-2.5 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Revenue</span>
              </div>
              <div className="flex justify-between items-center py-2 pl-4">
                <span className="text-sm text-gray-500">Sales ({data.invoiceCount} invoices)</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white tabular-nums">{fmt(data.revenue)}</span>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center py-2.5 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Cost of Goods Sold</span>
              </div>
              <div className="flex justify-between items-center py-2 pl-4">
                <span className="text-sm text-gray-500">Cost of goods sold (at time of sale)</span>
                <span className="text-sm font-medium text-gray-500 tabular-nums">- {fmt(data.cogs)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center py-3 px-4 rounded-xl mb-4 bg-gray-50 dark:bg-gray-800/60">
              <span className="text-sm font-bold text-slate-900 dark:text-white">Gross Profit</span>
              <span className={`text-sm font-bold tabular-nums ${data.grossP < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>{fmt(data.grossP)}</span>
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center py-2.5 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Operating Expenses</span>
                <span className="text-sm font-medium text-gray-500 tabular-nums">- {fmt(data.expTotal)}</span>
              </div>
              {Object.entries(data.expByCategory).map(([cat, amt]) => (
                <div key={cat} className="flex justify-between items-center py-2 pl-4">
                  <span className="text-sm text-gray-500">{cat}</span>
                  <span className="text-sm text-gray-500 tabular-nums">- {fmt(amt)}</span>
                </div>
              ))}
              {Object.keys(data.expByCategory).length === 0 && (
                <div className="py-2 pl-4 text-sm text-gray-400">No expenses recorded</div>
              )}
            </div>

            <div className={`flex justify-between items-center py-3 px-4 rounded-xl ${
              data.netP >= 0
                ? "bg-lime-100 dark:bg-lime-950/40"
                : "bg-red-50 dark:bg-red-950/40"}`}>
              <span className={`text-base font-bold ${data.netP >= 0 ? "text-slate-900 dark:text-lime-300" : "text-red-600 dark:text-red-400"}`}>Net Profit</span>
              <span className={`text-base font-bold tabular-nums ${data.netP >= 0 ? "text-slate-900 dark:text-lime-300" : "text-red-600 dark:text-red-400"}`}>{fmt(data.netP)}</span>
            </div>
          </div>
        </div>

      ) : (
        /* Item-wise P&L tab */
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className={`${CARD} px-4 py-3.5`}>
              <p className="text-[11px] text-gray-500 font-medium mb-1">Total items sold</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{itemData.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">unique products</p>
            </div>
            <div className={`${CARD} px-4 py-3.5`}>
              <p className="text-[11px] text-gray-500 font-medium mb-1">Most profitable item</p>
              <p className="text-base font-bold text-slate-900 dark:text-white truncate">{itemData[0]?.name || "—"}</p>
              <p className="text-xs text-gray-400 mt-0.5 tabular-nums">{itemData[0] ? fmt(itemData[0].profit) : "No data"}</p>
            </div>
            <div className={`${CARD} px-4 py-3.5`}>
              <p className="text-[11px] text-gray-500 font-medium mb-1">Least profitable item</p>
              <p className="text-base font-bold text-slate-900 dark:text-white truncate">{itemData[itemData.length-1]?.name || "—"}</p>
              <p className="text-xs text-gray-400 mt-0.5 tabular-nums">{itemData.length > 0 ? fmt(itemData[itemData.length-1].profit) : "No data"}</p>
            </div>
          </div>

          <div className={`${CARD} overflow-hidden shadow-sm`}>
            <div className="overflow-auto thin-scroll" style={{ maxHeight: "calc(100vh - 360px)" }}>
              <table className="w-full text-sm min-w-[880px]">
                <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800/60">
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    {[
                      { h: "Product", align: "left" },
                      { h: "Qty sold", align: "right" },
                      { h: "Revenue", align: "right" },
                      { h: "Avg cost", align: "right" },
                      { h: "Total cost", align: "right" },
                      { h: "Profit", align: "right" },
                      { h: "Margin", align: "left" },
                    ].map(c => (
                      <th key={c.h}
                        className={`px-5 py-3.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/60 ${c.align === "right" ? "text-right" : "text-left"}`}>
                        {c.h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
                  {itemData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16">
                        <Package size={38} className="mx-auto text-gray-200 dark:text-gray-700 mb-3" />
                        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No sales data for this period</p>
                      </td>
                    </tr>
                  ) : itemData.map((item, i) => (
                    <tr key={item.name} className="hover:bg-lime-50/40 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 w-4 tabular-nums">{i+1}</span>
                          <span className="font-medium text-slate-900 dark:text-white">{item.name}</span>
                        </div>
                      </td>
                      <td className={`${numCell} text-gray-500`}>{item.qty}</td>
                      <td className={`${numCell} text-slate-900 dark:text-white`}>{fmt(item.revenue)}</td>
                      <td className={`${numCell} text-gray-500`}>
                        {item.avgCost > 0 ? fmt(item.avgCost) : <span className="text-xs text-gray-400">No cost data</span>}
                      </td>
                      <td className={`${numCell} text-gray-500`}>{item.totalCost > 0 ? fmt(item.totalCost) : "—"}</td>
                      <td className={`${numCell} font-semibold ${item.profit >= 0 ? "text-slate-900 dark:text-white" : "text-red-600 dark:text-red-400"}`}>
                        {fmt(item.profit)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-20 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className={`h-1.5 rounded-full ${item.margin >= 0 ? "bg-lime-400" : "bg-red-500"}`}
                              style={{ width: `${Math.min(100, Math.abs(item.margin))}%` }} />
                          </div>
                          <span className={`text-xs font-medium tabular-nums ${item.margin >= 0 ? "text-slate-700 dark:text-gray-300" : "text-red-600 dark:text-red-400"}`}>
                            {item.margin.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {itemData.length > 0 && (
                  <tfoot className="sticky bottom-0 bg-gray-50 dark:bg-gray-800/60">
                    <tr className="border-t border-gray-200 dark:border-gray-700 text-sm font-semibold text-slate-900 dark:text-white">
                      <td className="px-5 py-3">Total ({itemData.length} products)</td>
                      <td className={numCell}></td>
                      <td className={numCell}>{fmt(totalRevenue)}</td>
                      <td className={numCell}></td>
                      <td className={`${numCell} text-gray-500`}>{fmt(totalCost)}</td>
                      <td className={`${numCell} ${totalProfit >= 0 ? "" : "text-red-600 dark:text-red-400"}`}>{fmt(totalProfit)}</td>
                      <td className="px-5 py-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center">
            * Item cost is the cost at time of sale. Sales made before this feature was added use the current cost as a fallback.
          </p>
        </div>
      )}
    </div>
  )
}