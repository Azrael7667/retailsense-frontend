import axios from "axios"
import { useAdminAuthStore } from "../store/adminAuthStore"

// Same baseURL convention as apiClient.js — there's no Vite dev proxy, so
// this must point at the backend explicitly or every request 404s/silently
// hits the frontend's own origin instead.
const adminApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8081"
})

adminApi.interceptors.request.use((config) => {
  const token = useAdminAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default adminApi
