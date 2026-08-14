import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { useEffect } from "react"
import { Toaster } from "react-hot-toast"
import { supabase } from "./lib/supabaseClient"
import { useAuthStore } from "./store/authStore"
import { useThemeStore } from "./store/themeStore"
import { useStoreId } from "./hooks/useStoreId"
import ErrorBoundary from "./components/common/ErrorBoundary"
import Login       from "./pages/auth/Login"
import Register    from "./pages/auth/Register"
import AcceptInvite from "./pages/auth/AcceptInvite"
import Layout      from "./components/layout/Layout"
import Dashboard   from "./pages/dashboard/Dashboard"
import Inventory   from "./pages/inventory/Inventory"
import Customers   from "./pages/customers/Customers"
import Suppliers   from "./pages/suppliers/Suppliers"
import POS         from "./pages/pos/POS"
import Sales       from "./pages/sales/Sales"
import PaymentIn   from "./pages/payments/PaymentIn"
import Purchase    from "./pages/purchase/Purchase"
import PnL         from "./pages/pnl/PnL"
import Reports     from "./pages/reports/Reports"
import Settings    from "./pages/settings/Settings"
import AIDashboard from "./pages/ai/AIDashboard"

function ProtectedRoute({ children }) {
  const user = useAuthStore((s) => s.user)
  return user ? children : <Navigate to="/login" replace />
}

// Restricts a route to specific roles. Redirects to /dashboard if the
// logged-in user's role isn't in `allow`. This is a UX layer on top of
// RLS, not a replacement for it — the database policies are what
// actually enforce access if someone bypasses the UI.
function RoleGate({ allow, children }) {
  const { role, loading } = useStoreId()
  if (loading) return null
  if (!allow.includes(role)) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  const setUser = useAuthStore((s) => s.setUser)
  const theme   = useThemeStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000, style: { fontSize: "14px" } }} />
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index               element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"    element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="pos"          element={<ErrorBoundary><POS /></ErrorBoundary>} />
          <Route path="inventory"    element={<ErrorBoundary><Inventory /></ErrorBoundary>} />
          <Route path="customers"    element={<ErrorBoundary><Customers /></ErrorBoundary>} />
          <Route path="suppliers"    element={<ErrorBoundary><Suppliers /></ErrorBoundary>} />
          <Route path="sales"        element={<Sales />} />
          <Route path="payment-in"   element={<PaymentIn />} />
          <Route path="purchase"     element={<ErrorBoundary><Purchase /></ErrorBoundary>} />

          <Route path="pnl" element={
            <RoleGate allow={["owner", "accountant", "auditor"]}>
              <ErrorBoundary><PnL /></ErrorBoundary>
            </RoleGate>
          } />
          <Route path="reports" element={
            <RoleGate allow={["owner", "accountant", "auditor"]}>
              <ErrorBoundary><Reports /></ErrorBoundary>
            </RoleGate>
          } />
          <Route path="settings" element={
            <RoleGate allow={["owner"]}>
              <ErrorBoundary><Settings /></ErrorBoundary>
            </RoleGate>
          } />
          <Route path="settings/:tab" element={
            <RoleGate allow={["owner"]}>
              <ErrorBoundary><Settings /></ErrorBoundary>
            </RoleGate>
          } />
          <Route path="ai" element={
            <RoleGate allow={["owner"]}>
              <ErrorBoundary><AIDashboard /></ErrorBoundary>
            </RoleGate>
          } />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
