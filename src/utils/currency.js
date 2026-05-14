/**
 * Format a number as Nepali Rupees
 * e.g. 1234567.50 → "Rs 12,34,567.50"
 * Uses Indian numbering system (lakhs/crores)
 */
export function formatRs(amount, decimals = 2) {
  if (amount === null || amount === undefined) return 'Rs 0.00'
  const num = parseFloat(amount)
  return 'Rs ' + num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function parseRs(str) {
  return parseFloat(String(str).replace(/[^0-9.]/g, '')) || 0
}