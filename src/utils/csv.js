// Minimal CSV row parser that supports quoted fields, commas inside quotes,
// and escaped quotes ("").
export function parseCsvRow(line) {
  const out = []
  let cur = ''
  let i = 0
  let inQuotes = false

  while (i < line.length) {
    const ch = line[i]

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      cur += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }

    if (ch === ',') {
      out.push(cur)
      cur = ''
      i += 1
      continue
    }

    cur += ch
    i += 1
  }

  out.push(cur)
  return out
}


