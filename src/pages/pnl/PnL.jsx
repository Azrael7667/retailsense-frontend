import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { TrendingUp, TrendingDown, DollarSign, Package } from "lucide-react"

export default function PnL() {
  const { storeId } = useStoreId()
  const [data,      setData]      = useState(null)
  const [itemData,  setItemData]  = useState([])
  const [period,    setPeriod]    = useState("this_month")
  const [loading,   setLoading]   = useState(false)
  const [tab,       setTab]       = useState("summary") // summary | itemwise

  const today = new Date()
  const periods = {
    this_month: { label: "This month",  start: new Date(today.getFullYear(), today.getMonth(), 1),   end: today },
    last_month: { label: "Last month",  start: new Date(today.getFullYear(), today.getMonth()-1, 1), end: new Date(today.getFullYear(), today.getMonth(), 0) },
    this_year:  { label: "This year",   start: new Date(today.getFullYear(), 0, 1),                  end: today },
    custom:     { label: "Custom",      start: null, end: null },
  }
  const [customStart, setCustomStart] = useState("")
  const [customEnd,   setCustomEnd]   = useState("")

  useEffect(() => { if (storeId) calculate() }, [storeId, period, customStart, customEnd])

  async function calculate() {
    if (!storeId) return
    setLoading(true)
    const p     = periods[period]
    const start = p.start ? p.start.toISOString().split("T")[0] : customStart
    const end   = p.end   ? p.end.toISOString().split("T")[0]   : customEnd
    if (!start || !end) { setLoading(false); return }

    const [inv, pur, exp, items, prods] = await Promise.all([
      supabase.from("invoices").select("total").eq("store_id", storeId).eq("status","paid").gte("invoice_date", start).lte("invoice_date", end),
      supabase.from("purchases").select("total").eq("store_id", storeId).gte("purchase_date", start).lte("purchase_date", end),
      supabase.from("expenses").select("amount, category").eq("store_id", storeId).gte("expense_date", start).lte("expense_date", end),
      supabase.from("invoice_items").select("product_id, product_name, quantity, unit_price, total, invoice_id, invoices(invoice_date, store_id)"),
      supabase.from("products").select("id, name, cost_price, selling_price").eq("store_id", storeId),
    ])
    
    const revenue  = (inv.data||[]).reduce((s,i) => s+i.total, 0)
    const cogs     = (pur.data||[]).reduce((s,p) => s+p.total, 0)
    const expTotal = (exp.data||[]).reduce((s,e) => s+e.amount, 0)
    const grossP   = revenue - cogs
    const netP     = grossP - expTotal

    const expByCategory = {}
    ;(exp.data||[]).forEach(e => {
      expByCategory[e.category||"Other"] = (expByCategory[e.category||"Other"]||0) + e.amount
    })

    setData({ revenue, cogs, grossP, expTotal, netP, expByCategory, invoiceCount: (inv.data||[]).length })

    // Item-wise P&L
    // Build cost map from purchase items
      const costMap = {}
    ;(prods.data||[]).forEach(p => {
      costMap[p.id]   = p.cost_price   // by product id
      costMap[p.name] = p.cost_price   // by product name as fallback
    })

    // Filter invoice items by date range and store
    const filteredItems = (items.data||[]).filter(ii => {
      const d = ii.invoices?.invoice_date
      return d && d >= start && d <= end && ii.invoices?.store_id === storeId
    })

    // Aggregate by product
    const productMap = {}
    filteredItems.forEach(ii => {
      const key = ii.product_name
      if (!productMap[key]) productMap[key] = { name: key, product_id: ii.product_id, revenue: 0, qty: 0 }
      productMap[key].revenue += ii.total
      productMap[key].qty     += ii.quantity
    })

    // Calculate profit using cost_price from products table
    const itemRows = Object.values(productMap).map(item => {
      // Use product_id to look up cost, fall back to name lookup
      const avgCost   = costMap[item.product_id] || costMap[item.name] || 0
      const totalCost = avgCost * item.qty
      const profit    = item.revenue - totalCost
      const margin    = item.revenue > 0 ? (profit / item.revenue) * 100 : 0
      return { ...item, avgCost, totalCost, profit, margin }
    }).sort((a, b) => b.profit - a.profit)

    
    setItemData(itemRows)
    setLoading(false)
  }

  const fmt  = (n) => "Rs " + Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
  const pct  = (a, b) => b > 0 ? ((a/b)*100).toFixed(1)+"%" : "—"

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Profit & Loss</h1>
          <p className="text-sm text-gray-500 mt-0.5">Financial performance summary</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500">
            {Object.entries(periods).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {period === "custom" && (
            <>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none" />
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {[
          { key: "summary",  label: "P&L Summary" },
          { key: "itemwise", label: "Item-wise P&L" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2 text-sm font-medium rounded-md transition-colors ${tab===t.key ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <div className="text-center py-20 text-gray-400">Select a period to view P&L</div>
      ) : tab === "summary" ? (
        <div className="space-y-4">
          {/* Top metrics */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total revenue", value: fmt(data.revenue), Icon: DollarSign,
                color: "bg-green-50 dark:bg-gray-900 text-green-600 dark:text-green-400",
                iconBg: "bg-green-100 dark:bg-green-900" },
              { label: "Gross profit",  value: fmt(data.grossP),  Icon: TrendingUp,
                color: "bg-blue-50 dark:bg-gray-900 text-blue-600 dark:text-blue-400",
                iconBg: "bg-blue-100 dark:bg-blue-900",
                sub: `Margin: ${pct(data.grossP, data.revenue)}` },
              { label: "Net profit",    value: fmt(data.netP),
                Icon: data.netP >= 0 ? TrendingUp : TrendingDown,
                color: data.netP >= 0 ? "bg-green-50 dark:bg-gray-900 text-green-600 dark:text-green-400" : "bg-red-50 dark:bg-gray-900 text-red-500",
                iconBg: data.netP >= 0 ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900",
                sub: `Margin: ${pct(data.netP, data.revenue)}` },
            ].map(m => (
              <div key={m.label} className={`${m.color} rounded-xl border border-white dark:border-gray-800 p-5`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${m.iconBg}`}>
                  <m.Icon size={20} />
                </div>
                <p className="text-2xl font-bold">{m.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{m.label}</p>
                {m.sub && <p className="text-xs text-gray-400 mt-1">{m.sub}</p>}
              </div>
            ))}
          </div>

          {/* Income Statement */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Income Statement</h2>

            <div className="mb-4">
              <div className="flex justify-between items-center py-2.5 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Revenue</span>
              </div>
              <div className="flex justify-between items-center py-2 pl-4">
                <span className="text-sm text-gray-500">Sales ({data.invoiceCount} invoices)</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{fmt(data.revenue)}</span>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center py-2.5 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Cost of Goods Sold</span>
              </div>
              <div className="flex justify-between items-center py-2 pl-4">
                <span className="text-sm text-gray-500">Purchases</span>
                <span className="text-sm font-medium text-red-500">- {fmt(data.cogs)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center py-3 bg-blue-50 dark:bg-blue-950 px-4 rounded-lg mb-4">
              <span className="text-sm font-bold text-blue-700 dark:text-blue-300">Gross Profit</span>
              <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{fmt(data.grossP)}</span>
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center py-2.5 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Operating Expenses</span>
                <span className="text-sm font-medium text-red-500">- {fmt(data.expTotal)}</span>
              </div>
              {Object.entries(data.expByCategory).map(([cat, amt]) => (
                <div key={cat} className="flex justify-between items-center py-2 pl-4">
                  <span className="text-sm text-gray-500">{cat}</span>
                  <span className="text-sm text-red-400">- {fmt(amt)}</span>
                </div>
              ))}
              {Object.keys(data.expByCategory).length === 0 && (
                <div className="py-2 pl-4 text-sm text-gray-400">No expenses recorded</div>
              )}
            </div>

            <div className={`flex justify-between items-center py-3 px-4 rounded-lg ${data.netP >= 0 ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"}`}>
              <span className={`text-base font-bold ${data.netP >= 0 ? "text-green-700 dark:text-green-300" : "text-red-600 dark:text-red-400"}`}>Net Profit</span>
              <span className={`text-base font-bold ${data.netP >= 0 ? "text-green-700 dark:text-green-300" : "text-red-600 dark:text-red-400"}`}>{fmt(data.netP)}</span>
            </div>
          </div>
        </div>

      ) : (
        /* Item-wise P&L tab */
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-xs text-gray-400 mb-1">Total items sold</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{itemData.length}</p>
              <p className="text-xs text-gray-400 mt-1">unique products</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-xs text-gray-400 mb-1">Most profitable item</p>
              <p className="text-base font-bold text-green-600 dark:text-green-400 truncate">
                {itemData[0]?.name || "—"}
              </p>
              <p className="text-xs text-gray-400 mt-1">{itemData[0] ? fmt(itemData[0].profit) : "No data"}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-xs text-gray-400 mb-1">Least profitable item</p>
              <p className="text-base font-bold text-red-500 truncate">
                {itemData[itemData.length-1]?.name || "—"}
              </p>
              <p className="text-xs text-gray-400 mt-1">{itemData.length > 0 ? fmt(itemData[itemData.length-1].profit) : "No data"}</p>
            </div>
          </div>

          {/* Item-wise table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {["Product","Qty sold","Revenue","Avg cost","Total cost","Profit","Margin"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {itemData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12">
                      <Package size={40} className="mx-auto text-gray-200 dark:text-gray-700 mb-2" />
                      <p className="text-gray-400">No sales data for this period</p>
                    </td>
                  </tr>
                ) : itemData.map((item, i) => (
                  <tr key={item.name} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-5">{i+1}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{item.qty}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{fmt(item.revenue)}</td>
                    <td className="px-4 py-3 text-gray-500">{item.avgCost > 0 ? fmt(item.avgCost) : <span className="text-xs text-amber-500">No cost data</span>}</td>
                    <td className="px-4 py-3 text-red-400">{item.totalCost > 0 ? fmt(item.totalCost) : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${item.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                        {fmt(item.profit)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full min-w-12">
                          <div className={`h-1.5 rounded-full ${item.margin >= 0 ? "bg-green-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min(100, Math.abs(item.margin))}%` }} />
                        </div>
                        <span className={`text-xs font-medium ${item.margin >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                          {item.margin.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer totals */}
            {itemData.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between text-sm font-semibold text-gray-900 dark:text-white">
                <span>Total ({itemData.length} products)</span>
                <div className="flex gap-8">
                  <span>{fmt(itemData.reduce((s,i)=>s+i.revenue,0))}</span>
                  <span className="text-red-400">{fmt(itemData.reduce((s,i)=>s+i.totalCost,0))}</span>
                  <span className={itemData.reduce((s,i)=>s+i.profit,0)>=0?"text-green-600 dark:text-green-400":"text-red-500"}>
                    {fmt(itemData.reduce((s,i)=>s+i.profit,0))}
                  </span>
                  <span className="w-24"></span>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 text-center">
            * Item cost is calculated from purchase records. Items with no purchase history show revenue only.
          </p>
        </div>
      )}
    </div>
  )
}
