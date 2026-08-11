import { Outlet, NavLink, useNavigate } from "react-router-dom"
import { useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useAuthStore } from "../../store/authStore"
import { useCalendarStore } from "../../store/calendarStore"
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck,
  BookOpen, FileText, ShoppingBag, TrendingUp, BarChart2,
  Settings, LogOut, Search, Plus, Zap, Brain,
  Bell, CalendarDays, Menu, ChevronDown
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
    { to: "/sales",     label: "Sales & Invoices",   icon: FileText },
    { to: "/payment-in", label: "Payment In",         icon: BookOpen },
    { to: "/purchase",  label: "Purchase & Expense", icon: ShoppingBag },
    { to: "/pnl",       label: "Profit & Loss",      icon: TrendingUp },
    { to: "/reports",   label: "Reports",            icon: BarChart2 },
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

  async function handleLogout() {
    await supabase.auth.signOut()
    clearUser()
    navigate("/login")
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* Sidebar */}
      <aside
        style={{ width: collapsed ? 52 : 220, minWidth: collapsed ? 52 : 220 }}
        className="flex flex-col bg-white border-r border-gray-200 transition-all duration-200 overflow-hidden">

        {/* Store header */}
        <div className="flex items-center gap-2.5 px-3 py-3 border-b border-gray-100 h-14">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs">BA</span>
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">Bijeta Auto Parts</p>
              <p className="text-xs text-gray-400 truncate">Solomon Silwal</p>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)}
            className="shrink-0 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <Menu size={14} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto no-scrollbar py-2 px-2 space-y-3">
          {NAV.map(group => (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-2 pt-1 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const Icon = item.icon
                  return (
                    <NavLink key={item.to} to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors
                        ${collapsed ? "justify-center" : ""}
                        ${isActive
                          ? "bg-blue-600 text-white"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        }`
                      }>
                      <Icon size={16} className="shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-gray-100 p-2 space-y-0.5">
          <button onClick={toggleCalendar}
            className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors ${collapsed ? "justify-center" : ""}`}>
            <CalendarDays size={15} className="shrink-0" />
            {!collapsed && <span>{calendarType === "BS" ? "BS Calendar" : "AD Calendar"}</span>}
          </button>
          <button onClick={handleLogout}
            className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-xs text-red-500 hover:bg-red-50 transition-colors ${collapsed ? "justify-center" : ""}`}>
            <LogOut size={15} className="shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center gap-3 px-5 shrink-0">

          {/* Search */}
          <div className="relative max-w-xs flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input placeholder="Search or create anything…"
              className="w-full pl-9 pr-12 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded font-mono">
              Ctrl+K
            </kbd>
          </div>

          <div className="flex-1" />

          {/* Buttons */}
          <button onClick={() => navigate("/pos")}
            className="btn-sm btn-outline">
            <Zap size={13} /> Quick POS
          </button>
          <button onClick={() => navigate("/sales")}
            className="btn-sm btn-primary">
            <Plus size={13} /> Add Sales
          </button>
          <button onClick={() => navigate("/purchase")}
            className="btn-sm btn-outline">
            <Plus size={13} /> Add Purchase
          </button>

          <div className="w-px h-5 bg-gray-200" />

          <button onClick={toggleCalendar}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            <CalendarDays size={13} />
            {calendarType}
          </button>

          <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <Bell size={16} />
          </button>

          <div className="flex items-center gap-2 pl-1 cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white text-[11px] font-bold">SS</span>
            </div>
            <span className="text-sm font-medium text-gray-700">Solomon</span>
            <ChevronDown size={13} className="text-gray-400" />
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
