import { useEffect, useRef, useState } from "react"
import { Trash2, HelpCircle } from "lucide-react"

// Set by <ConfirmHost /> once it is mounted (see App.jsx)
let openDialog = null

// Drop-in replacement for window.confirm. Returns a Promise<boolean>.
//
//   if (!(await confirmDialog({ title: "Delete customer?", message: "...", confirmText: "Delete", variant: "danger" }))) return
//   if (!(await confirmDialog("Discard this bill?"))) return      // plain string also works
export function confirmDialog(options = {}) {
  const opts = typeof options === "string" ? { message: options } : options
  return new Promise((resolve) => {
    // Falls back to the browser dialog if the host is not mounted
    if (!openDialog) return resolve(window.confirm(opts.message || opts.title || "Are you sure?"))
    openDialog({ ...opts, resolve })
  })
}

const PRIMARY_BTN = "bg-slate-900 hover:bg-slate-800 text-white dark:bg-lime-300 dark:hover:bg-lime-400 dark:text-slate-900"
const DANGER_BTN  = "bg-red-600 hover:bg-red-700 text-white"
const OUTLINE_BTN = "border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-slate-800 dark:text-gray-300"

export function ConfirmHost() {
  const [dlg, setDlg]   = useState(null)
  const [show, setShow] = useState(false)
  const dlgRef    = useRef(null)
  const cancelRef = useRef(null)
  const okRef     = useRef(null)

  useEffect(() => {
    openDialog = (d) => {
      dlgRef.current?.resolve(false) // a newer dialog replaces an open one
      dlgRef.current = d
      setDlg(d)
      requestAnimationFrame(() => setShow(true))
    }
    return () => { openDialog = null }
  }, [])

  function close(result) {
    const d = dlgRef.current
    dlgRef.current = null
    setShow(false)
    d?.resolve(result)
    setTimeout(() => setDlg(null), 150)
  }

  // Esc cancels. Focus lands on Cancel for deletes, on the main button otherwise.
  useEffect(() => {
    if (!dlg) return
    const onKey = (e) => { if (e.key === "Escape") close(false) }
    window.addEventListener("keydown", onKey)
    ;(dlg.variant === "danger" ? cancelRef : okRef).current?.focus()
    return () => window.removeEventListener("keydown", onKey)
  }, [dlg])

  if (!dlg) return null

  const danger = dlg.variant === "danger"

  return (
    // z-[100] keeps this above every other popup in the app (detail popups use z-[60])
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        onClick={() => close(false)}
        className={`absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-150 ${show ? "opacity-100" : "opacity-0"}`}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className={`relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl p-6 transition-all duration-150 ${
          show ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-1"
        }`}>
        <div className="flex items-start gap-4">
          <div className={`shrink-0 w-11 h-11 rounded-full grid place-items-center ${
            danger
              ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
              : "bg-lime-100 text-slate-800 dark:bg-lime-950 dark:text-lime-300"
          }`}>
            {danger ? <Trash2 size={20} /> : <HelpCircle size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {dlg.title || "Are you sure?"}
            </h2>
            {dlg.message && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 break-words">{dlg.message}</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            onClick={() => close(false)}
            className={`px-4 py-2 text-sm font-medium rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 ${OUTLINE_BTN}`}>
            {dlg.cancelText || "Cancel"}
          </button>
          <button
            ref={okRef}
            onClick={() => close(true)}
            className={`px-5 py-2 text-sm font-medium rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 ${danger ? DANGER_BTN : PRIMARY_BTN}`}>
            {dlg.confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  )
}