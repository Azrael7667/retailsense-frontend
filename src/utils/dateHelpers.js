/**
 * RetailSense Nepal — Date Helpers
 * Shows both AD (Gregorian) and BS (Bikram Sambat) dates
 */

// BS month names
const BS_MONTHS = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik",  "Mangsir","Poush",  "Magh",    "Falgun", "Chaitra"
]

const BS_MONTHS_SHORT = [
  "Bai", "Jes", "Ash", "Shr", "Bha", "Ash",
  "Kar", "Man", "Pou", "Mag", "Fal", "Cha"
]

// AD to BS conversion table (year: [days_in_each_month])
// Covers 2000-2045 AD (2057-2101 BS)
const BS_CALENDAR_DATA = {
  2057: [30,32,31,32,31,30,30,30,29,30,29,31],
  2058: [31,31,32,32,31,30,30,30,29,30,29,31],
  2059: [31,31,32,31,31,31,30,29,30,29,30,30],
  2060: [31,32,31,32,31,30,30,30,29,30,29,31],
  2061: [30,32,31,32,31,30,30,30,29,30,30,30],
  2062: [31,31,32,32,31,30,30,30,29,30,29,31],
  2063: [31,31,32,31,31,30,30,29,30,29,30,30],
  2064: [31,32,31,32,31,30,30,30,29,30,29,31],
  2065: [31,31,31,32,31,31,29,30,29,30,29,31],
  2066: [31,31,32,32,31,30,30,29,30,29,30,30],
  2067: [31,32,31,32,31,30,30,30,29,30,29,31],
  2068: [31,31,31,32,31,31,29,30,29,30,29,31],
  2069: [31,31,32,32,31,30,30,29,30,29,30,30],
  2070: [31,32,31,32,31,30,30,30,29,30,29,31],
  2071: [31,31,31,32,31,31,29,30,29,30,29,31],
  2072: [31,32,31,32,31,30,30,29,30,29,30,30],
  2073: [31,32,31,32,31,30,30,30,29,30,29,31],
  2074: [31,31,31,32,31,31,30,29,30,29,30,30],
  2075: [31,32,31,32,31,30,30,30,29,30,29,31],
  2076: [31,31,32,32,31,30,30,29,30,29,30,30],
  2077: [31,32,31,32,31,30,30,30,29,30,29,31],
  2078: [31,31,31,32,31,31,30,29,30,29,30,30],
  2079: [31,32,31,32,31,30,30,30,29,30,29,31],
  2080: [31,31,32,32,31,30,30,29,30,29,30,30],
  2081: [31,32,31,32,31,30,30,30,29,30,29,31],
  2082: [31,31,31,32,31,31,30,29,30,29,30,30],
  2083: [31,32,31,32,31,30,30,30,29,30,29,31],
  2084: [31,31,32,32,31,30,30,29,30,29,30,30],
  2085: [31,32,31,32,31,30,30,30,29,30,29,31],
}

// Reference point: 2000-01-01 AD = 2056-09-17 BS
const AD_REF = new Date(2000, 0, 1)
const BS_REF = { year: 2056, month: 9, day: 17 }

/**
 * Convert AD date to BS
 * @param {Date|string} adDate
 * @returns {{ year, month, day, monthName, monthNameShort }}
 */
export function adToBS(adDate) {
  try {
    const date = new Date(adDate)
    if (isNaN(date.getTime())) return null

    // Calculate days difference from reference
    const adRef = new Date(AD_REF)
    const diff  = Math.floor((date - adRef) / (1000 * 60 * 60 * 24))

    let bsYear  = BS_REF.year
    let bsMonth = BS_REF.month   // 1-based
    let bsDay   = BS_REF.day
    let daysLeft = diff

    while (daysLeft > 0) {
      const monthDays = getMonthDaysBS(bsYear, bsMonth)
      const remain    = monthDays - bsDay

      if (daysLeft <= remain) {
        bsDay += daysLeft
        daysLeft = 0
      } else {
        daysLeft -= remain + 1
        bsDay = 1
        bsMonth++
        if (bsMonth > 12) {
          bsMonth = 1
          bsYear++
        }
      }
    }

    return {
      year:           bsYear,
      month:          bsMonth,
      day:            bsDay,
      monthName:      BS_MONTHS[bsMonth - 1],
      monthNameShort: BS_MONTHS_SHORT[bsMonth - 1],
    }
  } catch {
    return null
  }
}

function getMonthDaysBS(year, month) {
  const data = BS_CALENDAR_DATA[year]
  if (!data) return 30
  return data[month - 1] || 30
}

/**
 * Format a date showing BOTH AD and BS
 * Returns: "Jan 15, 2024 | 1 Poush 2080"
 */
export function formatBoth(adDate) {
  if (!adDate) return "—"
  const date = new Date(adDate)
  if (isNaN(date.getTime())) return String(adDate)

  const ad = date.toLocaleDateString("en-NP", {
    year:  "numeric",
    month: "short",
    day:   "numeric",
  })

  const bs = adToBS(date)
  if (!bs) return ad

  return `${ad} | ${bs.day} ${bs.monthName} ${bs.year}`
}

/**
 * Format date as AD only
 */
export function formatAD(adDate, opts = {}) {
  if (!adDate) return "—"
  const date = new Date(adDate)
  if (isNaN(date.getTime())) return String(adDate)
  return date.toLocaleDateString("en-NP", {
    year:  "numeric",
    month: "short",
    day:   "numeric",
    ...opts,
  })
}

/**
 * Format date as BS only
 * Returns: "1 Poush 2080"
 */
export function formatBS(adDate) {
  if (!adDate) return "—"
  const bs = adToBS(new Date(adDate))
  if (!bs) return "—"
  return `${bs.day} ${bs.monthName} ${bs.year}`
}

/**
 * Format date as BS short
 * Returns: "2080 Pou 01"
 */
export function formatBSShort(adDate) {
  if (!adDate) return "—"
  const bs = adToBS(new Date(adDate))
  if (!bs) return "—"
  return `${bs.year} ${bs.monthNameShort} ${String(bs.day).padStart(2,"0")}`
}

/**
 * Today in both formats
 */
export function today() {
  return formatBoth(new Date())
}

/**
 * Date cell component data — use in tables
 * Returns object with both dates for display
 */
export function dateCell(adDate) {
  if (!adDate) return { ad: "—", bs: "—", both: "—" }
  const ad = formatAD(adDate)
  const bs = formatBS(adDate)
  return { ad, bs, both: `${ad} | ${bs}` }
}
