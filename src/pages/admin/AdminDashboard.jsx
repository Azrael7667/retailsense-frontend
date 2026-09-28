import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import adminApi from "../../lib/adminApiClient"
import { useAdminAuthStore } from "../../store/adminAuthStore"
import { ShieldCheck, LogOut, Store as StoreIcon, Users, RefreshCw } from "lucide-react"
import toast from "react-hot-toast"

export default function AdminDashboard() {
  const navigate = useNavigate()
  const admin = useAdminAuthStore((s) => s.admin)
  const clearAdminAuth = useAdminAuthStore((s) => s.clearAdminAuth)

  const [stores, setStores]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await adminApi.get("/api/platform-admin/stores")
      setStores(res.data.stores || [])
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load stores")
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    clearAdminAuth()
    navigate("/admin/login")
  }

  const totalStaff = stores.reduce((sum, s) => sum + (s.staff_count || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gray-950 border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <ShieldCheck size={17} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">RetailSense Platform Admin</p>
              <p className="text-xs text-gray-500 leading-tight">{admin?.full_name || admin?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors">
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">All Stores</h1>
            <p className="text-sm text-gray-500 mt-0.5">Every store registered on the platform</p>
          </div>
          <button onClick={load}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 min-w-[130px]">
            <p className="text-[11px] text-gray-400 font-medium mb-0.5">Total Stores</p>
            <p className="text-xl font-bold text-gray-900">{stores.length}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 min-w-[130px]">
            <p className="text-[11px] text-gray-400 font-medium mb-0.5">Total Staff Across All Stores</p>
            <p className="text-xl font-bold text-gray-900">{totalStaff}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                {["Store", "Type", "Owner", "Contact", "Staff", "Created"].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-16">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              ) : stores.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16">
                  <StoreIcon size={32} className="mx-auto text-gray-200 mb-3" />
                  <p className="text-gray-500 text-sm">No stores yet</p>
                </td></tr>
              ) : stores.map(s => (
                <tr key={s.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.address || "No address"}</p>
                  </td>
                  <td className="px-5 py-3.5 text-gray-600 capitalize">{s.store_type || "—"}</td>
                  <td className="px-5 py-3.5">
                    <p className="text-gray-800">{s.owner_name || "—"}</p>
                    <p className="text-xs text-gray-400">{s.owner_email || ""}</p>
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">
                    {s.phone || "—"}
                    {s.vat_number && <p className="text-xs text-gray-400">VAT: {s.vat_number}</p>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">
                      <Users size={11} /> {s.staff_count}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 text-xs">
                    {s.created_at ? new Date(s.created_at).toLocaleDateString("en-NP", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
