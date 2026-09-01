import { useEffect, useState } from "react"
import api from "../../lib/apiClient"
import { UserPlus, Trash2, Ban, Mail, Phone, Shield, Users as UsersIcon, X, Info } from "lucide-react"
import toast from "react-hot-toast"

const ROLES = [
  { value: "accountant", label: "Accountant", badge: "bg-blue-50 text-blue-600 border-blue-200", dot: "bg-blue-500" },
  { value: "auditor",    label: "Auditor",    badge: "bg-purple-50 text-purple-600 border-purple-200", dot: "bg-purple-500" },
  { value: "staff",      label: "Staff",      badge: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400" },
]
const roleMeta = (r) => ROLES.find(x => x.value === r) || { label: r, badge: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400" }

const AVATAR_COLORS = ["bg-indigo-500","bg-emerald-500","bg-amber-500","bg-rose-500","bg-sky-500","bg-violet-500"]
function avatarColor(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
function initials(name) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase()
}

const emptyInvite = { email: "", full_name: "", role: "staff", phone: "" }
const BANNER_DISMISS_KEY = "manageStaff.bannerDismissed"

export default function ManageStaff() {
  const [staff,      setStaff]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [form,       setForm]       = useState(emptyInvite)
  const [inviting,   setInviting]   = useState(false)
  const [busyId,     setBusyId]     = useState(null)
  const [showBanner, setShowBanner] = useState(() => !localStorage.getItem(BANNER_DISMISS_KEY))
  const [mounted,    setMounted]    = useState(false)

  useEffect(() => { load(); setMounted(true) }, [])

  function dismissBanner() {
    setShowBanner(false)
    localStorage.setItem(BANNER_DISMISS_KEY, "1")
  }

  async function load() {
    setLoading(true)
    try {
      const res = await api.get("/api/auth/staff")
      setStaff(res.data.staff || [])
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not load staff")
    } finally {
      setLoading(false)
    }
  }

  async function sendInvite() {
    if (!form.email.trim() || !form.full_name.trim()) {
      return toast.error("Name and email are required")
    }
    setInviting(true)
    try {
      const res = await api.post("/api/auth/invite-staff", {
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        role: form.role,
        phone: form.phone.trim() || null,
      })
      toast.success(res.data.message || "Invite sent")
      setShowModal(false)
      setForm(emptyInvite)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not send invite")
    } finally {
      setInviting(false)
    }
  }

  async function deactivate(member) {
    if (!confirm(`Deactivate ${member.full_name}? They will no longer be able to sign in. This can't be undone from here — you'd need to send a fresh invite to bring them back.`)) return
    setBusyId(member.id)
    try {
      await api.patch(`/api/auth/staff/${member.id}/deactivate`)
      toast.success(`${member.full_name} deactivated`)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not deactivate")
    } finally {
      setBusyId(null)
    }
  }

  async function remove(member) {
    if (!confirm(`Permanently delete ${member.full_name}? This removes their login entirely and can't be undone.`)) return
    setBusyId(member.id)
    try {
      const res = await api.delete(`/api/auth/staff/${member.id}`)
      toast.success(res.data.message || "Staff member deleted")
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not delete")
    } finally {
      setBusyId(null)
    }
  }

  const activeCount = staff.filter(s => s.is_active).length

  return (
    <div className="p-6">
      <style>{`
        @keyframes cardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rowIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Manage Staffs <span className="text-gray-300 dark:text-gray-600 font-medium">({staff.length})</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Invite team members and control who has access to your store</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.97] text-white text-sm font-semibold rounded-lg shadow-sm transition-all duration-150">
          <UserPlus size={15} /> Add New Staff
        </button>
      </div>

      {/* Info banner */}
      {showBanner && (
        <div
          className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-white dark:from-indigo-950/30 dark:via-gray-900 dark:to-gray-900 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl p-6 mb-5"
          style={{ animation: mounted ? "cardIn 0.35s ease-out both" : "none" }}>
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-lg">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                  <UsersIcon size={14} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Multi Users</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Add your business staff to manage your store together. Each person gets their own login and a role that controls what they can see and do.
              </p>
              <button onClick={dismissBanner}
                className="text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-3 transition-colors">
                Close
              </button>
            </div>
            <div className="hidden sm:flex items-center justify-center w-16 h-16 rounded-2xl bg-white/60 dark:bg-white/5 shrink-0">
              <UsersIcon size={28} className="text-indigo-300 dark:text-indigo-700" />
            </div>
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="flex items-center gap-3 mb-5">
        {[
          { label: "Total staff", value: staff.length, tone: "text-gray-900 dark:text-white" },
          { label: "Active",      value: activeCount, tone: "text-emerald-600" },
          { label: "Deactivated", value: staff.length - activeCount, tone: "text-gray-400" },
        ].map((s, i) => (
          <div key={s.label}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 min-w-[110px]"
            style={{ animation: mounted ? `cardIn 0.35s ease-out ${i * 50 + 60}ms both` : "none" }}>
            <p className="text-[11px] text-gray-400 font-medium mb-0.5">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"
        style={{ animation: mounted ? "cardIn 0.35s ease-out 120ms both" : "none" }}>
        <table className="w-full text-sm">
          <thead className="bg-gray-50/80 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
            <tr>
              {["Staff Name","Contact","Role","Status","Joined Date",""].map(h => (
                <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/70">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-16">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </td></tr>
            ) : staff.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-16">
                <UsersIcon size={38} className="mx-auto text-gray-200 dark:text-gray-700 mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No staff members yet</p>
                <p className="text-gray-300 dark:text-gray-600 text-xs mt-1">Invite your first team member to get started</p>
              </td></tr>
            ) : staff.map((m, i) => {
              const rMeta = roleMeta(m.role)
              const isOwner = m.role === "owner"
              return (
                <tr key={m.id}
                  className={`hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors ${!m.is_active ? "opacity-50" : ""}`}
                  style={{ animation: mounted ? `rowIn 0.3s ease-out ${i * 35}ms both` : "none" }}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${avatarColor(m.full_name)} flex items-center justify-center shrink-0`}>
                        <span className="text-white text-xs font-bold">{initials(m.full_name)}</span>
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-white">{m.full_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1.5 text-xs"><Mail size={12} className="shrink-0"/> {m.email}</div>
                    {m.phone && <div className="flex items-center gap-1.5 mt-1 text-xs"><Phone size={12} className="shrink-0"/> {m.phone}</div>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${isOwner ? "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950 dark:border-indigo-900" : rMeta.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isOwner ? "bg-indigo-500" : rMeta.dot}`} />
                      {isOwner ? "Owner" : rMeta.label}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${m.is_active ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800"}`}>
                      {m.is_active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 text-xs">
                    {m.created_at ? new Date(m.created_at).toLocaleDateString("en-NP", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    {isOwner ? (
                      <Shield size={14} className="text-gray-300 dark:text-gray-600 ml-auto" />
                    ) : (
                      <div className="flex items-center gap-1 justify-end">
                        {m.is_active && (
                          <button onClick={() => deactivate(m)} disabled={busyId === m.id}
                            title="Deactivate"
                            className="p-1.5 rounded-md hover:bg-amber-50 dark:hover:bg-amber-950/40 text-gray-400 hover:text-amber-600 active:scale-90 transition-all duration-150 disabled:opacity-40">
                            <Ban size={14} />
                          </button>
                        )}
                        <button onClick={() => remove(m)} disabled={busyId === m.id}
                          title="Delete permanently"
                          className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-gray-400 hover:text-red-500 active:scale-90 transition-all duration-150 disabled:opacity-40">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setShowModal(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-800"
            style={{ animation: "cardIn 0.2s ease-out both" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                  <UserPlus size={15} className="text-blue-600" />
                </div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Invite Staff Member</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full name *</label>
                <input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})}
                  placeholder="e.g. Kiran Shrestha"
                  className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone</label>
                <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                  placeholder="Optional"
                  className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Role *</label>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map(r => (
                    <button key={r.value} type="button"
                      onClick={() => setForm({...form, role: r.value})}
                      className={`px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-150 ${
                        form.role === r.value
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/50"
                          : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-2 bg-blue-50/60 dark:bg-blue-950/20 rounded-lg px-3 py-2.5">
                <Info size={13} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  They'll receive an email with a link to set their own password and sign in.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
              <button onClick={sendInvite} disabled={inviting}
                className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 active:scale-[0.97] text-white rounded-xl font-semibold disabled:opacity-50 transition-all duration-150">
                {inviting ? "Sending…" : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
