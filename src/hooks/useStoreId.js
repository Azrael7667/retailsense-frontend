import { useEffect } from "react"
import apiClient from "../lib/apiClient"
import { useAuthStore } from "../store/authStore"
import { useStoreStore } from "../store/storeStore"

export function useStoreId() {
  const user = useAuthStore((s) => s.user)
  const stores          = useStoreStore((s) => s.stores)
  const currentStoreId  = useStoreStore((s) => s.currentStoreId)
  const currentRole     = useStoreStore((s) => s.currentRole)
  const setStores       = useStoreStore((s) => s.setStores)
  const setCurrentStore = useStoreStore((s) => s.setCurrentStore)

  useEffect(() => {
    if (!user) return

    // Already have the list (e.g. persisted from an earlier session) — just
    // make sure something is selected, don't refetch.
    if (stores.length > 0) {
      if (!currentStoreId) {
        const target = stores.find(s => s.is_default) || stores[0]
        if (target) setCurrentStore(target.store_id, target.role)
      }
      return
    }

    apiClient.get("/api/auth/my-stores").then(({ data }) => {
      const list = data.stores || []
      setStores(list)
      // Keep the previously-selected store if it's still valid for this
      // user; otherwise fall back to their default (or just the first one).
      const stillValid = list.find(s => s.store_id === currentStoreId)
      const target = stillValid || list.find(s => s.is_default) || list[0]
      if (target) setCurrentStore(target.store_id, target.role)
    }).catch(() => {})
  }, [user?.id])

  return {
    storeId: currentStoreId,
    role: currentRole,
    loading: !currentStoreId,
    error: null,
  }
}
