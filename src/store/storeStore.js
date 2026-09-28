import { create } from "zustand"
import { persist } from "zustand/middleware"

export const useStoreStore = create(
  persist(
    (set) => ({
      stores: [],              // [{ store_id, role, is_default, stores: { name, store_type } }, ...]
      currentStoreId: null,
      currentRole: null,
      setStores: (stores) => set({ stores }),
      setCurrentStore: (storeId, role) => set({ currentStoreId: storeId, currentRole: role }),
      clearStores: () => set({ stores: [], currentStoreId: null, currentRole: null }),
    }),
    { name: "retailsense-store" }
  )
)
