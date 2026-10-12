import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiDownload } from 'react-icons/fi'
import { downloadCsv, downloadPdf } from '../utils/exportData'
import { Spinner } from './ui'

/** Two small buttons that export `rows` as CSV or PDF. Shows nothing when there is nothing to export. */
const ExportButtons = ({ filename, title, columns, rows }) => {
  const [busy, setBusy] = useState(false)
  if (!rows?.length) return null

  const pdf = async () => {
    setBusy(true)
    try {
      await downloadPdf(filename, title, columns, rows)
    } catch (e) {
      toast.error('Could not create the PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-2" role="group" aria-label="Export">
      <button className="btn-secondary btn-sm" onClick={() => downloadCsv(filename, columns, rows)}>
        <FiDownload size={14} /> CSV
      </button>
      <button className="btn-secondary btn-sm" onClick={pdf} disabled={busy}>
        {busy ? <Spinner className="h-3.5 w-3.5" /> : <FiDownload size={14} />} PDF
      </button>
    </div>
  )
}

export default ExportButtons
