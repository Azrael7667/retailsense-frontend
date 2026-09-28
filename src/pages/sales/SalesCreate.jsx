import { useLocation, useNavigate } from "react-router-dom"
import { useStoreId } from "../../hooks/useStoreId"
import NewInvoice from "./NewInvoice"

export default function SalesCreate() {
  const { storeId } = useStoreId()
  const location    = useLocation()
  const navigate    = useNavigate()

  const customerId = location.state?.customerId || null
  const editId     = location.state?.editId || null

  if (!storeId) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <NewInvoice
      storeId={storeId}
      initialCustomerId={customerId}
      editId={editId}
      onBack={() => {
        // Came from a customer's ledger? Return there and re-select them.
        if (customerId) navigate("/customers", { state: { selectCustomerId: customerId } })
        else navigate("/sales")
      }}
    />
  )
}