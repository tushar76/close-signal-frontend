import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { dateKey } from '../../../backend/shared/domain'
import type { Deal, FollowUp, Risk, Session } from '../../../backend/shared/types'
import { api, errorText } from './api'
import type { TeamMember } from './api'

export function RiskList({ alerts, onOpen }: { alerts: Risk[]; onOpen: (deal: Deal) => void }) {
  if (!alerts.length) return <p>No matching risk alerts.</p>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Deal</th>
            <th>Reason</th>
            <th>Date</th>
            <th>Suggested action</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert, index) => (
            <tr key={alert.deal.id + index}>
              <td>
                <button className="deal-link" onClick={() => onOpen(alert.deal)}>
                  {alert.deal.title}
                </button>
                <small>{alert.deal.ownerName}</small>
              </td>
              <td>{alert.reason}</td>
              <td>{alert.date ?? '—'}</td>
              <td>{alert.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Pipeline({
  session,
  deals,
  members,
  onOpen,
  refresh,
}: {
  session: Session
  deals: Deal[]
  members: TeamMember[]
  onOpen: (deal: Deal) => void
  refresh: () => Promise<void>
}) {
  const team = session.permissions.includes('deals:team')
  const write = session.permissions.includes('deals:write')
  const [scope, setScope] = useState(team ? 'team' : 'mine')
  const [dealId, setDealId] = useState('')
  const [taskFilter, setTaskFilter] = useState('pending')
  const [data, setData] = useState<{ tasks: FollowUp[]; alerts: Risk[]; today: string }>()
  const [filterError, setFilterError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let current = true
    const query = '?scope=' + scope
    Promise.all([
      api<{ tasks: FollowUp[]; today: string }>('/tasks' + query),
      api<{ alerts: Risk[] }>('/risks' + query),
    ]).then(
      ([tasks, risks]) => {
        if (current) {
          setData({ ...tasks, ...risks })
          setFilterError('')
        }
      },
      (cause: unknown) => {
        if (current) {
          setData(undefined)
          setFilterError(errorText(cause))
        }
      },
    )
    return () => {
      current = false
    }
  }, [scope, version, deals])
  const selectedDeal = deals.find((deal) => deal.id === dealId)
  const options = members.filter(
    (member) =>
      member.active &&
      (member.id === selectedDeal?.ownerId ||
        (member.role !== 'employee' && !member.disabled.includes('deals:team'))),
  )
  const today = data?.today ?? dateKey()
  const reminders =
    data?.tasks.filter((task) => task.status === 'pending' && task.dueDate <= today) ?? []
  const tasks = data?.tasks.filter(
    (task) =>
      taskFilter === 'all' ||
      (taskFilter === 'due'
        ? task.status === 'pending' && task.dueDate <= today
        : task.status === taskFilter),
  )
  async function writeTask(path: string, input: unknown) {
    setBusy(true)
    setError('')
    try {
      await api(path, 'POST', input)
      setVersion((version) => version + 1)
      await refresh()
      return true
    } catch (cause) {
      setError(errorText(cause))
      return false
    } finally {
      setBusy(false)
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const input = new FormData(form)
    const saved = await writeTask('/tasks', {
      dealId,
      title: input.get('title'),
      dueDate: input.get('dueDate'),
      assigneeId: input.get('assigneeId') || undefined,
    })
    if (saved) {
      form.reset()
      setDealId('')
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Follow-ups &amp; risk</h1>
          <p>See due tasks and opportunities that need attention.</p>
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {write && (
        <section className="card advanced-card">
          <h2>Schedule a follow-up</h2>
          <form className="advanced-filters" onSubmit={(event) => void submit(event)}>
            <label>
              Deal
              <select required value={dealId} onChange={(event) => setDealId(event.target.value)}>
                <option value="">Choose a deal</option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.title} ({deal.ownerName})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Task
              <input name="title" required maxLength={150} placeholder="Call the buyer" />
            </label>
            <label>
              Due date
              <input name="dueDate" required type="date" />
            </label>
            {team && selectedDeal && (
              <label>
                Assignee
                <select key={dealId} name="assigneeId" defaultValue={selectedDeal.ownerId}>
                  {!options.some((member) => member.id === selectedDeal.ownerId) && (
                    <option value={selectedDeal.ownerId}>
                      {selectedDeal.ownerName} (deal owner)
                    </option>
                  )}
                  {options.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="primary" disabled={busy}>
              Add follow-up
            </button>
          </form>
        </section>
      )}
      <section className="card advanced-card">
        <div className="section-heading">
          <div>
            <h2>Follow-up tasks</h2>
            <p>
              {reminders.filter((task) => task.dueDate === today).length} due today ·{' '}
              {reminders.filter((task) => task.dueDate < today).length} overdue
            </p>
          </div>
          <div className="advanced-filters">
            {team && (
              <label>
                Scope
                <select
                  value={scope}
                  onChange={(event) => {
                    setData(undefined)
                    setScope(event.target.value)
                  }}
                >
                  <option value="mine">My follow-ups and deals</option>
                  <option value="team">Entire workspace</option>
                </select>
              </label>
            )}
            <label>
              Task status
              <select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}>
                <option value="pending">Pending</option>
                <option value="due">Due and overdue</option>
                <option value="completed">Completed</option>
                <option value="all">All tasks</option>
              </select>
            </label>
          </div>
        </div>
        {filterError && (
          <p className="notice error" role="alert">
            {filterError}
          </p>
        )}
        {!data && !filterError && <p role="status">Loading follow-ups…</p>}
        {tasks?.length === 0 && <p>No matching follow-up tasks.</p>}
        {!!tasks?.length && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Deal</th>
                  <th>Assignee</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.title}</td>
                    <td>
                      <button className="deal-link" onClick={() => onOpen(task.deal)}>
                        {task.deal.title}
                      </button>
                    </td>
                    <td>{task.assigneeName}</td>
                    <td>{task.dueDate}</td>
                    <td>
                      {task.status === 'completed' ? (
                        <>
                          {'Completed by ' + task.completedBy}
                          <small>
                            {task.completedAt && new Date(task.completedAt).toLocaleString()}
                          </small>
                        </>
                      ) : (
                        <>
                          <span className={task.dueDate < today ? 'status lost' : 'status open'}>
                            {task.dueDate < today
                              ? 'Overdue'
                              : task.dueDate === today
                                ? 'Due today'
                                : 'Pending'}
                          </span>
                          {write && (
                            <button
                              className="link-button task-complete"
                              disabled={busy}
                              onClick={() => void writeTask('/tasks/' + task.id + '/complete', {})}
                            >
                              Complete
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card advanced-card">
        <h2>Open deal risk alerts</h2>
        {data && <RiskList alerts={data.alerts} onOpen={onOpen} />}
      </section>
    </>
  )
}
