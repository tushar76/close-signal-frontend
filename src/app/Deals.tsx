import { ArrowUpRight, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { dateKey, money } from '../../../backend/shared/domain'
import { pipelineStages } from '../../../backend/shared/types'
import type { Deal, DealEvent, PipelineStage, Session, Stage } from '../../../backend/shared/types'
import { api, errorText, loadDeal } from './api'
import type { DealInput, TeamMember } from './api'

const fieldLabels: Record<string, string> = {
  title: 'Deal name',
  company: 'Company',
  ownerId: 'Assignee',
  amount: 'Value',
  stage: 'Status',
  closedAt: 'Actual close date',
  expectedCloseAt: 'Expected close date',
  pipelineStage: 'Pipeline stage',
  followUp: 'Follow-up',
}
export const stageLabels = { open: 'Open', won: 'Closed won', lost: 'Closed lost' }
export function DealTable({
  deals,
  currency,
  showOwner,
  onOpen,
}: {
  deals: Deal[]
  currency: string
  showOwner: boolean
  onOpen: (deal: Deal) => void
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Deal</th>
            {showOwner && <th>Owner</th>}
            <th>Status</th>
            <th>Value</th>
            <th>Actual close</th>
            <th>Expected close</th>
            <th>Last activity</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => (
            <tr key={deal.id}>
              <td>
                <button className="deal-link" onClick={() => onOpen(deal)}>
                  {deal.title}
                  <ArrowUpRight size={13} />
                </button>
                {deal.company && <small>{deal.company}</small>}
              </td>
              {showOwner && <td>{deal.ownerName}</td>}
              <td>
                <span className={'status ' + deal.stage}>{stageLabels[deal.stage]}</span>
                {deal.stage === 'open' && (
                  <small className="pipeline-stage">{deal.pipelineStage}</small>
                )}
              </td>
              <td className="amount">{money(deal.amount, currency)}</td>
              <td>{deal.closedAt || '—'}</td>
              <td>{deal.expectedCloseAt || '—'}</td>
              <td>{deal.updatedAt.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DealEditor({
  session,
  deal,
  members,
  onClose,
  onSaved,
}: {
  session: Session
  deal?: Deal
  members: TeamMember[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [stage, setStage] = useState<Stage>(deal?.stage ?? 'open')
  const [history, setHistory] = useState<DealEvent[]>()
  const [historyError, setHistoryError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const modal = useRef<HTMLDialogElement>(null)
  const id = deal?.id
  const editable = session.permissions.includes('deals:write')
  useEffect(() => {
    modal.current?.showModal()
  }, [])
  useEffect(() => {
    if (!id) return
    let cancelled = false
    loadDeal(id).then(
      (data) => {
        if (!cancelled) setHistory(data.history)
      },
      (cause: unknown) => {
        if (!cancelled) setHistoryError(errorText(cause))
      },
    )
    return () => {
      cancelled = true
    }
  }, [id])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = new FormData(event.currentTarget)
    const payload: DealInput = {
      title: String(input.get('title')),
      company: String(input.get('company')),
      amount: Number(input.get('amount')),
      stage,
      ownerId: String(input.get('ownerId') || '') || undefined,
      closedAt: String(input.get('closedAt') || '') || null,
      expectedCloseAt: String(input.get('expectedCloseAt') || '') || null,
      pipelineStage: String(input.get('pipelineStage')) as PipelineStage,
    }
    setBusy(true)
    setError('')
    try {
      await api(id ? '/deals/' + id : '/deals', id ? 'PUT' : 'POST', payload)
      await onSaved()
    } catch (cause) {
      setError(errorText(cause))
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={modal}
      className="editor"
      aria-labelledby="deal-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="editor-inner">
        <div className="editor-heading">
          <div>
            <h2 id="deal-title">{deal ? (editable ? 'Edit deal' : 'Deal details') : 'New deal'}</h2>
            <p>
              {deal
                ? editable
                  ? 'Update the deal or check its activity.'
                  : 'Review the deal and its activity.'
                : 'Add an opportunity to your pipeline.'}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={!editable} className="editor-fields">
            <label>
              Deal name
              <input name="title" required maxLength={150} defaultValue={deal?.title} />
            </label>
            <label>
              Company
              <input name="company" maxLength={150} defaultValue={deal?.company} />
            </label>
            <div className="form-grid">
              <label>
                Value ({session.currency})
                <input
                  name="amount"
                  type="number"
                  min="0"
                  max="1000000000000"
                  step="0.01"
                  defaultValue={deal?.amount}
                  required
                />
              </label>
              <label>
                Status
                <select
                  name="stage"
                  value={stage}
                  onChange={(event) => setStage(event.target.value as Stage)}
                >
                  {Object.entries(stageLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Expected close date
                <input
                  name="expectedCloseAt"
                  type="date"
                  defaultValue={deal?.expectedCloseAt ?? ''}
                />
              </label>
              <label>
                Pipeline stage
                <select name="pipelineStage" defaultValue={deal?.pipelineStage ?? 'qualification'}>
                  {pipelineStages.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage[0].toUpperCase() + stage.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {stage !== 'open' && (
              <label>
                Actual close date
                <input
                  name="closedAt"
                  type="date"
                  required
                  max={dateKey()}
                  defaultValue={deal?.closedAt ?? dateKey()}
                />
              </label>
            )}
            {session.permissions.includes('deals:team') && members.length > 0 && (
              <label>
                Owner
                <select name="ownerId" defaultValue={deal?.ownerId ?? session.id}>
                  {members
                    .filter((member) => member.active || member.id === deal?.ownerId)
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </fieldset>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {editable && (
            <div className="button-row">
              <button type="button" className="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? 'Saving…' : deal ? 'Save changes' : 'Create deal'}
              </button>
            </div>
          )}
        </form>
        {deal && (
          <div className="history">
            <h3>Deal activity</h3>
            {historyError && <p className="notice error">{historyError}</p>}
            {!history && !historyError && <p>Loading activity…</p>}
            <ul>
              {history?.map((item, index) => (
                <li key={index}>
                  <strong>{item.event}</strong>
                  <small>
                    {item.actor} · {new Date(item.at).toLocaleString()}
                    {item.source && ' · ' + item.source}
                  </small>
                  {item.fields && (
                    <small>
                      {Object.entries(item.fields)
                        .map(([key, change]) => {
                          const format = (value: unknown) => {
                            if (value === null || value === '') return '—'
                            if (key === 'ownerId')
                              return (
                                members.find((member) => member.id === value)?.name ??
                                (value === session.id ? session.name : String(value))
                              )
                            if (key === 'amount' && typeof value === 'number')
                              return money(value, session.currency)
                            if (
                              key === 'followUp' &&
                              typeof value === 'object' &&
                              value &&
                              'title' in value
                            )
                              return (
                                String(value.title) +
                                ('dueDate' in value
                                  ? ' (' + String(value.dueDate) + ')'
                                  : ' (completed)')
                              )
                            return String(value)
                          }
                          return (
                            (fieldLabels[key] ?? key) +
                            ' ' +
                            format(change.before) +
                            ' → ' +
                            format(change.after)
                          )
                        })
                        .join(' · ')}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </dialog>
  )
}
