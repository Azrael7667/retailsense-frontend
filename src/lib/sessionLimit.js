import toast from "react-hot-toast"
import { supabase } from "./supabaseClient"

// Ask for a new login 24 hours after the person signed in.
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const KEY = "retailsense_login_at"

// When this login started, read from the token's amr claim (earliest entry). null if the token has none.
function tokenLoginTime(accessToken) {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    const stamps = (payload.amr || [])
      .map((a) => (a && typeof a === "object" ? Number(a.timestamp) : NaN))
      .filter((n) => Number.isFinite(n) && n > 0)
    return stamps.length ? Math.min(...stamps) * 1000 : null
  } catch {
    return null
  }
}

export function markLogin() {
  try { localStorage.setItem(KEY, String(Date.now())) } catch { /* private mode */ }
}

export async function enforceSessionLimit() {
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (!session) return false

  let saved = Number(localStorage.getItem(KEY))
  if (!Number.isFinite(saved) || saved <= 0) {      // a session created some other way (invite, reset): count from now
    saved = Date.now()
    localStorage.setItem(KEY, String(saved))
  }
  const fromToken = tokenLoginTime(session.access_token)
  const start = fromToken ? Math.min(saved, fromToken) : saved

  if (Date.now() - start > MAX_AGE_MS) {
    toast.error("Your session expired. Please log in again.")
    await supabase.auth.signOut()                    // the app then sends the person to the login page
    return true
  }
  return false
}

let started = false
export function startSessionLimit() {
  if (started || typeof window === "undefined") return
  started = true
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") localStorage.removeItem(KEY)
  })
  enforceSessionLimit()
  window.addEventListener("focus", enforceSessionLimit)
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") enforceSessionLimit() })
  setInterval(enforceSessionLimit, 5 * 60 * 1000)
}
