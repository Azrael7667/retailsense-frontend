import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import { useStoreId } from "../../hooks/useStoreId"
import api from "../../lib/apiClient"
import {
  Camera, Upload, X, Check, Trash2, RefreshCw,
  FileImage, AlertTriangle, Sparkles, ChevronDown, ShoppingBag, Receipt,
  ZoomIn, ZoomOut, Maximize2, Minimize2, Scan
} from "lucide-react"
import toast from "react-hot-toast"

// ---- Shared theme classes (new palette: navy + soft lime) ----
const PRIMARY_BTN = "bg-slate-900 hover:bg-slate-800 text-white dark:bg-lime-300 dark:hover:bg-lime-400 dark:text-slate-900"
const OUTLINE_BTN = "border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-lime-50 dark:hover:bg-gray-800 text-slate-800 dark:text-gray-300"
const FIELD = "border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-200 dark:focus:ring-lime-900"
const PANEL = "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"
const LABEL = "block text-xs font-medium text-gray-500 mb-1.5"

// Review layout: normal (image ~40%) or wide (50/50)
const GRID_NORMAL = "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
const GRID_WIDE   = "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"

const EXPENSE_CATS = ["Rent","Electricity","Water","Salary","Transport","Marketing","Maintenance","Telephone","Miscellaneous"]

const STATUS_META = {
  processing:       { label: "Processing",       badge: "bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400" },
  ready_for_review: { label: "Ready for review",  badge: "bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400" },
  approved:         { label: "Approved",          badge: "bg-green-100 dark:bg-green-950 text-green-600 dark:text-green-400" },
  rejected:         { label: "Rejected",          badge: "bg-gray-100 dark:bg-gray-800 text-gray-500" },
  failed:           { label: "Failed",            badge: "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400" },
}

// A scanned doc is an expense if the backend says so (doc_type or extracted bill_type)
const isExpenseDoc = (doc) =>
  doc?.doc_type === "expense_bill" || doc?.extracted_data?.bill_type === "expense"

// ============================================================
// Button that opens a Purchase / Expense choice
// ============================================================
function BillTypeMenu({ onPick, disabled, className, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} disabled={disabled} className={className}>
        {children}
        <ChevronDown size={14} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-2 w-44 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg overflow-hidden">
            <button onClick={() => { setOpen(false); onPick("purchase") }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-left text-slate-800 dark:text-gray-200 hover:bg-lime-50 dark:hover:bg-gray-800">
              <ShoppingBag size={15} /> Purchase
            </button>
            <button onClick={() => { setOpen(false); onPick("expense") }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-left text-slate-800 dark:text-gray-200 hover:bg-lime-50 dark:hover:bg-gray-800 border-t border-gray-100 dark:border-gray-800">
              <Receipt size={15} /> Expense
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// Bill viewer — zoom in/out, drag to move, Ctrl+scroll to zoom
// ============================================================
function BillImage({ src, wide, onToggleWide }) {
  const [zoom, setZoom] = useState(100) // % of the panel width
  const boxRef = useRef(null)
  const drag = useRef(null)

  const clamp = (v) => Math.min(400, Math.max(100, v))
  const zoomIn  = () => setZoom(z => clamp(z + 25))
  const zoomOut = () => setZoom(z => clamp(z - 25))
  const fit     = () => { setZoom(100); boxRef.current?.scrollTo({ top: 0, left: 0 }) }

  // Ctrl + mouse wheel zooms (needs a non-passive listener to stop page zoom)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(z => clamp(z + (e.deltaY < 0 ? 25 : -25)))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [src])

  // Drag to move around when zoomed in
  const onDown = (e) => {
    if (zoom <= 100) return
    const el = boxRef.current
    drag.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop }
  }
  const onMove = (e) => {
    if (!drag.current) return
    const el = boxRef.current
    el.scrollLeft = drag.current.l - (e.clientX - drag.current.x)
    el.scrollTop  = drag.current.t - (e.clientY - drag.current.y)
  }
  const onUp = () => { drag.current = null }

  const iconBtn = "p-1.5 rounded-md text-slate-700 dark:text-gray-200 hover:bg-lime-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-transparent"

  return (
    <div className={`${PANEL} p-2 lg:sticky lg:top-0 flex flex-col h-[calc(100vh-250px)] min-h-[420px] min-w-0`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-0.5">
          <button onClick={zoomOut} disabled={zoom <= 100} className={iconBtn} title="Zoom out"><ZoomOut size={16} /></button>
          <span className="w-12 text-center text-xs font-semibold text-slate-700 dark:text-gray-200 tabular-nums">{zoom}%</span>
          <button onClick={zoomIn} disabled={zoom >= 400} className={iconBtn} title="Zoom in"><ZoomIn size={16} /></button>
          <button onClick={fit} disabled={zoom === 100} className={`${iconBtn} flex items-center gap-1 text-xs font-medium px-2`} title="Fit to panel">
            <Scan size={14} /> Fit
          </button>
        </div>
        <button onClick={onToggleWide} className={`${iconBtn} flex items-center gap-1 text-xs font-medium px-2`}
          title={wide ? "Make the image narrower" : "Make the image wider"}>
          {wide ? <><Minimize2 size={14} /> Narrower</> : <><Maximize2 size={14} /> Wider</>}
        </button>
      </div>

      {/* Image area (slim-scroll = the thin, light scrollbar used across the app) */}
      {src ? (
        <div
          ref={boxRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onDoubleClick={() => setZoom(z => (z > 100 ? 100 : 250))}
          className={`flex-1 min-h-0 overflow-auto slim-scroll rounded-lg bg-gray-100 dark:bg-gray-800 ${zoom > 100 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}>
          <img src={src} alt="Scanned bill" draggable={false}
            style={{ width: `${zoom}%`, maxWidth: "none" }}
            className="block select-none" />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-300"><FileImage size={40} /></div>
      )}
      {src && (
        <p className="text-[11px] text-gray-400 text-center pt-1.5">
          Double-click to zoom · Ctrl + scroll to zoom · drag to move
        </p>
      )}
    </div>
  )
}

export default function ScanBill({ registerBack }) {
  const { storeId } = useStoreId()
  const [view,        setView]        = useState("inbox") // inbox | review
  const [docs,        setDocs]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [uploading,   setUploading]   = useState(false)
  const [selectedId,  setSelectedId]  = useState(null)
  const [selectedKind, setSelectedKind] = useState("purchase") // purchase | expense
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const billTypeRef = useRef("purchase") // type chosen in the menu, read when the file arrives

  useEffect(() => { if (storeId) loadDocs() }, [storeId])

  async function loadDocs() {
    setLoading(true)
    try {
      // Purchase bills + expense bills, merged newest first.
      const [p, e] = await Promise.allSettled([
        api.get("/api/pending-documents/", { params: { doc_type: "purchase_bill" } }),
        api.get("/api/pending-documents/", { params: { doc_type: "expense_bill" } }),
      ])
      const list = [
        ...(p.status === "fulfilled" ? p.value.data || [] : []),
        ...(e.status === "fulfilled" ? e.value.data || [] : []),
      ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      if (p.status === "rejected") toast.error("Could not load scanned bills")
      setDocs(list)
    } finally {
      setLoading(false)
    }
  }

  // Back from the review screen to the scanned-bills list
  function goToInbox() {
    setView("inbox")
    setSelectedId(null)
    loadDocs()
  }

  // Tell the parent page what its Back button should do while the review screen is open
  useEffect(() => {
    registerBack?.(view === "review" ? goToInbox : null)
    return () => registerBack?.(null)
  }, [view])

  // Menu choice -> remember the type -> open the camera / file picker
  function pickType(type, source) {
    billTypeRef.current = type
    if (source === "camera") cameraInputRef.current?.click()
    else fileInputRef.current?.click()
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file later
    if (!file) return

    const billType = billTypeRef.current
    setUploading(true)
    toast.loading("Reading bill…", { id: "scan" })
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("bill_type", billType) // "purchase" | "expense"
      const res = await api.post("/api/pending-documents/purchase-bill", formData)
      toast.success("Bill extracted — please review", { id: "scan" })
      await loadDocs()
      setSelectedId(res.data.id)
      setSelectedKind(billType)
      setView("review")
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not process bill", { id: "scan" })
      await loadDocs()
    } finally {
      setUploading(false)
    }
  }

  function openDoc(doc) {
    if (doc.status === "approved" || doc.status === "rejected") return
    setSelectedId(doc.id)
    setSelectedKind(isExpenseDoc(doc) ? "expense" : "purchase")
    setView("review")
  }

  if (view === "review" && selectedId) {
    return selectedKind === "expense"
      ? <ExpenseReview docId={selectedId} onBack={goToInbox} />
      : <ReviewScreen docId={selectedId} onBack={goToInbox} />
  }

  return (
    <div>
      {/* Upload actions */}
      <div className="flex items-center gap-3 mb-6">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelected} className="hidden" />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelected} className="hidden" />

        <BillTypeMenu onPick={t => pickType(t, "camera")} disabled={uploading}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50 ${PRIMARY_BTN}`}>
          <Camera size={15} /> Take Photo
        </BillTypeMenu>

        <BillTypeMenu onPick={t => pickType(t, "file")} disabled={uploading}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50 ${OUTLINE_BTN}`}>
          <Upload size={15} /> Upload from Files
        </BillTypeMenu>

        {uploading && (
          <span className="text-sm text-gray-400 flex items-center gap-1.5">
            <RefreshCw size={13} className="animate-spin" /> Reading bill with AI…
          </span>
        )}
      </div>

      {/* Inbox list */}
      <div className={`${PANEL} overflow-hidden`}>
        <div className="overflow-x-auto slim-scroll">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>{["Bill", "Type", "Supplier / Vendor", "Scanned", "Status", ""].map((h, i) =>
                <th key={i} className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              )}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12">
                  <div className="w-6 h-6 border-2 border-slate-900 dark:border-lime-300 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              ) : docs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-14">
                  <FileImage size={36} className="mx-auto text-gray-200 dark:text-gray-700 mb-2" />
                  <p className="text-gray-400 text-sm">No bills scanned yet</p>
                  <p className="text-gray-300 dark:text-gray-600 text-xs mt-1">Take a photo of a bill to get started</p>
                </td></tr>
              ) : docs.map(doc => {
                const meta = STATUS_META[doc.status] || STATUS_META.processing
                const expense = isExpenseDoc(doc)
                const party = expense
                  ? (doc.extracted_data?.vendor_name || doc.extracted_data?.supplier_name)
                  : doc.extracted_data?.supplier_name
                const billNumber = doc.extracted_data?.bill_number
                const clickable = doc.status !== "approved" && doc.status !== "rejected"
                return (
                  <tr key={doc.id}
                    className={clickable ? "hover:bg-lime-50 dark:hover:bg-gray-800 cursor-pointer" : "opacity-60"}
                    onClick={() => clickable && openDoc(doc)}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      {billNumber || <span className="text-gray-400 font-normal">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {expense ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-lime-100 text-slate-800 dark:bg-lime-950 dark:text-lime-300"><Receipt size={11}/> Expense</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-300"><ShoppingBag size={11}/> Purchase</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-gray-300">
                      {party || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(doc.created_at).toLocaleDateString("en-NP", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
                        {doc.status === "ready_for_review" && <Sparkles size={11} />}
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {doc.status === "ready_for_review" && (
                        <span className="text-xs text-slate-900 dark:text-lime-300 font-semibold">Review →</span>
                      )}
                      {doc.status === "approved" && doc.resulting_purchase_id && (
                        <span className="text-xs text-gray-400">{expense ? "Expense recorded" : "Purchase created"}</span>
                      )}
                      {doc.status === "failed" && (
                        <span className="text-xs text-red-500 flex items-center gap-1 justify-end" title={doc.error_message || ""}>
                          <AlertTriangle size={11} /> {doc.error_message?.slice(0, 40) || "Failed"}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Expense review — readable image + clean form
// ============================================================
function ExpenseReview({ docId, onBack }) {
  const [doc,       setDoc]       = useState(null)
  const [draft,     setDraft]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [approving, setApproving] = useState(false)
  const [wide,      setWide]      = useState(false)

  useEffect(() => { load() }, [docId])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get(`/api/pending-documents/${docId}`)
      setDoc(res.data)
      const d = res.data.extracted_data || {}
      setDraft({
        bill_type: "expense",
        vendor_name: d.vendor_name || d.supplier_name || "",
        bill_number: d.bill_number || "",
        bill_date: d.bill_date || new Date().toISOString().split("T")[0],
        category: d.category || "",
        total: d.total ?? d.amount ?? "",
        description: d.description || "",
        notes: d.notes || "",
        ...d,
      })
    } catch (e) {
      toast.error("Could not load this document")
    } finally {
      setLoading(false)
    }
  }

  async function saveChanges() {
    setSaving(true)
    try {
      await api.patch(`/api/pending-documents/${docId}`, { extracted_data: draft })
      toast.success("Changes saved")
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save changes")
    } finally {
      setSaving(false)
    }
  }

  async function approve() {
    if (!draft.category) return toast.error("Choose a category")
    if (!(parseFloat(draft.total) > 0)) return toast.error("Enter the amount")
    if (!confirm(`Record an expense of Rs ${Number(draft.total).toLocaleString("en-IN")}?`)) return
    setApproving(true)
    try {
      await api.patch(`/api/pending-documents/${docId}`, { extracted_data: draft })
      const res = await api.post(`/api/pending-documents/${docId}/approve`)
      toast.success(res.data.message || "Expense recorded")
      onBack()
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not approve")
    } finally {
      setApproving(false)
    }
  }

  async function reject() {
    if (!confirm("Discard this scanned bill? This can't be undone.")) return
    try {
      await api.post(`/api/pending-documents/${docId}/reject`)
      toast.success("Bill discarded")
      onBack()
    } catch (e) {
      toast.error("Could not discard")
    }
  }

  if (loading || !draft) {
    return (
      <div className="py-24 text-center">
        <div className="w-6 h-6 border-2 border-slate-900 dark:border-lime-300 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  return (
    <div className="min-w-0">
      {draft.notes && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-4 py-3 mb-4">
          <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300 whitespace-pre-line">{draft.notes}</p>
        </div>
      )}

      <div className={`grid grid-cols-1 ${wide ? GRID_WIDE : GRID_NORMAL} gap-5 items-start`}>
        <BillImage src={doc.image_url} wide={wide} onToggleWide={() => setWide(v => !v)} />

        <div className="space-y-4 min-w-0">
          <div className={`${PANEL} p-6`}>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Expense details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <div>
                <label className={LABEL}>Vendor</label>
                <input value={draft.vendor_name} onChange={e => setDraft({ ...draft, vendor_name: e.target.value })}
                  placeholder="Who was paid" className={`w-full px-3 py-2.5 text-sm ${FIELD}`} />
              </div>
              <div>
                <label className={LABEL}>Bill number (optional)</label>
                <input value={draft.bill_number} onChange={e => setDraft({ ...draft, bill_number: e.target.value })}
                  className={`w-full px-3 py-2.5 text-sm ${FIELD}`} />
              </div>
              <div>
                <label className={LABEL}>Category *</label>
                <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}
                  className={`w-full px-3 py-2.5 text-sm ${FIELD}`}>
                  <option value="">Select category</option>
                  {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Amount (Rs) *</label>
                <input type="number" min="0" step="0.01" value={draft.total} onChange={e => setDraft({ ...draft, total: e.target.value })}
                  placeholder="0.00" className={`w-full px-3 py-2.5 text-sm font-semibold ${FIELD}`} />
              </div>
              <div>
                <label className={LABEL}>Date (AD)</label>
                <input type="date" value={draft.bill_date || ""} onChange={e => setDraft({ ...draft, bill_date: e.target.value })}
                  className={`w-full px-3 py-2.5 text-sm ${FIELD}`} />
              </div>
              <div>
                <label className={LABEL}>Description</label>
                <input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Optional note" className={`w-full px-3 py-2.5 text-sm ${FIELD}`} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={reject} className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg font-medium">
              <X size={15} /> Discard
            </button>
            <div className="flex items-center gap-2">
              <button onClick={saveChanges} disabled={saving}
                className={`px-4 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50 ${OUTLINE_BTN}`}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button onClick={approve} disabled={approving}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50 ${PRIMARY_BTN}`}>
                <Check size={15} /> {approving ? "Recording…" : "Approve & Record Expense"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Purchase review — readable image + clean form, one card per item
// ============================================================
function ReviewScreen({ docId, onBack }) {
  const { storeId } = useStoreId()
  const [doc,       setDoc]       = useState(null)
  const [draft,     setDraft]     = useState(null)
  const [products,  setProducts]  = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [approving, setApproving] = useState(false)
  const [changingMatch, setChangingMatch] = useState({}) // { [itemIndex]: true }
  const [wide,      setWide]      = useState(false)

  useEffect(() => { load() }, [docId])
  useEffect(() => { if (storeId) loadLookups() }, [storeId])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get(`/api/pending-documents/${docId}`)
      setDoc(res.data)
      setDraft({ vat_percent: 13, ...res.data.extracted_data })
    } catch (e) {
      toast.error("Could not load this document")
    } finally {
      setLoading(false)
    }
  }

  async function loadLookups() {
    const [p, s] = await Promise.all([
      supabase.from("products").select("id,name").eq("store_id", storeId).eq("is_active", true).order("name"),
      supabase.from("suppliers").select("id,name").eq("store_id", storeId).order("name"),
    ])
    setProducts(p.data || [])
    setSuppliers(s.data || [])
  }

  function updateItem(i, field, val) {
    const items = [...draft.items]
    items[i] = { ...items[i], [field]: val }
    setDraft({ ...draft, items })
  }

  function linkToExistingProduct(i, productId) {
    const items = [...draft.items]
    if (productId === "__new__") {
      items[i] = { ...items[i], product_id: null, is_new: true }
    } else {
      const p = products.find(p => p.id === productId)
      items[i] = { ...items[i], product_id: productId, is_new: false, product_name: p?.name || items[i].product_name }
    }
    setDraft({ ...draft, items })
    setChangingMatch(prev => ({ ...prev, [i]: false }))
  }

  function removeItem(i) {
    setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })
  }

  async function saveChanges() {
    setSaving(true)
    try {
      await api.patch(`/api/pending-documents/${docId}`, { extracted_data: draft })
      toast.success("Changes saved")
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save changes")
    } finally {
      setSaving(false)
    }
  }

  async function approve() {
    if (!draft.items.length) return toast.error("No items to approve")
    if (!confirm(`Create a purchase with ${draft.items.length} item(s) and add stock?`)) return
    setApproving(true)
    try {
      await saveChangesSilently()
      const res = await api.post(`/api/pending-documents/${docId}/approve`)
      toast.success(res.data.message)
      onBack()
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not approve")
    } finally {
      setApproving(false)
    }
  }

  async function saveChangesSilently() {
    await api.patch(`/api/pending-documents/${docId}`, { extracted_data: draft })
  }

  async function reject() {
    if (!confirm("Discard this scanned bill? This can't be undone.")) return
    try {
      await api.post(`/api/pending-documents/${docId}/reject`)
      toast.success("Bill discarded")
      onBack()
    } catch (e) {
      toast.error("Could not discard")
    }
  }

  if (loading || !draft) {
    return (
      <div className="py-24 text-center">
        <div className="w-6 h-6 border-2 border-slate-900 dark:border-lime-300 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  // Net (post-discount) line amount — feeds subtotal/VAT, matching the supplier bill.
  const netLineTotal = (item) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.unit_price) || 0
    const disc = parseFloat(item.discount_percent) || 0
    return qty * price * (1 - disc / 100)
  }
  const grossLineTotal = (item) => (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)

  const grossSubtotal = draft.items.reduce((s, i) => s + grossLineTotal(i), 0)
  const subtotal       = draft.items.reduce((s, i) => s + netLineTotal(i), 0)
  const discountTotal  = grossSubtotal - subtotal
  const vatPercent  = parseFloat(draft.vat_percent ?? 13) || 0
  const vatAmount   = subtotal * (vatPercent / 100)
  const grandTotal  = subtotal + vatAmount
  const fmt = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })

  const input = `w-full px-3 py-2 text-sm ${FIELD}`

  return (
    <div className="min-w-0">
      {draft.notes && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-4 py-3 mb-4">
          <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300 whitespace-pre-line">{draft.notes}</p>
        </div>
      )}

      <div className={`grid grid-cols-1 ${wide ? GRID_WIDE : GRID_NORMAL} gap-5 items-start`}>

        {/* Left: readable bill image (zoom / drag / wider) */}
        <BillImage src={doc.image_url} wide={wide} onToggleWide={() => setWide(v => !v)} />

        {/* Right: clean editable form */}
        <div className="space-y-4 min-w-0">

          {/* Bill details */}
          <div className={`${PANEL} p-6`}>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Bill details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <div>
                <label className={LABEL}>Supplier</label>
                <input value={draft.supplier_name || ""} onChange={e => setDraft({ ...draft, supplier_name: e.target.value })}
                  placeholder="Supplier name" className={input} />
              </div>
              <div>
                <label className={LABEL}>Bill number</label>
                <input value={draft.bill_number || ""} onChange={e => setDraft({ ...draft, bill_number: e.target.value })}
                  className={input} />
              </div>
              <div>
                <label className={LABEL}>
                  Purchase date (AD)
                  {draft.bill_date_calendar === "BS" && (
                    <span className="ml-1.5 text-amber-600 dark:text-amber-400">— read as BS {draft.bill_date_raw}</span>
                  )}
                </label>
                <input type="date" value={draft.bill_date || ""} onChange={e => setDraft({ ...draft, bill_date: e.target.value })}
                  className={input} />
              </div>
              <div>
                <label className={LABEL}>Link to existing supplier (optional)</label>
                <select value={draft.supplier_id || ""} onChange={e => setDraft({ ...draft, supplier_id: e.target.value || null })}
                  className={input}>
                  <option value="">No match — leave unlinked</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Items — one card each */}
          <div className={`${PANEL} overflow-hidden`}>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Items ({draft.items.length})</h3>
            </div>

            <div className="p-4 space-y-3 bg-gray-50/60 dark:bg-gray-800/30">
              {draft.items.map((item, i) => {
                const lineTotal = netLineTotal(item)
                const showMatchPicker = changingMatch[i]
                return (
                  <div key={i} className={`${PANEL} p-4`}>

                    {/* Name + delete */}
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <label className={LABEL}>Item {i + 1}</label>
                        <input value={item.product_name} onChange={e => updateItem(i, "product_name", e.target.value)}
                          className={`w-full px-3 py-2 text-sm font-medium ${FIELD}`} />
                      </div>
                      <button onClick={() => removeItem(i)} title="Remove item"
                        className="mt-6 p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Numbers: two tidy rows of three */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                      <div>
                        <label className={LABEL}>Part No.</label>
                        <input type="text" value={item.part_number || ""} placeholder="—" onChange={e => updateItem(i, "part_number", e.target.value)}
                          className={input} />
                      </div>
                      <div>
                        <label className={LABEL}>Unit</label>
                        <input type="text" value={item.unit || ""} placeholder="pcs" onChange={e => updateItem(i, "unit", e.target.value)}
                          className={input} />
                      </div>
                      <div>
                        <label className={LABEL}>Qty</label>
                        <input type="number" value={item.quantity} min="0" step="0.01" onChange={e => updateItem(i, "quantity", e.target.value)}
                          className={`${input} text-right`} />
                      </div>
                      <div>
                        <label className={LABEL}>Rate (Rs)</label>
                        <input type="number" value={item.unit_price} min="0" step="0.01" onChange={e => updateItem(i, "unit_price", e.target.value)}
                          className={`${input} text-right`} />
                      </div>
                      <div>
                        <label className={LABEL}>Disc %</label>
                        <input type="number" value={item.discount_percent ?? ""} min="0" max="100" step="0.01" placeholder="0"
                          onChange={e => updateItem(i, "discount_percent", e.target.value)}
                          title="Applied to unit price before subtotal/VAT"
                          className={`${input} text-right`} />
                      </div>
                      <div>
                        <label className={LABEL}>Net total (Rs)</label>
                        <div className="w-full px-3 py-2 text-sm text-right font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-slate-900 dark:text-white">
                          {Number(lineTotal).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    {/* Product match */}
                    <div className="flex items-center gap-2 flex-wrap mt-3">
                      {item.is_new ? (
                        <span className="text-[11px] px-2 py-0.5 bg-lime-100 dark:bg-lime-950 text-slate-800 dark:text-lime-300 rounded-full font-medium">New product</span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 rounded-full font-medium">
                          {item.match_confidence != null ? `${Math.round(item.match_confidence * 100)}% match` : "Matched"}
                        </span>
                      )}
                      <button
                        onClick={() => setChangingMatch(prev => ({ ...prev, [i]: !prev[i] }))}
                        className="text-[11px] text-gray-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-0.5">
                        Change match <ChevronDown size={11} className={showMatchPicker ? "rotate-180 transition-transform" : "transition-transform"} />
                      </button>
                    </div>

                    {showMatchPicker && (
                      <select value={item.is_new ? "__new__" : (item.product_id || "__new__")}
                        onChange={e => linkToExistingProduct(i, e.target.value)}
                        className={`w-full max-w-md mt-2 px-3 py-2 text-xs ${FIELD}`}>
                        <option value="__new__">+ Create as new product</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
              {draft.items.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">No items — this bill can only be rejected</p>
              )}
            </div>

            {/* Totals summary */}
            {draft.items.length > 0 && (
              <div className="border-t border-gray-100 dark:border-gray-800 px-6 py-5">
                <div className="max-w-xs ml-auto space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Gross subtotal</span>
                    <span className="font-medium text-slate-900 dark:text-white">{fmt(grossSubtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Discount</span>
                    <span className="font-medium text-red-500">− {fmt(discountTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Taxable amount</span>
                    <span className="font-medium text-slate-900 dark:text-white">{fmt(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5">
                      VAT
                      <input type="number" value={draft.vat_percent ?? 13} min="0" max="100" step="0.01"
                        onChange={e => setDraft({ ...draft, vat_percent: e.target.value })}
                        className={`w-16 px-2 py-1 text-xs text-right ${FIELD}`} />
                      <span className="text-gray-400">%</span>
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white">{fmt(vatAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-base font-bold text-slate-900 dark:text-white border-t border-gray-200 dark:border-gray-700 pt-2">
                    <span>Total</span>
                    <span>{fmt(grandTotal)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions (stay visible at the bottom while scrolling) */}
          <div className="sticky bottom-0 z-[1] flex items-center justify-between bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur border-t border-gray-200 dark:border-gray-800 py-3">
            <button onClick={reject} className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg font-medium">
              <X size={15} /> Discard
            </button>
            <div className="flex items-center gap-2">
              <button onClick={saveChanges} disabled={saving}
                className={`px-4 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50 ${OUTLINE_BTN}`}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button onClick={approve} disabled={approving || draft.items.length === 0}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50 ${PRIMARY_BTN}`}>
                <Check size={15} /> {approving ? "Creating purchase…" : "Approve & Create Purchase"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}