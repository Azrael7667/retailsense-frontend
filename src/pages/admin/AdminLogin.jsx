import { useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { useAdminAuthStore } from "../../store/adminAuthStore"
import { ShieldCheck, Loader2 } from "lucide-react"
import toast from "react-hot-toast"

// Same base URL apiClient.js/adminApiClient.js use — there is no Vite dev
// proxy, so a bare axios.post("/api/...") here would resolve against the
// frontend's own origin (5173) instead of the backend (8081).
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8081"

export default function AdminLogin() {
  const navigate = useNavigate()
  const setAdminAuth = useAdminAuthStore((s) => s.setAdminAuth)

  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim() || !password) return toast.error("Enter your email and password")
    setLoading(true)
    try {
      // Plain axios, NOT the shared Supabase client — this must never touch
      // supabase.auth or it would also log the browser into the regular
      // app as this identity, which has no store_members row at all.
      const loginRes = await axios.post(`${API_BASE}/api/auth/login`, { email: email.trim(), password })
      const token = loginRes.data.access_token
      if (!token) throw new Error("No token returned")

      // Verify this token actually belongs to a platform admin BEFORE
      // storing anything — a valid store-user login that isn't also an
      // admin should be rejected here, not silently let through.
      const meRes = await axios.get(`${API_BASE}/api/platform-admin/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      setAdminAuth(token, meRes.data)
      toast.success(`Welcome, ${meRes.data.full_name || meRes.data.email}`)
      navigate("/admin/dashboard")
    } catch (e) {
      const detail = e?.response?.data?.detail
      if (e?.response?.status === 403) {
        toast.error("This account isn't a platform admin")
      } else if (e?.response?.status === 401) {
        toast.error("Incorrect email or password")
      } else {
        toast.error(detail || "Login failed")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center mb-4">
            <ShieldCheck size={22} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-white">RetailSense Platform Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Internal use only</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              autoFocus
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors">
            {loading ? <Loader2 size={15} className="animate-spin" /> : null}
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}
