import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabaseClient"
import { formatAD, formatBS } from "../../utils/dateHelpers"
import { Plus, Trash2, ChevronDown, Camera, Settings, ArrowLeft, Link2, Minus } from "lucide-react"
import toast from "react-hot-toast"

const BLUE = "#2563eb", BLUE_DK = "#1d4ed8", BLUE_BG = "#eff6ff", BLUE_BORDER = "#bfdbfe"
const BORDER = "#e5e7eb", LIGHT = "#f9fafb", DARK = "#111827", GRAY = "#374151", MUTED = "#9ca3af", RED = "#dc2626"

const lbl = { fontSize: 13.5, fontWeight: 600, color: GRAY, marginBottom: 7, display: "block" }
const inp = { width: "100%", padding: "9px 13px", fontSize: 14, border: `1px solid ${BORDER}`,
              borderRadius: 9, outline: "none", color: DARK, background: "#fff", boxSizing: "border-box" }
const cellInp = { width: "100%", border: "none", outline: "none", background: "transparent",
                   fontSize: 14, color: DARK, padding: "10px 11px", boxSizing: "border-box" }
const addLink = { display: "inline-flex", alignItems: "center", gap: 5, background: "none",
  border: "none", cursor: "pointer", color: BLUE, fontSize: 13.5, fontWeight: 600, padding: 0 }
const miniTrash = { background: "none", border: "none", cursor: "pointer", color: RED,
  padding: 5, display: "inline-flex", flexShrink: 0, borderRadius: 6 }

// Selects the whole value on focus so typing replaces "0" instead of
// prepending to it (fixes the "0100" leading-zero problem on number inputs).
const selectOnFocus = (e) => e.target.select()

const emptyRow = () => ({
  product_id: null, product_name: "", quantity: 1, unit: "",
  unit_price: 0, discount_percent: 0, discount: 0, total: 0
})

const TAX_PRESETS = [
  { label: "No Tax", value: 0 },
  { label: "VAT 13%", value: 13 },
  { label: "Custom %", value: "custom" },
]

let chargeSeq = 0

export default function NewInvoice({ storeId, onBack, initialCustomerId = null }) {
  const [customers,    setCustomers]    = useState([])
  const [products,     setProducts]     = useState([])
  const [rows,         setRows]         = useState([emptyRow()])
  const [header,       setHeader]       = useState({
    customer_id: initialCustomerId || "", invoice_date: new Date().toISOString().split("T")[0],
    payment_method: "cash", discount: 0, discount_percent: 0, tax: 0, notes: "",
  })
  const [saving,       setSaving]       = useState(false)
  const [custOpen,     setCustOpen]     = useState(false)
  const [custSearch,   setCustSearch]   = useState("")
  const [activeRowSearch, setActiveRowSearch] = useState(null)
  const [prodSearch,   setProdSearch]   = useState("")
  const custRef = useRef(null)

  // Invoice number — Auto (system generated) or Manual (typed in)
  const [invoiceNoMode,   setInvoiceNoMode]   = useState("auto") // "auto" | "manual"
  const [manualInvoiceNo, setManualInvoiceNo] = useState("")

  const [showDiscount, setShowDiscount] = useState(false)
  const [showTax,      setShowTax]      = useState(false)
  const [taxPreset,    setTaxPreset]    = useState(0)
  const [showCharges,  setShowCharges]  = useState(false)
  const [charges,      setCharges]      = useState([])
  const [showRound,    setShowRound]    = useState(false)
  const [roundSign,    setRoundSign]    = useState("+")
  const [roundOff,     setRoundOff]     = useState(0)

  useEffect(() => {
    if (!storeId) return
    supabase.from("customers").select("id,name,phone,balance").eq("store_id", storeId).order("name")
      .then(({ data }) => setCustomers(data || []))
    supabase.from("products").select("id,name,selling_price,unit,stock_quantity,sku")
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
    u[i].total        = product.selling_price * (parseFloat(u[i].quantity) || 1)
    setRows(u)
    setActiveRowSearch(null)
    setProdSearch("")
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
  function removeDiscount() {
    setShowDiscount(false)
    setHeader(h => ({ ...h, discount: 0, discount_percent: 0 }))
  }

  function applyTaxPreset(val) {
    setTaxPreset(val)
    if (val === "custom") return
    setHeader(h => ({ ...h, tax: Math.max(0, subtotal * (parseFloat(val)||0) / 100) }))
  }
  function setTaxRs(val) { setHeader(h => ({ ...h, tax: val })) }
  function removeTax() {
    setShowTax(false); setTaxPreset(0)
    setHeader(h => ({ ...h, tax: 0 }))
  }

  function addCharge() { setCharges(c => [...c, { id: ++chargeSeq, name: "", amount: "" }]) }
  function updateCharge(id, field, val) { setCharges(c => c.map(x => x.id === id ? { ...x, [field]: val } : x)) }
  function removeCharge(id) { setCharges(c => c.filter(x => x.id !== id)) }
  function removeChargesSection() { setShowCharges(false); setCharges([]) }

  function removeRoundOff() { setShowRound(false); setRoundOff(0); setRoundSign("+") }

  async function handleSave(payStatus = "paid") {
    const validRows = rows.filter(r => r.product_name.trim() && r.quantity > 0)
    if (!validRows.length) return toast.error("Add at least one item")

    if (invoiceNoMode === "manual" && !manualInvoiceNo.trim()) {
      return toast.error("Enter an invoice number, or switch back to Auto")
    }

    setSaving(true)
    try {
      let invNum = manualInvoiceNo.trim()
      if (invoiceNoMode === "auto") {
        const { count } = await supabase.from("invoices")
          .select("id", { count: "exact", head: true }).eq("store_id", storeId)
        invNum = `INV-${new Date().getFullYear()}-${String((count||0)+1).padStart(3,"0")}`
      } else {
        const { data: existing } = await supabase.from("invoices")
          .select("id").eq("store_id", storeId).eq("invoice_number", invNum).maybeSingle()
        if (existing) {
          toast.error(`Invoice number "${invNum}" already exists`)
          setSaving(false)
          return
        }
      }

      const taxToSave = Math.round((taxRs + roundVal) * 100) / 100

      const { data: inv, error } = await supabase.from("invoices").insert({
        store_id:         storeId,
        customer_id:      header.customer_id || null,
        invoice_number:   invNum,
        invoice_date:     header.invoice_date,
        subtotal:         Math.round(subtotal * 100) / 100,
        discount:         discountRs,
        tax:              taxToSave,
        delivery_charge:  chargesTotal,
        delivery_address: null,
        delivery_note:    charges.length ? JSON.stringify(charges) : null,
        total:            Math.round(total * 100) / 100,
        paid_amount:      payStatus === "paid" ? Math.round(total * 100) / 100 : 0,
        payment_method:   header.payment_method,
        status:           payStatus === "paid" ? "paid" : "unpaid",
        notes:            header.notes,
      }).select().single()
      if (error) throw error

      await supabase.from("invoice_items").insert(
        validRows.map(r => ({
          invoice_id:   inv.id,
          product_id:   r.product_id,
          product_name: r.product_name,
          quantity:     parseFloat(r.quantity),
          unit_price:   parseFloat(r.unit_price),
          discount:     parseFloat(r.discount) || 0,
          total:        parseFloat(r.total),
        }))
      )

      for (const r of validRows) {
        if (r.product_id) {
          const { data: p } = await supabase.from("products")
            .select("stock_quantity").eq("id", r.product_id).single()
          if (p) await supabase.from("products")
            .update({ stock_quantity: p.stock_quantity - parseFloat(r.quantity) })
            .eq("id", r.product_id)
        }
      }

      toast.success(`${invNum} saved!`)
      onBack()
    } catch(e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredCusts = customers.filter(c =>
    c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
    (c.phone||"").includes(custSearch)
  )

  const filteredProds = (q) => products.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    (p.sku||"").toLowerCase().includes(q.toLowerCase())
  ).slice(0, 8)

  const selCust = customers.find(c => c.id === header.customer_id)

  // Whole-rupee display — no ".00" clutter
  const fmtNum = (n) => Math.round(Number(n||0)).toLocaleString("en-IN")

  return (
    <div style={{ padding: 22, background: LIGHT, minHeight: "100%" }}>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
        <button onClick={onBack}
          style={{ display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34, borderRadius: 999, border: `1px solid ${BORDER}`, background: "#fff",
            color: GRAY, cursor: "pointer", marginRight: 12 }}>
          <ArrowLeft size={17} />
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: DARK }}>Create Sales Invoice</h1>
        <div style={{ flex: 1 }} />
        <button style={{ display: "flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 9, border: `1px solid ${BORDER}`, background: "#fff",
          color: GRAY, cursor: "pointer" }}>
          <Settings size={16} />
        </button>
      </div>

      {/* Card */}
      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14,
        overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", borderTop: `3px solid ${BLUE}` }}>

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
                  boxShadow: "0 10px 24px rgba(0,0,0,0.12)", zIndex: 30, overflow: "hidden" }}>
                  <div style={{ padding: 9, borderBottom: `1px solid ${BORDER}` }}>
                    <input autoFocus value={custSearch} onChange={e => setCustSearch(e.target.value)}
                      placeholder="Search customers..."
                      style={{ ...inp, padding: "7px 11px", fontSize: 13.5 }} />
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    <button
                      onClick={() => { setHeader({...header, customer_id:""}); setCustOpen(false) }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "11px 15px", background: "none", border: "none",
                        borderBottom: "1px solid #f3f4f6", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => e.currentTarget.style.background = LIGHT}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ fontSize: 14, color: GRAY, fontWeight: 600 }}>Walk-in / Cash Sale</span>
                    </button>
                    {filteredCusts.map(c => (
                      <button key={c.id}
                        onClick={() => { setHeader({...header, customer_id:c.id}); setCustOpen(false) }}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "11px 15px", background: "none", border: "none",
                          borderBottom: "1px solid #f3f4f6", cursor: "pointer", textAlign: "left" }}
                        onMouseEnter={e => e.currentTarget.style.background = LIGHT}
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
                <button
                  onClick={() => setInvoiceNoMode(m => m === "auto" ? "manual" : "auto")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
                    fontSize: 12, fontWeight: 700, color: BLUE }}>
                  {invoiceNoMode === "auto" ? "Manual" : "Auto"}
                </button>
              </div>
              {invoiceNoMode === "manual" ? (
                <input
                  value={manualInvoiceNo}
                  onChange={e => setManualInvoiceNo(e.target.value)}
                  placeholder="e.g. 160173"
                  style={{ ...inp, minWidth: 170 }}
                />
              ) : (
                <div style={{ ...inp, color: MUTED, minWidth: 170 }}>
                  INV-{new Date().getFullYear()}-###
                </div>
              )}
            </div>
            <div>
              <span style={lbl}>Invoice Date</span>
              <input type="date" value={header.invoice_date}
                onChange={e => setHeader({...header, invoice_date: e.target.value})}
                style={{ ...inp, minWidth: 170 }} />
              <p style={{ fontSize: 12, color: BLUE, fontWeight: 600, marginTop: 6 }}>
                {formatBS(header.invoice_date)}
              </p>
            </div>
          </div>
        </div>

        {/* Billing items table */}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: "#fafaf9" }}>
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

                  {activeRowSearch === i && prodSearch && filteredProds(prodSearch).length > 0 && (
                    <div style={{ position: "absolute", left: 13, right: 13, top: "100%", marginTop: 3,
                      background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 11,
                      boxShadow: "0 10px 24px rgba(0,0,0,0.14)", zIndex: 20, overflow: "hidden" }}>
                      {filteredProds(prodSearch).map(p => (
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
                            <p style={{ fontSize: 14, fontWeight: 700, color: DARK }}>Rs. {p.selling_price.toLocaleString("en-IN")}</p>
                            <p style={{ fontSize: 12, color: MUTED }}>{p.stock_quantity} {p.unit} in stock</p>
                          </div>
                        </button>
                      ))}
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
            ))}

            <tr>
              <td colSpan={4} style={{ ...tdStyle, borderBottom: "none" }}>
                <button onClick={() => setRows([...rows, emptyRow()])} style={addLink}>
                  <Plus size={15} /> Add Billing Item
                </button>
              </td>
              <td style={{ ...tdStyle, borderBottom: "none", textAlign: "right", fontSize: 13.5, color: GRAY, fontWeight: 600 }}>
                Sub Total
              </td>
              <td style={{ ...tdStyle, borderBottom: "none", textAlign: "right", fontSize: 14.5, fontWeight: 700, color: DARK, whiteSpace: "nowrap" }}>
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
              <label style={{ width: 84, height: 84, borderRadius: 11,
                border: `1.5px dashed ${BORDER}`, display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer", background: LIGHT }}>
                <Camera size={21} color={MUTED} />
                <input type="file" accept="image/*" style={{ display: "none" }} />
              </label>
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
                  <span style={{ fontSize: 13.5, color: GRAY, fontWeight: 600, width: 72, flexShrink: 0 }}>Discount</span>
                  <input type="number" min="0" max="100" className="no-spin" value={header.discount_percent}
                    onFocus={selectOnFocus}
                    onChange={e => setDiscountPercent(e.target.value)}
                    placeholder="0"
                    style={{ ...inp, width: 56, padding: "7px 6px", textAlign: "center", fontSize: 13.5 }} />
                  <span style={{ fontSize: 12, color: MUTED }}>%</span>
                  <Link2 size={13} color={MUTED} />
                  <input type="number" min="0" className="no-spin" value={header.discount}
                    onFocus={selectOnFocus}
                    onChange={e => setDiscountRs(e.target.value)}
                    placeholder="0"
                    style={{ ...inp, flex: 1, padding: "7px 11px", textAlign: "right", fontSize: 13.5 }} />
                  <span style={{ fontSize: 12, color: MUTED }}>Rs.</span>
                  <button onClick={removeDiscount} style={miniTrash}><Trash2 size={14} /></button>
                </div>
              )}

              {showTax && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13.5, color: GRAY, fontWeight: 600, width: 72, flexShrink: 0 }}>Tax</span>
                  <select value={taxPreset} onChange={e => applyTaxPreset(e.target.value === "custom" ? "custom" : Number(e.target.value))}
                    style={{ ...inp, flex: 1, padding: "7px 9px", cursor: "pointer", fontSize: 13.5 }}>
                    {TAX_PRESETS.map(t => <option key={t.label} value={t.value}>{t.label}</option>)}
                  </select>
                  <input type="number" min="0" className="no-spin" value={header.tax}
                    disabled={taxPreset !== "custom"}
                    onFocus={selectOnFocus}
                    onChange={e => setTaxRs(e.target.value)}
                    placeholder="0"
                    style={{ ...inp, width: 96, padding: "7px 11px", textAlign: "right", fontSize: 13.5,
                      background: taxPreset !== "custom" ? LIGHT : "#fff", color: taxPreset !== "custom" ? MUTED : DARK }} />
                  <span style={{ fontSize: 12, color: MUTED }}>Rs.</span>
                  <button onClick={removeTax} style={miniTrash}><Trash2 size={14} /></button>
                </div>
              )}

              {showCharges && charges.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input value={c.name} onChange={e => updateCharge(c.id, "name", e.target.value)}
                    placeholder="Enter charge name"
                    style={{ ...inp, flex: 1, padding: "7px 11px", fontSize: 13.5 }} />
                  <input type="number" min="0" className="no-spin" value={c.amount}
                    onFocus={selectOnFocus}
                    onChange={e => updateCharge(c.id, "amount", e.target.value)}
                    placeholder="0"
                    style={{ ...inp, width: 96, padding: "7px 11px", textAlign: "right", fontSize: 13.5 }} />
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
                  style={{ ...addLink, color: MUTED, fontWeight: 500, fontSize: 12.5 }}>
                  Remove Charges Section
                </button>
              )}

              {showRound && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13.5, color: GRAY, fontWeight: 600, width: 72, flexShrink: 0 }}>Round Off</span>
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
                    style={{ ...inp, flex: 1, padding: "7px 11px", textAlign: "right", fontSize: 13.5 }} />
                  <span style={{ fontSize: 12, color: MUTED }}>Rs.</span>
                  <button onClick={removeRoundOff} style={miniTrash}><Trash2 size={14} /></button>
                </div>
              )}
            </div>

            {/* Total — plain, no highlight box */}
            <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 18, paddingTop: 16,
              display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, color: DARK, fontWeight: 700 }}>Total Amount</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: DARK }}>
                Rs. {fmtNum(total)}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
              <span style={{ fontSize: 13.5, color: GRAY, fontWeight: 600 }}>Payment Mode</span>
              <select value={header.payment_method}
                onChange={e => setHeader({...header, payment_method: e.target.value})}
                style={{ ...inp, width: 150, cursor: "pointer", fontSize: 13.5 }}>
                {["cash","card","esewa","khalti","bank_transfer","credit"].map(m => (
                  <option key={m} value={m}>{m.replace("_"," ")}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
        <button onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer",
            color: GRAY, fontSize: 13.5, fontWeight: 600, padding: "9px 6px" }}>
          Cancel
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => handleSave("unpaid")} disabled={saving}
            style={{ padding: "10px 20px", fontSize: 13.5, fontWeight: 600, color: GRAY,
              border: `1px solid ${BORDER}`, background: "#fff", borderRadius: 999,
              cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            Save & New
          </button>

          <div style={{ display: "flex", borderRadius: 999, overflow: "hidden" }}>
            <button onClick={() => handleSave("paid")} disabled={saving}
              style={{ padding: "10px 22px", fontSize: 13.5, fontWeight: 700, color: "#fff",
                background: BLUE, border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save Sales Invoice"}
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
    </div>
  )
}

const thStyle = {
  padding: "12px 11px", textAlign: "left", fontSize: 11.5, fontWeight: 700,
  color: GRAY, borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`,
  textTransform: "uppercase", letterSpacing: "0.04em",
}
const tdStyle = {
  padding: "9px 11px", borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`,
  verticalAlign: "middle",
}
