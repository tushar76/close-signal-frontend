import { ArrowUpRight, Copy, MailPlus, Target as TargetIcon, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { dateKey, money } from '../../../backend/shared/domain'
import { configurablePermissions, permissionLabels } from '../../../backend/shared/types'
import type { Session, Target } from '../../../backend/shared/types'
import { api, errorText } from './api'
import type { Invite, Records, TeamMember } from './api'

const thisMonth = dateKey().slice(0, 7)
function useAction() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function run(work: () => Promise<void>, success: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await work()
      setMessage(success)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  return { busy, run, message, error }
}
function Feedback({ message, error }: { message: string; error: string }) {
  return (
    <>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

export function Team({
  session,
  records,
  refresh,
}: {
  session: Session
  records: Records
  refresh: () => Promise<void>
}) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [inviteError, setInviteError] = useState('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [month, setMonth] = useState(thisMonth)
  const [monthTargets, setMonthTargets] = useState<Target[]>(records.targets)
  const [selected, setSelected] = useState('')
  const [editing, setEditing] = useState('')
  const permissionAction = useAction()
  const inviteAction = useAction()
  const memberAction = useAction()
  const targetAction = useAction()
  const canInvite = session.permissions.includes('employees:invite')
  const canAssign = session.permissions.includes('targets:team')
  const editingMember = records.members.find((member) => member.id === editing)
  const canManageMembers = session.permissions.includes('members:manage')
  const canInviteAdmins = session.permissions.includes('admins:manage')
  const assignee = selected || records.members.find((member) => member.active)?.id || ''
  const priorTarget = monthTargets.find((target) => target.memberId === assignee)
  const refreshInvites = useCallback(async () => {
    try {
      setInvites((await api<{ invites: Invite[] }>('/invites')).invites)
      setInviteError('')
    } catch (cause) {
      setInviteError(errorText(cause))
    }
  }, [])
  const refreshTargets = useCallback(async () => {
    if (!month) return
    try {
      setMonthTargets((await api<{ targets: Target[] }>('/targets?month=' + month)).targets)
    } catch {
      setMonthTargets([])
    }
  }, [month])
  useEffect(() => {
    if (canInvite) void refreshInvites()
  }, [canInvite, refreshInvites])
  useEffect(() => {
    void refreshTargets()
  }, [refreshTargets])

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form))
    setLink('')
    setCopied(false)
    void inviteAction.run(async () => {
      const { path } = await api<{ path: string }>('/invites', 'POST', body)
      setLink(new URL(path, window.location.origin).href)
      form.reset()
      await refreshInvites()
    }, 'Invitation created.')
  }
  function setTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void targetAction.run(async () => {
      await api('/targets', 'PUT', {
        memberId: assignee,
        month,
        amount: Number(data.get('amount')),
      })
      await Promise.all([refresh(), refreshTargets()])
    }, 'Target saved.')
  }
  function update(member: TeamMember, role: 'admin' | 'employee', active: boolean) {
    void memberAction.run(async () => {
      await api('/members/' + member.id, 'PATCH', { role, active })
      await Promise.all([refresh(), refreshInvites()])
    }, 'Member updated.')
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Team & targets</h1>
          <p>Manage invitations and monthly sales goals.</p>
        </div>
      </div>
      {(canInvite || canAssign) && (
        <div className="team-grid">
          {canInvite && (
            <section className="card padded">
              <div className="section-title">
                <span className="metric-icon">
                  <MailPlus size={20} />
                </span>
                <div>
                  <h2>Invite a member</h2>
                  <p>Share the invitation link with the intended recipient.</p>
                </div>
              </div>
              <form className="form-stack" onSubmit={invite}>
                <label>
                  Work email
                  <input name="email" type="email" required />
                </label>
                <label>
                  Role
                  <select name="role">
                    <option value="employee">Employee</option>
                    {canInviteAdmins && <option value="admin">Admin</option>}
                  </select>
                </label>
                <button className="primary" disabled={inviteAction.busy}>
                  Create invitation
                  <ArrowUpRight size={16} />
                </button>
              </form>
              <Feedback {...inviteAction} />
              {link && (
                <div className="link-box">
                  <label>
                    Invitation link
                    <input value={link} onFocus={(event) => event.target.select()} readOnly />
                  </label>
                  <button
                    className="secondary"
                    onClick={() =>
                      void navigator.clipboard
                        ?.writeText(link)
                        .then(() => setCopied(true))
                        .catch(() => setCopied(false))
                    }
                  >
                    <Copy size={15} />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
            </section>
          )}
          {canAssign && (
            <section className="card padded">
              <div className="section-title">
                <span className="metric-icon">
                  <TargetIcon size={20} />
                </span>
                <div>
                  <h2>Assign a target</h2>
                  <p>Set a closed-won revenue goal for a member.</p>
                </div>
              </div>
              <form className="form-stack" onSubmit={setTarget}>
                <label>
                  Member
                  <select
                    value={assignee}
                    onChange={(event) => setSelected(event.target.value)}
                    required
                  >
                    {records.members
                      .filter((member) => member.active)
                      .map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    Month
                    <input
                      type="month"
                      value={month}
                      onChange={(event) => setMonth(event.target.value)}
                      required
                      min="2000-01"
                      max="2099-12"
                    />
                  </label>
                  <label>
                    Amount ({session.currency})
                    <input
                      key={month + assignee + (priorTarget?.amount ?? '')}
                      name="amount"
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      max="1000000000000"
                      defaultValue={priorTarget?.amount}
                    />
                  </label>
                </div>
                <button className="primary" disabled={targetAction.busy || !assignee}>
                  Save target
                </button>
              </form>
              <Feedback {...targetAction} />
            </section>
          )}
        </div>
      )}
      <section className="card">
        <div className="section-heading">
          <div className="section-title">
            <span className="metric-icon">
              <Users size={20} />
            </span>
            <div>
              <h2>Workspace members</h2>
              <p>Roles control what each member can access.</p>
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Account</th>
                <th>Target · {month || thisMonth}</th>
                {canManageMembers && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {records.members.map((member) => {
                const target = monthTargets.find((entry) => entry.memberId === member.id)
                return (
                  <tr key={member.id}>
                    <td>
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </td>
                    <td>{member.role}</td>
                    <td>
                      <span className={'status ' + (member.active ? 'won' : 'lost')}>
                        {member.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td>{target ? money(target.amount, session.currency) : '—'}</td>
                    {canManageMembers && (
                      <td>
                        {member.role !== 'owner' && (
                          <div className="member-actions">
                            <select
                              aria-label={'Role for ' + member.name}
                              value={member.role}
                              disabled={memberAction.busy}
                              onChange={(event) =>
                                update(
                                  member,
                                  event.target.value as 'admin' | 'employee',
                                  Boolean(member.active),
                                )
                              }
                            >
                              <option value="employee">Employee</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button
                              className="secondary"
                              disabled={memberAction.busy}
                              onClick={() =>
                                update(
                                  member,
                                  member.role === 'admin' ? 'admin' : 'employee',
                                  !member.active,
                                )
                              }
                            >
                              {member.active ? 'Disable' : 'Enable'}
                            </button>
                            <button className="secondary" onClick={() => setEditing(member.id)}>
                              Permissions
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="table-feedback">
          <Feedback {...memberAction} />
        </div>
      </section>
      {canManageMembers && editingMember && (
        <section className="card padded" key={editingMember.id}>
          <div className="section-heading">
            <div>
              <h2>Permissions for {editingMember.name}</h2>
              <p>Choose which role permissions this member can use.</p>
            </div>
            <button className="secondary" onClick={() => setEditing('')}>
              Close
            </button>
          </div>
          <form
            className="form-stack permissions"
            key={editingMember.role + editingMember.disabled.join(',')}
            onSubmit={(event) => {
              event.preventDefault()
              const selected = new FormData(event.currentTarget)
              const disabled = configurablePermissions(editingMember.role).filter(
                (permission) => !selected.has(permission),
              )
              void permissionAction.run(async () => {
                await api('/members/' + editingMember.id + '/permissions', 'PUT', { disabled })
                await refresh()
              }, 'Permissions saved.')
            }}
          >
            {configurablePermissions(editingMember.role).map((permission) => (
              <label key={permission}>
                <input
                  name={permission}
                  type="checkbox"
                  defaultChecked={!editingMember.disabled.includes(permission)}
                />
                {permissionLabels[permission]}
              </label>
            ))}
            <button className="primary" disabled={permissionAction.busy}>
              Save permissions
            </button>
          </form>
          <Feedback {...permissionAction} />
        </section>
      )}
      {canInvite && (
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Pending invitations</h2>
              <p>Invitation links expire after 72 hours.</p>
            </div>
          </div>
          {inviteError && <p className="notice error">{inviteError}</p>}
          {invites.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((item) => (
                    <tr key={item.email}>
                      <td>{item.email}</td>
                      <td>{item.role}</td>
                      <td>{new Date(item.expires).toLocaleString()}</td>
                      <td>
                        <button
                          className="secondary"
                          disabled={inviteAction.busy}
                          onClick={() =>
                            void inviteAction.run(async () => {
                              await api('/invites/revoke', 'POST', { email: item.email })
                              setLink('')
                              await refreshInvites()
                            }, 'Invitation revoked.')
                          }
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="padding-text">No pending invitations.</p>
          )}
        </section>
      )}
    </>
  )
}

export function WorkspaceSettings({
  session,
  refresh,
}: {
  session: Session
  refresh: () => Promise<void>
}) {
  const action = useAction()
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Workspace settings</h1>
          <p>Manage your workspace details.</p>
        </div>
      </div>
      <section className="card padded settings">
        <h2>General</h2>
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault()
            const name = new FormData(event.currentTarget).get('name')
            void action.run(async () => {
              await api('/workspace', 'PATCH', { name })
              await refresh()
            }, 'Workspace updated.')
          }}
        >
          <label>
            Workspace name
            <input
              name="name"
              defaultValue={session.workspace}
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label>
            Currency
            <input value={session.currency} readOnly />
          </label>
          <button className="primary" disabled={action.busy}>
            Save settings
          </button>
        </form>
        <Feedback {...action} />
      </section>
    </>
  )
}
