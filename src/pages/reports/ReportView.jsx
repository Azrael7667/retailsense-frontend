import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { useParams, useNavigate, Link } from "react-router-dom"
import { ArrowLeft, Download, Printer, Calendar, ChevronDown, Search, ArrowUpDown, Check } from "lucide-react"
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

// Lowercase and strip everything except letters and digits, so searching
// "inv202609011094" matches "INV-20260901-1094" and "20260928" matches "2026-09-28".
function normalize(v) {
  return String(v ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
}

// TODO: replace with your real business name (same source the invoice print uses)
const BUSINESS_NAME = "Bijeta Auto Parts"

// Shared style constants (navy + lime scheme)
const PRIMARY_BTN =
  "bg-slate-900 text-white hover:bg-slate-800 dark:bg-lime-300 dark:text-slate-900 dark:hover:bg-lime-200"
const OUTLINE_BTN =
  "border border-gray-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
const FIELD_FOCUS =
  "focus:outline-none focus:ring-2 focus:ring-lime-200 dark:focus:ring-lime-900 focus:border-lime-500"
const OPTION_ACTIVE =
  "bg-lime-100 dark:bg-gray-800 text-slate-900 dark:text-lime-300 font-semibold"
const OPTION_IDLE = "text-slate-700 dark:text-gray-300"

// ---- Dropdown panel styling (matches the Payment Out dropdown) ----
const PANEL =
  "absolute z-20 mt-2 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg p-1.5"
const PANEL_HEADER =
  "px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"

// Selected option gets lime; other options get a very light gray on hover
function optionClass(active) {
  return (
    "w-full flex items-center justify-between gap-3 px-3 py-2 text-sm rounded-lg text-left transition-colors " +
    (active
      ? OPTION_ACTIVE
      : `${OPTION_IDLE} hover:bg-gray-50 dark:hover:bg-gray-800/60`)
  )
}

// Dropdown trigger button: neon lime box while open or focused
function triggerClass(open) {
  const base =
    "flex items-center gap-2 text-sm px-3.5 py-2 rounded-lg whitespace-nowrap border transition " +
    "bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-300 " +
    "focus:outline-none focus:border-lime-500 dark:focus:border-lime-500 focus:ring-2 focus:ring-lime-300 dark:focus:ring-lime-700"
  const state = open
    ? "border-lime-500 dark:border-lime-500 ring-2 ring-lime-300 dark:ring-lime-700"
    : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
  return `${base} ${state}`
}

function chevronClass(open) {
  return `w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-150 ${open ? "rotate-180" : ""}`
}

const STATUS_STYLES = {
  paid: {
    pill: "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400",
    dot: "bg-green-500",
  },
  partial: {
    pill: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  default: {
    pill: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
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

// ---- Print stylesheet: hides the app, shows only the A4 report sheet ----
const PRINT_CSS = `
  @page { size: A4; margin: 12mm; }

  #report-print-root { display: none; }

  @media print {
    #root { display: none !important; }
    #report-print-root { display: block !important; }
    html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }

  .rp-sheet { font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; font-size: 11px; }
  .rp-bar { border-top: 4px solid #0f172a; margin-bottom: 12px; }
  .rp-head { display: flex; justify-content: space-between; align-items: flex-start; }
  .rp-biz { font-size: 20px; font-weight: 800; line-height: 1.2; }
  .rp-sub { font-size: 10px; color: #475569; margin-top: 3px; }
  .rp-pill { border: 1.5px solid #0f172a; border-radius: 8px; padding: 5px 12px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }

  .rp-info { display: flex; justify-content: space-between; gap: 16px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 14px; margin: 12px 0 14px; }
  .rp-label { font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #475569; margin-bottom: 3px; }
  .rp-info-title { font-size: 14px; font-weight: 700; }
  .rp-info-right { text-align: right; line-height: 1.6; }

  .rp-table { width: 100%; border-collapse: collapse; border: 1px solid #0f172a; }
  .rp-table thead { display: table-header-group; }
  .rp-table tr { break-inside: avoid; page-break-inside: avoid; }
  .rp-table th { padding: 6px 8px; font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #475569; background: #f8fafc; border: 1px solid #0f172a; }
  .rp-table td { padding: 6px 8px; border-left: 1px solid #0f172a; border-right: 1px solid #0f172a; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .rp-table .rp-left { text-align: left; }
  .rp-table .rp-right { text-align: right; }
  .rp-table .rp-bold { font-weight: 700; }
  .rp-table tr.rp-fill { height: 100%; }
  .rp-table tr.rp-fill td { border-bottom: none; padding: 0; height: 100%; }

  .rp-totals { margin: 14px 0 0 auto; width: 270px; border: 1px solid #0f172a; border-radius: 10px; padding: 8px 12px; }
  .rp-totals-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }

  .rp-foot { display: flex; justify-content: space-between; margin-top: 40px; }
  .rp-sign { width: 150px; border-top: 1px solid #0f172a; padding-top: 4px; text-align: center; font-size: 9px; }
`

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
          <Link to="/reports" className="text-gray-400 dark:text-gray-500 hover:text-slate-900 dark:hover:text-gray-300">
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

    // Punctuation-insensitive search: compare only letters and digits
    const q = normalize(search)
    if (q) {
      out = out.filter((r) =>
        columns.some((c) => {
          const raw = r[c.key]
          return normalize(raw).includes(q) || normalize(fmt(raw, c.type)).includes(q)
        })
      )
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
        <button onClick={() => navigate("/reports")} className="mt-4 text-slate-900 dark:text-lime-300 text-sm font-medium hover:underline">← Back to Reports</button>
      </div>
    )
  }

  // ---- Print sheet (only visible when printing) ----
  const rangeLabel = datePresetLabel === "All Date" ? "All dates" : `${startDate} to ${endDate}`
  const generatedOn = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })

  // Always stretch the table to fill the A4 sheet when it fits on one page,
  // including when there are no transactions at all
  const fillPage = filteredRows.length <= 20

  const printSheet = (
    <div id="report-print-root">
      <style>{PRINT_CSS}</style>
      <div className="rp-sheet">
        <div className="rp-bar" />

        <div className="rp-head">
          <div>
            <div className="rp-biz">{BUSINESS_NAME}</div>
            <div className="rp-sub">Generated on {generatedOn}</div>
          </div>
          <div className="rp-pill">Report</div>
        </div>

        <div className="rp-info">
          <div>
            <div className="rp-label">Report</div>
            <div className="rp-info-title">{report.title}</div>
          </div>
          <div className="rp-info-right">
            <div><span className="rp-label">Period: </span>{rangeLabel}</div>
            {hasStatusCol && statusFilter !== "All Status" && (
              <div><span className="rp-label">Status: </span>{statusFilter}</div>
            )}
            {search.trim() && (
              <div><span className="rp-label">Search: </span>{search.trim()}</div>
            )}
          </div>
        </div>

        <table className="rp-table" style={fillPage ? { height: "165mm" } : undefined}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.align === "right" ? "rp-right" : "rp-left"}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`${c.align === "right" ? "rp-right" : "rp-left"} ${c.type === "currency" ? "rp-bold" : ""}`}
                  >
                    {fmt(row[c.key], c.type)}
                  </td>
                ))}
              </tr>
            ))}
            {fillPage && (
              <tr className="rp-fill">
                {columns.map((c) => <td key={c.key} />)}
              </tr>
            )}
          </tbody>
        </table>

        <div className="rp-totals">
          {summaryCards.map((c) => (
            <div key={c.label} className="rp-totals-row">
              <span>{c.label}</span>
              <span>{c.isCount ? `${c.value} Entries` : c.value}</span>
            </div>
          ))}
        </div>

        <div className="rp-foot">
          <div className="rp-sign">Prepared By</div>
          <div className="rp-sign">Authorized Signature</div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link to="/reports" className="text-gray-400 dark:text-gray-500 hover:text-slate-900 dark:hover:text-gray-300">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{report.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg ${OUTLINE_BTN}`}>
              <Printer className="w-4 h-4" /> Print
            </button>
            <button
              onClick={exportCSV}
              disabled={!filteredRows.length}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 ${PRIMARY_BTN}`}
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
              className={`w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${FIELD_FOCUS}`}
            />
          </div>

          {/* Status dropdown */}
          {hasStatusCol && (
            <div className="relative" ref={statusRef}>
              <button
                onClick={() => setStatusOpen((v) => !v)}
                className={`${triggerClass(statusOpen)} min-w-[150px] justify-between`}
              >
                {statusFilter} <ChevronDown className={chevronClass(statusOpen)} />
              </button>
              {statusOpen && (
                <div className={`${PANEL} w-52 left-0`}>
                  <p className={PANEL_HEADER}>Status</p>
                  {statusOptions.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setStatusFilter(s); setStatusOpen(false) }}
                      className={optionClass(statusFilter === s)}
                    >
                      <span>{s}</span>
                      {statusFilter === s && <Check className="w-4 h-4 text-lime-600 dark:text-lime-300" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Date dropdown */}
          <div className="relative" ref={dateRef}>
            <button
              onClick={() => setDateOpen((v) => !v)}
              className={triggerClass(dateOpen)}
            >
              <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              {datePresetLabel}
              <ChevronDown className={chevronClass(dateOpen)} />
            </button>
            {dateOpen && (
              <div className={`${PANEL} w-72 max-w-[calc(100vw-2rem)] left-1/2 -translate-x-1/2`}>
                <p className={PANEL_HEADER}>Date range</p>
                <div className="space-y-0.5 mb-2">
                  {DATE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p)}
                      className={optionClass(datePresetLabel === p.label)}
                    >
                      <span>{p.label}</span>
                      {datePresetLabel === p.label && <Check className="w-4 h-4 text-lime-600 dark:text-lime-300" />}
                    </button>
                  ))}
                </div>
                <div className="border-t border-gray-100 dark:border-gray-800 pt-2 px-1.5">
                  <p className="px-1.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Custom</p>
                  <div className="flex items-center gap-2">
                    <input type="date" value={draftStart} onChange={(e) => setDraftStart(e.target.value)}
                      className={`text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 flex-1 min-w-0 bg-white dark:bg-gray-800 text-slate-900 dark:text-white ${FIELD_FOCUS}`} />
                    <span className="text-gray-400 dark:text-gray-500 text-xs">to</span>
                    <input type="date" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)}
                      className={`text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 flex-1 min-w-0 bg-white dark:bg-gray-800 text-slate-900 dark:text-white ${FIELD_FOCUS}`} />
                  </div>
                  <button onClick={applyCustomRange} className={`w-full mt-2 mb-1 text-sm py-2 rounded-lg font-medium ${PRIMARY_BTN}`}>
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          {report.needsPartyPicker && (
            <select
              value={partyId}
              onChange={(e) => { setPartyId(e.target.value); setTimeout(fetchData, 0) }}
              className={`text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-slate-900 dark:text-white ${FIELD_FOCUS}`}
            >
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {/* Sort dropdown */}
          <div className="relative ml-auto" ref={sortRef}>
            <button
              onClick={() => setSortOpen((v) => !v)}
              className={triggerClass(sortOpen)}
            >
              <ArrowUpDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              Sort By
              <ChevronDown className={chevronClass(sortOpen)} />
            </button>
            {sortOpen && (
              <div className={`${PANEL} w-56 right-0`}>
                <p className={PANEL_HEADER}>Sort by</p>
                {SORT_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSortBy(s); setSortOpen(false) }}
                    className={optionClass(sortBy === s)}
                  >
                    <span>{s}</span>
                    {sortBy === s && <Check className="w-4 h-4 text-lime-600 dark:text-lime-300" />}
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
              <div key={c.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 truncate">{c.label}</p>
                <p className="text-base font-semibold text-slate-900 dark:text-white">{c.isCount ? `${c.value} Entries` : c.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
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
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-800 hover:bg-lime-50/40 dark:hover:bg-gray-800/50 transition-colors">
                      {columns.map((c) => {
                        const statusKey = String(row[c.key] ?? "").toLowerCase()
                        const st = STATUS_STYLES[statusKey] || STATUS_STYLES.default
                        return (
                          <td key={c.key} className={`px-4 py-2.5 ${c.align === "right" ? "text-right" : "text-left"} ${c.key === "status" ? "" : "text-slate-700 dark:text-gray-300"}`}>
                            {c.key === "status" && row[c.key] ? (
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${st.pill}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                {row[c.key]}
                              </span>
                            ) : (
                              fmt(row[c.key], c.type)
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Rendered outside #root so print can hide the whole app and show only this */}
      {createPortal(printSheet, document.body)}
    </>
  )
}