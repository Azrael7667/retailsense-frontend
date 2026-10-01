import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom"
import { useState, useRef, useEffect } from "react"
import toast from "react-hot-toast"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { useAuthStore } from "../../store/authStore"
import { useCalendarStore } from "../../store/calendarStore"
import { useStoreStore } from "../../store/storeStore"
import { useStoreId } from "../../hooks/useStoreId"
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck,
  BookOpen, FileText, ShoppingBag, BarChart2,
  Settings, LogOut, Search, Plus, Zap, Brain,
  Bell, CalendarDays, Menu, ChevronDown, ChevronRight, UserCog, TrendingUp,
  Check, X
} from "lucide-react"

const NAV = [
  { label: "Business", items: [
    { to: "/dashboard", label: "Dashboard",          icon: LayoutDashboard },
    { to: "/pos",       label: "POS",                icon: Zap },
    { to: "/inventory", label: "Inventory",          icon: Package },
  ]},
  { label: "Parties", items: [
    { to: "/customers", label: "Customers",          icon: Users },
    { to: "/suppliers", label: "Suppliers",          icon: Truck },
  ]},
  { label: "Transactions", items: [
    { key: "sales", label: "Sales", icon: FileText, children: [
      { to: "/sales",        label: "Sales Invoices" },
      { to: "/payment-in",   label: "Payment In" },
      { to: "/quotations",   label: "Quotations" },
      { to: "/sales-return", label: "Sales Return" },
    ]},
    { key: "purchase", label: "Purchase", icon: ShoppingBag, children: [
      { to: "/purchase",        label: "Purchase" },
      { to: "/payment-out",     label: "Payment Out" },
      { to: "/purchase-return", label: "Purchase Return" },
    ]},
    { to: "/reports",   label: "Reports",            icon: BarChart2 },
  ]},
  { label: "Management", items: [
    { to: "/manage-staff", label: "Manage Staffs",   icon: UserCog },
  ]},
  { label: "Intelligence", items: [
    { to: "/ai",        label: "AI Insights",        icon: Brain },
  ]},
  { label: "System", items: [
    { to: "/settings",  label: "Settings",           icon: Settings },
  ]},
]

const STORE_TYPES = [
  { value: "grocery",     label: "Grocery" },
  { value: "clothing",    label: "Clothing" },
  { value: "electronics", label: "Electronics" },
  { value: "pharmacy",    label: "Pharmacy" },
  { value: "general",     label: "General" },
]

const emptyStoreForm = { store_name: "", store_type: "general", address: "", phone: "", vat_number: "" }

function initials(name) {
  return (name || "?").trim().charAt(0).toUpperCase()
}

export default function Layout() {
  const navigate  = useNavigate()
  const clearUser = useAuthStore((s) => s.clearUser)
  const { calendarType, toggleCalendar } = useCalendarStore()
  const [collapsed, setCollapsed] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const location = useLocation()
  const [openGroups, setOpenGroups] = useState(() => {
    const initial = new Set()
    NAV.forEach(section => section.items.forEach(item => {
      if (item.children && item.children.some(c => location.pathname.startsWith(c.to))) {
        initial.add(item.key)
      }
    }))
    return initial
  })

  // Triggers the /my-stores load into storeStore (same hook every page
  // already uses) — Layout doesn't need its storeId/role return values
  // itself, just needs the fetch to have run.
  useStoreId()

  const stores          = useStoreStore((s) => s.stores)
  const currentStoreId  = useStoreStore((s) => s.currentStoreId)
  const setStores       = useStoreStore((s) => s.setStores)
  const setCurrentStore = useStoreStore((s) => s.setCurrentStore)
  const currentStore = stores.find(s => s.store_id === currentStoreId)

  const [switcherOpen, setSwitcherOpen] = useState(false)
  const switcherRef = useRef(null)

  const [showCreateStore, setShowCreateStore] = useState(false)
  const [storeForm, setStoreForm] = useState(emptyStoreForm)
  const [creatingStore, setCreatingStore] = useState(false)

  useEffect(() => {
    function onClick(e) {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) setSwitcherOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  function toggleGroup(key) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    clearUser()
    navigate("/login")
  }

  function switchStore(storeId, role) {
    setCurrentStore(storeId, role)
    setSwitcherOpen(false)
    // Any detail view (an open invoice modal, a specific customer selected,
    // etc.) belongs to the OLD store's data and won't resolve correctly
    // against the new one — safest to land somewhere neutral.
    navigate("/dashboard")
  }

  function openCreateStore() {
    setSwitcherOpen(false)
    setStoreForm(emptyStoreForm)
    setShowCreateStore(true)
  }

  async function handleCreateStore() {
    if (!storeForm.store_name.trim()) return
    setCreatingStore(true)
    try {
      const { data } = await apiClient.post("/api/auth/create-store", storeForm)
      const newStoreId = data.store_id
      const refreshed = await apiClient.get("/api/auth/my-stores")
      const list = refreshed.data.stores || []
      setStores(list)
      setCurrentStore(newStoreId, "owner")
      setShowCreateStore(false)
      navigate("/dashboard")
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to create store")
    } finally {
      setCreatingStore(false)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* Sidebar — Karobar's exact navy (#0d1726), lime accent for active/highlight states */}
      <aside
        style={{ width: collapsed ? 56 : 248, minWidth: collapsed ? 56 : 248 }}
        className="flex flex-col bg-[#0d1726] border-r border-white/5 transition-all duration-200 overflow-hidden">

        {/* App wordmark row */}
        <div className={`flex items-center h-14 border-b border-white/5 ${collapsed ? "justify-center px-0" : "justify-between px-3.5"}`}>
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-lime-400 flex items-center justify-center shrink-0">
                <TrendingUp size={17} className="text-gray-900" strokeWidth={2.5} />
              </div>
              <span className="text-[18px] font-bold text-white tracking-tight">RetailSense</span>
            </div>
          )}
          <button onClick={() => setCollapsed(c => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors ${collapsed ? "" : "-mr-1"}`}>
            <Menu size={14} />
          </button>
        </div>

        {/* Store switcher row */}
        {!collapsed && (
          <div className="relative border-b border-white/5" ref={switcherRef}>
            <button onClick={() => setSwitcherOpen(!switcherOpen)}
              className="flex items-center gap-2 px-3.5 py-2 w-full hover:bg-white/5 transition-colors">
              <div className="w-7 h-7 rounded-full bg-lime-200 flex items-center justify-center shrink-0">
                <span className="text-gray-900 font-bold text-[12px]">{initials(currentStore?.stores?.name)}</span>
              </div>
              <span className="text-[13px] font-medium text-white truncate flex-1 text-left">
                {currentStore?.stores?.name || "Loading…"}
              </span>
              <ChevronDown size={13} className="text-gray-500 shrink-0" />
            </button>

            {switcherOpen && (
              <div className="absolute top-full left-2 right-2 mt-1 bg-[#141f33] border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="max-h-64 overflow-y-auto py-1">
                  {stores.map(s => (
                    <button key={s.store_id} onClick={() => switchStore(s.store_id, s.role)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-white/5 transition-colors text-left">
                      <div className="w-6 h-6 rounded-full bg-lime-100 flex items-center justify-center shrink-0">
                        <span className="text-gray-900 font-semibold text-[11px]">{initials(s.stores?.name)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-white truncate">{s.stores?.name}</p>
                        <p className="text-[10px] text-gray-500 capitalize">{s.role}{s.is_default ? " · Default" : ""}</p>
                      </div>
                      {s.store_id === currentStoreId && <Check size={14} className="text-lime-400 shrink-0" />}
                    </button>
                  ))}
                </div>
                <button onClick={openCreateStore}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 border-t border-white/10 text-white hover:bg-white/5 transition-colors text-[13px] font-medium">
                  <Plus size={14} className="text-lime-400" /> Create New Profile
                </button>
              </div>
            )}
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center py-2 border-b border-white/5">
            <div className="w-7 h-7 rounded-full bg-lime-200 flex items-center justify-center" title={currentStore?.stores?.name}>
              <span className="text-gray-900 font-bold text-[12px]">{initials(currentStore?.stores?.name)}</span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto no-scrollbar py-2 px-2 space-y-3">
          {NAV.map(group => (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-2 pt-1 pb-0.5 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const Icon = item.icon

                  if (item.children) {
                    const isGroupActive = item.children.some(c => location.pathname.startsWith(c.to))
                    const isOpen = openGroups.has(item.key)
                    return (
                      <div key={item.key}>
                        <button
                          onClick={() => toggleGroup(item.key)}
                          title={collapsed ? item.label : undefined}
                          className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm transition-colors duration-150
                            ${collapsed ? "justify-center" : ""}
                            ${isGroupActive
                              ? "text-white font-semibold"
                              : "text-gray-300 hover:bg-white/5 hover:text-white"
                            }`}>
                          <Icon size={16} className={`shrink-0 ${isGroupActive ? "text-accent-400" : ""}`} />
                          {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                          {!collapsed && (
                            isOpen
                              ? <ChevronDown size={13} className="shrink-0 text-gray-500" />
                              : <ChevronRight size={13} className="shrink-0 text-gray-500" />
                          )}
                        </button>
                        {!collapsed && isOpen && (
                          <div className="ml-6 mt-0.5 space-y-0.5 border-l border-white/5 pl-2">
                            {item.children.map(child => (
                              <NavLink key={child.to} to={child.to}
                                className={({ isActive }) =>
                                  `block px-2.5 py-1.5 rounded-lg text-sm transition-colors duration-150
                                  ${isActive
                                      ? "bg-accent-400 text-gray-900 font-semibold"
                                      : "text-gray-400 hover:bg-white/5 hover:text-white"
                                    }`
                                }>
                                <span className="truncate">{child.label}</span>
                              </NavLink>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }

                  return (
                    <NavLink key={item.to} to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors duration-150
                        ${collapsed ? "justify-center" : ""}
                        ${isActive
                          ? "bg-accent-400 text-gray-900 font-semibold"
                          : "text-gray-300 hover:bg-white/5 hover:text-white"
                        }`
                      }>
                      {({ isActive }) => (
                        <>
                          <Icon size={16} className={`shrink-0 ${isActive ? "text-gray-900" : ""}`} />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-white/5 p-2 space-y-0.5">
          {/* <button onClick={toggleCalendar}
            className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-xs text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors ${collapsed ? "justify-center" : ""}`}>
            <CalendarDays size={15} className="shrink-0" />
            {!collapsed && <span>{calendarType === "BS" ? "BS Calendar" : "AD Calendar"}</span>}
          </button> */}
          <button onClick={handleLogout}
            className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors ${collapsed ? "justify-center" : ""}`}>
            <LogOut size={15} className="shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar — stays light, matches Karobar's light header over dark sidebar */}
        <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 px-5 shrink-0">

          {/* Search — neon lime border + ring on focus */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input placeholder="Search here"
              className="w-full pl-9 pr-12 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 transition focus:outline-none focus:bg-white dark:focus:bg-gray-800 focus:border-lime-500 dark:focus:border-lime-500 focus:ring-2 focus:ring-lime-300 dark:focus:ring-lime-700" />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">
              Ctrl+K
            </kbd>
          </div>

          <div className="flex-1" />

          {/* Buttons */}
          <div className="relative">
            <button onClick={() => setAddMenuOpen(o => !o)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-gray-900 hover:bg-gray-800 text-white rounded-full transition-colors">
              Add New <Plus size={14} />
            </button>
            {addMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAddMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg shadow-lg py-1 z-20">
                  {[
                    { label: "Quick POS", icon: Zap, to: "/pos" },
                    { label: "Add Sales", icon: Plus, to: "/sales/create" },
                    { label: "Add Purchase", icon: Plus, to: "/purchase/create" },
                  ].map(o => (
                    <button key={o.to}
                      onClick={() => { navigate(o.to); setAddMenuOpen(false) }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <o.icon size={13} /> {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />

          <button onClick={toggleCalendar}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
            <CalendarDays size={13} />
            {calendarType}
          </button>

          <button className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
            <Bell size={16} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
          </button>

          <div className="flex items-center gap-2 pl-1 cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-accent-500 flex items-center justify-center">
              <span className="text-black text-[11px] font-bold">SS</span>
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Solomon</span>
            <ChevronDown size={13} className="text-gray-400 dark:text-gray-500" />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Create New Profile modal */}
      {showCreateStore && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreateStore(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Create New Profile</h2>
              <button onClick={() => setShowCreateStore(false)} className="p-1 rounded text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Store name *</label>
                <input autoFocus value={storeForm.store_name}
                  onChange={e => setStoreForm({...storeForm, store_name: e.target.value})}
                  placeholder="e.g. Solomon's Electronics"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Business type</label>
                <select value={storeForm.store_type}
                  onChange={e => setStoreForm({...storeForm, store_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none">
                  {STORE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                  <input value={storeForm.phone}
                    onChange={e => setStoreForm({...storeForm, phone: e.target.value})}
                    placeholder="98XXXXXXXX"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">VAT/PAN No.</label>
                  <input value={storeForm.vat_number}
                    onChange={e => setStoreForm({...storeForm, vat_number: e.target.value})}
                    placeholder="Optional"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                <input value={storeForm.address}
                  onChange={e => setStoreForm({...storeForm, address: e.target.value})}
                  placeholder="e.g. Kathmandu"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => setShowCreateStore(false)}
                className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300">
                Cancel
              </button>
              <button onClick={handleCreateStore} disabled={creatingStore}
                className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50">
                {creatingStore ? "Creating…" : "Create Profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}