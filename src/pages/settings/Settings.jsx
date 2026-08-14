import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import { useThemeStore } from "../../store/themeStore"
import { useCalendarStore } from "../../store/calendarStore"
import api from "../../lib/apiClient"
import { Plus, Trash2, Sun, Moon, CalendarDays, UserPlus, Copy, Check, X, ShieldOff } from "lucide-react"
import toast from "react-hot-toast"

const TABS = ["store", "categories", "preferences", "staff"]

const ROLE_LABELS = {
  owner:      { label: "Owner",      badge: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400" },
  accountant: { label: "Accountant", badge: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400" },
  auditor:    { label: "Auditor",    badge: "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400" },
  staff:      { label: "Staff",      badge: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300" },
}

const emptyInvite = { full_name: "", email: "", role: "staff", phone: "" }

export default function Settings() {
  const { storeId } = useStoreId()
  const { tab: urlTab } = useParams()
  const navigate = useNavigate()
  const { theme, toggleTheme }           = useThemeStore()
  const { calendarType, toggleCalendar } = useCalendarStore()
  const [store,      setStore]      = useState(null)
  const [categories, setCategories] = useState([])
  const [newCat,     setNewCat]     = useState("")
  const [saving,     setSaving]     = useState(false)
  const [tab,        setTab]        = useState(TABS.includes(urlTab) ? urlTab : "store")

  // Staff tab state
  const [staffList,   setStaffList]   = useState([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [inviteForm,  setInviteForm]  = useState(emptyInvite)
  const [inviting,    setInviting]    = useState(false)
  const [copied,      setCopied]      = useState(false)

  useEffect(() => { if (storeId) load() }, [storeId])
  useEffect(() => { if (tab === "staff") loadStaff() }, [tab])

  // Keep tab in sync if the URL param changes externally (e.g. sidebar link)
  useEffect(() => {
    if (TABS.includes(urlTab) && urlTab !== tab) setTab(urlTab)
  }, [urlTab])

  function selectTab(t) {
    setTab(t)
    navigate(`/settings/${t}`, { replace: true })
  }

  async function load() {
    const [s, c] = await Promise.all([
      supabase.from("stores").select("*").eq("id", storeId).single(),
      supabase.from("categories").select("*").eq("store_id", storeId).order("name"),
    ])
    setStore(s.data); setCategories(c.data||[])
  }

  async function saveStore() {
    setSaving(true)
    const { error } = await supabase.from("stores").update({
      name: store.name, store_type: store.store_type,
      owner_name: store.owner_name, phone: store.phone, address: store.address, pan_number: store.pan_number,
    }).eq("id", storeId)
    if (error) toast.error(error.message)
    else toast.success("Store details saved!")
    setSaving(false)
  }

  async function addCategory() {
    if (!newCat.trim()) return
    const { error } = await supabase.from("categories").insert({ store_id: storeId, name: newCat.trim(), is_system: false })
    if (error) toast.error(error.message)
    else { toast.success("Category added"); setNewCat(""); load() }
  }

  async function deleteCategory(id) {
    if (!confirm("Delete this category?")) return
    await supabase.from("categories").delete().eq("id", id)
    toast.success("Category deleted"); load()
  }

  // ---- Staff management ----

  async function loadStaff() {
    setStaffLoading(true)
    try {
      const res = await api.get("/api/auth/staff")
      setStaffList(res.data.staff || [])
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not load staff list")
    } finally {
      setStaffLoading(false)
    }
  }

  async function handleInvite() {
    if (!inviteForm.full_name.trim()) return toast.error("Name is required")
    if (!inviteForm.email.trim())     return toast.error("Email is required")
    setInviting(true)
    try {
      const res = await api.post("/api/auth/invite-staff", {
        email: inviteForm.email.trim(),
        full_name: inviteForm.full_name.trim(),
        role: inviteForm.role,
        phone: inviteForm.phone.trim() || null,
      })
      toast.success(res.data.message)
      setInviteForm(emptyInvite)
      loadStaff()
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not invite staff member")
    } finally {
      setInviting(false)
    }
  }

  async function handleDeactivate(member) {
    if (!confirm(`Deactivate ${member.full_name}? They will no longer be able to log in.`)) return
    try {
      await api.patch(`/api/auth/staff/${member.id}/deactivate`)
      toast.success(`${member.full_name} deactivated`)
      loadStaff()
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not deactivate staff member")
    }
  }

  function copyTempPassword() {
    navigator.clipboard.writeText(lastInvite.temp_password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your store preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => selectTab(t)}
            className={`px-5 py-2 text-sm font-medium rounded-md capitalize transition-colors ${tab===t?"bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm":"text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
            {t === "staff" ? "Staff & Roles" : t}
          </button>
        ))}
      </div>

      {/* Store profile */}
      {tab === "store" && store && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Store profile</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Store name",  key: "name",        type: "text" },
              { label: "Store type",  key: "store_type",  type: "text" },
              { label: "Owner name",  key: "owner_name",  type: "text" },
              { label: "Phone",       key: "phone",       type: "tel"  },
              { label: "PAN number",  key: "pan_number",  type: "text" },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                <input type={f.type} value={store[f.key]||""} onChange={e => setStore({...store, [f.key]: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
              <input value={store.address||""} onChange={e => setStore({...store, address: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button onClick={saveStore} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium disabled:opacity-50">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {/* Categories */}
      {tab === "categories" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Product categories</h2>
          <div className="flex gap-2 mb-4">
            <input value={newCat} onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCategory()}
              placeholder="New category name…"
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={addCategory} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">
              <Plus size={15} /> Add
            </button>
          </div>
          <div className="space-y-2">
            {categories.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-900 dark:text-white">{c.name}</span>
                  {c.is_system && <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded">System</span>}
                </div>
                {!c.is_system && (
                  <button onClick={() => deleteCategory(c.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
            {categories.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No categories yet</p>}
          </div>
        </div>
      )}

      {/* Preferences */}
      {tab === "preferences" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Appearance</h2>
            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                {theme === "light" ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-blue-400" />}
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Theme</p>
                  <p className="text-xs text-gray-400">{theme === "light" ? "Light mode active" : "Dark mode active"}</p>
                </div>
              </div>
              <button onClick={toggleTheme} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors" style={{ background: theme === "dark" ?"#f97316" : "#d1d5db" }}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${theme === "dark" ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <CalendarDays size={18} className="text-green-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Calendar system</p>
                  <p className="text-xs text-gray-400">{calendarType === "BS" ? "Bikram Sambat (Nepali)" : "Anno Domini (English)"}</p>
                </div>
              </div>
              <button onClick={toggleCalendar} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors" style={{ background: calendarType === "BS" ? "#f97316" : "#d1d5db" }}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${calendarType === "BS" ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Currency</h2>
            <p className="text-sm text-gray-500 mb-3">Currency is fixed to Nepali Rupees throughout the application.</p>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
              <span className="text-lg font-bold text-blue-600">Rs</span>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Nepali Rupee (NPR)</p>
                <p className="text-xs text-gray-400">Indian numbering system — lakhs & crores</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Staff & Roles */}
      {tab === "staff" && (
        <div className="space-y-4">

          {/* Invite form */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Invite a team member</h2>
            <p className="text-xs text-gray-400 mb-4">
              They'll get their own login. Choose the role carefully — it controls what they can see and do.
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full name</label>
                <input value={inviteForm.full_name} onChange={e => setInviteForm({...inviteForm, full_name: e.target.value})}
                  placeholder="e.g. Sita Gurung"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input type="email" value={inviteForm.email} onChange={e => setInviteForm({...inviteForm, email: e.target.value})}
                  placeholder="sita@example.com"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone (optional)</label>
                <input value={inviteForm.phone} onChange={e => setInviteForm({...inviteForm, phone: e.target.value})}
                  placeholder="98XXXXXXXX"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <select value={inviteForm.role} onChange={e => setInviteForm({...inviteForm, role: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="staff">Staff — billing & inventory only</option>
                  <option value="accountant">Accountant — full financial access</option>
                  <option value="auditor">Auditor — read-only financial access</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={handleInvite} disabled={inviting}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium disabled:opacity-50">
                <UserPlus size={15} /> {inviting ? "Inviting…" : "Send Invite"}
              </button>
            </div>
          </div>

          {/* Staff list */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Team members <span className="font-normal text-gray-400">({staffList.length})</span>
              </h2>
            </div>
            {staffLoading ? (
              <div className="py-12 text-center">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : staffList.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No team members yet</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {staffList.map(m => {
                  const roleInfo = ROLE_LABELS[m.role] || ROLE_LABELS.staff
                  return (
                    <div key={m.id} className="flex items-center justify-between px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-sm font-bold text-blue-600 dark:text-blue-400">
                          {m.full_name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{m.full_name}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleInfo.badge}`}>
                              {roleInfo.label}
                            </span>
                            {!m.is_active && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400">
                                Deactivated
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{m.email}{m.phone ? ` · ${m.phone}` : ""}</p>
                        </div>
                      </div>
                      {m.role !== "owner" && m.is_active && (
                        <button onClick={() => handleDeactivate(m)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-red-200 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                          <ShieldOff size={13} /> Deactivate
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
