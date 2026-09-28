import { useEffect, useState, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { Plus, Trash2, ChevronDown, Camera, Settings, ArrowLeft, Link2, Minus, X } from "lucide-react"
import toast from "react-hot-toast"
import QuickAddItemModal from "../../components/purchases/QuickAddItemModal"

const BLUE = "#2563eb", BLUE_DK = "#1d4ed8", BLUE_BG = "#eff6ff"
const BORDER = "#e5e7eb", LIGHT = "#f9fafb", DARK = "#111827", GRAY = "#374151", MUTED = "#9ca3af", RED = "#dc2626"

const lbl = { fontSize: 13, fontWeight: 600, color: GRAY, marginBottom: 7, display: "block" }
const inp = { width: "100%", padding: "9px 13px", fontSize: 14, border: `1px solid ${BORDER}`,
              borderRadius: 9, outline: "none", color: DARK, background: "#fff", boxSizing: "border-box" }
const cellInp = { width: "100%", border: "none", outline: "none", background: "transparent",
                   fontSize: 14, color: DARK, padding: "10px 11px", boxSizing: "border-box" }
const addLink = { display: "inline-flex", alignItems: "center", gap: 5, background: "none",
  border: "none", cursor: "pointer", color: BLUE, fontSize: 13, fontWeight: 600, padding: 0 }
const miniTrash = { background: "none", border: "none", cursor: "pointer", color: RED,
  padding: 5, display: "inline-flex", flexShrink: 0, borderRadius: 6 }

const selectOnFocus = (e) => e.target.select()

const emptyRow = () => ({
  product_id: null, product_name: "", quantity: 1, unit: "",
  unit_price: 0, discount_percent: 0, discount: 0, total: 0,
})

const TAX_PRESETS = [
  { label: "No Tax", value: 0 },
  { label: "VAT 13%", value: 13 },
  { label: "Custom %", value: "custom" },
]

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
    payment_method: "cash", discount: 0, discount_percent: 0, tax: 0, notes: "",
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

  const [showDiscount, setShowDiscount] = useState(false)
  const [showTax,      setShowTax]      = useState(false)
  const [taxPreset,    setTaxPreset]    = useState(0)
  const [showCharges,  setShowCharges]  = useState(false)
  const [charges,      setCharges]      = useState([])
  const [showRound,    setShowRound]    = useState(false)
  const [roundSign,    setRoundSign]    = useState("+")
  const [roundOff,     setRoundOff]     = useState(0)

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
      setHeader(h => ({
        ...h,
        supplier_id: data.supplier_id || "",
        purchase_date: data.purchase_date,
        notes: data.notes || "",
        discount: data.extra_discount ?? data.discount_total ?? 0,
        tax: Math.round(((data.tax || 0) - (data.round_off_amount || 0)) * 100) / 100,
      }))

      const newRows = (data.items || []).map(item => {
        const gross = item.quantity * item.unit_price
        return {
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit: "",
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || 0,
          discount: Math.max(0, gross - item.total),
          total: item.total,
        }
      })
      setRows(newRows.length ? newRows : [emptyRow()])

      if ((data.extra_discount ?? data.discount_total ?? 0) > 0) setShowDiscount(true)

      const recoveredTax = Math.round(((data.tax || 0) - (data.round_off_amount || 0)) * 100) / 100
      if (recoveredTax > 0) { setShowTax(true); setTaxPreset("custom") }

      // Round off has its own column for purchases, so it recovers cleanly
      // (unlike invoices, which fold it into tax with no separate record).
      const rv = data.round_off_amount || 0
      if (rv !== 0) {
        setShowRound(true)
        setRoundSign(rv < 0 ? "-" : "+")
        setRoundOff(Math.abs(rv))
      }

      // Charges: only the total was ever stored for purchases (no itemized
      // breakdown like invoices' delivery_note), so this collapses to one row.
      if ((data.charges_amount || 0) > 0) {
        setCharges([{ id: ++chargeSeq, name: "Charges", amount: data.charges_amount }])
        setShowCharges(true)
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
      supabase.from("products").select("id,name,cost_price,unit,stock_quantity,sku").eq("store_id", storeId).eq("is_active", true).order("name"),
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

  const subtotal     = rows.reduce((s, r) => s + (parseFloat(r.total)||0), 0)
  const discountRs   = parseFloat(header.discount) || 0
  const taxRs        = parseFloat(header.tax) || 0
  const chargesTotal = charges.reduce((s, c) => s + (parseFloat(c.amount)||0), 0)
  const roundVal     = (parseFloat(roundOff)||0) * (roundSign === "-" ? -1 : 1)
  const total        = Math.max(0, subtotal - discountRs + taxRs + chargesTotal + roundVal)

  function setDiscountPercent(val) {
    const percent = parseFloat(val) || 0
    setHeader(h => ({ ...h, discount_percent: val, discount: Math.max(0, subtotal * percent / 100) }))
  }
  function setDiscountRs(val) {
    const amt = parseFloat(val) || 0
    const percent = subtotal > 0 ? (amt / subtotal) * 100 : 0
    setHeader(h => ({ ...h, discount: val, discount_percent: percent.toFixed(1) }))
  }
  function removeDiscount() { setShowDiscount(false); setHeader(h => ({ ...h, discount: 0, discount_percent: 0 })) }

  function applyTaxPreset(val) {
    setTaxPreset(val)
    if (val === "custom") return
    setHeader(h => ({ ...h, tax: Math.max(0, subtotal * (parseFloat(val)||0) / 100) }))
  }
  function setTaxRs(val) { setHeader(h => ({ ...h, tax: val })) }
  function removeTax() { setShowTax(false); setTaxPreset(0); setHeader(h => ({ ...h, tax: 0 })) }

  function addCharge() { setCharges(c => [...c, { id: ++chargeSeq, name: "", amount: "" }]) }
  function updateCharge(id, field, val) { setCharges(c => c.map(x => x.id === id ? { ...x, [field]: val } : x)) }
  function removeCharge(id) { setCharges(c => c.filter(x => x.id !== id)) }
  function removeChargesSection() { setShowCharges(false); setCharges([]) }
  function removeRoundOff() { setShowRound(false); setRoundOff(0); setRoundSign("+") }

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
      const roundedTotal = Math.round(total * 100) / 100
      const paidNow = fullyPaid ? roundedTotal : Math.min(roundedTotal, Math.max(0, parseFloat(paidAmount) || 0))

      const payload = {
        supplier_id: header.supplier_id || null,
        purchase_date: header.purchase_date,
        paid_amount: paidNow,
        tax: taxRs,
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
          setRows([emptyRow()]); setHeader(h => ({ ...h, notes: "" })); setImages([])
          setShowDiscount(false); setShowTax(false); setShowCharges(false); setShowRound(false)
          setHeader(h => ({ ...h, discount: 0, discount_percent: 0, tax: 0 })); setCharges([]); setRoundOff(0)
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
    if (!confirm("Delete this purchase? This reverses its balance and stock effects, and removes any linked payment allocations.")) return
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
      p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku||"").toLowerCase().includes(q.toLowerCase())
    ).slice(0, 8)
    return list
  }
  const selSupp = suppliers.find(s => s.id === header.supplier_id)
  const fmtNum = (n) => Math.round(Number(n||0)).toLocaleString("en-IN")

  if (editId && loadingExisting) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <div style={{ width: 26, height: 26, border: `2px solid ${BLUE}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }}/>
      </div>
    )
  }

  return (
    <div style={{ padding: 22, background: LIGHT, minHeight: "100%" }}>

      <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
        <button onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34, borderRadius: 999, border: `1px solid ${BORDER}`, background: "#fff",
            color: GRAY, cursor: "pointer", marginRight: 12 }}>
          <ArrowLeft size={17} />
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: DARK }}>
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
        overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", borderTop: `3px solid ${BLUE}` }}>

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
                  boxShadow: "0 10px 24px rgba(0,0,0,0.12)", zIndex: 30, overflow: "hidden" }}>
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
                        borderBottom: "1px solid #f3f4f6", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ fontSize: 14, color: GRAY, fontWeight: 600 }}>Direct Purchase</span>
                    </button>
                    {filteredSupps.map(s => (
                      <button key={s.id}
                        onClick={() => { setHeader({...header, supplier_id:s.id}); setSuppOpen(false) }}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "11px 15px", background: "none", border: "none",
                          borderBottom: "1px solid #f3f4f6", cursor: "pointer", textAlign: "left" }}
                        onMouseEnter={e => e.currentTarget.style.background = LIGHT}
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
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
                      fontSize: 12, fontWeight: 700, color: BLUE }}>
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
              <p style={{ fontSize: 12, color: BLUE, fontWeight: 600, marginTop: 6 }}>
                {formatBS(header.purchase_date)}
              </p>
            </div>
          </div>
        </div>

        {/* Items table */}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: "#fafaf9" }}>
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
                      width: 20, height: 20, borderRadius: 6, background: LIGHT, color: GRAY,
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
                        boxShadow: "0 10px 24px rgba(0,0,0,0.14)", zIndex: 20, overflow: "hidden" }}>
                        {matches.map(p => (
                          <button key={p.id}
                            onMouseDown={() => pickProduct(i, p)}
                            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "11px 15px", background: "none", border: "none",
                              borderBottom: "1px solid #f3f4f6", cursor: "pointer", textAlign: "left" }}
                            onMouseEnter={e => e.currentTarget.style.background = LIGHT}
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
                              cursor: "pointer", textAlign: "left", color: BLUE, fontWeight: 600, fontSize: 13 }}
                            onMouseEnter={e => e.currentTarget.style.background = BLUE_BG}
                            onMouseLeave={e => e.currentTarget.style.background = "none"}>
                            <Plus size={14} /> Add new item "{q.trim()}"
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  <td style={{ ...tdStyle, padding: 0 }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <input type="number" value={row.quantity} min="1" className="no-spin"
                        onFocus={selectOnFocus}
                        onChange={e => updateRow(i, "quantity", e.target.value)}
                        style={{ ...cellInp, textAlign: "center", fontWeight: 600, width: "auto", flex: 1, minWidth: 0 }} />
                      {row.unit && (
                        <span style={{ fontSize: 11, color: MUTED, paddingRight: 9, flexShrink: 0 }}>{row.unit}</span>
                      )}
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
                        background: "rgba(0,0,0,0.6)", border: "none", color: "#fff",
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
                        background: "rgba(0,0,0,0.6)", border: "none", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ maxWidth: 350, marginLeft: "auto", width: "100%" }}>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginBottom: showDiscount||showTax||showCharges||showRound ? 16 : 0 }}>
              {!showDiscount && <button onClick={() => setShowDiscount(true)} style={addLink}><Plus size={14}/> Add Discount</button>}
              {!showTax      && <button onClick={() => setShowTax(true)} style={addLink}><Plus size={14}/> Add Tax</button>}
              {!showCharges  && <button onClick={() => { setShowCharges(true); addCharge() }} style={addLink}><Plus size={14}/> Add Charges</button>}
              {!showRound    && <button onClick={() => setShowRound(true)} style={addLink}><Plus size={14}/> Round Off</button>}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>

              {showDiscount && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: GRAY, fontWeight: 600, width: 72, flexShrink: 0 }}>Discount</span>
                  <input type="number" min="0" max="100" className="no-spin" value={header.discount_percent}
                    onFocus={selectOnFocus}
                    onChange={e => setDiscountPercent(e.target.value)}
                    placeholder="0"
                    style={{ ...inp, width: 56, padding: "7px 6px", textAlign: "center", fontSize: 13 }} />
                  <span style={{ fontSize: 12, color: MUTED }}>%</span>
                  <Link2 size={13} color={MUTED} />
                  <input type="number" min="0" className="no-spin" value={header.discount}
                    onFocus={selectOnFocus}
                    onChange={e => setDiscountRs(e.target.value)}
                    placeholder="0"
                    style={{ ...inp, flex: 1, padding: "7px 11px", textAlign: "right", fontSize: 13 }} />
                  <span style={{ fontSize: 12, color: MUTED }}>Rs.</span>
                  <button onClick={removeDiscount} style={miniTrash}><Trash2 size={14} /></button>
                </div>
              )}

              {showTax && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: GRAY, fontWeight: 600, width: 72, flexShrink: 0 }}>Tax</span>
                  <select value={taxPreset} onChange={e => applyTaxPreset(e.target.value === "custom" ? "custom" : Number(e.target.value))}
                    style={{ ...inp, flex: 1, padding: "7px 9px", cursor: "pointer", fontSize: 13 }}>
                    {TAX_PRESETS.map(t => <option key={t.label} value={t.value}>{t.label}</option>)}
                  </select>
                  <input type="number" min="0" className="no-spin" value={header.tax}
                    disabled={taxPreset !== "custom"}
                    onFocus={selectOnFocus}
                    onChange={e => setTaxRs(e.target.value)}
                    placeholder="0"
                    style={{ ...inp, width: 96, padding: "7px 11px", textAlign: "right", fontSize: 13,
                      background: taxPreset !== "custom" ? LIGHT : "#fff", color: taxPreset !== "custom" ? MUTED : DARK }} />
                  <span style={{ fontSize: 12, color: MUTED }}>Rs.</span>
                  <button onClick={removeTax} style={miniTrash}><Trash2 size={14} /></button>
                </div>
              )}

              {showCharges && charges.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input value={c.name} onChange={e => updateCharge(c.id, "name", e.target.value)}
                    placeholder="Enter charge name"
                    style={{ ...inp, flex: 1, padding: "7px 11px", fontSize: 13 }} />
                  <input type="number" min="0" className="no-spin" value={c.amount}
                    onFocus={selectOnFocus}
                    onChange={e => updateCharge(c.id, "amount", e.target.value)}
                    placeholder="0"
                    style={{ ...inp, width: 96, padding: "7px 11px", textAlign: "right", fontSize: 13 }} />
                  <span style={{ fontSize: 12, color: MUTED }}>Rs.</span>
                  <button onClick={() => removeCharge(c.id)} style={miniTrash}><Trash2 size={14} /></button>
                </div>
              ))}
              {showCharges && (
                <button onClick={addCharge} style={{ ...addLink, marginLeft: 0 }}>
                  <Plus size={14}/> Add More Charges
                </button>
              )}
              {showCharges && charges.length > 0 && (
                <button onClick={removeChargesSection}
                  style={{ ...addLink, color: MUTED, fontWeight: 500, fontSize: 12 }}>
                  Remove Charges Section
                </button>
              )}

              {showRound && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: GRAY, fontWeight: 600, width: 72, flexShrink: 0 }}>Round Off</span>
                  <div style={{ display: "flex", border: `1px solid ${BORDER}`, borderRadius: 9, overflow: "hidden" }}>
                    <button onClick={() => setRoundSign("+")}
                      style={{ width: 28, height: 32, border: "none", cursor: "pointer",
                        background: roundSign === "+" ? BLUE : "#fff", color: roundSign === "+" ? "#fff" : MUTED,
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Plus size={13} />
                    </button>
                    <button onClick={() => setRoundSign("-")}
                      style={{ width: 28, height: 32, border: "none", cursor: "pointer", borderLeft: `1px solid ${BORDER}`,
                        background: roundSign === "-" ? BLUE : "#fff", color: roundSign === "-" ? "#fff" : MUTED,
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Minus size={13} />
                    </button>
                  </div>
                  <input type="number" min="0" className="no-spin" value={roundOff}
                    onFocus={selectOnFocus}
                    onChange={e => setRoundOff(e.target.value)}
                    placeholder="0"
                    style={{ ...inp, flex: 1, padding: "7px 11px", textAlign: "right", fontSize: 13 }} />
                  <span style={{ fontSize: 12, color: MUTED }}>Rs.</span>
                  <button onClick={removeRoundOff} style={miniTrash}><Trash2 size={14} /></button>
                </div>
              )}
            </div>

            <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 18, paddingTop: 16,
              display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, color: DARK, fontWeight: 700 }}>Total Amount</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: DARK }}>
                Rs. {fmtNum(total)}
              </span>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, color: GRAY, fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={fullyPaid} onChange={e => setFullyPaid(e.target.checked)} />
              Fully paid now
            </label>
            {!fullyPaid && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                <span style={{ fontSize: 13, color: GRAY, fontWeight: 600 }}>Paid now</span>
                <input type="number" min="0" className="no-spin" value={paidAmount}
                  onFocus={selectOnFocus}
                  onChange={e => setPaidAmount(e.target.value)}
                  placeholder="0"
                  style={{ ...inp, width: 130, padding: "7px 11px", textAlign: "right", fontSize: 13 }} />
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
              <span style={{ fontSize: 13, color: GRAY, fontWeight: 600 }}>Payment Mode</span>
              <select value={header.payment_method}
                onChange={e => setHeader({...header, payment_method: e.target.value})}
                style={{ ...inp, width: 150, cursor: "pointer", fontSize: 13 }}>
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
              background: BLUE, border: "none", borderRadius: 999, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
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
              style={{ padding: "10px 20px", fontSize: 13, fontWeight: 600, color: GRAY,
                border: `1px solid ${BORDER}`, background: "#fff", borderRadius: 999,
                cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
              Save & New
            </button>

            <div style={{ display: "flex", borderRadius: 999, overflow: "hidden" }}>
              <button onClick={() => handleSave(false)} disabled={saving}
                style={{ padding: "10px 22px", fontSize: 13, fontWeight: 700, color: "#fff",
                  background: BLUE, border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving…" : "Save Purchase Bill"}
              </button>
              <button disabled={saving}
                style={{ padding: "10px 12px", background: BLUE_DK, border: "none",
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
