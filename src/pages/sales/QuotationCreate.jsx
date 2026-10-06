import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import toast from "react-hot-toast"
import { supabase } from "../../lib/supabaseClient"
import apiClient from "../../lib/apiClient"
import { useStoreId } from "../../hooks/useStoreId"
import { formatBS } from "../../utils/dateHelpers"

const DEFAULT_VAT = 13
const FIELD = "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 focus:border-lime-500"
const LABEL = "block text-[13px] font-semibold text-slate-700 mb-1.5"
const TH = "px-3 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-700 bg-gray-50 border-b border-r border-gray-200 text-left"
const TD = "border-b border-r border-gray-200 align-middle"
const CELL = "w-full px-3 py-2.5 text-sm bg-transparent outline-none"
const fmt2 = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const isoDay = (offset = 0) => {
  const d = new Date(); d.setDate(d.getDate() + offset)
  return d.toISOString().split("T")[0]
}
const emptyRow = () => ({ product_id: null, product_name: "", quantity: 1, unit_price: 0, discount: 0 })
const rowTotal = (r) => Math.max(0, (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_price) || 0) - (parseFloat(r.discount) || 0))

export default function QuotationCreate() {
  const { storeId } = useStoreId()
  const location = useLocation()
  const navigate = useNavigate()
  const editId = location.state?.editId || null
  const onBack = () => navigate("/quotations")

  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [rows, setRows] = useState([emptyRow()])
  const [header, setHeader] = useState({
    customer_id: "", quotation_date: isoDay(0), valid_until: isoDay(14), notes: "", terms: "",
  })
  const [discount, setDiscount] = useState("0")
  const [vatPercent, setVatPercent] = useState(String(DEFAULT_VAT))
  const [quotationNo, setQuotationNo] = useState("")
  const [status, setStatus] = useState("draft")
  const [activeRow, setActiveRow] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!editId)

  useEffect(() => {
    if (!storeId) return
    supabase.from("customers").select("id,name,phone").eq("store_id", storeId).order("name")
      .then(({ data }) => setCustomers(data || []))
    supabase.from("products").select("id,name,local_names,selling_price,sku")
      .eq("store_id", storeId).eq("is_active", true).order("name")
      .then(({ data }) => setProducts(data || []))
  }, [storeId])

  useEffect(() => {
    if (!editId) return
    let cancelled = false
    apiClient.get(`/api/quotations/${editId}`).then(({ data }) => {
      if (cancelled) return
      setQuotationNo(data.quotation_number)
      setStatus(data.status)
      const items = (data.items || []).map(i => ({
        product_id: i.product_id, product_name: i.product_name,
        quantity: i.quantity, unit_price: i.unit_price, discount: i.discount || 0,
      }))
      setRows(items.length ? items : [emptyRow()])
      setHeader({
        customer_id: data.customer_id || "", quotation_date: data.quotation_date,
        valid_until: data.valid_until || "", notes: data.notes || "", terms: data.terms || "",
      })
      const itemsSub = items.reduce((s, r) => s + rowTotal(r), 0)
      const disc = data.discount || 0
      setDiscount(String(disc))
      const taxable = Math.max(0, itemsSub - disc)
      setVatPercent(data.tax > 0 && taxable > 0 ? String(+((data.tax / taxable) * 100).toFixed(4)) : "0")
    }).catch(e => {
      toast.error(e?.response?.data?.detail || "Failed to load quotation")
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [editId])

  const locked = status === "converted"
  const subtotal = rows.reduce((s, r) => s + rowTotal(r), 0)
  const discountRs = parseFloat(discount) || 0
  const taxable = Math.max(0, subtotal - discountRs)
  const vatRs = Math.round(taxable * (parseFloat(vatPercent) || 0)) / 100
  const total = Math.round((taxable + vatRs) * 100) / 100

  const updateRow = (i, field, val) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [field]: val } : r))
  const pickProduct = (i, p) => {
    setRows(rs => rs.map((r, j) => j === i ? { ...r, product_id: p.id, product_name: p.name, unit_price: p.selling_price } : r))
    setActiveRow(null)
  }
  const matches = (q) => products.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) || (p.local_names || "").toLowerCase().includes(q.toLowerCase()) || (p.sku || "").toLowerCase().includes(q.toLowerCase())
  ).slice(0, 8)

  async function save(stayForNext) {
    const valid = rows.filter(r => r.product_name.trim() && parseFloat(r.quantity) > 0)
    if (!valid.length) return toast.error("Add at least one item")
    if (header.valid_until && header.valid_until < header.quotation_date) {
      return toast.error("'Valid until' can't be before the quotation date")
    }
    setSaving(true)
    try {
      const payload = {
        customer_id: header.customer_id || null,
        quotation_date: header.quotation_date,
        valid_until: header.valid_until || null,
        discount: discountRs,
        tax: vatRs,
        notes: header.notes || null,
        terms: header.terms || null,
        items: valid.map(r => ({
          product_id: r.product_id || null,
          product_name: r.product_name,
          quantity: parseFloat(r.quantity),
          unit_price: parseFloat(r.unit_price) || 0,
          discount: parseFloat(r.discount) || 0,
        })),
      }
      if (editId) {
        await apiClient.put(`/api/quotations/${editId}`, payload)
        toast.success("Quotation updated")
        onBack()
      } else {
        const { data } = await apiClient.post("/api/quotations/", { ...payload, quotation_number_mode: "auto" })
        toast.success(`${data.quotation_number} saved`)
        if (stayForNext) {
          setRows([emptyRow()]); setDiscount("0"); setVatPercent(String(DEFAULT_VAT))
          setHeader(h => ({ ...h, customer_id: "", notes: "", terms: "" }))
        } else onBack()
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || "Failed to save quotation")
    } finally {
      setSaving(false)
    }
  }

  if (!storeId || loading) {
    return <div className="py-24"><div className="w-6 h-6 border-2 border-lime-600 border-t-transparent rounded-full animate-spin mx-auto" /></div>
  }

  return (
    <div className="p-6 bg-slate-50 min-h-full">
      <div className="flex items-center mb-4">
        <button onClick={onBack} className="w-9 h-9 rounded-full border border-gray-200 bg-white text-gray-600 flex items-center justify-center mr-3">
          <ArrowLeft size={17} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">{editId ? "Edit Quotation" : "Create Quotation"}</h1>
      </div>

      {locked && (
        <p className="mb-4 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
          This quotation was converted to an invoice and can't be edited.
        </p>
      )}

      <div className="bg-white border border-gray-200 border-t-[3px] border-t-lime-500 rounded-xl overflow-hidden">
        {/* Party + dates */}
        <div className="px-6 py-5 border-b border-gray-200 flex flex-wrap items-start justify-between gap-6">
          <div className="w-[310px]">
            <label className={LABEL}>Customer</label>
            <select value={header.customer_id} disabled={locked}
              onChange={e => setHeader({ ...header, customer_id: e.target.value })} className={FIELD}>
              <option value="">Walk-in / No customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-6">
            <div>
              <label className={LABEL}>Quotation No</label>
              <div className={`${FIELD} min-w-[150px] bg-gray-50 text-gray-500`}>{quotationNo || "QT-####"}</div>
            </div>
            <div>
              <label className={LABEL}>Date</label>
              <input type="date" value={header.quotation_date} disabled={locked}
                onChange={e => setHeader({ ...header, quotation_date: e.target.value })} className={`${FIELD} min-w-[150px]`} />
              <p className="text-xs font-semibold text-slate-600 mt-1.5">{formatBS(header.quotation_date)}</p>
            </div>
            <div>
              <label className={LABEL}>Valid until</label>
              <input type="date" value={header.valid_until} disabled={locked}
                onChange={e => setHeader({ ...header, valid_until: e.target.value })} className={`${FIELD} min-w-[150px]`} />
            </div>
          </div>
        </div>

        {/* Items */}
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr>
              <th className={`${TH} w-[5%] text-center`}>S.N.</th>
              <th className={`${TH} w-[38%]`}>Item Name</th>
              <th className={`${TH} w-[10%] text-center`}>Qty</th>
              <th className={`${TH} w-[16%] text-right`}>Rate</th>
              <th className={`${TH} w-[14%] text-right`}>Discount (Rs)</th>
              <th className={`${TH} w-[14%] text-right`}>Amount</th>
              <th className={`${TH} w-[3%] border-r-0`}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className={`${TD} text-center text-xs font-bold text-slate-900`}>{i + 1}</td>
                <td className={`${TD} relative`}>
                  <input className={CELL} placeholder="Enter item name" value={r.product_name} disabled={locked}
                    onChange={e => { updateRow(i, "product_name", e.target.value); updateRow(i, "product_id", null); setActiveRow(i) }}
                    onFocus={() => setActiveRow(i)}
                    onBlur={() => setTimeout(() => setActiveRow(a => (a === i ? null : a)), 150)} />
                  {activeRow === i && r.product_name && matches(r.product_name).length > 0 && (
                    <div className="absolute left-2 right-2 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {matches(r.product_name).map(p => (
                        <button key={p.id} type="button" onMouseDown={() => pickProduct(i, p)}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-lime-50 border-b border-gray-100">
                          <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                          <span className="text-sm text-gray-700">Rs. {Number(p.selling_price || 0).toLocaleString("en-IN")}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className={TD}>
                  <input type="number" min="0" className={`${CELL} text-center font-semibold`} value={r.quantity} disabled={locked}
                    onFocus={e => e.target.select()} onChange={e => updateRow(i, "quantity", e.target.value)} />
                </td>
                <td className={TD}>
                  <input type="number" min="0" className={`${CELL} text-right`} value={r.unit_price} disabled={locked}
                    onFocus={e => e.target.select()} onChange={e => updateRow(i, "unit_price", e.target.value)} />
                </td>
                <td className={TD}>
                  <input type="number" min="0" className={`${CELL} text-right`} value={r.discount} disabled={locked}
                    onFocus={e => e.target.select()} onChange={e => updateRow(i, "discount", e.target.value)} />
                </td>
                <td className={`${TD} px-3 text-right text-sm font-bold text-gray-900 whitespace-nowrap`}>Rs. {fmt2(rowTotal(r))}</td>
                <td className={`${TD} border-r-0 text-center`}>
                  {rows.length > 1 && !locked && (
                    <button onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} className="p-1.5 text-red-500 hover:bg-red-50 rounded-md">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} className={`${TD} border-b-0 px-3 py-3`}>
                {!locked && (
                  <button onClick={() => setRows(rs => [...rs, emptyRow()])}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
                    <Plus size={15} /> Add Item
                  </button>
                )}
              </td>
              <td className={`${TD} border-b-0 px-3 text-right text-[13px] font-semibold text-slate-700`}>Sub Total</td>
              <td className={`${TD} border-b-0 px-3 text-right text-sm font-bold text-gray-900 whitespace-nowrap`}>Rs. {fmt2(subtotal)}</td>
              <td className={`${TD} border-b-0 border-r-0`}></td>
            </tr>
          </tbody>
        </table>

        {/* Notes + totals */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-4">
            <div>
              <label className={LABEL}>Notes</label>
              <textarea rows={3} className={`${FIELD} resize-none max-w-[400px]`} value={header.notes} disabled={locked}
                placeholder="Note shown on the quotation" onChange={e => setHeader({ ...header, notes: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Terms & conditions</label>
              <textarea rows={3} className={`${FIELD} resize-none max-w-[400px]`} value={header.terms} disabled={locked}
                placeholder="e.g. Prices valid for 14 days. Delivery within 3 days." onChange={e => setHeader({ ...header, terms: e.target.value })} />
            </div>
          </div>

          <div className="w-full max-w-[360px] md:ml-auto border border-gray-200 self-start">
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="h-10 px-3 text-[13px] font-semibold text-slate-700 bg-gray-50 border-b border-r border-gray-200 w-[40%]">Total Amount</td>
                  <td className="h-10 px-3 text-right text-[13px] font-semibold border-b border-gray-200" colSpan={2}>Rs. {fmt2(subtotal)}</td>
                </tr>
                <tr>
                  <td className="h-10 px-3 text-[13px] font-semibold text-slate-700 bg-gray-50 border-b border-r border-gray-200">Discount (Rs)</td>
                  <td className="border-b border-gray-200" colSpan={2}>
                    <input type="number" min="0" className={`${CELL} text-right`} value={discount} disabled={locked}
                      onFocus={e => e.target.select()} onChange={e => setDiscount(e.target.value)} />
                  </td>
                </tr>
                <tr>
                  <td className="h-10 px-3 text-[13px] font-semibold text-slate-700 bg-gray-50 border-b border-r border-gray-200">Taxable</td>
                  <td className="h-10 px-3 text-right text-[13px] font-semibold border-b border-gray-200" colSpan={2}>Rs. {fmt2(taxable)}</td>
                </tr>
                <tr>
                  <td className="h-10 px-3 text-[13px] font-semibold text-slate-700 bg-gray-50 border-b border-r border-gray-200">VAT %</td>
                  <td className="border-b border-r border-gray-200 w-[26%]">
                    <input type="number" min="0" max="100" step="any" className={`${CELL} text-center`} value={vatPercent} disabled={locked}
                      onFocus={e => e.target.select()} onChange={e => setVatPercent(e.target.value)} />
                  </td>
                  <td className="h-10 px-3 text-right text-[13px] font-semibold border-b border-gray-200">Rs. {fmt2(vatRs)}</td>
                </tr>
                <tr>
                  <td className="h-11 px-3 text-[13px] font-bold bg-lime-50 border-r border-gray-200">Net Amount</td>
                  <td className="h-11 px-3 text-right text-[17px] font-extrabold bg-lime-50" colSpan={2}>Rs. {fmt2(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-4">
        <button onClick={onBack} className="text-[13px] font-semibold text-gray-600 px-2 py-2">Cancel</button>
        {!locked && (
          <div className="flex items-center gap-2.5">
            {!editId && (
              <button onClick={() => save(true)} disabled={saving}
                className="px-5 py-2.5 text-[13px] font-semibold border border-gray-200 bg-white rounded-full disabled:opacity-60">
                Save & New
              </button>
            )}
            <button onClick={() => save(false)} disabled={saving}
              className="px-6 py-2.5 text-[13px] font-bold text-white bg-slate-900 rounded-full disabled:opacity-60">
              {saving ? "Saving…" : editId ? "Update Quotation" : "Save Quotation"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
