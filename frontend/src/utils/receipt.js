import { pdfMoney } from './exportData'

const label = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

// A one-page payment receipt as a PDF.
export const downloadReceiptPdf = async (p, resident) => {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a5' })
  const w = doc.internal.pageSize.getWidth()

  doc.setFillColor(10, 58, 57)
  doc.rect(0, 0, w, 64, 'F')
  doc.setTextColor(255)
  doc.setFontSize(18)
  doc.text('Payment receipt', 32, 40)

  doc.setTextColor(30)
  doc.setFontSize(26)
  doc.text(pdfMoney(p.amount), 32, 112)
  doc.setFontSize(10)
  doc.setTextColor(46, 125, 50)
  doc.text('PAID', 32, 130)

  const rows = [
    ['Received from', resident || p.residentId?.name || '-'],
    ['Flat', `${p.block ? `${p.block}-` : ''}${p.flatNo || '-'}`],
    ['For', `${label(p.type)}${p.month ? ` - ${p.month}` : ''}`],
    ['Paid on', p.paidAt ? new Date(p.paidAt).toLocaleString() : '-'],
    ['Method', label(p.paymentMethod || 'online')],
    ['Reference', p.transactionId || p.razorpayPaymentId || '-'],
    ['Receipt no.', String(p._id || '').slice(-8).toUpperCase()]
  ]
  let y = 168
  rows.forEach(([k, v]) => {
    doc.setTextColor(120)
    doc.setFontSize(9)
    doc.text(k, 32, y)
    doc.setTextColor(30)
    doc.setFontSize(11)
    doc.text(doc.splitTextToSize(String(v), w - 160), 140, y)
    doc.setDrawColor(225)
    doc.line(32, y + 10, w - 32, y + 10)
    y += 30
  })

  doc.setFontSize(8)
  doc.setTextColor(150)
  doc.text('This is a computer-generated receipt.', 32, y + 14)
  doc.save(`receipt-${String(p._id || '').slice(-8)}.pdf`)
}
