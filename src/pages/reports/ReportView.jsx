import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { ArrowLeft, Download, Printer, Calendar, ChevronDown, Search, ArrowUpDown } from "lucide-react"
import api from "../../lib/apiClient"
import { REPORTS, REPORT_COLUMNS } from "../../config/reportsConfig"
import PnL from "../pnl/PnL"

function fmt(val, type) {
  if (val === null || val === undefined || val === "") return "-"
  if (type === "currency") return `Rs. ${Number(val).toLocaleString("en-IN")}`
  return val
}

function toISO(d) {
  return d.toISOString().slice(0, 10)
}

const DATE_PRESETS = [
  { label: "All Date", get: () => null },
  { label: "Today", get: () => { const d = new Date(); return [toISO(d), toISO(d)] } },
  { label: "Yesterday", get: () => { const d = new Date(Date.now() - 86400000); return [toISO(d), toISO(d)] } },
  { label: "This Week", get: () => { const d = new Date(); const day = d.getDay(); const start = new Date(d); start.setDate(d.getDate() - day); return [toISO(start), toISO(d)] } },
  { label: "This Month", get: () => { const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth(), 1); return [toISO(start), toISO(d)] } },
  { label: "Last Month", get: () => { const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth() - 1, 1); const end = new Date(d.getFullYear(), d.getMonth(), 0); return [toISO(start), toISO(end)] } },
  { label: "This Year", get: () => { const d = new Date(); const start = new Date(d.getFullYear(), 0, 1); return [toISO(start), toISO(d)] } },
]

const SORT_OPTIONS = ["Latest", "Oldest", "Amount: Low to High", "Amount: High to Low"]

export default function ReportView() {
  const { key } = useParams()
  const navigate = useNavigate()
  const report = REPORTS.find((r) => r.key === key)

  // Profit & Loss has its own rich UI (period picker, summary cards, item-wise
  // tab) that doesn't fit the generic column-table below — render it directly
  // instead of trying to force it through REPORT_COLUMNS.
  if (report?.key === "profit-loss") {
    return (
      <div>
        <div className="px-6 pt-6 flex items-center gap-3">
          <Link to="/reports" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </div>
        <PnL />
      </div>
    )
  }

  const columns = REPORT_COLUMNS[key] || []
  const currencyCols = useMemo(() => columns.filter((c) => c.type === "currency").slice(0, 3), [columns])
  const hasStatusCol = columns.some((c) => c.key === "status")
  const hasDateCol = columns.some((c) => c.key === "date")

  const today = new Date().toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const [startDate, setStartDate] = useState(monthAgo)
  const [endDate, setEndDate] = useState(today)
  const [datePresetLabel, setDatePresetLabel] = useState("Last 30 Days")
  const [dateOpen, setDateOpen] = useState(false)
  const [draftStart, setDraftStart] = useState(monthAgo)
  const [draftEnd, setDraftEnd] = useState(today)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("All Status")
  const [statusOpen, setStatusOpen] = useState(false)
  const [sortBy, setSortBy] = useState("Latest")
  const [sortOpen, setSortOpen] = useState(false)

  const [parties, setParties] = useState([])
  const [partyId, setPartyId] = useState("")

  const dateRef = useRef(null)
  const statusRef = useRef(null)
  const sortRef = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (dateRef.current && !dateRef.current.contains(e.target)) setDateOpen(false)
      if (statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false)
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  useEffect(() => {
    if (report?.needsPartyPicker) {
      api.get("/api/customers").then((res) => {
        const list = res.data?.customers || res.data || []
        setParties(list)
        if (list.length && !partyId) setPartyId(list[0].id)
      }).catch(() => setParties([]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.needsPartyPicker])

  const fetchData = useCallback(async () => {
    if (report?.needsPartyPicker && !partyId) return
    setLoading(true)
    setError(null)
    try {
      const params = { start_date: startDate, end_date: endDate }
      if (report?.needsPartyPicker) params.party_id = partyId
      const res = await api.get(`/api/reports/${key}`, { params })
      setRows(res.data.rows || res.data || [])
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load report")
    } finally {
      setLoading(false)
    }
  }, [key, startDate, endDate, partyId, report])

  useEffect(() => {
    if (report?.supported) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report])

  function applyPreset(preset) {
    const range = preset.get()
    if (range) {
      setStartDate(range[0]); setEndDate(range[1])
      setDraftStart(range[0]); setDraftEnd(range[1])
    }
    setDatePresetLabel(preset.label)
    setDateOpen(false)
    setTimeout(fetchData, 0)
  }

  function applyCustomRange() {
    setStartDate(draftStart); setEndDate(draftEnd)
    setDatePresetLabel("Custom Range")
    setDateOpen(false)
    setTimeout(fetchData, 0)
  }

  const statusOptions = useMemo(() => {
    if (!hasStatusCol) return []
    const set = new Set(rows.map((r) => r.status).filter(Boolean))
    return ["All Status", ...Array.from(set)]
  }, [rows, hasStatusCol])

  const filteredRows = useMemo(() => {
    let out = [...rows]
    if (statusFilter !== "All Status") {
      out = out.filter((r) => (r.status || "").toLowerCase() === statusFilter.toLowerCase())
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter((r) => columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q)))
    }
    const primaryCurrencyKey = currencyCols[0]?.key
    if (sortBy === "Oldest" && hasDateCol) {
      out.sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    } else if (sortBy === "Latest" && hasDateCol) {
      out.sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    } else if (sortBy === "Amount: Low to High" && primaryCurrencyKey) {
      out.sort((a, b) => (a[primaryCurrencyKey] || 0) - (b[primaryCurrencyKey] || 0))
    } else if (sortBy === "Amount: High to Low" && primaryCurrencyKey) {
      out.sort((a, b) => (b[primaryCurrencyKey] || 0) - (a[primaryCurrencyKey] || 0))
    }
    return out
  }, [rows, statusFilter, search, sortBy, columns, currencyCols, hasDateCol])

  const summaryCards = useMemo(() => {
    const cards = [{ label: `Total ${report?.title || "Entries"}`, value: filteredRows.length.toLocaleString("en-IN"), isCount: true }]
    currencyCols.forEach((c) => {
      const sum = filteredRows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0)
      cards.push({ label: c.label, value: fmt(sum, "currency") })
    })
    return cards
  }, [filteredRows, currencyCols, report])

  const exportCSV = () => {
    if (!filteredRows.length) return
    const header = columns.map((c) => c.label).join(",")
    const body = filteredRows.map((r) => columns.map((c) => `"${r[c.key] ?? ""}"`).join(",")).join("\n")
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${key}-${startDate}-to-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!report) return <div className="p-6 dark:text-white">Report not found.</div>

  if (!report.supported) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center mt-20">
        <p className="text-gray-500 dark:text-gray-400">"{report.title}" isn't available yet — it needs a backend data model we haven't built.</p>
        <button onClick={() => navigate("/reports")} className="mt-4 text-blue-600 dark:text-blue-400 text-sm">← Back to Reports</button>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link to="/reports" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{report.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            onClick={exportCSV}
            disabled={!filteredRows.length}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>

        {hasStatusCol && (
          <div className="relative" ref={statusRef}>
            <button
              onClick={() => setStatusOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-nowrap"
            >
              {statusFilter} <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            </button>
            {statusOpen && (
              <div className="absolute z-20 mt-1 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg py-1">
                {statusOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s); setStatusOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${statusFilter === s ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="relative" ref={dateRef}>
          <button
            onClick={() => setDateOpen((v) => !v)}
            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-nowrap"
          >
            <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" /> {datePresetLabel}
          </button>
          {dateOpen && (
            <div className="absolute z-20 mt-1 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg p-3 right-0">
              <div className="space-y-0.5 mb-3">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800 pt-3 flex items-center gap-2">
                <input type="date" value={draftStart} onChange={(e) => setDraftStart(e.target.value)}
                  className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                <span className="text-gray-400 dark:text-gray-500 text-xs">to</span>
                <input type="date" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)}
                  className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <button onClick={applyCustomRange} className="w-full mt-2 text-sm py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Apply
              </button>
            </div>
          )}
        </div>

        {report.needsPartyPicker && (
          <select
            value={partyId}
            onChange={(e) => { setPartyId(e.target.value); setTimeout(fetchData, 0) }}
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {parties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        <div className="relative ml-auto" ref={sortRef}>
          <button
            onClick={() => setSortOpen((v) => !v)}
            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-nowrap"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" /> Sort By
          </button>
          {sortOpen && (
            <div className="absolute z-20 mt-1 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg py-1 right-0">
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setSortBy(s); setSortOpen(false) }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${sortBy === s ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {!loading && !error && rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {summaryCards.map((c) => (
            <div key={c.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 truncate">{c.label}</p>
              <p className="text-base font-semibold text-gray-900 dark:text-white">{c.isCount ? `${c.value} Entries` : c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
        ) : error ? (
          <div className="p-10 text-center text-red-500 dark:text-red-400 text-sm">{error}</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center text-gray-400 dark:text-gray-500 text-sm">No data for this range.</div>
        ) : (
          <div className="overflow-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 380px)" }}>
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase">
                  {columns.map((c) => (
                    <th key={c.key} className={`px-4 py-2.5 font-medium border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 ${c.align === "right" ? "text-right" : "text-left"}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/70 dark:hover:bg-gray-800/50 transition-colors">
                    {columns.map((c) => (
                      <td key={c.key} className={`px-4 py-2.5 ${c.align === "right" ? "text-right" : "text-left"} ${c.key === "status" ? "" : "text-gray-700 dark:text-gray-300"}`}>
                        {c.key === "status" && row[c.key] ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            String(row[c.key]).toLowerCase() === "paid"
                              ? "bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400"
                              : String(row[c.key]).toLowerCase() === "partial"
                              ? "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400"
                              : "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"
                          }`}>
                            {row[c.key]}
                          </span>
                        ) : (
                          fmt(row[c.key], c.type)
                        )}
                      </td>
                    ))}
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
