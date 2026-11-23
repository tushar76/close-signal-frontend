import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CsvPreview, CsvRow } from '../../../backend/shared/types'
import { api, errorText } from './api'

type ImportResult = {
  imported: number
  skipped: number
  failed: number
  rows: (CsvRow & { outcome: string })[]
}

export function CsvImport({ refresh }: { refresh: () => Promise<void> }) {
  const [file, setFile] = useState<File>()
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<CsvPreview>()
  const [selected, setSelected] = useState<number[]>([])
  const [result, setResult] = useState<ImportResult>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setError('')
    setPreview(undefined)
    setResult(undefined)
    try {
      if (file.size > 180_000) throw new Error('Choose a CSV file up to 180 KB.')
      const csv = await file.text()
      const data = await api<CsvPreview>('/csv/preview', 'POST', { csv })
      setCsv(csv)
      setPreview(data)
      setSelected(data.rows.filter((row) => row.status === 'valid').map((row) => row.row))
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  async function save() {
    setBusy(true)
    setError('')
    try {
      setResult(await api<ImportResult>('/csv/import', 'POST', { csv, rows: selected }))
      await refresh()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Import deals</h1>
          <p>Preview a CSV and select the rows to save.</p>
        </div>
        <a className="secondary" href="/api/csv/template" download>
          Download CSV template
        </a>
      </div>
      <section className="card advanced-card">
        <form className="advanced-filters" onSubmit={(event) => void inspect(event)}>
          <label>
            CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              required
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0])
                setPreview(undefined)
                setResult(undefined)
              }}
            />
          </label>
          <button className="primary" disabled={!file || busy}>
            Preview import
          </button>
        </form>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {preview && (
          <>
            <p>
              Mapped columns:{' '}
              {Object.entries(preview.mapping)
                .map(([field, header]) => `${header} → ${field}`)
                .join(' · ')}
            </p>
            {result && (
              <p className="notice" role="status">
                {result.imported} imported · {result.skipped} skipped · {result.failed} failed
              </p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {!result && <th>Import</th>}
                    <th>Row</th>
                    <th>Deal and company</th>
                    <th>Amount</th>
                    <th>Mapped owner</th>
                    <th>Status and stage</th>
                    <th>Close dates</th>
                    <th>{result ? 'Result' : 'Preview'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(result?.rows ?? preview.rows).map((row) => (
                    <tr key={row.row}>
                      {!result && (
                        <td>
                          <input
                            aria-label={'Import row ' + row.row}
                            type="checkbox"
                            disabled={row.status !== 'valid' || busy}
                            checked={selected.includes(row.row)}
                            onChange={(event) =>
                              setSelected(
                                event.target.checked
                                  ? [...selected, row.row]
                                  : selected.filter((id) => id !== row.row),
                              )
                            }
                          />
                        </td>
                      )}
                      <td>{row.row}</td>
                      <td>
                        {row.title}
                        <small>{row.company}</small>
                      </td>
                      <td>{row.amount}</td>
                      <td>{row.owner}</td>
                      <td>
                        {row.dealStatus}
                        <small>{row.pipelineStage}</small>
                      </td>
                      <td>
                        <small>Actual: {row.closedAt || '—'}</small>
                        <small>Expected: {row.expectedCloseAt || '—'}</small>
                      </td>
                      <td>
                        {'outcome' in row ? String(row.outcome) : row.status}
                        {row.reason && <small>{row.reason}</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!result && (
              <button
                className="primary"
                disabled={busy || !selected.length}
                onClick={() => void save()}
              >
                Import {selected.length} selected {selected.length === 1 ? 'row' : 'rows'}
              </button>
            )}
          </>
        )}
      </section>
    </>
  )
}
