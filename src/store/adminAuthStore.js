import { create } from "zustand"
import { persist } from "zustand/middleware"

// Completely separate from the regular authStore (which mirrors the
// Supabase client's session). This never touches supabase.auth — it just
// holds the raw access_token returned by POST /api/auth/login, plus the
// admin's own identity from GET /api/platform-admin/me.
export const useAdminAuthStore = create(
  persist(
    (set) => ({
      token: null,
      admin: null,
      setAdminAuth: (token, admin) => set({ token, admin }),
      clearAdminAuth: () => set({ token: null, admin: null }),
    }),
    { name: "retailsense-admin-auth" }
  )
)
