import axios from "axios"
import { supabase } from "./supabaseClient"
import { useStoreStore } from "../store/storeStore"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8081"
})
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`
  }
  // Which store this request applies to. No router reads this yet — it's
  // wired here first so the header is already flowing on every request by
  // the time routers start migrating over to use it (see get_store_id's
  // optional requested_store_id param on the backend).
  const currentStoreId = useStoreStore.getState().currentStoreId
  if (currentStoreId) {
    config.headers["X-Store-Id"] = currentStoreId
  }
  return config
})

// The server answers 401 "Session expired" once the login is older than 24 hours: sign out so the app shows the login page.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const detail = String(error?.response?.data?.detail || "")
    if (error?.response?.status === 401 && /session expired/i.test(detail)) {
      await supabase.auth.signOut()
    }
    return Promise.reject(error)
  }
)

export default api
