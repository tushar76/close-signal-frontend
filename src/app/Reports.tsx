import { useEffect, useState } from 'react'
import { dateKey, money, monthBounds } from '../../../backend/shared/domain'
import type { Deal, Report, Session } from '../../../backend/shared/types'
import { api, errorText } from './api'
import type { TeamMember } from './api'
import { DealTable } from './Deals'

export function Reports({
  session,
  members,
  deals,
  onOpen,
}: {
  session: Session
  members: TeamMember[]
  deals: Deal[]
  onOpen: (deal: Deal) => void
}) {
  const today = dateKey()
  const first = today.slice(0, 7) + '-01'
  const previous = monthBounds(dateKey(new Date(Date.parse(first) - 86_400_000)).slice(0, 7))
  const [scope, setScope] = useState('mine')
  const [status, setStatus] = useState<'all' | 'won' | 'lost'>('all')
  const [period, setPeriod] = useState('month')
  const [customFrom, setFrom] = useState(first)
  const [customTo, setTo] = useState(today)
  const [loaded, setLoaded] = useState<{ query: string; report?: Report; error?: string }>()
  const team =
    session.permissions.includes('deals:team') && session.permissions.includes('targets:team')
  const from = period === 'custom' ? customFrom : period === 'last_month' ? previous.from : first
  const to = period === 'custom' ? customTo : period === 'last_month' ? previous.to : today
  const valid = Boolean(from && to && from <= to)
  const query = new URLSearchParams({ from, to, scope: scope === 'team' ? 'team' : 'mine' })
  if (scope !== 'team' && scope !== 'mine') query.set('memberId', scope)
  const request = query.toString()
  useEffect(() => {
    if (!valid) return
    const controller = new AbortController()
    api<Report>('/reports?' + request).then(
      (report) => {
        if (!controller.signal.aborted) setLoaded({ query: request, report })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setLoaded({ query: request, error: errorText(error) })
      },
    )
    return () => controller.abort()
  }, [valid, request, deals])
  const result = valid && loaded?.query === request ? loaded : undefined
  const matching =
    result?.report?.deals.filter((deal) => status === 'all' || deal.stage === status) ?? []
  const display = (value: number) => money(value, session.currency)
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Reports</h1>
          <p>Review sales and monthly target progress.</p>
        </div>
      </div>
      <section className="card advanced-card">
        <div className="advanced-filters">
          <label>
            Employee
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="mine">My sales</option>
              {team && <option value="team">Entire workspace</option>}
              {team &&
                members
                  .filter((member) => member.id !== session.id)
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} ({member.email})
                    </option>
                  ))}
            </select>
          </label>
          <label>
            Date range
            <select value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="month">This month</option>
              <option value="last_month">Last month</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          {period === 'custom' && (
            <>
              <label>
                From
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </>
          )}
        </div>
        {!valid && (
          <p className="notice error" role="alert">
            Choose a start date on or before the end date.
          </p>
        )}
        {valid && !result && <p role="status">Loading report…</p>}
        {result?.error && (
          <p className="notice error" role="alert">
            {result.error}
          </p>
        )}
        {result?.report && (
          <div className="advanced-results" aria-live="polite">
            <div>
              <h2>{result.report.label}</h2>
              <p>
                {result.report.from} to {result.report.to} (UTC)
              </p>
            </div>
            <dl className="report-metrics">
              <div>
                <dt>Closed-won revenue</dt>
                <dd>{display(result.report.wonValue)}</dd>
              </div>
              <div>
                <dt>Won count</dt>
                <dd>{result.report.won}</dd>
              </div>
              <div>
                <dt>Lost count</dt>
                <dd>{result.report.lost}</dd>
              </div>
            </dl>
            <h3>Monthly targets</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Actual dates</th>
                    <th>Full-month target</th>
                    <th>Won revenue</th>
                    <th>Achievement</th>
                    <th>Remaining vs. full-month target</th>
                  </tr>
                </thead>
                <tbody>
                  {result.report.monthly.map((goal) => (
                    <tr key={goal.month}>
                      <td>
                        {goal.month}
                        {!goal.fullMonth && <small>Partial month actuals</small>}
                      </td>
                      <td>
                        {goal.from} to {goal.to}
                      </td>
                      <td>
                        {goal.target === null ? 'No target assigned' : display(goal.target)}
                        {scope === 'team' && <small>{goal.assignedCount} assigned targets</small>}
                      </td>
                      <td>{display(goal.wonValue)}</td>
                      <td>{goal.achievement === null ? '—' : goal.achievement + '%'}</td>
                      <td>{goal.remaining === null ? '—' : display(goal.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Matching deals</h3>
            {result.report.deals.length > 0 && (
              <div className="advanced-filters">
                <label>
                  Deal status
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as typeof status)}
                  >
                    <option value="all">All closed deals</option>
                    <option value="won">Closed won</option>
                    <option value="lost">Closed lost</option>
                  </select>
                </label>
              </div>
            )}
            {matching.length ? (
              <DealTable
                deals={matching}
                currency={session.currency}
                showOwner={team}
                onOpen={onOpen}
              />
            ) : (
              <p>No closed deals match the selected filters.</p>
            )}
          </div>
        )}
      </section>
    </>
  )
}
