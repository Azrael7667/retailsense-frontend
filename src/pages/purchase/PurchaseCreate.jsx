import { useEffect, useState, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { Plus, Trash2, ChevronDown, Camera, Settings, ArrowLeft, X } from "lucide-react"
import toast from "react-hot-toast"
import QuickAddItemModal from "../../components/purchases/QuickAddItemModal"
import { confirmDialog } from "../../components/common/ConfirmDialog"

// ---- Theme (navy + soft lime) ----
const NAVY = "#0f172a", NAVY_DK = "#1e293b"
const LIME = "#84cc16", LIME_SOFT = "#f7fee7", LIME_PILL = "#ecfccb"
const BORDER = "#e5e7eb", LIGHT = "#f8fafc", DARK = "#0f172a", GRAY = "#334155", MUTED = "#94a3b8", RED = "#dc2626"

// VAT % pre-filled on every NEW purchase bill (set to 0 if most of your purchases are not VAT-billed).
// Editing an existing purchase always starts from that purchase's own saved tax.
const DEFAULT_VAT = 13

const lbl = { fontSize: 13, fontWeight: 600, color: GRAY, marginBottom: 7, display: "block" }
const inp = { width: "100%", padding: "9px 13px", fontSize: 14, border: `1px solid ${BORDER}`,
              borderRadius: 9, outline: "none", color: DARK, background: "#fff", boxSizing: "border-box" }
const cellInp = { width: "100%", border: "none", outline: "none", background: "transparent",
                   fontSize: 14, color: DARK, padding: "10px 11px", boxSizing: "border-box" }
const addLink = { display: "inline-flex", alignItems: "center", gap: 5, background: "none",
  border: "none", cursor: "pointer", color: NAVY, fontSize: 13, fontWeight: 600, padding: 0 }
const miniTrash = { background: "none", border: "none", cursor: "pointer", color: RED,
  padding: 5, display: "inline-flex", flexShrink: 0, borderRadius: 6 }

// Totals table (same square, ruled look as the items table, but compact)
const T_CELL  = { padding: 0, height: 36, borderBottom: `1px solid ${BORDER}`,
  borderRight: `1px solid ${BORDER}`, verticalAlign: "middle" }
const T_LABEL = { ...T_CELL, padding: "0 12px", background: LIGHT, fontSize: 13, fontWeight: 600, color: GRAY }
const T_VALUE = { ...T_CELL, padding: "0 12px", textAlign: "right", fontSize: 13, fontWeight: 600,
  color: DARK, whiteSpace: "nowrap" }
const T_BOX   = { display: "flex", alignItems: "center" }
const T_INP   = { ...cellInp, fontSize: 13, padding: "6px 4px", textAlign: "center", minWidth: 0 }
const T_INP_R = { ...T_INP, textAlign: "right", paddingRight: 12 }
const T_PRE   = { fontSize: 12, color: MUTED, paddingLeft: 10, flexShrink: 0 }   // "Rs." in front
const T_UNIT  = { fontSize: 12, color: MUTED, paddingRight: 8, flexShrink: 0 }   // "%" after
const NO_RIGHT = { borderRight: "none" }

// Qty column: the unit label always gets the same fixed-width slot (even when empty),
// so the quantity number sits in exactly the same place on every row.
const QTY_UNIT = { width: 46, flexShrink: 0, boxSizing: "border-box", paddingRight: 8,
  textAlign: "right", fontSize: 11, color: MUTED, whiteSpace: "nowrap" }

// Inline styles can't do :focus, so the lime focus ring is defined once here
const FocusStyle = () => (
  <style>{`
    .ni input:focus, .ni select:focus, .ni textarea:focus {
      border-color: ${LIME} !important;
      box-shadow: 0 0 0 3px ${LIME_PILL};
    }
    .ni input[type="checkbox"] { accent-color: ${NAVY}; width: 16px; height: 16px; }
  `}</style>
)

const selectOnFocus = (e) => e.target.select()

const emptyRow = () => ({
  product_id: null, product_name: "", quantity: 1, unit: "",
  unit_price: 0, discount_percent: 0, discount: 0, total: 0,
})

let chargeSeq = 0

export default function PurchaseCreate() {
  const { storeId } = useStoreId()
  const navigate = useNavigate()
  const location = useLocation()
  const preSupplierId = location.state?.supplierId || null
  const editId = location.state?.editId || null

  const [suppliers, setSuppliers] = useState([])
  const [products,  setProducts]  = useState([])
  const [rows,      setRows]      = useState([emptyRow()])
  const [header,    setHeader]    = useState({
    supplier_id: preSupplierId || "", purchase_date: new Date().toISOString().split("T")[0],
    payment_method: "cash", discount: 0, discount_percent: 0, notes: "",
  })
  const [saving,     setSaving]     = useState(false)
  const [suppOpen,   setSuppOpen]   = useState(false)
  const [suppSearch, setSuppSearch] = useState("")
  const [activeRowSearch, setActiveRowSearch] = useState(null)
  const [prodSearch, setProdSearch] = useState("")
  const suppRef = useRef(null)

  const [billNoMode, setBillNoMode] = useState("auto") // "auto" | "manual"
  const [manualBillNo, setManualBillNo] = useState("")
  const [existingBillNo, setExistingBillNo] = useState("")

  // VAT % (text so typing "1" then "13" works). The VAT amount is calculated from it.
  const [vatPercent, setVatPercent] = useState(String(DEFAULT_VAT))

  // Extra charges and round-off are no longer part of the create screen, but an existing
  // purchase that already has them keeps them (shown as rows in the totals table)
  // so editing never drops money.
  const [charges,   setCharges]   = useState([])
  const [showRound, setShowRound] = useState(false)
  const [roundOff,  setRoundOff]  = useState("0") // signed amount, e.g. "-0.35"

  const [fullyPaid,  setFullyPaid]  = useState(true)
  const [paidAmount, setPaidAmount] = useState("")

  const [images, setImages] = useState([]) // newly picked { file, previewUrl }
  const [existingImageUrls, setExistingImageUrls] = useState([]) // already-uploaded URLs, from edit

  const [loadingExisting, setLoadingExisting] = useState(!!editId)
  const [deleting, setDeleting] = useState(false)

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddRow,  setQuickAddRow]  = useState(null)
  const [quickAddName, setQuickAddName] = useState("")

  useEffect(() => { if (storeId) loadRefs() }, [storeId])
  useEffect(() => {
    function handleClick(e) { if (suppRef.current && !suppRef.current.contains(e.target)) setSuppOpen(false) }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Load the existing purchase for editing and pre-fill everything we can.
  useEffect(() => {
    if (!editId) return
    let cancelled = false
    setLoadingExisting(true)
    apiClient.get(`/api/purchases/${editId}`).then(({ data }) => {
      if (cancelled) return
      setExistingBillNo(data.bill_number || "")

      const newRows = (data.items || []).map(item => {
        const gross = item.quantity * item.unit_price
        return {
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit: "",
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || 0,
          // rounded to 2 decimals so floating-point noise (0.04999999) never shows in the box
          discount: Math.round(Math.max(0, gross - item.total) * 100) / 100,
          total: item.total,
        }
      })
      setRows(newRows.length ? newRows : [emptyRow()])

      const itemsSubtotal = newRows.reduce((s, r) => s + (parseFloat(r.total)||0), 0)
      const disc = data.extra_discount ?? data.discount_total ?? 0
      setHeader(h => ({
        ...h,
        supplier_id: data.supplier_id || "",
        purchase_date: data.purchase_date,
        notes: data.notes || "",
        discount: disc,
        discount_percent: itemsSubtotal > 0 ? +((disc / itemsSubtotal) * 100).toFixed(1) : 0,
      }))

      // Tax: stored as a flat amount (with any round-off folded in), so recover the
      // plain tax and turn it back into the % of the taxable amount. A purchase saved
      // without tax starts at 0% (never the default 13%). 4 decimals so 12.999999 shows as 13.
      const recoveredTax = Math.round(((data.tax || 0) - (data.round_off_amount || 0)) * 100) / 100
      const taxable = Math.max(0, itemsSubtotal - disc)
      setVatPercent(recoveredTax > 0 && taxable > 0 ? String(+((recoveredTax / taxable) * 100).toFixed(4)) : "0")

      // Round off has its own column for purchases, so it recovers cleanly.
      const rv = data.round_off_amount || 0
      if (rv !== 0) { setShowRound(true); setRoundOff(String(rv)) }

      // Charges: only the total was ever stored for purchases (no itemized
      // breakdown like invoices' delivery_note), so this collapses to one row.
      if ((data.charges_amount || 0) > 0) {
        setCharges([{ id: ++chargeSeq, name: "Charges", amount: data.charges_amount }])
      }

      const paid = data.paid_amount || 0
      const isFully = paid >= data.total
      setFullyPaid(isFully)
      if (!isFully) setPaidAmount(String(paid))

      setExistingImageUrls(data.image_urls || [])
    }).catch(e => {
      if (!cancelled) toast.error(e?.response?.data?.detail || "Failed to load purchase")
    }).finally(() => {
      if (!cancelled) setLoadingExisting(false)
    })
    return () => { cancelled = true }
  }, [editId])

  async function loadRefs() {
    const [s, pr] = await Promise.all([
      supabase.from("suppliers").select("id,name,phone,balance").eq("store_id", storeId).order("name"),
      supabase.from("products").select("id,name,local_names,cost_price,unit,stock_quantity,sku").eq("store_id", storeId).eq("is_active", true).order("name"),
    ])
    setSuppliers(s.data || [])
    setProducts(pr.data || [])
  }

  function updateRow(i, field, val) {
    const u = [...rows]
    u[i][field] = val

    if (field === "discount_percent") {
      const base = (parseFloat(u[i].quantity)||0) * (parseFloat(u[i].unit_price)||0)
      u[i].discount = Math.max(0, base * (parseFloat(val)||0) / 100)
    }
    if (field === "discount") {
      const base = (parseFloat(u[i].quantity)||0) * (parseFloat(u[i].unit_price)||0)
      u[i].discount_percent = base > 0 ? ((parseFloat(val)||0) / base * 100).toFixed(1) : 0
    }
    if (["quantity","unit_price","discount","discount_percent"].includes(field)) {
      u[i].total = Math.max(0,
        (parseFloat(u[i].quantity)||0) * (parseFloat(u[i].unit_price)||0) - (parseFloat(u[i].discount)||0)
      )
    }
    setRows(u)
  }

  function pickProduct(i, product) {
    const u = [...rows]
    u[i].product_id   = product.id
    u[i].product_name = product.name
    u[i].unit_price   = product.cost_price || 0
    u[i].unit         = product.unit || ""
    u[i].total        = (product.cost_price || 0) * (parseFloat(u[i].quantity) || 1)
    setRows(u)
    setActiveRowSearch(null)
    setProdSearch("")
  }

  function handleCreateNew(i, name) {
    setQuickAddRow(i); setQuickAddName(name); setQuickAddOpen(true)
    setActiveRowSearch(null); setProdSearch("")
  }

  // ---- Totals (same order as the supplier's printed bill) ----
  // Total Amount -> Discount -> Taxable -> VAT -> Net Amount
  const subtotal     = rows.reduce((s, r) => s + (parseFloat(r.total)||0), 0)
  const discountRs   = parseFloat(header.discount) || 0
  const taxable      = Math.max(0, subtotal - discountRs)
  const vatPct       = parseFloat(vatPercent) || 0
  const vatRs        = Math.round(taxable * vatPct) / 100          // 2 decimals
  const chargesTotal = charges.reduce((s, c) => s + (parseFloat(c.amount)||0), 0)
  const roundVal     = showRound ? (parseFloat(roundOff) || 0) : 0
  const total        = Math.round(Math.max(0, taxable + vatRs + chargesTotal + roundVal) * 100) / 100 // Net Amount

  function setDiscountPercent(val) {
    const percent = parseFloat(val) || 0
    // Rs. amount is kept to 2 decimals (e.g. 64.04, not 64.0385)
    setHeader(h => ({ ...h, discount_percent: val, discount: Math.max(0, Math.round(subtotal * percent) / 100) }))
  }
  function setDiscountRs(val) {
    const amt = parseFloat(val) || 0
    const percent = subtotal > 0 ? (amt / subtotal) * 100 : 0
    setHeader(h => ({ ...h, discount: val, discount_percent: percent.toFixed(1) }))
  }

  function updateCharge(id, field, val) { setCharges(c => c.map(x => x.id === id ? { ...x, [field]: val } : x)) }
  function removeCharge(id) { setCharges(c => c.filter(x => x.id !== id)) }
  function removeRoundOff() { setShowRound(false); setRoundOff("0") }

  function handleImagePick(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ""
    setImages(prev => [...prev, ...files.map(f => ({ file: f, previewUrl: URL.createObjectURL(f) }))])
  }
  function removeImage(i) { setImages(prev => prev.filter((_, j) => j !== i)) }
  function removeExistingImage(i) { setExistingImageUrls(prev => prev.filter((_, j) => j !== i)) }

  async function uploadImages() {
    const urls = []
    for (const img of images) {
      const path = `${storeId}/${Date.now()}-${img.file.name}`
      const { error } = await supabase.storage.from("purchase-attachments").upload(path, img.file)
      if (error) { toast.error(`Image upload failed: ${error.message}`); continue }
      const { data } = supabase.storage.from("purchase-attachments").getPublicUrl(path)
      urls.push(data.publicUrl)
    }
    return urls
  }

  async function handleSave(andNew) {
    const validRows = rows.filter(r => r.product_name.trim() && r.quantity > 0)
    if (!validRows.length) return toast.error("Add at least one item")
    if (!editId && billNoMode === "manual" && !manualBillNo.trim()) return toast.error("Enter a bill number, or switch back to Auto")

    setSaving(true)
    try {
      const newImageUrls = images.length ? await uploadImages() : []
      const roundedTotal = total
      const paidNow = fullyPaid ? roundedTotal : Math.min(roundedTotal, Math.max(0, parseFloat(paidAmount) || 0))

      const payload = {
        supplier_id: header.supplier_id || null,
        purchase_date: header.purchase_date,
        paid_amount: paidNow,
        tax: vatRs,
        notes: header.notes || null,
        discount: discountRs,
        charges_amount: chargesTotal,
        round_off_amount: roundVal,
        image_urls: [...existingImageUrls, ...newImageUrls],
        items: validRows.map(r => ({
          product_id: r.product_id || null,
          product_name: r.product_name,
          quantity: parseFloat(r.quantity),
          unit_price: parseFloat(r.unit_price),
          discount_percent: parseFloat(r.discount_percent) || 0,
        })),
      }
      if (!editId) {
        payload.bill_number = billNoMode === "manual" ? manualBillNo.trim() : null
        payload.bill_number_mode = billNoMode
      }

      if (editId) {
        await apiClient.put(`/api/purchases/${editId}`, payload)
        toast.success("Purchase updated!")
        if (header.supplier_id) {
          navigate("/suppliers", { state: { selectSupplierId: header.supplier_id } })
        } else {
          navigate("/purchase")
        }
      } else {
        const { data: pur } = await apiClient.post("/api/purchases/", payload)
        toast.success(`${shortDocNumber(pur.bill_number, pur.purchase_date)} saved!`)
        if (andNew) {
          setRows([emptyRow()])
          setHeader(h => ({ ...h, notes: "", discount: 0, discount_percent: 0 }))
          setImages([])
          setVatPercent(String(DEFAULT_VAT))
          setCharges([])
          setShowRound(false); setRoundOff("0")
          setFullyPaid(true); setPaidAmount("")
          setBillNoMode("auto"); setManualBillNo("")
          loadRefs()
        } else if (header.supplier_id) {
          navigate("/suppliers", { state: { selectSupplierId: header.supplier_id } })
        } else {
          navigate("/purchase")
        }
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || "Failed to save purchase")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const ok = await confirmDialog({
      title: "Delete this purchase?",
      message: "This reverses its balance and stock effects, and removes any linked payment allocations.",
      confirmText: "Delete",
      variant: "danger",
    })
    if (!ok) return

    setDeleting(true)
    try {
      await apiClient.delete(`/api/purchases/${editId}`)
      toast.success("Purchase deleted")
      if (header.supplier_id) {
        navigate("/suppliers", { state: { selectSupplierId: header.supplier_id } })
      } else {
        navigate("/purchase")
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to delete purchase")
    } finally {
      setDeleting(false)
    }
  }

  const filteredSupps = suppliers.filter(s =>
    s.name.toLowerCase().includes(suppSearch.toLowerCase()) || (s.phone||"").includes(suppSearch)
  )
  const filteredProds = (q) => {
    const list = products.filter(p =>
      p.name.toLowerCase().includes(q.toLowerCase()) || (p.local_names||"").toLowerCase().includes(q.toLowerCase()) || (p.sku||"").toLowerCase().includes(q.toLowerCase())
    ).slice(0, 8)
    return list
  }
  const selSupp = suppliers.find(s => s.id === header.supplier_id)

  // Item rows: whole rupees. Totals table: two decimals, like the printed bill.
  const fmtNum = (n) => Math.round(Number(n||0)).toLocaleString("en-IN")
  const fmt2   = (n) => Number(n||0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (editId && loadingExisting) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <div style={{ width: 26, height: 26, border: `2px solid ${NAVY}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }}/>
      </div>
    )
  }

  return (
    <div className="ni" style={{ padding: 22, background: LIGHT, minHeight: "100%" }}>
      <FocusStyle />

      <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
        <button onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34, borderRadius: 999, border: `1px solid ${BORDER}`, background: "#fff",
            color: GRAY, cursor: "pointer", marginRight: 12 }}>
          <ArrowLeft size={17} />
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: DARK }}>
          {editId ? "Edit Purchase Bill" : "Create Purchase Bill"}
        </h1>
        <div style={{ flex: 1 }} />
        <button style={{ display: "flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 9, border: `1px solid ${BORDER}`, background: "#fff",
          color: GRAY, cursor: "pointer" }}>
          <Settings size={16} />
        </button>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14,
        overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.05)", borderTop: `3px solid ${LIME}` }}>

        {/* Party + Bill info */}
        <div style={{ padding: "22px 26px", borderBottom: `1px solid ${BORDER}`,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 26 }}>

          <div style={{ width: 310 }} ref={suppRef}>
            <span style={lbl}>Select Party</span>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => { setSuppOpen(!suppOpen); setSuppSearch("") }}
                style={{ ...inp, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: "pointer", textAlign: "left" }}>
                <span style={{ color: selSupp ? DARK : MUTED, fontWeight: selSupp ? 600 : 400 }}>
                  {selSupp ? selSupp.name : "Search for party"}
                </span>
                <ChevronDown size={15} color={MUTED} />
              </button>

              {suppOpen && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 5,
                  background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 11,
                  boxShadow: "0 10px 24px rgba(15,23,42,0.12)", zIndex: 30, overflow: "hidden" }}>
                  <div style={{ padding: 9, borderBottom: `1px solid ${BORDER}` }}>
                    <input autoFocus value={suppSearch} onChange={e => setSuppSearch(e.target.value)}
                      placeholder="Search suppliers..."
                      style={{ ...inp, padding: "7px 11px", fontSize: 13 }} />
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    <button
                      onClick={() => { setHeader({...header, supplier_id:""}); setSuppOpen(false) }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "11px 15px", background: "none", border: "none",
                        borderBottom: "1px solid #f1f5f9", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => e.currentTarget.style.background = LIME_SOFT}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ fontSize: 14, color: GRAY, fontWeight: 600 }}>Direct Purchase</span>
                    </button>
                    {filteredSupps.map(s => (
                      <button key={s.id}
                        onClick={() => { setHeader({...header, supplier_id:s.id}); setSuppOpen(false) }}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "11px 15px", background: "none", border: "none",
                          borderBottom: "1px solid #f1f5f9", cursor: "pointer", textAlign: "left" }}
                        onMouseEnter={e => e.currentTarget.style.background = LIME_SOFT}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 600, color: DARK }}>{s.name}</p>
                          {s.phone && <p style={{ fontSize: 12, color: MUTED }}>{s.phone}</p>}
                        </div>
                        {s.balance > 0 && (
                          <span style={{ fontSize: 12, color: RED, fontWeight: 600 }}>
                            Payable: Rs. {s.balance.toLocaleString("en-IN")}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 34 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <span style={{ ...lbl, marginBottom: 0 }}>Bill No</span>
                {!editId && (
                  <button
                    onClick={() => setBillNoMode(m => m === "auto" ? "manual" : "auto")}
                    style={{ background: LIME_PILL, border: "none", cursor: "pointer", padding: "2px 9px",
                      borderRadius: 999, fontSize: 12, fontWeight: 700, color: NAVY }}>
                    {billNoMode === "auto" ? "Manual" : "Auto"}
                  </button>
                )}
              </div>
              {editId ? (
                <div style={{ ...inp, color: DARK, minWidth: 170, background: LIGHT }}>
                  {shortDocNumber(existingBillNo, header.purchase_date) || "—"}
                </div>
              ) : billNoMode === "manual" ? (
                <input
                  value={manualBillNo}
                  onChange={e => setManualBillNo(e.target.value)}
                  placeholder="e.g. 77777"
                  style={{ ...inp, minWidth: 170 }}
                />
              ) : (
                <div style={{ ...inp, color: MUTED, minWidth: 170 }}>
                  PUR-{(header.purchase_date || "").slice(0, 4) || new Date().getFullYear()}-####
                </div>
              )}
            </div>
            <div>
              <span style={lbl}>Purchase Date</span>
              <input type="date" value={header.purchase_date}
                onChange={e => setHeader({...header, purchase_date: e.target.value})}
                style={{ ...inp, minWidth: 170 }} />
              <p style={{ fontSize: 12, color: GRAY, fontWeight: 600, marginTop: 6 }}>
                {formatBS(header.purchase_date)}
              </p>
            </div>
          </div>
        </div>

        {/* Items table */}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: LIGHT }}>
              <th style={{ ...thStyle, width: "5%" }}>S.N.</th>
              <th style={{ ...thStyle, width: "32%" }}>Item Name</th>
              <th style={{ ...thStyle, width: "11%" }}>Qty</th>
              <th style={{ ...thStyle, width: "15%" }}>Rate</th>
              <th style={{ ...thStyle, width: "20%" }}>Discount</th>
              <th style={{ ...thStyle, width: "14%", textAlign: "right" }}>Amount</th>
              <th style={{ ...thStyle, width: "3%", borderRight: "none" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const q = activeRowSearch === i ? prodSearch : ""
              const matches = q ? filteredProds(q) : []
              const exactMatch = q && products.some(p => p.name.toLowerCase() === q.trim().toLowerCase())
              return (
                <tr key={i}>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 20, height: 20, borderRadius: 6, background: LIME_PILL, color: NAVY,
                      fontSize: 12, fontWeight: 700 }}>{i+1}</span>
                  </td>

                  <td style={{ ...tdStyle, padding: 0, position: "relative" }}>
                    <input
                      value={row.product_name}
                      onChange={e => {
                        updateRow(i, "product_name", e.target.value)
                        setActiveRowSearch(i)
                        setProdSearch(e.target.value)
                      }}
                      onFocus={() => { setActiveRowSearch(i); setProdSearch(row.product_name) }}
                      placeholder="Enter item name"
                      style={{ ...cellInp, fontSize: 14, fontWeight: 500, padding: "12px 13px" }} />

                    {activeRowSearch === i && q && (matches.length > 0 || !exactMatch) && (
                      <div style={{ position: "absolute", left: 13, right: 13, top: "100%", marginTop: 3,
                        background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 11,
                        boxShadow: "0 10px 24px rgba(15,23,42,0.14)", zIndex: 20, overflow: "hidden" }}>
                        {matches.map(p => (
                          <button key={p.id}
                            onMouseDown={() => pickProduct(i, p)}
                            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "11px 15px", background: "none", border: "none",
                              borderBottom: "1px solid #f1f5f9", cursor: "pointer", textAlign: "left" }}
                            onMouseEnter={e => e.currentTarget.style.background = LIME_SOFT}
                            onMouseLeave={e => e.currentTarget.style.background = "none"}>
                            <div>
                              <p style={{ fontSize: 14, fontWeight: 600, color: DARK }}>{p.name}</p>
                              {p.sku && <p style={{ fontSize: 12, color: MUTED }}>#{p.sku}</p>}
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <p style={{ fontSize: 14, fontWeight: 700, color: DARK }}>Rs. {(p.cost_price||0).toLocaleString("en-IN")}</p>
                              <p style={{ fontSize: 12, color: MUTED }}>{p.stock_quantity} {p.unit} in stock</p>
                            </div>
                          </button>
                        ))}
                        {!exactMatch && (
                          <button
                            onMouseDown={() => handleCreateNew(i, q.trim())}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8,
                              padding: "11px 15px", background: "none", border: "none",
                              cursor: "pointer", textAlign: "left", color: NAVY, fontWeight: 600, fontSize: 13 }}
                            onMouseEnter={e => e.currentTarget.style.background = LIME_SOFT}
                            onMouseLeave={e => e.currentTarget.style.background = "none"}>
                            <Plus size={14} /> Add new item "{q.trim()}"
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Qty: the unit slot is always rendered (fixed width), so the number never shifts */}
                  <td style={{ ...tdStyle, padding: 0 }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <input type="number" value={row.quantity} min="1" className="no-spin"
                        onFocus={selectOnFocus}
                        onChange={e => updateRow(i, "quantity", e.target.value)}
                        style={{ ...cellInp, textAlign: "center", fontWeight: 600, width: "auto", flex: 1, minWidth: 0 }} />
                      <span style={QTY_UNIT}>{row.unit}</span>
                    </div>
                  </td>

                  <td style={{ ...tdStyle, padding: 0 }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: MUTED, paddingLeft: 9, flexShrink: 0 }}>Rs.</span>
                      <input type="number" value={row.unit_price} min="0" className="no-spin"
                        onFocus={selectOnFocus}
                        onChange={e => updateRow(i, "unit_price", e.target.value)}
                        style={{ ...cellInp, paddingLeft: 5, minWidth: 0 }} />
                    </div>
                  </td>

                  <td style={{ ...tdStyle, padding: 0 }}>
                    <div style={{ display: "flex", alignItems: "stretch", height: "100%" }}>
                      <div style={{ display: "flex", alignItems: "center", flex: 1,
                        borderRight: `1px solid ${BORDER}`, minWidth: 0 }}>
                        <input type="number" value={row.discount_percent} min="0" max="100" className="no-spin"
                          onFocus={selectOnFocus}
                          onChange={e => updateRow(i, "discount_percent", e.target.value)}
                          style={{ ...cellInp, textAlign: "center", paddingRight: 2, minWidth: 0 }} />
                        <span style={{ fontSize: 12, color: MUTED, paddingRight: 7, flexShrink: 0 }}>%</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                        <input type="number" value={row.discount} min="0" className="no-spin"
                          onFocus={selectOnFocus}
                          onChange={e => updateRow(i, "discount", e.target.value)}
                          style={{ ...cellInp, textAlign: "center", paddingRight: 2, minWidth: 0 }} />
                        <span style={{ fontSize: 12, color: MUTED, paddingRight: 9, flexShrink: 0 }}>Rs.</span>
                      </div>
                    </div>
                  </td>

                  <td style={{ ...tdStyle, textAlign: "right", fontSize: 14, fontWeight: 700, color: DARK, whiteSpace: "nowrap" }}>
                    Rs. {fmtNum(row.total)}
                  </td>

                  <td style={{ ...tdStyle, borderRight: "none", textAlign: "center", padding: "8px 4px" }}>
                    {rows.length > 1 && (
                      <button onClick={() => setRows(rows.filter((_,j)=>j!==i))} style={miniTrash}
                        onMouseEnter={e => e.currentTarget.style.background = "#fee2e2"}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}

            <tr>
              <td colSpan={4} style={{ ...tdStyle, borderBottom: "none" }}>
                <button onClick={() => setRows([...rows, emptyRow()])} style={addLink}>
                  <Plus size={15} /> Add Billing Item
                </button>
              </td>
              <td style={{ ...tdStyle, borderBottom: "none", textAlign: "right", fontSize: 13, color: GRAY, fontWeight: 600 }}>
                Sub Total
              </td>
              <td style={{ ...tdStyle, borderBottom: "none", textAlign: "right", fontSize: 14, fontWeight: 700, color: DARK, whiteSpace: "nowrap" }}>
                Rs. {fmtNum(subtotal)}
              </td>
              <td style={{ ...tdStyle, borderBottom: "none", borderRight: "none" }}></td>
            </tr>
          </tbody>
        </table>

        {/* Bottom section */}
        <div style={{ padding: 26, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 42 }}>

          {/* Left: notes + images */}
          <div>
            <span style={lbl}>Notes or Remarks</span>
            <textarea value={header.notes}
              onChange={e => setHeader({...header, notes: e.target.value})}
              rows={3}
              placeholder="Enter note or description..."
              style={{ ...inp, resize: "none", maxWidth: 400, fontSize: 14 }} />

            <div style={{ marginTop: 20 }}>
              <span style={lbl}>Attach Images</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ width: 84, height: 84, borderRadius: 11,
                  border: `1.5px dashed ${BORDER}`, display: "flex", alignItems: "center",
                  justifyContent: "center", cursor: "pointer", background: LIGHT, flexShrink: 0 }}>
                  <Camera size={21} color={MUTED} />
                  <input type="file" accept="image/*" multiple onChange={handleImagePick} style={{ display: "none" }} />
                </label>
                {existingImageUrls.map((url, i) => (
                  <div key={`existing-${i}`} style={{ position: "relative", width: 84, height: 84, borderRadius: 11,
                    overflow: "hidden", border: `1px solid ${BORDER}`, flexShrink: 0 }}>
                    <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button onClick={() => removeExistingImage(i)}
                      style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: 999,
                        background: "rgba(15,23,42,0.7)", border: "none", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
                {images.map((img, i) => (
                  <div key={i} style={{ position: "relative", width: 84, height: 84, borderRadius: 11,
                    overflow: "hidden", border: `1px solid ${BORDER}`, flexShrink: 0 }}>
                    <img src={img.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button onClick={() => removeImage(i)}
                      style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: 999,
                        background: "rgba(15,23,42,0.7)", border: "none", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: totals table, same order as the supplier's printed bill */}
          <div style={{ maxWidth: 360, marginLeft: "auto", width: "100%" }}>

            <div style={{ border: `1px solid ${BORDER}`, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "32%" }} />
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "38%" }} />
                </colgroup>
                <tbody>

                  {/* Total Amount */}
                  <tr>
                    <td style={T_LABEL}>Total Amount</td>
                    <td colSpan={2} style={{ ...T_VALUE, ...NO_RIGHT }}>Rs. {fmt2(subtotal)}</td>
                  </tr>

                  {/* Discount: % cell + Rs. cell (kept linked) */}
                  <tr>
                    <td style={T_LABEL}>Discount</td>
                    <td style={T_CELL}>
                      <div style={T_BOX}>
                        <input type="number" min="0" max="100" className="no-spin" value={header.discount_percent}
                          onFocus={selectOnFocus}
                          onChange={e => setDiscountPercent(e.target.value)}
                          placeholder="0"
                          style={T_INP} />
                        <span style={T_UNIT}>%</span>
                      </div>
                    </td>
                    <td style={{ ...T_CELL, ...NO_RIGHT }}>
                      <div style={T_BOX}>
                        <span style={T_PRE}>Rs.</span>
                        <input type="number" min="0" className="no-spin" value={header.discount}
                          onFocus={selectOnFocus}
                          onChange={e => setDiscountRs(e.target.value)}
                          placeholder="0"
                          style={T_INP_R} />
                      </div>
                    </td>
                  </tr>

                  {/* Taxable */}
                  <tr>
                    <td style={T_LABEL}>Taxable</td>
                    <td colSpan={2} style={{ ...T_VALUE, ...NO_RIGHT }}>Rs. {fmt2(taxable)}</td>
                  </tr>

                  {/* VAT: label | % cell | amount */}
                  <tr>
                    <td style={T_LABEL}>VAT</td>
                    <td style={T_CELL}>
                      <div style={T_BOX}>
                        <input type="number" min="0" max="100" step="any" className="no-spin" value={vatPercent}
                          onFocus={selectOnFocus}
                          onChange={e => setVatPercent(e.target.value)}
                          placeholder="0"
                          style={T_INP} />
                        <span style={T_UNIT}>%</span>
                      </div>
                    </td>
                    <td style={{ ...T_VALUE, ...NO_RIGHT }}>Rs. {fmt2(vatRs)}</td>
                  </tr>

                  {/* Existing extra charges (only on purchases that already have them) */}
                  {charges.map(c => (
                    <tr key={c.id}>
                      <td colSpan={2} style={T_CELL}>
                        <input value={c.name} onChange={e => updateCharge(c.id, "name", e.target.value)}
                          placeholder="Charge name"
                          style={{ ...T_INP, textAlign: "left", padding: "6px 12px" }} />
                      </td>
                      <td style={{ ...T_CELL, ...NO_RIGHT }}>
                        <div style={T_BOX}>
                          <span style={T_PRE}>Rs.</span>
                          <input type="number" min="0" className="no-spin" value={c.amount}
                            onFocus={selectOnFocus}
                            onChange={e => updateCharge(c.id, "amount", e.target.value)}
                            placeholder="0"
                            style={{ ...T_INP_R, paddingRight: 4 }} />
                          <button onClick={() => removeCharge(c.id)} style={{ ...miniTrash, marginRight: 4 }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Existing round-off (only on purchases that already have one) */}
                  {showRound && (
                    <tr>
                      <td style={T_LABEL}>Round Off</td>
                      <td colSpan={2} style={{ ...T_CELL, ...NO_RIGHT }}>
                        <div style={T_BOX}>
                          <span style={T_PRE}>Rs.</span>
                          <input type="number" step="any" className="no-spin" value={roundOff}
                            onFocus={selectOnFocus}
                            onChange={e => setRoundOff(e.target.value)}
                            placeholder="0"
                            style={{ ...T_INP_R, paddingRight: 4 }} />
                          <button onClick={removeRoundOff} style={{ ...miniTrash, marginRight: 4 }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Net Amount */}
                  <tr>
                    <td style={{ ...T_LABEL, background: LIME_SOFT, color: DARK, fontSize: 13, fontWeight: 700,
                      height: 44, borderBottom: "none" }}>
                      Net Amount
                    </td>
                    <td colSpan={2} style={{ ...T_VALUE, ...NO_RIGHT, background: LIME_SOFT, fontSize: 17,
                      fontWeight: 800, height: 44, borderBottom: "none" }}>
                      Rs. {fmt2(total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, fontSize: 13, color: GRAY, fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={fullyPaid} onChange={e => setFullyPaid(e.target.checked)} />
              Fully paid now
            </label>
            {!fullyPaid && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                <span style={{ fontSize: 13, color: GRAY, fontWeight: 600 }}>Paid now</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: MUTED }}>Rs.</span>
                  <input type="number" min="0" className="no-spin" value={paidAmount}
                    onFocus={selectOnFocus}
                    onChange={e => setPaidAmount(e.target.value)}
                    placeholder="0"
                    style={{ ...inp, width: 120, padding: "7px 11px", textAlign: "right", fontSize: 13 }} />
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
              <span style={{ fontSize: 13, color: GRAY, fontWeight: 600 }}>Payment Mode</span>
              <select value={header.payment_method}
                onChange={e => setHeader({...header, payment_method: e.target.value})}
                style={{ ...inp, width: 150, cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>
                {["cash","card","esewa","khalti","bank_transfer","cheque"].map(m => (
                  <option key={m} value={m}>{m.replace("_"," ")}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {editId ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <button onClick={handleDelete} disabled={deleting || saving}
            style={{ padding: "10px 18px", fontSize: 13, fontWeight: 600, color: RED,
              border: "1px solid #fecaca", background: "#fff", borderRadius: 999,
              cursor: "pointer", opacity: deleting ? 0.6 : 1 }}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button onClick={() => handleSave(false)} disabled={saving || deleting}
            style={{ padding: "10px 26px", fontSize: 13, fontWeight: 700, color: "#fff",
              background: NAVY, border: "none", borderRadius: 999, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Updating…" : "Update Purchase Bill"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <button onClick={() => navigate(-1)}
            style={{ background: "none", border: "none", cursor: "pointer",
              color: GRAY, fontSize: 13, fontWeight: 600, padding: "9px 6px" }}>
            Cancel
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => handleSave(true)} disabled={saving}
              style={{ padding: "10px 20px", fontSize: 13, fontWeight: 600, color: DARK,
                border: `1px solid ${BORDER}`, background: "#fff", borderRadius: 999,
                cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
              Save & New
            </button>

            <div style={{ display: "flex", borderRadius: 999, overflow: "hidden" }}>
              <button onClick={() => handleSave(false)} disabled={saving}
                style={{ padding: "10px 22px", fontSize: 13, fontWeight: 700, color: "#fff",
                  background: NAVY, border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving…" : "Save Purchase Bill"}
              </button>
              <button disabled={saving}
                style={{ padding: "10px 12px", background: NAVY_DK, border: "none",
                  borderLeft: "1px solid rgba(255,255,255,0.25)", color: "#fff", cursor: "pointer",
                  opacity: saving ? 0.6 : 1 }}>
                <ChevronDown size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {quickAddOpen && (
        <QuickAddItemModal storeId={storeId} initialName={quickAddName} onClose={() => setQuickAddOpen(false)}
          onCreated={(newProduct) => {
            setProducts(prev => [...prev, newProduct])
            if (quickAddRow !== null) {
              updateRow(quickAddRow, "product_id", newProduct.id)
              updateRow(quickAddRow, "product_name", newProduct.name)
              updateRow(quickAddRow, "unit", newProduct.unit || "pcs")
              updateRow(quickAddRow, "unit_price", newProduct.cost_price || 0)
            }
            setQuickAddOpen(false)
          }} />
      )}
    </div>
  )
}

const thStyle = {
  padding: "12px 11px", textAlign: "left", fontSize: 11, fontWeight: 700,
  color: GRAY, borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`,
  textTransform: "uppercase", letterSpacing: "0.04em",
}
const tdStyle = {
  padding: "9px 11px", borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`,
  verticalAlign: "middle",
}