// CSV and PDF downloads built from the rows already on screen.
// A column is { header: 'Name', value: (row) => 'text' }.

const stamp = () => new Date().toISOString().slice(0, 10)

// A cell starting with = + - @ would run as a formula when the CSV is opened in Excel, so neutralise it.
const cell = (v) => {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

const save = (blob, name) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const downloadCsv = (filename, columns, rows) => {
  const lines = [columns.map((c) => cell(c.header)).join(',')]
  rows.forEach((r) => lines.push(columns.map((c) => cell(c.value(r))).join(',')))
  // The BOM makes Excel read ₹ and other characters correctly.
  save(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${filename}-${stamp()}.csv`)
}

export const downloadPdf = async (filename, title, columns, rows) => {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  doc.setFontSize(16)
  doc.text(title, 40, 44)
  doc.setFontSize(9)
  doc.setTextColor(110)
  doc.text(`Exported ${new Date().toLocaleString()} · ${rows.length} row${rows.length === 1 ? '' : 's'}`, 40, 60)
  autoTable(doc, {
    startY: 74,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => String(c.value(r) ?? ''))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [10, 58, 57] },
    margin: { left: 40, right: 40 }
  })
  doc.save(`${filename}-${stamp()}.pdf`)
}

// jsPDF's built-in fonts have no ₹ glyph, so amounts in PDFs are written as "Rs. 1,200".
export const pdfMoney = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
