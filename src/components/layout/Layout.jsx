import { Outlet, NavLink, useNavigate } from "react-router-dom"
import { useState } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useAuthStore } from "../../store/authStore"
import { useThemeStore } from "../../store/themeStore"
import { useCalendarStore } from "../../store/calendarStore"
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck,
  BookOpen, FileText, ShoppingBag, TrendingUp, BarChart2,
  Settings, ChevronRight, Sun, Moon, LogOut, Store,
  CalendarDays, Menu, X
} from "lucide-react"

const NAV_GROUPS = [
  {
    label: "Business",
    items: [
      { to: "/dashboard",  label: "Dashboard",         icon: LayoutDashboard },
      { to: "/pos",        label: "POS",               icon: ShoppingCart },
      { to: "/inventory",  label: "Inventory",         icon: Package },
    ],
  },
  {
    label: "Parties",
    items: [
      { to: "/customers",  label: "Customers",         icon: Users },
      { to: "/suppliers",  label: "Suppliers",         icon: Truck },
      { to: "/khata",      label: "Khata / Udharo",    icon: BookOpen },
    ],
  },
  {
    label: "Transactions",
    items: [
      { to: "/sales",      label: "Sales & Invoices",  icon: FileText },
      { to: "/purchase",   label: "Purchase & Expense",icon: ShoppingBag },
      { to: "/pnl",        label: "Profit & Loss",     icon: TrendingUp },
      { to: "/reports",    label: "Reports",           icon: BarChart2 },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/settings",   label: "Settings",          icon: Settings },
    ],
  },
]

export default function Layout() {
  const navigate                         = useNavigate()
  const clearUser                        = useAuthStore((s) => s.clearUser)
  const { theme, toggleTheme }           = useThemeStore()
  const { calendarType, toggleCalendar } = useCalendarStore()
  const [sidebarOpen, setSidebarOpen]    = useState(true)

  async function handleLogout() {
    await supabase.auth.signOut()
    clearUser()
    navigate("/login")
  }

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950 overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className={`
        flex flex-col bg-gray-900 dark:bg-gray-950 text-white
        transition-all duration-200 shrink-0 border-r border-gray-800
        ${sidebarOpen ? "w-56" : "w-16"}
      `}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-800">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shrink-0">
            <Store size={16} className="text-white" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-white leading-tight">RetailSense</p>
              <p className="text-xs text-gray-500 leading-tight">Nepal</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto text-gray-500 hover:text-white transition-colors"
          >
            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {sidebarOpen && (
                <p className="px-4 pb-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={!sidebarOpen ? item.label : undefined}
                    className={({ isActive }) => `
                      flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors
                      ${isActive
                        ? "bg-orange-500 text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white"
                      }
                    `}
                  >
                    <Icon size={17} className="shrink-0" />
                    {sidebarOpen && <span>{item.label}</span>}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Bottom controls */}
        <div className="border-t border-gray-800 p-3 space-y-1">
          <button
            onClick={toggleCalendar}
            title="Toggle calendar"
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <CalendarDays size={17} className="shrink-0" />
            {sidebarOpen && <span>{calendarType === "BS" ? "BS Calendar" : "AD Calendar"}</span>}
          </button>
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            {theme === "light"
              ? <Moon size={17} className="shrink-0" />
              : <Sun  size={17} className="shrink-0" />}
            {sidebarOpen && <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>}
          </button>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-950 hover:text-red-300 transition-colors"
          >
            <LogOut size={17} className="shrink-0" />
            {sidebarOpen && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center gap-3 shrink-0">
          <div className="flex-1" />
          <button
            onClick={() => navigate("/sales")}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add Sale
          </button>
          <button
            onClick={() => navigate("/purchase/new")}
            className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
          >
            + Add Purchase
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
