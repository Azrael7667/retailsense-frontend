import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom"
import { useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useAuthStore } from "../../store/authStore"
import { useCalendarStore } from "../../store/calendarStore"
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck,
  BookOpen, FileText, ShoppingBag, BarChart2,
  Settings, LogOut, Search, Plus, Zap, Brain,
  Bell, CalendarDays, Menu, ChevronDown, ChevronRight, UserCog, TrendingUp
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

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* Sidebar — Karobar's exact navy (#0d1726), indigo accent for active/highlight states */}
      <aside
        style={{ width: collapsed ? 56 : 248, minWidth: collapsed ? 56 : 248 }}
        className="flex flex-col bg-[#0d1726] border-r border-white/5 transition-all duration-200 overflow-hidden">

        {/* App wordmark row — flat icon, smaller text, muted collapse toggle */}
        <div className={`flex items-center h-12 border-b border-white/5 ${collapsed ? "justify-center px-0" : "justify-between px-3.5"}`}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-accent-500 flex items-center justify-center shrink-0">
              <TrendingUp size={13} className="text-gray-900" strokeWidth={2.5} />
            </div>
              <span className="text-[11px] font-semibold text-white tracking-tight">RetailSense</span>
            </div>
          )}
          <button onClick={() => setCollapsed(c => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors ${collapsed ? "" : "-mr-1"}`}>
            <Menu size={14} />
          </button>
        </div>

        {/* Store switcher row — flat, no card/pill background, matching
            Karobar's plain avatar+name+chevron row (only bordered top/bottom) */}
        {!collapsed && (
          <button className="flex items-center gap-2 px-3.5 py-2 border-b border-white/5 hover:bg-white/5 transition-colors">
            <div className="w-7 h-7 rounded-full bg-accent-500 flex items-center justify-center shrink-0">
              <span className="text-gray-900 font-bold text-[12px]">B</span>
            </div>
            <span className="text-[14px] font-semibold text-white truncate flex-1 text-left">Bijeta Auto Parts</span>
            <ChevronDown size={13} className="text-gray-500 shrink-0" />
          </button>
        )}
        {collapsed && (
          <div className="flex justify-center py-2 border-b border-white/5">
            <div className="w-7 h-7 rounded-full bg-accent-500 flex items-center justify-center" title="Bijeta Auto Parts">
              <span className="text-gray-900 font-bold text-[12px]">B</span>
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
                              ? "bg-accent-500 text-gray-900 font-semibold"
                              : "text-gray-300 hover:bg-white/5 hover:text-white"
                            }`}>
                          <Icon size={16} className={`shrink-0 ${isGroupActive ? "text-gray-900" : ""}`} />
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
                                    ? "bg-accent-500 text-gray-900 font-semibold"
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
                          ? "bg-white/10 text-white font-semibold"
                          : "text-gray-300 hover:bg-white/5 hover:text-white"
                        }`
                      }>
                      {({ isActive }) => (
                        <>
                          <Icon size={16} className={`shrink-0 ${isActive ? "text-primary-400" : ""}`} />
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

          {/* Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input placeholder="Search here"
              className="w-full pl-9 pr-12 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400" />
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
                    { label: "Add Sales", icon: Plus, to: "/sales" },
                    { label: "Add Purchase", icon: Plus, to: "/purchase" },
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
    </div>
  )
}
