import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import { useAuthStore } from "../../store/authStore"

export default function AcceptInvite() {
  const [password,        setPassword]        = useState("")
  const [confirmPassword, setConfirmPassword]  = useState("")
  const [loading,         setLoading]          = useState(false)
  const [checking,        setChecking]         = useState(true)
  const [email,           setEmail]            = useState("")
  const [error,           setError]            = useState("")
  const navigate = useNavigate()
  const setUser  = useAuthStore((s) => s.setUser)

  // Supabase's client (detectSessionInUrl: true by default) picks up the
  // invite-link tokens from the URL automatically and turns them into a
  // real (temporary) session. We just check that a session exists.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setEmail(data.session.user.email)
      } else {
        setError("This invite link is invalid or has expired. Ask the store owner to send a new one.")
      }
      setChecking(false)
    })
  }, [])

  async function handleSetPassword(e) {
    e.preventDefault()
    setError("")

    if (password.length < 8) {
      return setError("Password must be at least 8 characters")
    }
    if (password !== confirmPassword) {
      return setError("Passwords don't match")
    }

    setLoading(true)
    const { data, error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setUser(data.user)
    navigate("/dashboard")
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <span className="text-white font-bold text-xl">R</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">RetailSense Nepal</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {email ? `Welcome, set a password for ${email}` : "Accept your invite"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-8">
          {error && !email ? (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          ) : (
            <form onSubmit={handleSetPassword} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Create a password
                </label>
                <input
                  type="password" required value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Confirm password
                </label>
                <input
                  type="password" required value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition"
                />
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-orange-700
                           text-white rounded-lg text-sm font-medium transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Setting up your account…" : "Set password & continue"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
