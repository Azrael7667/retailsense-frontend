import { useState, useEffect } from "react"
import { supabase } from "../lib/supabaseClient"
import { useAuthStore } from "../store/authStore"

export function useStoreId() {
  const user = useAuthStore((s) => s.user)
  const [storeId, setStoreId] = useState(null)
  const [role,    setRole]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from("users")
      .select("store_id, role")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setError("Could not load store. Make sure your account is fully set up.")
        } else {
          setStoreId(data.store_id)
          setRole(data.role)
        }
        setLoading(false)
      })
  }, [user?.id])

  return { storeId, role, loading, error }
}
