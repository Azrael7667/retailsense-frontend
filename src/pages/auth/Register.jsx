import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import { useAuthStore } from "../../store/authStore"

export default function Register() {
  const [form, setForm] = useState({
    full_name: "", email: "", password: "",
    store_name: "", store_type: "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")
  const navigate = useNavigate()
  const setUser  = useAuthStore((s) => s.setUser)

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  async function handleRegister(e) {
    e.preventDefault()
    setLoading(true); setError("")
    try {
      // 1. Create auth user
      const { data, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name } },
      })
      if (authError) throw authError
      const user = data.user
      if (!user) throw new Error("Sign up failed — no user returned")

      // 2. Create store row
      const { data: storeData, error: storeError } = await supabase
        .from("stores")
        .insert({
          name:       form.store_name,
          store_type: form.store_type || "general",
          owner_name: form.full_name,
        })
        .select()
        .single()
      if (storeError) throw storeError

      // 3. Create user profile row
      const { error: userError } = await supabase
        .from("users")
        .insert({
          id:        user.id,
          store_id:  storeData.id,
          full_name: form.full_name,
          email:     form.email,
          role:      "owner",
        })
      if (userError) throw userError

      // 4. Seed default categories for this store type
      const presets = {
        grocery:     ["Rice & Flour","Pulses & Lentils","Spices","Oil & Ghee","Snacks","Beverages","Dairy","Personal Care","Household","Others"],
        clothing:    ["Men's Wear","Women's Wear","Kids Wear","Footwear","Accessories","Ethnic Wear","Innerwear","Others"],
        electronics: ["Mobile Phones","Accessories","Laptops","TVs & Monitors","Audio","Kitchen Appliances","Batteries","Others"],
        pharmacy:    ["Prescription Medicines","OTC Medicines","Vitamins","Personal Care","Baby Care","Medical Devices","Others"],
        general:     ["Category 1","Category 2","Category 3","Others"],
      }
      const storeTypeKey = (form.store_type || "general").toLowerCase()
      const categoryNames = presets[storeTypeKey] || presets["general"]
      await supabase.from("categories").insert(
        categoryNames.map(name => ({ store_id: storeData.id, name, is_system: true }))
      )

      setUser(user)
      navigate("/dashboard")
    } catch (err) {
      console.error("Registration error:", err)
      setError(err.message || "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <span className="text-white font-bold text-xl">R</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Create your store</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">RetailSense Nepal — free for small stores</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-8">
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Your full name</label>
              <input name="full_name" type="text" required value={form.full_name} onChange={update} placeholder="Solomon Silwal"
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Store name</label>
                <input name="store_name" type="text" required value={form.store_name} onChange={update} placeholder="e.g. Silwal Kirana"
                  className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Type of store</label>
                <input name="store_type" type="text" required value={form.store_type} onChange={update} placeholder="e.g. Grocery"
                  className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
              <input name="email" type="email" required value={form.email} onChange={update} placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
              <input name="password" type="password" required minLength={6} value={form.password} onChange={update} placeholder="Minimum 6 characters"
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {loading ? "Creating your store…" : "Create store & sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-600 hover:text-orange-600 font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
