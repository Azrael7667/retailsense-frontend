import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import axios from "axios"
import { useAdminAuthStore } from "../../store/adminAuthStore"
import { ShieldCheck, TrendingUp, Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react"
import toast from "react-hot-toast"

// Same base URL apiClient.js/adminApiClient.js use — there is no Vite dev
// proxy, so a bare axios.post("/api/...") here would resolve against the
// frontend's own origin (5173) instead of the backend (8081).
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8081"

// Underline-style field: the line turns indigo and the label brightens while the input is focused
const FIELD =
  "group flex items-end gap-2 border-b-2 border-gray-700 focus-within:border-indigo-500 " +
  "pt-2.5 pb-2 transition-colors"
const FIELD_LABEL =
  "block text-xs text-gray-500 group-focus-within:text-indigo-400 mb-1 transition-colors"
const FIELD_INPUT =
  "admin-autofill w-full bg-transparent text-sm text-gray-100 placeholder-gray-600 outline-none"

export default function AdminLogin() {
  const navigate = useNavigate()
  const setAdminAuth = useAdminAuthStore((s) => s.setAdminAuth)

  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw]     = useState(false)
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
    <div className="min-h-screen flex items-center justify-center bg-white px-4 py-8">

      {/* Browser autofill paints a light patch behind saved logins; repaint it to the card color */}
      <style>{`
        .admin-autofill:-webkit-autofill,
        .admin-autofill:-webkit-autofill:hover,
        .admin-autofill:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #111827 inset !important;
          -webkit-text-fill-color: #f3f4f6 !important;
          caret-color: #f3f4f6;
          transition: background-color 9999s ease-out 0s;
        }
      `}</style>

      {/* Card: same size and 5:6 split as the store login */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-[5fr_6fr] rounded-2xl overflow-hidden border border-gray-200 shadow-sm min-h-[470px]">

        {/* ───────── Left: greeting panel (hidden on small screens) ───────── */}
        <div className="hidden md:flex relative flex-col justify-between bg-indigo-800 px-8 py-8 overflow-hidden">
          {/* Decorative curved lines */}
          <svg viewBox="0 0 400 520" preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
            <path d="M-20 420 Q 120 120 330 40"  fill="none" stroke="#4338ca" strokeWidth="1.2" />
            <path d="M-20 470 Q 140 170 360 70"  fill="none" stroke="#4338ca" strokeWidth="1.2" />
            <path d="M-20 520 Q 160 220 390 100" fill="none" stroke="#4338ca" strokeWidth="1.2" />
            <path d="M20 560 Q 190 270 420 130"  fill="none" stroke="#4338ca" strokeWidth="1.2" />
            <path d="M70 600 Q 230 320 450 160"  fill="none" stroke="#4338ca" strokeWidth="1.2" />
          </svg>

          <div className="relative w-11 h-11 rounded-xl bg-white flex items-center justify-center">
            <ShieldCheck size={26} className="text-indigo-800" />
          </div>

          <div className="relative">
            <h2 className="text-4xl leading-tight font-semibold text-white tracking-tight mb-4 whitespace-nowrap">
              Hello, Admin !
            </h2>
            <p className="text-[15px] leading-relaxed text-indigo-200 max-w-xs">
              Manage stores, users and the whole RetailSense platform from one place.
            </p>
          </div>

          <p className="relative text-xs text-indigo-300">RetailSense. Internal use only.</p>
        </div>

        {/* ───────── Right: sign-in form ───────── */}
        <div className="bg-gray-900 flex flex-col justify-between px-8 sm:px-10 py-8">

          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-indigo-400" />
            <span className="text-base font-semibold text-gray-50">RetailSense</span>
          </div>

          <div className="w-full py-6">
            {/* Small screens: the greeting panel is hidden, so show a compact greeting here */}
            <div className="md:hidden flex items-center gap-2.5 mb-6">
              <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
                <ShieldCheck size={20} className="text-white" />
              </div>
              <span className="text-sm text-gray-400">Hello, Admin !</span>
            </div>

            <h1 className="text-2xl font-semibold text-gray-50 mb-1.5">Welcome back</h1>
            <p className="text-[13px] leading-relaxed text-gray-400 mb-6">
              Sign in with your platform admin account.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className={FIELD}>
                <div className="flex-1 min-w-0">
                  <label className={FIELD_LABEL}>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    autoFocus placeholder="admin@retailsense.com" className={FIELD_INPUT} />
                </div>
              </div>

              <div className={FIELD}>
                <div className="flex-1 min-w-0">
                  <label className={FIELD_LABEL}>Password</label>
                  <input type={showPw ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" className={FIELD_INPUT} />
                </div>
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 pb-0.5">
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>

              <button type="submit" disabled={loading}
                className="w-full h-11 mt-2 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700
                           disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium
                           rounded-[10px] transition-colors">
                {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>

          <p className="text-[13px] text-gray-500 text-center md:text-left">
            Not an admin?{" "}
            <Link to="/login" className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200 font-medium underline underline-offset-2">
              <ArrowLeft size={13} /> Go to store login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}