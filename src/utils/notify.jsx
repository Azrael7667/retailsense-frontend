import toast from "react-hot-toast"
import { ToastBody } from "../components/common/AppToaster"

// Use these when a toast needs a title AND a description, or a yellow warning.
//
//   notify.success("Purchase saved", "Stock was updated for 4 items.")
//   notify.warning("Low stock", "Only 2 pcs left of Brake Pad.")
//   notify.error("Could not save", err.message)
//
// Normal calls like toast.success("Saved!") keep working without this file.
const body = (title, description) => <ToastBody title={title} description={description} />

export const notify = {
  success: (title, description, opts) => toast.success(body(title, description), opts),
  error:   (title, description, opts) => toast.error(body(title, description), opts),
  warning: (title, description, opts) =>
    toast(body(title, description), { ...opts, className: "toast-warning" }),
}