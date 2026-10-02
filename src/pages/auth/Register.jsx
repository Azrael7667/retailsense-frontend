import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { User, Mail, Lock, Eye, EyeOff, Store, ChevronDown, TrendingUp, Check } from "lucide-react"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { useAuthStore } from "../../store/authStore"
import { useStoreStore } from "../../store/storeStore"

const FEATURES = [
  "Billing, stock and reports in one app",
  "Add staff and control what they see",
  "Print invoices and reports on A4",
]

// Same keys as CATEGORY_PRESETS in the backend (routers/auth.py)
const STORE_TYPES = [
  { value: "grocery",     label: "Grocery" },
  { value: "clothing",    label: "Clothing" },
  { value: "electronics", label: "Electronics" },
  { value: "pharmacy",    label: "Pharmacy" },
  { value: "general",     label: "General" },
]

// Field wrapper: border + neon lime ring light up when the input inside is focused
const FIELD_WRAP =
  "flex items-center gap-2 h-[42px] px-3 rounded-[10px] border bg-white dark:bg-gray-800 " +
  "border-gray-200 dark:border-gray-700 transition " +
  "focus-within:border-lime-500 focus-within:ring-[3px] focus-within:ring-lime-200 " +
  "dark:focus-within:ring-lime-900"

const INPUT =
  "autofill-clean flex-1 min-w-0 bg-transparent text-sm text-slate-900 dark:text-white " +
  "placeholder-slate-400 focus:outline-none"

const LABEL = "block text-[13px] font-medium text-slate-700 dark:text-gray-300 mb-1.5"

export default function Register() {
  const [form, setForm] = useState({
    full_name: "", email: "", password: "",
    store_name: "", store_type: "",
  })
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")
  const navigate = useNavigate()
  const setUser  = useAuthStore((s) => s.setUser)
  const clearStores = useStoreStore((s) => s.clearStores)

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  async function handleRegister(e) {
    e.preventDefault()
    setLoading(true); setError("")
    try {
      // 1. Backend creates the auth user (pre-confirmed), store, owner profile,
      //    store membership and default categories in one go (service role).
      await apiClient.post("/api/auth/register", {
        email:      form.email.trim(),
        password:   form.password,
        full_name:  form.full_name.trim(),
        store_name: form.store_name.trim(),
        store_type: form.store_type || "general",
      })

      // 2. Sign in so the user lands on the dashboard with a session
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email:    form.email.trim(),
        password: form.password,
      })
      if (signInError) throw signInError

      // Drop any store list / active store cached by a previous user on this
      // browser so the new account starts clean.
      clearStores()
      setUser(data.user)
      navigate("/dashboard")
    } catch (err) {
      console.error("Registration error:", err)
      const detail = err?.response?.data?.detail
      setError(
        (typeof detail === "string" && detail) ||
        err.message ||
        "Registration failed"
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-[5fr_6fr] rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm min-h-[560px]">

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
              Set up your store in minutes
            </h2>
            <p className="text-sm leading-relaxed text-slate-400 mb-6">
              RetailSense Nepal is free for small stores.
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

        {/* ───────── Right: sign-up form ───────── */}
        <div className="bg-white dark:bg-gray-900 px-8 sm:px-10 py-8 flex flex-col justify-center">

          {/* Logo shown only on small screens, where the brand panel is hidden */}
          <div className="md:hidden flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-lg bg-lime-400 flex items-center justify-center shrink-0">
              <TrendingUp size={20} className="text-slate-900" strokeWidth={2.5} />
            </div>
            <span className="text-[19px] font-bold text-slate-900 dark:text-white tracking-tight">RetailSense</span>
          </div>

          <h1 className="text-[22px] font-semibold text-slate-900 dark:text-white">Create your store</h1>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1 mb-5">It takes less than a minute</p>

          <form onSubmit={handleRegister} className="space-y-[14px]">
            <div>
              <label className={LABEL}>Your full name</label>
              <div className={FIELD_WRAP}>
                <User size={17} className="text-slate-400 shrink-0" />
                <input name="full_name" type="text" required value={form.full_name} onChange={update}
                  placeholder="Your full name" className={INPUT} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Store name</label>
                <div className={FIELD_WRAP}>
                  <Store size={17} className="text-slate-400 shrink-0" />
                  <input name="store_name" type="text" required value={form.store_name} onChange={update}
                    placeholder="Your store name" className={INPUT} />
                </div>
              </div>
              <div>
                <label className={LABEL}>Type of store</label>
                <div className={FIELD_WRAP}>
                  <select name="store_type" required value={form.store_type} onChange={update}
                    className={`${INPUT} appearance-none cursor-pointer ${form.store_type ? "" : "text-slate-400 dark:text-slate-400"}`}>
                    <option value="" disabled>Select type</option>
                    {STORE_TYPES.map((t) => (
                      <option key={t.value} value={t.value} className="text-slate-900">{t.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="text-slate-400 shrink-0 pointer-events-none" />
                </div>
              </div>
            </div>

            <div>
              <label className={LABEL}>Email</label>
              <div className={FIELD_WRAP}>
                <Mail size={17} className="text-slate-400 shrink-0" />
                <input name="email" type="email" required value={form.email} onChange={update}
                  placeholder="you@example.com" className={INPUT} />
              </div>
            </div>

            <div>
              <label className={LABEL}>Password</label>
              <div className={FIELD_WRAP}>
                <Lock size={17} className="text-slate-400 shrink-0" />
                <input name="password" type={showPw ? "text" : "password"} required minLength={6}
                  value={form.password} onChange={update}
                  placeholder="Minimum 6 characters" className={INPUT} />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 transition-colors shrink-0">
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Use at least 6 characters.</p>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 active:bg-slate-950
                         dark:bg-lime-300 dark:hover:bg-lime-400 dark:text-slate-900
                         text-white rounded-[10px] text-sm font-medium transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Creating your store…" : "Create store and sign in"}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 dark:text-gray-400 mt-5">
            Already have an account?{" "}
            <Link to="/login" className="text-lime-700 hover:text-lime-800 dark:text-lime-400 dark:hover:text-lime-300 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
