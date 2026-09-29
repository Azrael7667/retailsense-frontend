import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Toaster, toast, resolveValue } from "react-hot-toast"
import { Check, X, Loader2 } from "lucide-react"

// Colour of the round icon button for each toast type
const COLORS = {
  success: "#22c55e",
  error:   "#ef4444",
  warning: "#f59e0b",
  loading: "#0a5cff",
  info:    "#0a5cff",
}

const PILL_BG = "#16191d"
const SPRING   = "cubic-bezier(0.34, 1.35, 0.64, 1)" // slight overshoot, like the island
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)"

// Colours are inline on purpose so no other CSS can override them.
const TITLE = { margin: 0, fontSize: 14, fontWeight: 600, lineHeight: "18px", color: "#ffffff", wordBreak: "break-word", textAlign: "left" }
const DESC  = { margin: "1px 0 0", fontSize: 12, lineHeight: "16px", color: "#9aa3ad", wordBreak: "break-word", textAlign: "left" }

function getVariant(t) {
  if (t.type === "success") return "success"
  if (t.type === "error") return "error"
  if (t.type === "loading") return "loading"
  if (t.className?.includes("toast-warning")) return "warning"
  return "info"
}

function Glyph({ variant, customIcon }) {
  if (customIcon) return <span style={{ fontSize: 15, lineHeight: 1 }}>{customIcon}</span>
  if (variant === "success") return <Check size={18} strokeWidth={3} color="#fff" />
  if (variant === "error")   return <X size={18} strokeWidth={3} color="#fff" />
  if (variant === "loading") return <Loader2 size={18} strokeWidth={2.5} color="#fff" className="animate-spin" />
  return <span style={{ color: "#fff", fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{variant === "warning" ? "!" : "i"}</span>
}

// Title + optional description. Use it through `notify` (see utils/notify.jsx).
export function ToastBody({ title, description }) {
  return (
    <>
      <p style={TITLE}>{title}</p>
      {description && <p style={DESC}>{description}</p>}
    </>
  )
}

function ToastCard({ t }) {
  const variant = getVariant(t)
  const message = resolveValue(t.message, t)
  const isPlainText = typeof message === "string"
  const isLong = isPlainText && message.length > 40

  const reduce =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const ms = (n) => (reduce ? 0 : n)

  const [shown, setShown] = useState(false) // the small pill has popped in
  const [open,  setOpen]  = useState(false) // the pill is stretched open with text
  const [textW, setTextW] = useState(0)
  const textRef = useRef(null)
  const leaving = !t.visible

  // Enter: pop in, then stretch open
  useEffect(() => {
    const a = setTimeout(() => setShown(true), 30)
    const b = setTimeout(() => setOpen(true), 30 + ms(230))
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [])

  // Leave: shrink back first, then fade out
  useEffect(() => { if (leaving) setOpen(false) }, [leaving])

  // Measure the text so the pill can animate to its exact width
  useLayoutEffect(() => {
    if (textRef.current) setTextW(textRef.current.offsetWidth)
  }, [t.type, t.message])

  const visible = shown && !leaving
  const exitDelay = leaving ? ms(260) : 0

  return (
    <div
      onClick={() => t.type !== "loading" && toast.dismiss(t.id)}
      style={{
        display: "flex",
        alignItems: "center",
        boxSizing: "border-box",
        height: 52,
        padding: 8,
        maxWidth: "calc(100vw - 2rem)",
        borderRadius: open ? 26 : 20,
        background: PILL_BG,
        color: "#fff",
        cursor: t.type === "loading" ? "default" : "pointer",
        boxShadow: "0 14px 32px -10px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
        transformOrigin: "right top",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(-14px) scale(0.6)",
        transition: [
          `opacity ${ms(220)}ms ${EASE_OUT} ${exitDelay}ms`,
          `transform ${ms(leaving ? 260 : 480)}ms ${leaving ? EASE_OUT : SPRING} ${exitDelay}ms`,
          `border-radius ${ms(400)}ms ${EASE_OUT}`,
        ].join(", "),
      }}>

      {/* Text: width animates from 0 to its natural size */}
      <div
        style={{
          overflow: "hidden",
          width: open ? textW : 0,
          opacity: open ? 1 : 0,
          transition: `width ${ms(520)}ms ${SPRING}, opacity ${ms(260)}ms ease ${open ? ms(120) : 0}ms`,
        }}>
        <div ref={textRef} style={{ width: "max-content", maxWidth: 260, padding: "0 12px 0 10px" }}>
          {isPlainText ? (
            <p style={isLong ? { ...TITLE, fontSize: 13, fontWeight: 500 } : TITLE}>{message}</p>
          ) : (
            message
          )}
        </div>
      </div>

      {/* Round icon button */}
      <div
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: COLORS[variant],
          transition: "background 250ms ease",
        }}>
        <Glyph variant={variant} customIcon={t.icon} />
      </div>
    </div>
  )
}

export default function AppToaster() {
  return (
    <Toaster
      position="top-right"
      gutter={10}
      containerStyle={{ top: 16, right: 16 }}
      toastOptions={{ duration: 3500 }}>
      {(t) => <ToastCard t={t} />}
    </Toaster>
  )
}