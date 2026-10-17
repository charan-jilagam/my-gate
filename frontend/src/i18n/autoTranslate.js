// Translates what is on screen after React has drawn it. Most of the app's words are plain JSX text, table headings,
// button labels and status tags; instead of wrapping each one in t(), this walks the page and swaps any text that is
// an exact entry in the dictionary (plus dates and a few patterns). The original English is remembered per node so
// switching back to English restores it, and React still owns the text: when it writes new English, we translate again.
//
// Never touched: form fields and their values, scripts, styles, anything inside [data-no-translate] or [translate="no"],
// and any text that is not in the dictionary (names, numbers, notes people typed).

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT'])
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt']

const skipped = (el) => {
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
    if (SKIP_TAGS.has(n.tagName.toUpperCase())) return true
    if (n.hasAttribute && (n.hasAttribute('data-no-translate') || n.getAttribute('translate') === 'no')) return true
  }
  return false
}

// text node -> { src: English, shown: what we wrote }
const textState = new WeakMap()
// element -> { attrName: { src, shown } }
const attrState = new WeakMap()

export const makeTranslator = (dict, patterns) => {
  const lookup = (raw) => {
    const text = raw.trim()
    if (!text) return raw
    let out = dict[text]
    if (out === undefined) {
      for (const fn of patterns) {
        out = fn(text, dict)
        if (out !== undefined) break
      }
    }
    if (out === undefined || out === text) return raw
    const lead = raw.match(/^\s*/)[0]
    const trail = raw.match(/\s*$/)[0]
    return lead + out + trail
  }
  return lookup
}

const translateTextNode = (node, lookup, active) => {
  const st = textState.get(node)
  const current = node.nodeValue
  let src = current
  if (st) {
    if (current === st.shown) src = st.src // still our translation: nothing new from React
    else src = current // React wrote fresh text
  }
  const next = active ? lookup(src) : src
  if (next === current) {
    if (st && src === current) textState.delete(node)
    return
  }
  textState.set(node, { src, shown: next })
  node.nodeValue = next
}

const translateAttrs = (el, lookup, active) => {
  for (const name of ATTRS) {
    if (!el.hasAttribute(name)) continue
    const states = attrState.get(el) || {}
    const st = states[name]
    const current = el.getAttribute(name)
    const src = st && current === st.shown ? st.src : current
    const next = active ? lookup(src) : src
    if (next === current) continue
    states[name] = { src, shown: next }
    attrState.set(el, states)
    el.setAttribute(name, next)
  }
}

export const translateTree = (root, lookup, active) => {
  if (!root) return
  if (root.nodeType === 3) {
    if (root.parentNode && !skipped(root.parentNode)) translateTextNode(root, lookup, active)
    return
  }
  if (root.nodeType !== 1 || skipped(root)) return
  translateAttrs(root, lookup, active)
  for (let c = root.firstChild; c; c = c.nextSibling) translateTree(c, lookup, active)
}

/** Starts watching `root`. Returns a function that stops it. */
export const startAutoTranslate = (root, lookup, active) => {
  let pending = false
  const queue = new Set()
  const flush = () => {
    pending = false
    observer.disconnect() // our own writes must not wake us again
    queue.forEach((n) => {
      if (n.isConnected) translateTree(n, lookup, active)
    })
    queue.clear()
    observe()
  }
  const schedule = () => {
    if (!pending) {
      pending = true
      requestAnimationFrame(flush)
    }
  }
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach((n) => queue.add(n))
      else if (r.type === 'characterData') queue.add(r.target)
      else if (r.type === 'attributes') queue.add(r.target)
    }
    schedule()
  })
  const observe = () =>
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  translateTree(root, lookup, active)
  observe()
  return () => observer.disconnect()
}
