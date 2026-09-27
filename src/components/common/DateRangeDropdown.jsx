import { useState, useRef, useEffect } from "react"
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { adToBS, bsToAD, daysInBSMonth, BS_MONTHS } from "../../utils/dateHelpers"

const PRESETS = [
  { label: "All Date",       key: "all" },
  { label: "Today",          key: "today" },
  { label: "Yesterday",      key: "yesterday" },
  { label: "This Week",      key: "week" },
  { label: "This Month",     key: "month" },
  { label: "Last Month",     key: "lastMonth" },
  { label: "This Fiscal Year", key: "fiscalYear" },
  { label: "This Year",      key: "year" },
]

// Local-time ISO formatter — NOT date.toISOString(), which converts to UTC
// first and can shift the date back a day for Nepal's UTC+5:45 offset.
function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function getPresetRange(key) {
  const now = new Date()
  const start = (y, m, d) => new Date(y, m, d)
  switch (key) {
    case "today":
      return { from: toISO(now), to: toISO(now) }
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1)
      return { from: toISO(y), to: toISO(y) }
    }
    case "week": {
      const day = now.getDay() === 0 ? 6 : now.getDay() - 1
      const s = new Date(now); s.setDate(now.getDate() - day)
      return { from: toISO(s), to: toISO(now) }
    }
    case "month":
      return { from: toISO(start(now.getFullYear(), now.getMonth(), 1)), to: toISO(now) }
    case "lastMonth": {
      const s = start(now.getFullYear(), now.getMonth() - 1, 1)
      const e = start(now.getFullYear(), now.getMonth(), 0)
      return { from: toISO(s), to: toISO(e) }
    }
    case "fiscalYear": {
      // Approximation: Nepali FY starts Shrawan 1 (BS) ≈ mid-July (AD).
      const boundary = start(now.getFullYear(), 6, 16)
      const s = now >= boundary ? boundary : start(now.getFullYear() - 1, 6, 16)
      return { from: toISO(s), to: toISO(now) }
    }
    case "year":
      return { from: toISO(start(now.getFullYear(), 0, 1)), to: toISO(now) }
    default:
      return { from: "", to: "" }
  }
}

export default function DateRangeDropdown({ from, to, onApply }) {
  const [open, setOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(from || "")
  const [draftTo, setDraftTo] = useState(to || "")
  const [viewBS, setViewBS] = useState(() => adToBS(new Date()) || { year: 2082, month: 1 })
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  useEffect(() => {
    setDraftFrom(from || "")
    setDraftTo(to || "")
  }, [open]) // eslint-disable-line

  function pickPreset(key) {
    const r = getPresetRange(key)
    setDraftFrom(r.from); setDraftTo(r.to)
    const anchor = r.to || r.from
    if (anchor) {
      const bs = adToBS(anchor)
      if (bs) setViewBS({ year: bs.year, month: bs.month })
    }
  }

  function pickDay(dateStr) {
    if (!draftFrom || (draftFrom && draftTo)) { setDraftFrom(dateStr); setDraftTo("") }
    else if (dateStr < draftFrom) { setDraftFrom(dateStr) }
    else { setDraftTo(dateStr) }
  }

  function prevMonth() {
    setViewBS(v => v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 })
  }
  function nextMonth() {
    setViewBS(v => v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 })
  }

  function apply() { onApply({ from: draftFrom, to: draftTo }); setOpen(false) }
  function cancel() { setOpen(false) }

  const label = from && to
    ? (from === to ? from : `${from} → ${to}`)
    : "All Date"

  const daysInMonth = daysInBSMonth(viewBS.year, viewBS.month)
  const firstDayAD = bsToAD(viewBS.year, viewBS.month, 1)
  const startOffset = firstDayAD ? firstDayAD.getDay() : 0 // 0=Sun..6=Sat

  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 py-2 px-3 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300">
        <Calendar size={13} className="text-gray-400"/>
        <span className="text-gray-700">{label}</span>
        <ChevronDown size={12} className="text-gray-400"/>
      </button>

      {open && (
        <div className="absolute z-20 mt-2 flex bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="w-40 py-2 border-r border-gray-100 shrink-0">
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => pickPreset(p.key)}
                className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                {p.label}
              </button>
            ))}
          </div>

          <div className="p-4 w-[300px]">
            <div className="flex items-center gap-2 mb-3">
              <input value={draftFrom} onChange={e => setDraftFrom(e.target.value)}
                placeholder="YYYY-MM-DD"
                className="flex-1 min-w-0 py-1.5 px-2 text-xs border border-gray-200 rounded-md"/>
              <span className="text-gray-300 shrink-0">→</span>
              <input value={draftTo} onChange={e => setDraftTo(e.target.value)}
                placeholder="YYYY-MM-DD"
                className="flex-1 min-w-0 py-1.5 px-2 text-xs border border-gray-200 rounded-md"/>
            </div>

            <div className="flex items-center justify-between mb-2">
              <button onClick={prevMonth} className="p-1 text-gray-500 hover:text-gray-800"><ChevronLeft size={14}/></button>
              <span className="text-sm font-semibold text-gray-800">
                {BS_MONTHS[viewBS.month - 1]} {viewBS.year}
              </span>
              <button onClick={nextMonth} className="p-1 text-gray-500 hover:text-gray-800"><ChevronRight size={14}/></button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400 mb-1">
              {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={i}/>
                const ad = bsToAD(viewBS.year, viewBS.month, d)
                if (!ad) return <div key={i}/>
                const dateStr = toISO(ad)
                const inRange = draftFrom && draftTo && dateStr >= draftFrom && dateStr <= draftTo
                const isEdge = dateStr === draftFrom || dateStr === draftTo
                return (
                  <button key={i} onClick={() => pickDay(dateStr)}
                    className={`text-xs py-1 rounded-md ${
                      isEdge ? "bg-blue-600 text-white" :
                      inRange ? "bg-blue-50 text-blue-600" :
                      "text-gray-700 hover:bg-gray-100"
                    }`}>
                    {d}
                  </button>
                )
              })}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={cancel} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
              <button onClick={apply} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
