import NepaliDate from 'nepali-date'

/**
 * Format a JS Date to display string based on user's calendar preference
 * @param {Date|string} date
 * @param {'BS'|'AD'} calendarType
 */
export function formatDate(date, calendarType = 'BS') {
  const d = new Date(date)
  if (calendarType === 'AD') {
    return d.toLocaleDateString('en-NP', {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  }
  // Convert to BS
  const nd = new NepaliDate(d)
  const [y, m, day] = [nd.getYear(), nd.getMonth() + 1, nd.getDate()]
  const months = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashwin',
                  'Kartik','Mangsir','Poush','Magh','Falgun','Chaitra']
  return `${day} ${months[m-1]} ${y}`
}

export function adToBs(date) {
  return new NepaliDate(new Date(date))
}

export function bsToAd(year, month, day) {
  return new NepaliDate(year, month - 1, day).toJsDate()
}