import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Search } from "lucide-react"
import { REPORTS, REPORT_CATEGORIES } from "../../config/reportsConfig"

export default function Reports() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("All Reports")
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    return REPORTS.filter((r) => {
      const matchesTab = activeTab === "All Reports" || r.category === activeTab
      const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase())
      return matchesTab && matchesSearch
    })
  }, [activeTab, search])

  const grouped = useMemo(() => {
    const groups = {}
    filtered.forEach((r) => {
      if (!groups[r.category]) groups[r.category] = []
      groups[r.category].push(r)
    })
    return groups
  }, [filtered])

  const sectionTitleMap = {
    Transactions: "Transaction Report",
    Parties: "Party Report",
    Inventory: "Inventory Report",
    "Income Expense": "Income Expense Report",
    "Business Status": "Business Status",
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Browse Various Reports</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Sales, purchase, party, inventory and income/expense reports</p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports..."
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-lime-200 dark:focus:ring-lime-900 focus:border-lime-500"
          />
        </div>
      </div>

      <div className="flex gap-2 mb-8 flex-wrap">
        {REPORT_CATEGORIES.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              activeTab === tab
                ? "bg-lime-200 text-slate-900 shadow-sm dark:bg-lime-300"
                : "bg-gray-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-lime-100 dark:hover:bg-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {Object.entries(grouped).map(([category, reports]) => (
        <div key={category} className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-gray-400 mb-3">
            {sectionTitleMap[category] || category}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {reports.map((r) => (
              <button
                key={r.key}
                disabled={!r.supported}
                onClick={() => navigate(r.route || `/reports/${r.key}`)}
                className={`text-left p-4 rounded-xl border transition ${
                  r.supported
                    ? "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-lime-400 dark:hover:border-lime-500 hover:bg-lime-50 dark:hover:bg-gray-800 hover:shadow-sm cursor-pointer"
                    : "border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 cursor-not-allowed opacity-60"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-900 dark:text-gray-100 text-sm">{r.title}</span>
                  {!r.supported && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0 ml-2">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{r.desc}</p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}