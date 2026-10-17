// Text that changes every time (dates, times) cannot be listed in the dictionary, so it is handled by rules.
// A rule gets the trimmed English text and the dictionary, and returns the translation or undefined.

const MONTHS = {
  hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
  te: ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్']
}
const DAYS = {
  hi: { Mon: 'सोम', Tue: 'मंगल', Wed: 'बुध', Thu: 'गुरु', Fri: 'शुक्र', Sat: 'शनि', Sun: 'रवि' },
  te: { Mon: 'సోమ', Tue: 'మంగళ', Wed: 'బుధ', Thu: 'గురు', Fri: 'శుక్ర', Sat: 'శని', Sun: 'ఆది' }
}
const MERIDIEM = { hi: { am: 'पूर्वाह्न', pm: 'अपराह्न' }, te: { am: 'ఉదయం', pm: 'సాయంత్రం' } }
const MONTH_RE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/g
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DAY_RE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\b/g

const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Turns [English with {0}, Hindi, Telugu] rows into rules. */
const templateRules = (templates, index) =>
  templates.map((row) => {
    const names = []
    const source = esc(row[0]).replace(/\\\{(\d)\\\}/g, (_, n) => {
      names.push(Number(n))
      return '(.+?)'
    })
    const re = new RegExp(`^${source}$`)
    return (text) => {
      const m = text.match(re)
      if (!m) return undefined
      return row[index].replace(/\{(\d)\}/g, (_, n) => m[1 + names.indexOf(Number(n))] ?? '')
    }
  })

export const makePatterns = (lang, templates = []) => {
  const months = MONTHS[lang]
  const days = DAYS[lang]
  const mer = MERIDIEM[lang]
  if (!months) return []

  const dateRule = (text) => {
    const hasDate = /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/.test(text) || /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/.test(text)
    const hasTime = /\b\d{1,2}:\d{2}\s?(am|pm)\b/i.test(text)
    const hasDay = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s/.test(text)
    if (!hasDate && !hasTime && !hasDay) return undefined
    let out = text
    if (hasDate) out = out.replace(MONTH_RE, (m) => months[MONTH_KEYS.indexOf(m.slice(0, 3).toLowerCase())])
    if (hasDate || hasDay) out = out.replace(DAY_RE, (m) => days[m.slice(0, 3)] || m)
    out = out.replace(/\b(\d{1,2}:\d{2})\s?(am|pm)\b/gi, (_, t, ap) => `${t} ${mer[ap.toLowerCase()]}`)
    return out === text ? undefined : out
  }

  // "Today, 2:07 pm", "Tomorrow, 9:00 am": translate the leading word through the dictionary, the time through the rule above
  const dayWordRule = (text, dict) => {
    const m = text.match(/^(Today|Tomorrow|Yesterday)(,?\s+)(.*)$/)
    if (!m || !dict[m[1]]) return undefined
    const rest = dateRule(m[3]) || m[3]
    return `${dict[m[1]]}${m[2]}${rest}`
  }

  // "3 days", "2 hours", "45 minutes", "12 min": a number then a unit
  const UNITS = {
    hi: { day: 'दिन', days: 'दिन', hour: 'घंटा', hours: 'घंटे', minute: 'मिनट', minutes: 'मिनट', min: 'मिनट', mins: 'मिनट', yrs: 'वर्ष', year: 'वर्ष', years: 'वर्ष', month: 'महीना', months: 'महीने', week: 'सप्ताह', weeks: 'सप्ताह', flats: 'फ़्लैट', flat: 'फ़्लैट', people: 'लोग', guests: 'मेहमान', votes: 'वोट', vote: 'वोट', jobs: 'काम', job: 'काम', reports: 'रिपोर्ट', replies: 'जवाब', reply: 'जवाब', likes: 'पसंद', comments: 'टिप्पणियाँ', photos: 'फ़ोटो', slots: 'स्लॉट' },
    te: { day: 'రోజు', days: 'రోజులు', hour: 'గంట', hours: 'గంటలు', minute: 'నిమిషం', minutes: 'నిమిషాలు', min: 'నిమి', mins: 'నిమి', yrs: 'సంవత్సరాలు', year: 'సంవత్సరం', years: 'సంవత్సరాలు', month: 'నెల', months: 'నెలలు', week: 'వారం', weeks: 'వారాలు', flats: 'ఫ్లాట్లు', flat: 'ఫ్లాట్', people: 'మంది', guests: 'అతిథులు', votes: 'ఓట్లు', vote: 'ఓటు', jobs: 'పనులు', job: 'పని', reports: 'నివేదికలు', replies: 'సమాధానాలు', reply: 'సమాధానం', likes: 'లైక్‌లు', comments: 'వ్యాఖ్యలు', photos: 'ఫోటోలు', slots: 'స్లాట్లు' }
  }[lang]
  const unitRule = (text) => {
    const m = text.match(/^([\d.,]+)\s+([a-z]+)(.*)$/i)
    if (!m || !UNITS[m[2].toLowerCase()]) return undefined
    return `${m[1]} ${UNITS[m[2].toLowerCase()]}${m[3]}`
  }

  const rules = [dayWordRule, dateRule, ...templateRules(templates, lang === 'hi' ? 1 : 2), unitRule]

  // "A-101 · Personal", "Plumber, Electrician", "· Block B terrace": translate each piece that is known
  const segmentRule = (text, dict) => {
    const parts = text.split(/(\s·\s|^·\s|,\s)/)
    if (parts.length < 2) return undefined
    let changed = false
    const out = parts.map((part, i) => {
      if (i % 2 === 1 || !part.trim()) return part
      let hit = dict[part.trim()]
      if (hit === undefined) for (const r of rules) { hit = r(part.trim(), dict); if (hit !== undefined) break }
      if (hit === undefined) return part
      changed = true
      return hit
    })
    return changed ? out.join('') : undefined
  }
  return [...rules, segmentRule]
}
