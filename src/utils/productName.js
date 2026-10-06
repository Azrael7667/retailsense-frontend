export function splitLocalNames(value) {
  const out = []
  for (const n of String(value || "").split(",")) {
    const t = n.trim()
    if (t && !out.some(o => o.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  return out
}

// "Spring Leaves" + "patta" -> "Spring Leaves / Patta". Safe to run again: old local-name suffixes are removed first.
export function composeName(name, localNames, previousLocalNames = "") {
  const parts = String(name || "").trim().split(/\s+\/\s+/).map(p => p.trim()).filter(Boolean)
  const current = splitLocalNames(localNames)
  const known = new Set([...current, ...splitLocalNames(previousLocalNames)].map(n => n.toLowerCase()))
  while (parts.length > 1 && known.has(parts[parts.length - 1].toLowerCase())) parts.pop()
  return [parts.join(" / "), ...current.map(n => n.charAt(0).toUpperCase() + n.slice(1))].join(" / ")
}
