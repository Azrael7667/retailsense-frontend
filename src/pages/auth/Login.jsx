import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Mail, Lock, Eye, EyeOff, TrendingUp, Check } from "lucide-react"
import { supabase } from "../../lib/supabaseClient"
import { markLogin } from "../../lib/sessionLimit"
import { useAuthStore } from "../../store/authStore"
import { useStoreStore } from "../../store/storeStore"

const FEATURES = [
  "Fast billing with VAT invoices",
  "Live stock and supplier balances",
  "Reports that print on A4",
]

// Field wrapper: border + neon lime ring light up when the input inside is focused
const FIELD_WRAP =
  "flex items-center gap-2 h-[42px] px-3 rounded-[10px] border bg-white dark:bg-gray-800 " +
  "border-gray-200 dark:border-gray-700 transition " +
  "focus-within:border-lime-500 focus-within:ring-[3px] focus-within:ring-lime-200 " +
  "dark:focus-within:ring-lime-900"

export default function Login() {
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")
  const navigate = useNavigate()
  const setUser  = useAuthStore((s) => s.setUser)
  const clearStores = useStoreStore((s) => s.clearStores)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError("")
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    // Wipe any store list / active store left in localStorage by a previous
    // user on this browser, so it never carries over to this account.
    clearStores()
    setUser(data.user)
    markLogin()
    navigate("/dashboard")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-[5fr_6fr] rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm min-h-[470px]">

        {/* ───────── Left: brand panel (hidden on small screens) ───────── */}
        <div className="hidden md:flex flex-col justify-between bg-[#0d1726] px-8 py-8">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-lime-400 flex items-center justify-center shrink-0">
              <TrendingUp size={20} className="text-slate-900" strokeWidth={2.5} />
            </div>
            <span className="text-[19px] font-bold text-white tracking-tight">RetailSense</span>
          </div>

          <div>
            <h2 className="text-2xl font-semibold leading-snug text-white mb-3">
              Run your whole store from one place
            </h2>
            <p className="text-sm leading-relaxed text-slate-400 mb-6">
              Sales, purchases, stock and reports, built for Nepali retail.
            </p>
            <ul className="space-y-2.5">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-slate-200">
                  <Check size={16} className="text-lime-400 shrink-0" strokeWidth={2.5} />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-slate-500">RetailSense Nepal</p>
        </div>

        {/* ───────── Right: sign-in form ───────── */}
        <div className="bg-white dark:bg-gray-900 px-8 sm:px-10 py-10 flex flex-col justify-center">

          {/* Logo shown only on small screens, where the brand panel is hidden */}
          <div className="md:hidden flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-lg bg-lime-400 flex items-center justify-center shrink-0">
              <TrendingUp size={20} className="text-slate-900" strokeWidth={2.5} />
            </div>
            <span className="text-[19px] font-bold text-slate-900 dark:text-white tracking-tight">RetailSense</span>
          </div>

          <h1 className="text-[22px] font-semibold text-slate-900 dark:text-white">Welcome back</h1>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1 mb-6">Sign in to your store account</p>

          <form onSubmit={handleLogin} className="space-y-[18px]">
            <div>
              <label className="block text-[13px] font-medium text-slate-700 dark:text-gray-300 mb-1.5">
                Email
              </label>
              <div className={FIELD_WRAP}>
                <Mail size={17} className="text-slate-400 shrink-0" />
                <input
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[13px] font-medium text-slate-700 dark:text-gray-300">
                  Password
                </label>
                <a href="#" className="text-[13px] text-lime-700 hover:text-lime-800 dark:text-lime-400 dark:hover:text-lime-300 hover:underline">
                  Forgot password?
                </a>
              </div>
              <div className={FIELD_WRAP}>
                <Lock size={17} className="text-slate-400 shrink-0" />
                <input
                  type={showPw ? "text" : "password"} required value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 transition-colors shrink-0">
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 active:bg-slate-950
                         dark:bg-lime-300 dark:hover:bg-lime-400 dark:text-slate-900
                         text-white rounded-[10px] text-sm font-medium transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 dark:text-gray-400 mt-6">
            New store?{" "}
            <Link to="/register" className="text-lime-700 hover:text-lime-800 dark:text-lime-400 dark:hover:text-lime-300 font-medium hover:underline">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
