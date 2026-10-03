import { useCallback, useEffect, useRef, useState } from "react"
import { Bell, Check, Pencil, Plus, Trash2, X } from "lucide-react"
import api from "../../lib/apiClient"
import { useStoreId } from "../../hooks/useStoreId"

const POLL_MS = 60 * 1000

export function timeAgo(iso, now = Date.now()) {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ""
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`
  const d = Math.round(h / 24)
  if (d < 7) return d === 1 ? "yesterday" : `${d} days ago`
  return new Date(iso).toLocaleDateString("en-NP", { month: "short", day: "numeric" })
}

const ICON = {
  created:  [Plus,   "bg-lime-100 text-lime-700"],
  updated:  [Pencil, "bg-sky-100 text-sky-700"],
  deleted:  [Trash2, "bg-red-100 text-red-600"],
  approved: [Check,  "bg-green-100 text-green-700"],
  rejected: [X,      "bg-gray-200 text-gray-600"],
}

// "Solomon Silwal deleted ..." reads "You deleted ..." for the person's own actions
function wording(it) {
  return it.mine && it.user_name && it.summary.startsWith(it.user_name) ? "You" + it.summary.slice(it.user_name.length) : it.summary
}

export function BellPanel({ items, loading, error, seenAt }) {
  return (
    <div className="absolute right-0 top-full mt-2 w-96 max-w-[90vw] bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <p className="text-sm font-bold text-slate-900 dark:text-white">Activity</p>
        <span className="text-[11px] text-gray-400">Latest changes in this shop</span>
      </div>
      <div className="max-h-[26rem] overflow-y-auto">
        {error ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">{error}</p>
        ) : loading && items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">Loading...</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No activity yet. Deletions, edits and approvals will show up here.</p>
        ) : (
          <ul>
            {items.map((it) => {
              const [Icon, cls] = ICON[it.action] || ICON.updated
              const unread = !it.mine && new Date(it.created_at).getTime() > seenAt
              return (
                <li key={it.id} className={`flex gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800 last:border-0 ${unread ? "bg-lime-50/60 dark:bg-gray-800/60" : ""}`}>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${cls}`}><Icon size={13} /></span>
                  <div className="min-w-0">
                    <p className="text-[13px] text-slate-800 dark:text-gray-200 break-words">{wording(it)}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(it.created_at)}</p>
                  </div>
                  {unread && <span className="ml-auto mt-1 w-2 h-2 rounded-full bg-lime-500 shrink-0" />}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function NotificationBell() {
  const { storeId } = useStoreId()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [seenAt, setSeenAt] = useState(0)
  const boxRef = useRef(null)
  const key = storeId ? `retailsense_activity_seen_${storeId}` : null

  // when the person last looked, kept per shop
  useEffect(() => {
    if (!key) return
    const saved = Number(localStorage.getItem(key))
    if (Number.isFinite(saved) && saved > 0) {
      setSeenAt(saved)
    } else {
      const now = Date.now()                       // first time: only count what happens from now on
      localStorage.setItem(key, String(now))
      setSeenAt(now)
    }
  }, [key])

  const load = useCallback(async () => {
    if (!storeId) return
    try {
      setLoading(true)
      const { data } = await api.get("/api/activity", { params: { limit: 30 } })
      setItems(data.items || [])
      setError("")
    } catch (e) {
      setError(e?.response?.status === 403 ? "You do not have access to this shop's activity." : "Could not load activity.")
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => { setItems([]); load() }, [load])      // on first load and whenever the shop changes
  useEffect(() => {
    const t = setInterval(load, POLL_MS)
    const onFocus = () => load()
    window.addEventListener("focus", onFocus)
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus) }
  }, [load])

  function markRead() {
    if (!key) return
    const now = Date.now()
    localStorage.setItem(key, String(now))
    setSeenAt(now)
  }

  useEffect(() => {
    if (!open) return
    const close = () => { markRead(); setOpen(false) }
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) close() }
    const onKey = (e) => { if (e.key === "Escape") close() }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey) }
  }, [open, key])

  const unread = items.filter((i) => !i.mine && new Date(i.created_at).getTime() > seenAt).length

  function toggle() {
    if (open) { markRead(); setOpen(false) } else { load(); setOpen(true) }
  }

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={toggle} aria-label="Activity"
        className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && <BellPanel items={items} loading={loading} error={error} seenAt={seenAt} />}
    </div>
  )
}
