import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  Bell,
  Upload,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings2,
  Sparkles,
  Target as TargetIcon,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import type { Deal, FollowUp, Session } from '../../../backend/shared/types'
import { dateKey, money, monthBounds, summarize } from '../../../backend/shared/domain'
import { api, errorText, loadSession, RequestError } from './api'
import type { Records, TeamMember } from './api'
import { Brand } from './Auth'
import { DealEditor, DealTable } from './Deals'
import { Ask } from './Ask'
import { CsvImport } from './CsvImport'
import { Pipeline } from './Pipeline'
import { Reports } from './Reports'
import { Team, WorkspaceSettings } from './Team'

const month = dateKey().slice(0, 7)
const period = monthBounds(month)
const monthLabel = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(period.from))
const roleLabels = { owner: 'Workspace owner', admin: 'Admin', employee: 'Employee' }

export function Workspace({
  session,
  onSession,
  onLogout,
}: {
  session: Session
  onSession: (value: Session | null) => void
  onLogout: () => Promise<void>
}) {
  const management = session.role !== 'employee'
  const canWrite = session.permissions.includes('deals:write')
  const [records, setRecords] = useState<Records>()
  const [reminders, setReminders] = useState(0)
  const [error, setError] = useState('')
  const [navigation, setNavigation] = useState(false)
  const [editor, setEditor] = useState<Deal | 'new' | null>(null)
  const refresh = useCallback(async () => {
    try {
      const sessionResponse = await loadSession()
      if (!sessionResponse.session) {
        onSession(null)
        return
      }
      onSession(sessionResponse.session)
      const [dealData, targetData, teamData, taskData] = await Promise.all([
        api<Pick<Records, 'deals'>>('/deals'),
        api<Pick<Records, 'targets'>>('/targets?month=' + month),
        sessionResponse.session.permissions.includes('members:view')
          ? api<Pick<Records, 'members'>>('/members')
          : Promise.resolve({ members: [] }),
        api<{ tasks: FollowUp[]; today: string }>('/tasks'),
      ])
      setRecords({ ...dealData, ...targetData, ...teamData })
      setReminders(
        taskData.tasks.filter((task) => task.status === 'pending' && task.dueDate <= taskData.today)
          .length,
      )
      setError('')
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 401) onSession(null)
      else setError(errorText(cause))
    }
  }, [onSession])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const nav = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    {
      to: '/deals',
      label: session.permissions.includes('deals:team') ? 'Team deals' : 'My deals',
      icon: BriefcaseBusiness,
    },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    { to: '/follow-ups', label: 'Follow-ups & risk', icon: Bell },
    ...(canWrite ? [{ to: '/import', label: 'Import deals', icon: Upload }] : []),
    ...(session.permissions.includes('ask:own')
      ? [{ to: '/ask', label: 'Ask CloseSignal', icon: Sparkles }]
      : []),
    ...(session.permissions.includes('members:view')
      ? [{ to: '/team', label: 'Team & targets', icon: Users }]
      : []),
    ...(session.permissions.includes('workspace:manage')
      ? [{ to: '/settings', label: 'Settings', icon: Settings2 }]
      : []),
  ]
  const edit = (deal: Deal) => setEditor(deal)
  const logout = () => void onLogout().catch((cause: unknown) => setError(errorText(cause)))
  return (
    <div className="shell">
      {navigation && (
        <button
          className="side-overlay"
          aria-label="Close navigation"
          onClick={() => setNavigation(false)}
        />
      )}
      <aside className={'sidebar' + (navigation ? ' revealed' : '')}>
        <Brand />
        <div className="workspace-tag">
          <span className="workspace-mark">{session.workspace.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{session.workspace}</strong>
            <small>{management ? 'Management workspace' : 'Employee workspace'}</small>
          </div>
        </div>
        <nav aria-label="Workspace navigation">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setNavigation(false)}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">{session.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{session.name}</strong>
            <small>{roleLabels[session.role]}</small>
          </div>
          <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="workspace-main">
        <header className="topbar">
          <button
            className="icon-button menu-toggle"
            aria-label={navigation ? 'Close navigation' : 'Open navigation'}
            onClick={() => setNavigation(!navigation)}
          >
            {navigation ? <X size={21} /> : <Menu size={21} />}
          </button>
          <span className="top-workspace">{session.workspace}</span>
          {reminders > 0 && (
            <NavLink to="/follow-ups" className="secondary">
              <Bell size={16} /> {reminders} due
            </NavLink>
          )}
          {canWrite && (
            <button className="primary" onClick={() => setEditor('new')}>
              <Plus size={17} /> New deal
            </button>
          )}
        </header>
        <div className="workspace-content">
          {error && (
            <p className="notice error" role="alert">
              {error}{' '}
              <button className="link-button" onClick={() => void refresh()}>
                Retry
              </button>
            </p>
          )}
          {!records && !error && <p role="status">Loading workspace…</p>}
          {records && (
            <Routes>
              <Route
                path="/"
                element={
                  <Overview
                    session={session}
                    records={records}
                    onOpen={edit}
                    onCreate={() => setEditor('new')}
                  />
                }
              />
              <Route
                path="/deals"
                element={
                  <DealsPage
                    session={session}
                    deals={records.deals}
                    members={records.members}
                    onOpen={edit}
                  />
                }
              />
              <Route
                path="/deals/:id"
                element={<DealRoute session={session} records={records} refresh={refresh} />}
              />
              <Route
                path="/reports"
                element={
                  <Reports
                    deals={records.deals}
                    session={session}
                    members={records.members}
                    onOpen={edit}
                  />
                }
              />
              <Route
                path="/follow-ups"
                element={
                  <Pipeline
                    session={session}
                    deals={records.deals}
                    members={records.members}
                    onOpen={edit}
                    refresh={refresh}
                  />
                }
              />
              {canWrite && <Route path="/import" element={<CsvImport refresh={refresh} />} />}
              {session.permissions.includes('ask:own') && (
                <Route
                  path="/ask"
                  element={
                    <Ask
                      session={session}
                      members={records.members}
                      onOpen={edit}
                      refresh={refresh}
                    />
                  }
                />
              )}
              {session.permissions.includes('members:view') && (
                <Route
                  path="/team"
                  element={<Team session={session} records={records} refresh={refresh} />}
                />
              )}
              {session.permissions.includes('workspace:manage') && (
                <Route
                  path="/settings"
                  element={<WorkspaceSettings session={session} refresh={refresh} />}
                />
              )}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </div>
      </main>
      {editor && (
        <DealEditor
          session={session}
          deal={editor === 'new' ? undefined : editor}
          members={records?.members ?? []}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

function DealRoute({
  session,
  records,
  refresh,
}: {
  session: Session
  records: Records
  refresh: () => Promise<void>
}) {
  const { id } = useParams()
  const navigate = useNavigate()
  const deal = records.deals.find((item) => item.id === id)
  function close() {
    void navigate('/deals')
  }
  if (!deal)
    return (
      <p className="notice error" role="alert">
        Deal not found. <NavLink to="/deals">View deals</NavLink>
      </p>
    )
  return (
    <DealEditor
      key={deal.id}
      session={session}
      deal={deal}
      members={records.members}
      onClose={close}
      onSaved={async () => {
        close()
        await refresh()
      }}
    />
  )
}

function Overview({
  session,
  records,
  onOpen,
  onCreate,
}: {
  session: Session
  records: Records
  onOpen: (deal: Deal) => void
  onCreate: () => void
}) {
  const team = session.permissions.includes('deals:team')
  const summary = summarize(records.deals, period.from, period.to)
  const target = records.targets
    .filter((entry) => team || entry.memberId === session.id)
    .reduce((sum, entry) => sum + entry.amount, 0)
  const progress = target > 0 ? Math.round((summary.wonValue / target) * 100) : 0
  const cards = [
    { label: 'Won revenue', value: money(summary.wonValue, session.currency), Icon: BarChart3 },
    {
      label: 'Deals closed',
      value: String(summary.won + summary.lost),
      detail: `${summary.won} won · ${summary.lost} lost`,
      Icon: Activity,
    },
    {
      label: 'Open pipeline',
      value: money(summary.pipelineValue, session.currency),
      detail: `${summary.open} open ${summary.open === 1 ? 'deal' : 'deals'}`,
      Icon: BriefcaseBusiness,
    },
  ]
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{team ? 'Sales overview' : 'My sales overview'}</h1>
          <p>
            {team
              ? 'Track your team’s sales and pipeline.'
              : 'Track your deals, wins, and monthly target.'}
          </p>
        </div>
        <span className="date-chip">{monthLabel}</span>
      </div>
      <div className="metrics">
        {cards.map(({ label, value, detail, Icon }) => (
          <article className="card metric" key={label}>
            <div>
              <p>{label}</p>
              <strong>{value}</strong>
              {detail && <small>{detail}</small>}
            </div>
            <span className="metric-icon">
              <Icon size={20} />
            </span>
          </article>
        ))}
      </div>
      <section className="card target-card">
        <div className="section-heading">
          <div className="section-title">
            <span className="metric-icon">
              <TargetIcon size={20} />
            </span>
            <div>
              <h2>Monthly target</h2>
              <p>{team ? 'Combined individual targets' : 'Your assigned sales goal'}</p>
            </div>
          </div>
          {target > 0 && <strong>{progress}%</strong>}
        </div>
        {target > 0 ? (
          <>
            <progress
              max={100}
              value={Math.min(100, progress)}
              aria-label="Monthly target progress"
            />
            <div className="target-detail">
              <span>{money(summary.wonValue, session.currency)} won</span>
              <span>{money(target, session.currency)} target</span>
            </div>
          </>
        ) : (
          <p className="target-empty">No targets have been assigned for {monthLabel}.</p>
        )}
      </section>
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Recent deals</h2>
            <p>Latest updates in your pipeline</p>
          </div>
          <NavLink className="secondary" to="/deals">
            View deals
          </NavLink>
        </div>
        {records.deals.length ? (
          <DealTable
            deals={records.deals.slice(0, 6)}
            currency={session.currency}
            showOwner={team}
            onOpen={onOpen}
          />
        ) : (
          <div className="empty">
            <BriefcaseBusiness size={26} />
            <h3>No deals yet</h3>
            <p>Add a deal to begin tracking your pipeline.</p>
            {session.permissions.includes('deals:write') && (
              <button className="primary" onClick={onCreate}>
                <Plus size={16} /> Add a deal
              </button>
            )}
          </div>
        )}
      </section>
    </>
  )
}

function DealsPage({
  session,
  deals,
  members,
  onOpen,
}: {
  session: Session
  deals: Deal[]
  members: TeamMember[]
  onOpen: (deal: Deal) => void
}) {
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('')
  const [owner, setOwner] = useState('')
  const team = session.permissions.includes('deals:team')
  const query = search.trim().toLowerCase()
  const filtered = deals.filter(
    (deal) =>
      (!stage || deal.stage === stage) &&
      (!owner || deal.ownerId === owner) &&
      (!query ||
        [deal.title, deal.company, deal.ownerName].some((value) =>
          value.toLowerCase().includes(query),
        )),
  )
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{team ? 'Team deals' : 'My deals'}</h1>
          <p>Review your pipeline and update deal stages.</p>
        </div>
      </div>
      <section className="card">
        <div className="filters">
          <input
            type="search"
            aria-label="Search deals"
            placeholder="Search deals…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <label className="filter-select">
            <select
              aria-label="Filter by status"
              value={stage}
              onChange={(event) => setStage(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="won">Closed won</option>
              <option value="lost">Closed lost</option>
            </select>
            <ChevronDown size={15} />
          </label>
          {team && (
            <label className="filter-select">
              <select
                aria-label="Filter by owner"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
              >
                <option value="">All owners</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </label>
          )}
        </div>
        {filtered.length ? (
          <DealTable
            deals={filtered}
            currency={session.currency}
            showOwner={team}
            onOpen={onOpen}
          />
        ) : (
          <div className="empty">
            <BriefcaseBusiness size={25} />
            <h3>{deals.length ? 'No matching deals' : 'No deals yet'}</h3>
            <p>
              {deals.length
                ? 'Try a different search or filter.'
                : session.permissions.includes('deals:write')
                  ? 'Use New deal to add your first deal.'
                  : 'No deals are available in your view.'}
            </p>
          </div>
        )}
      </section>
    </>
  )
}
