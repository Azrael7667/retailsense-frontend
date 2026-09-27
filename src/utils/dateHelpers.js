/**
 * RetailSense Nepal — Date Helpers
 * Shows both AD (Gregorian) and BS (Bikram Sambat) dates
 *
 * Uses @sbmdkl/nepali-date-converter (npm i @sbmdkl/nepali-date-converter)
 * instead of a hand-maintained day-count table, which had silent errors.
 */

import { adToBs, bsToAd } from "@sbmdkl/nepali-date-converter"

export const BS_MONTHS = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik",  "Mangsir","Poush",  "Magh",    "Falgun", "Chaitra"
]

export const BS_MONTHS_SHORT = [
  "Bai", "Jes", "Ash", "Shr", "Bha", "Ash",
  "Kar", "Man", "Pou", "Mag", "Fal", "Cha"
]

/**
 * Convert AD date to BS
 * @param {Date|string} adDate
 * @returns {{ year, month, day, monthName, monthNameShort }|null}
 */
export function adToBS(adDate) {
  try {
    const date = new Date(adDate)
    if (isNaN(date.getTime())) return null

    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")

    const result = adToBs(`${y}-${m}-${d}`)

    let bsYear, bsMonth, bsDay
    if (typeof result === "string") {
      ;[bsYear, bsMonth, bsDay] = result.split("-").map(Number)
    } else if (result && typeof result === "object") {
      bsYear  = result.year ?? result.bsYear
      bsMonth = result.month ?? result.bsMonth
      bsDay   = result.day ?? result.bsDay
    } else {
      return null
    }

    if (!bsYear || !bsMonth || !bsDay) return null

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

/**
 * Convert a BS date (year, month 1-12, day) to a JS Date (AD)
 * @returns {Date|null}
 */
export function bsToAD(year, month, day) {
  try {
    const y = String(year)
    const m = String(month).padStart(2, "0")
    const d = String(day).padStart(2, "0")
    const result = bsToAd(`${y}-${m}-${d}`)

    let adYear, adMonth, adDay
    if (typeof result === "string") {
      ;[adYear, adMonth, adDay] = result.split("-").map(Number)
    } else if (result && typeof result === "object") {
      adYear  = result.year ?? result.adYear
      adMonth = result.month ?? result.adMonth
      adDay   = result.day ?? result.adDay
    } else {
      return null
    }

    if (!adYear || !adMonth || !adDay) return null
    return new Date(adYear, adMonth - 1, adDay)
  } catch {
    return null
  }
}

/**
 * Number of days in a given BS month (1-12), derived from the converter
 * itself (start-of-month -> start-of-next-month, in AD days) instead of
 * a hand-maintained table.
 */
export function daysInBSMonth(year, month) {
  const start = bsToAD(year, month, 1)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const next = bsToAD(nextYear, nextMonth, 1)
  if (!start || !next) return 30
  return Math.round((next - start) / (1000 * 60 * 60 * 24))
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
