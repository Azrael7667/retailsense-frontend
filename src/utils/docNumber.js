// Display-only form of stored document numbers: PREFIX-YEAR-NUMBER.
// Never write this back to the DB.
//   INV-2026-1098      -> INV-2026-1098
//   INV-20260710-0953  -> INV-2026-0953
//   BILL-202608-0012   -> BILL-2026-0012
//   INV-1099 + date    -> INV-2026-1099
//   PUR-0013 + date    -> PUR-2026-0013
//   PI-0056  + date    -> PI-2026-0056
// Anything unrecognised (e.g. a manually typed number) is returned unchanged.
export function shortDocNumber(raw, date) {
  if (!raw) return ""
  const s = String(raw).trim()
  let m

  // Old formats that embed a full date
  if ((m = s.match(/^INV-(\d{4})\d{4}-(\d+)$/)))  return `INV-${m[1]}-${m[2]}`
  if ((m = s.match(/^BILL-(\d{4})\d{2}-(\d+)$/))) return `BILL-${m[1]}-${m[2]}`

  // Already in PREFIX-YEAR-NUMBER form
  if ((m = s.match(/^(INV|BILL|PUR|PI|PO|SR|PR|QT)-(\d{4})-(\d+)$/))) return s

  // Plain PREFIX-NUMBER: add the year from the document date
  if ((m = s.match(/^(INV|BILL|PUR|PI|PO|SR|PR|QT)-(\d+)$/))) {
    const year = date ? String(date).slice(0, 4) : ""
    return /^\d{4}$/.test(year) ? `${m[1]}-${year}-${m[2]}` : s
  }

  return s
}
