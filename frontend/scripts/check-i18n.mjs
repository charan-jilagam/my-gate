// Sanity checks for the translation tables: run with `npm run check:i18n`.
// Fails when a row is incomplete, a template loses a placeholder, or the same English text has two different translations.
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'i18n-'))
const out = join(dir, 'bundle.mjs')
await build({ entryPoints: ['src/i18n/translations.js'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' })
const { DICTIONARIES, TEMPLATES } = await import(pathToFileURL(out).href)
const rowFiles = await Promise.all(['rows1', 'rows2', 'rows3', 'rows4'].map(async (n) => {
  const f = join(dir, `${n}.mjs`)
  await build({ entryPoints: [`src/i18n/${n}.js`], bundle: true, format: 'esm', platform: 'node', outfile: f, logLevel: 'error' })
  return (await import(pathToFileURL(f).href)).default
}))
const rows = rowFiles.flat()
const problems = []
const seen = new Map()
for (const row of rows) {
  if (row.length !== 3 || row.some((c) => typeof c !== 'string' || !c.trim())) problems.push(`incomplete row: ${JSON.stringify(row)}`)
  const holes = (s) => (s.match(/\{\d\}/g) || []).sort().join()
  if (holes(row[0]) !== holes(row[1]) || holes(row[0]) !== holes(row[2])) problems.push(`placeholders differ: ${row[0]}`)
  const prev = seen.get(row[0])
  if (prev && (prev[1] !== row[1] || prev[2] !== row[2])) problems.push(`two translations for "${row[0]}"`)
  seen.set(row[0], row)
}
const count = (o) => Object.keys(o).length
console.log(`rows: ${rows.length}, templates: ${TEMPLATES.length}, hi: ${count(DICTIONARIES.hi)}, te: ${count(DICTIONARIES.te)}`)
rmSync(dir, { recursive: true, force: true })
if (problems.length) {
  console.log(problems.join('\n'))
  process.exit(1)
}
console.log('translation tables look consistent')
