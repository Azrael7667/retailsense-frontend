import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Download, Search, X } from "lucide-react"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts"
import api from "../../lib/apiClient"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatAD } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import DateRangeDropdown from "../../components/common/DateRangeDropdown"

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl"
const FIELD =
  "w-full pl-9 pr-9 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-200 focus:border-lime-500"
const TYPE_STYLE = {
  Sale: "bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-300",
  Purchase: "bg-lime-100 text-slate-800 dark:bg-lime-950 dark:text-lime-300",
  "Sales Return": "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  "Purchase Return": "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
}
const rs = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtyFmt = (n) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })
const isoToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function Stat({ label, value, hint, warn }) {
  return (
    <div className={`${CARD} px-4 py-3`}>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 truncate">{label}</p>
      <p className={`text-base font-semibold ${warn ? "text-amber-600" : "text-slate-900 dark:text-white"}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

export default function ItemDetails() {
  const { storeId } = useStoreId()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [item, setItem] = useState(null)
  const [range, setRange] = useState({ from: "", to: "" })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const boxRef = useRef(null)
  const skipSearch = useRef(false)

  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  useEffect(() => {
    if (skipSearch.current) { skipSearch.current = false; return }
    const q = query.trim().replace(/[,()%*]/g, " ")
    if (!storeId || q.length < 2) { setResults([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      const { data: rows } = await supabase.from("products")
        .select("id, name, sku, stock_quantity")
        .eq("store_id", storeId).eq("is_active", true)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .order("name").limit(12)
      if (!cancelled) { setResults(rows || []); setOpen(true) }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, storeId])

  useEffect(() => {
    if (!item?.id) { setData(null); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    api.get("/api/reports/item-details", {
      params: { product_id: item.id, start_date: range.from || "2000-01-01", end_date: range.to || isoToday() },
    })
      .then((res) => { if (!cancelled) setData(res.data) })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail || "Failed to load this item") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [item?.id, range.from, range.to])

  function pick(p) {
    if (p.name !== query) skipSearch.current = true
    setQuery(p.name)
    setItem({ id: p.id, name: p.name })
    setOpen(false)
  }

  function clear() {
    setQuery("")
    setItem(null)
    setData(null)
    setResults([])
  }

  const monthly = useMemo(() => {
    const m = {}
    ;(data?.rows || []).forEach((r) => {
      if (r.type !== "Purchase" && r.type !== "Sale") return
      const k = (r.date || "").slice(0, 7)
      if (!k) return
      if (!m[k]) m[k] = { month: k, Purchased: 0, Sold: 0 }
      if (r.type === "Purchase") m[k].Purchased += Number(r.qty_in) || 0
      else m[k].Sold += Number(r.qty_out) || 0
    })
    return Object.values(m).sort((a, b) => a.month.localeCompare(b.month))
  }, [data])

  function exportCSV() {
    if (!data?.rows?.length) return
    const head = ["Date", "Type", "Reference", "Party", "In", "Out", "Rate", "Amount"]
    const body = data.rows.map((r) =>
      [r.date, r.type, shortDocNumber(r.reference, r.date), r.party_name, r.qty_in, r.qty_out, r.rate, r.amount]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `item-${(data.item.name || "details").replace(/[^a-z0-9]+/gi, "-")}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const it = data?.item
  const sm = data?.summary
  const margin = it && Number(it.selling_price) > 0 ? ((it.selling_price - it.cost_price) / it.selling_price) * 100 : null
  const lowStock = it && Number(it.stock_quantity) <= Number(it.reorder_level || 0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link to="/reports" className="text-gray-400 dark:text-gray-500 hover:text-slate-900 dark:hover:text-gray-300">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Item Details Report</h1>
        </div>
        <button onClick={exportCSV} disabled={!data?.rows?.length}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 bg-slate-900 text-white hover:bg-slate-800 dark:bg-lime-300 dark:text-slate-900">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-xl" ref={boxRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => { if (results.length) setOpen(true) }}
            placeholder="Search an item by name or SKU…" className={FIELD} />
          {query && (
            <button onClick={clear} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
          {open && results.length > 0 && (
            <div className="absolute z-20 mt-1.5 w-full bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg py-1.5 max-h-80 overflow-y-auto">
              {results.map((p) => (
                <button key={p.id} onClick={() => pick(p)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2 text-sm text-left hover:bg-lime-50 dark:hover:bg-gray-800">
                  <span className="min-w-0">
                    <span className="block truncate text-slate-900 dark:text-white">{p.name}</span>
                    {p.sku && <span className="block text-[11px] text-gray-400">{p.sku}</span>}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">{qtyFmt(p.stock_quantity)} in stock</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <DateRangeDropdown from={range.from} to={range.to} onApply={({ from, to }) => setRange({ from, to })} />
      </div>

      {!item && (
        <div className={`${CARD} p-10 text-center text-sm text-gray-400`}>
          Search for an item above to see its stock, prices and every purchase, sale and return.
        </div>
      )}
      {item && loading && <div className={`${CARD} p-10 text-center text-sm text-gray-400`}>Loading…</div>}
      {item && !loading && error && <div className={`${CARD} p-10 text-center text-sm text-red-500`}>{error}</div>}

      {item && !loading && !error && data && (
        <>
          <p className="mb-3 text-sm text-slate-700 dark:text-gray-300">
            <span className="font-semibold">{it.name}</span>
            {it.sku ? ` · ${it.sku}` : ""}{it.category && it.category !== "-" ? ` · ${it.category}` : ""}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
            <Stat label="Current stock" value={`${qtyFmt(it.stock_quantity)} ${it.unit || "pcs"}`}
              hint={`Reorder at ${qtyFmt(it.reorder_level)}`} warn={lowStock} />
            <Stat label="Cost price" value={rs(it.cost_price)} />
            <Stat label="Selling price" value={Number(it.selling_price) > 0 ? rs(it.selling_price) : "Not set"}
              hint={margin !== null ? `${margin.toFixed(1)}% margin` : "set a price to sell this item"} warn={margin === null} />
            <Stat label="Stock value (cost)" value={rs(Number(it.stock_quantity) * Number(it.cost_price))} />
            <Stat label="Purchased" value={qtyFmt(sm.purchased_qty)} hint={`${qtyFmt(sm.purchase_return_qty)} returned to supplier`} />
            <Stat label="Sold" value={qtyFmt(sm.sold_qty)} hint={`${qtyFmt(sm.sales_return_qty)} returned to stock`} />
          </div>

          {monthly.length > 0 && (
            <div className={`${CARD} p-4 mb-4`}>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Purchased and sold per month (units)</p>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Purchased" fill="#84cc16" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Sold" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className={`${CARD} overflow-hidden`}>
            {data.rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-400">No purchases, sales or returns for this item in the selected period.</div>
            ) : (
              <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 420px)" }}>
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase">
                      {["Date", "Type", "Reference", "Party", "In", "Out", "Rate", "Amount"].map((h, i) => (
                        <th key={h} className={`px-4 py-2.5 font-medium border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 ${i >= 4 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-gray-800 hover:bg-lime-50/40 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-700 dark:text-gray-300">{formatAD(r.date)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_STYLE[r.type] || ""}`}>{r.type}</span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-700 dark:text-gray-300">{shortDocNumber(r.reference, r.date) || "-"}</td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-gray-300">{r.party_name}</td>
                        <td className="px-4 py-2.5 text-right text-green-700 dark:text-green-400">{Number(r.qty_in) > 0 ? `+${qtyFmt(r.qty_in)}` : "-"}</td>
                        <td className="px-4 py-2.5 text-right text-red-600 dark:text-red-400">{Number(r.qty_out) > 0 ? `-${qtyFmt(r.qty_out)}` : "-"}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap text-slate-700 dark:text-gray-300">{rs(r.rate)}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap font-medium text-slate-900 dark:text-white">{rs(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
