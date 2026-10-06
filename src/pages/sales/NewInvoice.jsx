import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { shortDocNumber } from "../../utils/docNumber"
import { Plus, Trash2, ChevronDown, Camera, Settings, ArrowLeft } from "lucide-react"
import toast from "react-hot-toast"

// ---- Theme (navy + soft lime) ----
const NAVY = "#0f172a", NAVY_DK = "#1e293b"
const LIME = "#84cc16", LIME_SOFT = "#f7fee7", LIME_PILL = "#ecfccb", LIME_BORDER = "#d9f99d"
const BORDER = "#e5e7eb", LIGHT = "#f8fafc", DARK = "#0f172a", GRAY = "#334155", MUTED = "#94a3b8", RED = "#dc2626"

// VAT % pre-filled on every NEW invoice (set to 0 if most of your sales are not VAT-billed).
// Editing an existing invoice always starts from that invoice's own saved tax.
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

// Totals table (same square, ruled look as the billing items table, but compact)
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
    @keyframes niCardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  `}</style>
)

// Selects the whole value on focus so typing replaces "0" instead of
// prepending to it (fixes the "0100" leading-zero problem on number inputs).
const selectOnFocus = (e) => e.target.select()

const emptyRow = () => ({
  product_id: null, product_name: "", quantity: 1, unit: "",
  unit_price: 0, discount_percent: 0, discount: 0, total: 0, cost_price: 0
})

let chargeSeq = 0

/**
 * Props:
 *  storeId
 *  onBack               () => void
 *  initialCustomerId    pre-select a customer on create (ignored once editId loads its own)
 *  editId                if set, this is the "Edit Sales Invoice" flow: fetches the existing
 *                        invoice, pre-fills the form, and Save calls PUT instead of POST.
 */
export default function NewInvoice({ storeId, onBack, initialCustomerId = null, editId = null }) {
  const [customers,    setCustomers]    = useState([])
  const [products,     setProducts]     = useState([])
  const [rows,         setRows]         = useState([emptyRow()])
  const [header,       setHeader]       = useState({
    customer_id: initialCustomerId || "", invoice_date: new Date().toISOString().split("T")[0],
    payment_method: "cash", discount: 0, discount_percent: 0, notes: "",
  })
  const [saving,       setSaving]       = useState(false)
  const [custOpen,     setCustOpen]     = useState(false)
  const [custSearch,   setCustSearch]   = useState("")
  const [activeRowSearch, setActiveRowSearch] = useState(null)
  const [prodSearch,   setProdSearch]   = useState("")
  const custRef = useRef(null)

  // Invoice number — Auto (system generated) or Manual (typed in). Irrelevant
  // once editing: the number is shown read-only and never changes on update.
  const [invoiceNoMode,   setInvoiceNoMode]   = useState("auto") // "auto" | "manual"
  const [manualInvoiceNo, setManualInvoiceNo] = useState("")
  const [existingInvoiceNumber, setExistingInvoiceNumber] = useState("")

  // VAT % (text so typing "1" then "13" works). The VAT amount is calculated from it.
  const [vatPercent, setVatPercent] = useState(String(DEFAULT_VAT))

  // Extra charges are no longer part of the create screen, but an existing invoice that
  // already has them keeps them (shown as rows in the totals table) so editing never drops money.
  const [charges, setCharges] = useState([])

  // Received Amount — checked keeps the field synced to the current total
  // (convenience "mark as fully paid"); unchecked freezes whatever's typed
  // there as an explicit override. The field itself is always editable
  // either way — checking/unchecking never locks it.
  const [receivedChecked, setReceivedChecked] = useState(true)
  const [receivedAmount,  setReceivedAmount]  = useState("0")

  const [loadingExisting, setLoadingExisting] = useState(!!editId)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (!storeId) return
    supabase.from("customers").select("id,name,phone,balance").eq("store_id", storeId).order("name")
      .then(({ data }) => setCustomers(data || []))
    supabase.from("products").select("id,name,local_names,selling_price,cost_price,unit,stock_quantity,sku")
      .eq("store_id", storeId).eq("is_active", true).order("name")
      .then(({ data }) => setProducts(data || []))
  }, [storeId])

  useEffect(() => {
    function handleClick(e) {
      if (custRef.current && !custRef.current.contains(e.target)) setCustOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Load the existing invoice for editing and pre-fill everything we can.
  useEffect(() => {
    if (!editId) return
    let cancelled = false
    setLoadingExisting(true)
    apiClient.get(`/api/invoices/${editId}`).then(({ data }) => {
      if (cancelled) return
      setExistingInvoiceNumber(data.invoice_number || "")

      const newRows = (data.items || []).map(item => {
        const base = item.quantity * item.unit_price
        return {
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit: "",
          unit_price: item.unit_price,
          discount: item.discount || 0,
          discount_percent: base > 0 ? +(((item.discount||0) / base) * 100).toFixed(1) : 0,
          total: item.total,
          cost_price: item.cost_price_at_sale || 0,
        }
      })
      setRows(newRows.length ? newRows : [emptyRow()])

      const itemsSubtotal = newRows.reduce((s, r) => s + (parseFloat(r.total)||0), 0)
      const disc = data.discount || 0
      setHeader(h => ({
        ...h,
        customer_id: data.customer_id || "",
        invoice_date: data.invoice_date,
        payment_method: data.payment_method || "cash",
        notes: data.notes || "",
        discount: disc,
        discount_percent: itemsSubtotal > 0 ? +((disc / itemsSubtotal) * 100).toFixed(1) : 0,
      }))

      // Tax: the invoice stores a flat amount, so turn it back into the % of the taxable
      // amount. An invoice saved without tax starts at 0% (never the default 13%).
      const tax = data.tax || 0
      const taxable = Math.max(0, itemsSubtotal - disc)
      setVatPercent(tax > 0 && taxable > 0 ? String(+((tax / taxable) * 100).toFixed(6)) : "0")

      // Charges: try to recover the itemized breakdown from delivery_note
      // (stored as JSON at save time); fall back to one combined row.
      if ((data.delivery_charge || 0) > 0) {
        let restored = []
        try {
          const parsed = data.delivery_note ? JSON.parse(data.delivery_note) : null
          if (Array.isArray(parsed) && parsed.length) {
            restored = parsed.map(c => ({ id: ++chargeSeq, name: c.name || "", amount: c.amount || 0 }))
          }
        } catch { /* not parseable JSON — fall through to combined row */ }
        if (!restored.length) {
          restored = [{ id: ++chargeSeq, name: "Charges", amount: data.delivery_charge }]
        }
        setCharges(restored)
      }

      const paid = data.paid_amount || 0
      setReceivedAmount(String(paid))
      setReceivedChecked(paid >= data.total)
    }).catch(e => {
      if (!cancelled) toast.error(e?.response?.data?.detail || "Failed to load invoice")
    }).finally(() => {
      if (!cancelled) setLoadingExisting(false)
    })
    return () => { cancelled = true }
  }, [editId])

  function updateRow(i, field, val) {
    const u = [...rows]
    u[i][field] = val

    if (field === "discount_percent") {
      const base = (parseFloat(u[i].quantity)||0) * (parseFloat(u[i].unit_price)||0)
      u[i].discount = Math.max(0, base * (parseFloat(val)||0) / 100)
    }

    if (["quantity","unit_price","discount","discount_percent"].includes(field)) {
      u[i].total = Math.max(0,
        (parseFloat(u[i].quantity)||0) * (parseFloat(u[i].unit_price)||0) -
        (parseFloat(u[i].discount)||0)
      )
    }
    setRows(u)
  }

  function pickProduct(i, product) {
    const u = [...rows]
    u[i].product_id   = product.id
    u[i].product_name = product.name
    u[i].unit_price   = product.selling_price
    u[i].unit         = product.unit || ""
    u[i].cost_price   = product.cost_price || 0   // snapshot cost AS OF right now — locked in at save time
    u[i].total        = product.selling_price * (parseFloat(u[i].quantity) || 1)
    setRows(u)
    setActiveRowSearch(null)
    setProdSearch("")
  }

  // ---- Totals (same order as the printed bill) ----
  // Total Amount -> Discount -> Taxable -> VAT -> Net Amount
  const subtotal     = rows.reduce((s, r) => s + (parseFloat(r.total)||0), 0)
  const discountRs   = parseFloat(header.discount) || 0
  const taxable      = Math.max(0, subtotal - discountRs)
  const vatPct       = parseFloat(vatPercent) || 0
  const vatRs        = Math.round(taxable * vatPct) / 100        // 2 decimals
  const chargesTotal = charges.reduce((s, c) => s + (parseFloat(c.amount)||0), 0)
  const total        = Math.round(Math.max(0, taxable + vatRs + chargesTotal) * 100) / 100 // Net Amount

  // Keep the Received Amount field synced to the total only while checked —
  // this is what makes "checked" mean "fully paid" even as items/discount/tax
  // change the total. Unchecking freezes the field as an explicit override.
  useEffect(() => {
    if (receivedChecked) setReceivedAmount(String(Math.round(total * 100) / 100))
  }, [total, receivedChecked])

  const balanceDue = Math.max(0, Math.round((total - (parseFloat(receivedAmount) || 0)) * 100) / 100)

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

  function resetFormForNext() {
    setRows([emptyRow()])
    setHeader(h => ({ ...h, customer_id: "", discount: 0, discount_percent: 0, notes: "" }))
    setInvoiceNoMode("auto")
    setManualInvoiceNo("")
    setVatPercent(String(DEFAULT_VAT))
    setCharges([])
    setReceivedChecked(true)
    setReceivedAmount("0")
  }

  async function handleSave(stayForNext) {
    const validRows = rows.filter(r => r.product_name.trim() && r.quantity > 0)
    if (!validRows.length) return toast.error("Add at least one item")

    if (!editId && invoiceNoMode === "manual" && !manualInvoiceNo.trim()) {
      return toast.error("Enter an invoice number, or switch back to Auto")
    }

    setSaving(true)
    try {
      const paidNow = Math.min(total, Math.max(0, parseFloat(receivedAmount) || 0))

      const payload = {
        customer_id: header.customer_id || null,
        invoice_date: header.invoice_date,
        payment_method: header.payment_method,
        paid_amount: Math.round(paidNow * 100) / 100,
        discount: discountRs,
        tax: vatRs,
        notes: header.notes || null,
        delivery_charge: chargesTotal,
        delivery_address: null,
        delivery_note: charges.length ? JSON.stringify(charges) : null,
        items: validRows.map(r => ({
          product_id: r.product_id || null,
          product_name: r.product_name,
          quantity: parseFloat(r.quantity),
          unit_price: parseFloat(r.unit_price),
          discount: parseFloat(r.discount) || 0,
        })),
      }
      if (!editId) {
        payload.invoice_number_mode = invoiceNoMode
        payload.invoice_number = invoiceNoMode === "manual" ? manualInvoiceNo.trim() : null
      }

      if (editId) {
        await apiClient.put(`/api/invoices/${editId}`, payload)
        toast.success("Invoice updated!")
        onBack()
      } else {
        const { data: inv } = await apiClient.post("/api/invoices/", payload)
        toast.success(`${shortDocNumber(inv.invoice_number, inv.invoice_date)} saved!`)
        if (stayForNext) resetFormForNext()
        else onBack()
      }
    } catch(e) {
      toast.error(e?.response?.data?.detail || e.message || "Failed to save invoice")
    } finally {
      setSaving(false)
    }
  }

  // Delete button just opens the confirm modal; runDelete does the request
  function handleDelete() {
    setShowDeleteConfirm(true)
  }

  async function runDelete() {
    setDeleting(true)
    try {
      await apiClient.delete(`/api/invoices/${editId}`)
      toast.success("Invoice deleted")
      setShowDeleteConfirm(false)
      onBack()
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to delete invoice")
    } finally {
      setDeleting(false)
    }
  }

  const filteredCusts = customers.filter(c =>
    c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
    (c.phone||"").includes(custSearch)
  )

  const filteredProds = (q) => products.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    (p.local_names||"").toLowerCase().includes(q.toLowerCase()) ||
    (p.sku||"").toLowerCase().includes(q.toLowerCase())
  ).slice(0, 8)

  const selCust = customers.find(c => c.id === header.customer_id)

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

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
        <button onClick={onBack}
          style={{ display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34, borderRadius: 999, border: `1px solid ${BORDER}`, background: "#fff",
            color: GRAY, cursor: "pointer", marginRight: 12 }}>
          <ArrowLeft size={17} />
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: DARK }}>
          {editId ? "Edit Sales Invoice" : "Create Sales Invoice"}
        </h1>
        <div style={{ flex: 1 }} />
        <button style={{ display: "flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 9, border: `1px solid ${BORDER}`, background: "#fff",
          color: GRAY, cursor: "pointer" }}>
          <Settings size={16} />
        </button>
      </div>

      {/* Card */}
      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14,
        overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.05)", borderTop: `3px solid ${LIME}` }}>

        {/* Top row — Party + Invoice info */}
        <div style={{ padding: "22px 26px", borderBottom: `1px solid ${BORDER}`,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 26 }}>

          <div style={{ width: 310 }} ref={custRef}>
            <span style={lbl}>Select Party</span>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => { setCustOpen(!custOpen); setCustSearch("") }}
                style={{ ...inp, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: "pointer", textAlign: "left" }}>
                <span style={{ color: selCust ? DARK : MUTED, fontWeight: selCust ? 600 : 400 }}>
                  {selCust ? selCust.name : "Search for party"}
                </span>
                <ChevronDown size={15} color={MUTED} />
              </button>

              {custOpen && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 5,
                  background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 11,
                  boxShadow: "0 10px 24px rgba(15,23,42,0.12)", zIndex: 30, overflow: "hidden" }}>
                  <div style={{ padding: 9, borderBottom: `1px solid ${BORDER}` }}>
                    <input autoFocus value={custSearch} onChange={e => setCustSearch(e.target.value)}
                      placeholder="Search customers..."
                      style={{ ...inp, padding: "7px 11px", fontSize: 13 }} />
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    <button
                      onClick={() => { setHeader({...header, customer_id:""}); setCustOpen(false) }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "11px 15px", background: "none", border: "none",
                        borderBottom: "1px solid #f1f5f9", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => e.currentTarget.style.background = LIME_SOFT}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ fontSize: 14, color: GRAY, fontWeight: 600 }}>Walk-in / Cash Sale</span>
                    </button>
                    {filteredCusts.map(c => (
                      <button key={c.id}
                        onClick={() => { setHeader({...header, customer_id:c.id}); setCustOpen(false) }}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "11px 15px", background: "none", border: "none",
                          borderBottom: "1px solid #f1f5f9", cursor: "pointer", textAlign: "left" }}
                        onMouseEnter={e => e.currentTarget.style.background = LIME_SOFT}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 600, color: DARK }}>{c.name}</p>
                          {c.phone && <p style={{ fontSize: 12, color: MUTED }}>{c.phone}</p>}
                        </div>
                        {c.balance > 0 && (
                          <span style={{ fontSize: 12, color: RED, fontWeight: 600 }}>
                            Due: Rs. {c.balance.toLocaleString("en-IN")}
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
                <span style={{ ...lbl, marginBottom: 0 }}>Invoice No</span>
                {!editId && (
                  <button
                    onClick={() => setInvoiceNoMode(m => m === "auto" ? "manual" : "auto")}
                    style={{ background: LIME_PILL, border: "none", cursor: "pointer", padding: "2px 9px",
                      borderRadius: 999, fontSize: 12, fontWeight: 700, color: NAVY }}>
                    {invoiceNoMode === "auto" ? "Manual" : "Auto"}
                  </button>
                )}
              </div>
              {editId ? (
                <div style={{ ...inp, color: DARK, minWidth: 170, background: LIGHT }}>
                  {shortDocNumber(existingInvoiceNumber, header.invoice_date) || "—"}
                </div>
              ) : invoiceNoMode === "manual" ? (
                <input
                  value={manualInvoiceNo}
                  onChange={e => setManualInvoiceNo(e.target.value)}
                  placeholder="e.g. 160173"
                  style={{ ...inp, minWidth: 170 }}
                />
              ) : (
                <div style={{ ...inp, color: MUTED, minWidth: 170 }}>
                  INV-{(header.invoice_date || "").slice(0, 4) || new Date().getFullYear()}-####
                </div>
              )}
            </div>
            <div>
              <span style={lbl}>Invoice Date</span>
              <input type="date" value={header.invoice_date}
                onChange={e => setHeader({...header, invoice_date: e.target.value})}
                style={{ ...inp, minWidth: 170 }} />
              <p style={{ fontSize: 12, color: GRAY, fontWeight: 600, marginTop: 6 }}>
                {formatBS(header.invoice_date)}
              </p>
            </div>
          </div>
        </div>

        {/* Billing items table */}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: LIGHT }}>
              <th style={{ ...thStyle, width: "5%" }}>S.N.</th>
              <th style={{ ...thStyle, width: "34%" }}>Item Name</th>
              <th style={{ ...thStyle, width: "10%" }}>Qty</th>
              <th style={{ ...thStyle, width: "15%" }}>Rate</th>
              <th style={{ ...thStyle, width: "20%" }}>Discount</th>
              <th style={{ ...thStyle, width: "13%", textAlign: "right" }}>Amount</th>
              <th style={{ ...thStyle, width: "3%", borderRight: "none" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
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

                  {activeRowSearch === i && prodSearch && filteredProds(prodSearch).length > 0 && (
                    <div style={{ position: "absolute", left: 13, right: 13, top: "100%", marginTop: 3,
                      background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 11,
                      boxShadow: "0 10px 24px rgba(15,23,42,0.14)", zIndex: 20, overflow: "hidden" }}>
                      {filteredProds(prodSearch).map(p => (
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
                            <p style={{ fontSize: 14, fontWeight: 700, color: DARK }}>Rs. {p.selling_price.toLocaleString("en-IN")}</p>
                            <p style={{ fontSize: 12, color: MUTED }}>{p.stock_quantity} {p.unit} in stock</p>
                          </div>
                        </button>
                      ))}
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
            ))}

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
              <label style={{ width: 84, height: 84, borderRadius: 11,
                border: `1.5px dashed ${BORDER}`, display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer", background: LIGHT }}>
                <Camera size={21} color={MUTED} />
                <input type="file" accept="image/*" style={{ display: "none" }} />
              </label>
            </div>
          </div>

          {/* Right: totals table, same order as the printed bill */}
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

                  {/* Existing extra charges (only on invoices that already have them) */}
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

            {/* Received Amount — checkbox syncs the field to the net amount; the field
                itself always stays editable, checked or not */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: GRAY, fontWeight: 600, cursor: "pointer" }}>
                <input type="checkbox" checked={receivedChecked}
                  onChange={e => {
                    const checked = e.target.checked
                    setReceivedChecked(checked)
                    setReceivedAmount(checked ? String(Math.round(total * 100) / 100) : "0")
                  }} />
                Received Amount
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: MUTED }}>Rs.</span>
                <input type="number" min="0" className="no-spin" value={receivedAmount}
                  onFocus={selectOnFocus}
                  onChange={e => setReceivedAmount(e.target.value)}
                  placeholder="0"
                  style={{ ...inp, width: 120, padding: "7px 11px", textAlign: "right", fontSize: 13 }} />
              </div>
            </div>

            {balanceDue > 0 && (
              <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 9,
                background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: RED }}>Balance Due:</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: RED }}>Rs. {fmt2(balanceDue)}</span>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
              <span style={{ fontSize: 13, color: GRAY, fontWeight: 600 }}>Payment Mode</span>
              <select value={header.payment_method}
                onChange={e => setHeader({...header, payment_method: e.target.value})}
                style={{ ...inp, width: 150, cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>
                {["cash","card","esewa","khalti","bank_transfer","credit"].map(m => (
                  <option key={m} value={m}>{m.replace("_"," ")}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
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
            {saving ? "Updating…" : "Update Sales Invoice"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <button onClick={onBack}
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
                {saving ? "Saving…" : "Save Sales Invoice"}
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

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center",
          justifyContent: "center", padding: 16 }}>
          <div onClick={() => !deleting && setShowDeleteConfirm(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)", backdropFilter: "blur(2px)" }} />
          <div style={{ position: "relative", background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440,
            border: `1px solid ${BORDER}`, boxShadow: "0 25px 50px -12px rgba(15,23,42,0.25)", padding: 24,
            animation: "niCardIn 0.2s ease-out both" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#fef2f2", color: "#ef4444",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Trash2 size={22} />
              </div>
              <div style={{ paddingTop: 4, minWidth: 0 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: DARK, margin: 0 }}>Delete invoice?</h2>
                <p style={{ fontSize: 14, color: "#6b7280", marginTop: 4, lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 600, color: GRAY }}>
                    {shortDocNumber(existingInvoiceNumber, header.invoice_date) || "This invoice"}
                  </span>{" "}
                  will be permanently removed. Its balance and stock effects will be reversed, and any linked
                  sales returns will also be deleted.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                style={{ padding: "8px 20px", fontSize: 14, border: `1px solid ${BORDER}`, borderRadius: 12,
                  background: "#fff", color: GRAY, cursor: "pointer", opacity: deleting ? 0.5 : 1 }}>
                Cancel
              </button>
              <button onClick={runDelete} disabled={deleting}
                style={{ padding: "8px 20px", fontSize: 14, fontWeight: 600, borderRadius: 12, border: "none",
                  background: "#dc2626", color: "#fff", cursor: "pointer", opacity: deleting ? 0.5 : 1 }}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
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