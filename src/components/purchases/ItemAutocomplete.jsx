import { useState, useRef, useEffect } from "react"
import { Plus, Search } from "lucide-react"

export default function ItemAutocomplete({ products, value, displayName, onPick, onCreateNew, bare = false }) {
  const [query, setQuery] = useState(displayName || "")
  const [open,  setOpen]  = useState(false)
  const ref = useRef(null)

  useEffect(() => { setQuery(displayName || "") }, [displayName])

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const q = query.trim().toLowerCase()
  const matches = q
    ? products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8)
    : products.slice(0, 8)
  const exactMatch = products.some(p => p.name.toLowerCase() === q)

  return (
    <div className="relative" ref={ref}>
      {bare ? (
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Type item name…"
          className="w-full px-1.5 py-1.5 border-0 bg-transparent text-gray-900 dark:text-white text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:bg-white dark:focus:bg-gray-800 transition-all"
        />
      ) : (
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="Type item name…"
            className="w-full pl-7 pr-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
          />
        </div>
      )}

      {open && (
        <div className="absolute z-40 mt-1 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-52 overflow-y-auto">
            {matches.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400 text-center">No matching items</p>
            ) : matches.map(p => (
              <button key={p.id} type="button"
                onClick={() => { onPick(p); setQuery(p.name); setOpen(false) }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-50 dark:border-gray-800 last:border-b-0">
                <span className="text-gray-900 dark:text-white truncate">{p.name}</span>
                <span className="text-xs text-gray-400 shrink-0">{p.stock_quantity ?? 0} {p.unit}</span>
              </button>
            ))}
          </div>
          {q && !exactMatch && (
            <button type="button"
              onClick={() => { onCreateNew(query.trim()); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 border-t border-gray-100 dark:border-gray-800 transition-colors">
              <Plus size={13} /> Add new item "{query.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}
