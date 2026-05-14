import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { useEffect } from "react"
import { Toaster } from "react-hot-toast"
import { supabase } from "./lib/supabaseClient"
import { useAuthStore } from "./store/authStore"
import { useThemeStore } from "./store/themeStore"

import Login     from "./pages/auth/Login"
import Register  from "./pages/auth/Register"
import Layout    from "./components/layout/Layout"
import Dashboard from "./pages/dashboard/Dashboard"
import Inventory from "./pages/inventory/Inventory"
import Customers from "./pages/customers/Customers"
import Suppliers from "./pages/suppliers/Suppliers"
import Khata     from "./pages/khata/Khata"
import POS       from "./pages/pos/POS"
import Sales     from "./pages/sales/Sales"
import Purchase  from "./pages/purchase/Purchase"
import PnL       from "./pages/pnl/PnL"
import Reports   from "./pages/reports/Reports"
import Settings  from "./pages/settings/Settings"

function ProtectedRoute({ children }) {
  const user = useAuthStore((s) => s.user)
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  const setUser = useAuthStore((s) => s.setUser)
  const theme   = useThemeStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index              element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"   element={<Dashboard />} />
          <Route path="pos"         element={<POS />} />
          <Route path="inventory"   element={<Inventory />} />
          <Route path="customers"   element={<Customers />} />
          <Route path="suppliers"   element={<Suppliers />} />
          <Route path="khata"       element={<Khata />} />
          <Route path="sales"       element={<Sales />} />
          <Route path="sales/new"   element={<Sales />} />
          <Route path="purchase"    element={<Purchase />} />
          <Route path="purchase/new" element={<Purchase />} />
          <Route path="pnl"         element={<PnL />} />
          <Route path="reports"     element={<Reports />} />
          <Route path="settings"    element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
