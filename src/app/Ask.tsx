import { ArrowRight, Send, Sparkles, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import { money } from '../../../backend/shared/domain'
import type {
  AskAnswer,
  AskConversation,
  AskThread,
  Deal,
  Session,
} from '../../../backend/shared/types'
import { api, askTurn, errorText } from './api'
import type { TeamMember } from './api'
import { DealTable, stageLabels } from './Deals'
import { RiskList } from './Pipeline'

function requestId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

const suggestions = [
  'How many deals did I close this month?',
  'How many deals did I win last month?',
  'What is my won revenue this month?',
  'What is in my open pipeline?',
  'Compare my sales this month with last month.',
  'How much revenue do I still need to hit my target?',
  'What if my top 2 open deals close this month?',
  'Which of my deals have been inactive for 14 days?',
]
const scopedSuggestions = [
  'How many deals closed this month?',
  'How many deals were won last month?',
  'What was the won revenue this month?',
  'Show the open pipeline.',
  'Compare sales this month with last month.',
  'How much revenue is needed to hit the target?',
  'What if the top 2 open deals close this month?',
  'Which deals have been inactive for 14 days?',
]
export function Ask({
  session,
  members,
  onOpen,
  refresh,
}: {
  session: Session
  members: TeamMember[]
  onOpen: (deal: Deal) => void
  refresh: () => Promise<void>
}) {
  const base = '/ask/conversations'
  const [question, setQuestion] = useState('')
  const [scope, setScope] = useState('mine')
  const [explicitScope, setExplicitScope] = useState(false)
  const [chats, setChats] = useState<AskConversation[]>([])
  const [chatId, setChatId] = useState<string>()
  const [thread, setThread] = useState<AskThread>({ messages: [] })
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState<{ question: string; text: string }>()
  const activeRequest = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(true)
  const [retry, setRetry] = useState<() => Promise<void>>()
  const team = session.permissions.includes('ask:team')
  const latest = thread.messages.at(-1)?.answer
  const draft = latest?.draft
  const chatIdentity = session.workspaceId + ':' + session.id
  const end = useRef<HTMLLIElement>(null)
  const pending = useRef<{ key: string; id: string; requestId: string } | null>(null)
  const lastMessageId = thread.messages.at(-1)?.id

  const run = useCallback(async function run(operation: () => Promise<void>) {
    setBusy(true)
    setError('')
    setRetry(undefined)
    try {
      await operation()
    } catch (cause) {
      setError(errorText(cause))
      setRetry(() => () => run(operation))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        const items = await api<AskConversation[]>(base)
        const first = items[0]?.id
        const loaded = first ? await api<AskThread>(base + '/' + first) : { messages: [] }
        if (!active) return
        setChats(items)
        setChatId(first)
        setThread(loaded)
      } catch (cause) {
        if (active) {
          setError(errorText(cause))
          setRetry(() => () => run(initialize))
        }
      } finally {
        if (active) setBusy(false)
      }
    }
    void initialize()
    return () => {
      active = false
      activeRequest.current?.abort()
    }
  }, [chatIdentity, run])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [lastMessageId, generating])

  async function open(id: string, create = false) {
    pending.current = null
    await run(async () => {
      if (create) await api(base, 'POST', { id })
      const [loaded, items] = await Promise.all([
        api<AskThread>(base + '/' + id),
        api<AskConversation[]>(base),
      ])
      setChatId(id)
      setThread(loaded)
      setChats(items)
      setQuestion('')
    })
  }

  async function ask(text: string, selected?: string) {
    if ((!selected && text.trim().length < 2) || busy) return
    const key = JSON.stringify([chatId, text.trim(), scope, explicitScope, selected])
    if (pending.current?.key !== key)
      pending.current = { key, id: chatId ?? requestId(), requestId: requestId() }
    const { id, requestId: messageId } = pending.current
    await run(async () => {
      const controller = new AbortController()
      activeRequest.current = controller
      setGenerating({ question: text, text: '' })
      try {
        if (!chatId) await api(base, 'POST', { id })
        const memberId =
          scope !== 'mine' && scope !== 'team' && scope !== 'auto' ? scope : undefined
        const next = await askTurn(
          base + '/' + id + '/messages',
          {
            question: text,
            scope: scope === 'team' || memberId ? 'team' : 'mine',
            memberId,
            explicitScope,
            selected,
            requestId: messageId,
          },
          (delta) =>
            setGenerating((current) => current && { ...current, text: current.text + delta }),
          controller.signal,
        )
        setChatId(id)
        setThread(next)
        setQuestion((current) => (current === text ? '' : current))
        setChats(await api<AskConversation[]>(base))
        pending.current = null
      } finally {
        activeRequest.current = null
        setGenerating(undefined)
      }
    })
  }

  async function loadOlder() {
    await run(async () => {
      const older = await api<AskThread>(base + '/' + chatId + '?before=' + thread.before)
      setThread({ before: older.before, messages: [...older.messages, ...thread.messages] })
    })
  }

  async function finishDraft(operation: 'confirm' | 'discard') {
    if (!draft || busy) return
    await run(async () => {
      const next = await api<AskThread>(
        base + '/' + chatId + '/drafts/' + draft.id + '/' + operation,
        'POST',
        { revision: draft.revision },
      )
      setThread(next)
      setQuestion('')
      if (operation === 'confirm') await refresh()
    })
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void ask(question)
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Ask CloseSignal</h1>
          <p>Ask a general question, review sales, or prepare a CRM update.</p>
        </div>
      </div>
      <div className="ask-layout">
        <aside className="card ask-sidebar" aria-label="Saved chats">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void open(requestId(), true)}
          >
            <Plus size={16} /> New chat
          </button>
          <ul>
            {chats.map((chat) => (
              <li key={chat.id}>
                <button
                  type="button"
                  title={chat.title}
                  disabled={busy}
                  aria-current={chat.id === chatId ? 'true' : undefined}
                  onClick={() => void open(chat.id)}
                >
                  {chat.title}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="ask-main">
          <section className="card ask-card">
            <div className="section-title">
              <span className="metric-icon">
                <Sparkles size={20} />
              </span>
              <div>
                <h2>Conversation</h2>
                <p>
                  {session.modelEnabled
                    ? 'General chat with Ollama · CRM reports and actions'
                    : 'Guided CRM reports and sales definitions'}
                </p>
              </div>
            </div>
            {team && (
              <label className="scope">
                Answer scope
                <select
                  value={scope}
                  onChange={(event) => {
                    setScope(event.target.value)
                    setExplicitScope(event.target.value !== 'auto')
                  }}
                  disabled={busy || Boolean(draft)}
                >
                  <option value="mine">My sales</option>
                  <option value="auto">Use the question</option>
                  <option value="team">Entire workspace</option>
                  {members
                    .filter((member) => member.id !== session.id)
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({member.email})
                      </option>
                    ))}
                </select>
              </label>
            )}
            {!draft && !thread.messages.length && !generating && (
              <div className="suggestions">
                {(scope === 'mine' || scope === 'auto' ? suggestions : scopedSuggestions).map(
                  (prompt) => (
                    <button
                      className="suggestion"
                      key={prompt}
                      onClick={() => void ask(prompt)}
                      disabled={busy}
                    >
                      {prompt}
                      <ArrowRight size={15} />
                    </button>
                  ),
                )}
              </div>
            )}
            {thread.before && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void loadOlder()}
              >
                Load older messages
              </button>
            )}
            {(!!thread.messages.length || generating) && (
              <ol className="ask-conversation" aria-label="Messages" aria-live="polite">
                {thread.messages.map(({ id, question: prompt, answer }) => (
                  <li key={id}>
                    <p className="ask-user-message">{prompt}</p>
                    <AnswerView
                      answer={answer}
                      session={session}
                      onOpen={onOpen}
                      pdfUrl={
                        answer.pdf && chatId
                          ? '/api' + base + '/' + chatId + '/messages/' + id + '/report.pdf'
                          : undefined
                      }
                      pending={id === lastMessageId && Boolean(draft)}
                    />
                  </li>
                ))}
                {generating && (
                  <li>
                    <p className="ask-user-message">{generating.question}</p>
                    <div className="ask-turn">
                      {generating.text && (
                        <p className="answer-copy" data-testid="streaming-reply">
                          {generating.text}
                        </p>
                      )}
                      <span role="status">Generating reply…</span>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => activeRequest.current?.abort()}
                      >
                        Stop
                      </button>
                    </div>
                  </li>
                )}
                <li ref={end} aria-hidden="true" className="ask-thread-end" />
              </ol>
            )}
            <form className="ask-form" onSubmit={submit}>
              <input
                aria-label="Sales question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={
                  draft
                    ? 'Reply to continue or enter a field, e.g. Company: Amberline'
                    : 'Ask a question or request a CRM draft…'
                }
                maxLength={4000}
              />
              <button className="primary" disabled={busy || question.trim().length < 2}>
                <Send size={17} /> {draft ? 'Reply' : 'Ask'}
              </button>
            </form>
            {busy && !generating && <p role="status">Working on your request…</p>}
            {error && (
              <div className="notice error" role="alert">
                <p>{error}</p>
                {retry && (
                  <button className="secondary" disabled={busy} onClick={() => void retry()}>
                    Retry
                  </button>
                )}
              </div>
            )}
          </section>
          {draft && (
            <section className="card advanced-card" aria-live="polite">
              <div>
                <h2>{draft.kind === 'create' ? 'New deal draft' : 'Deal update draft'}</h2>
              </div>
              <dl className="draft-fields">
                <div>
                  <dt>Deal name</dt>
                  <dd>{draft.fields.title || 'Needed'}</dd>
                </div>
                <div>
                  <dt>Company</dt>
                  <dd>{draft.fields.company || '—'}</dd>
                </div>
                <div>
                  <dt>Value</dt>
                  <dd>
                    {draft.fields.amount === undefined
                      ? 'Needed'
                      : money(draft.fields.amount, session.currency)}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{stageLabels[draft.fields.stage ?? 'open']}</dd>
                </div>
                <div>
                  <dt>Assignee</dt>
                  <dd>{draft.assignee ?? 'Choose an assignee'}</dd>
                </div>
                {draft.followUpTitle && (
                  <div>
                    <dt>Follow-up task</dt>
                    <dd>{draft.followUpTitle}</dd>
                  </div>
                )}
                {draft.dueDate && (
                  <div>
                    <dt>Follow-up due (UTC)</dt>
                    <dd>{draft.dueDate}</dd>
                  </div>
                )}
                {(draft.fields.closedAt || draft.deal?.closedAt) && (
                  <div>
                    <dt>Actual close date (UTC)</dt>
                    <dd>{draft.fields.closedAt ?? 'Cleared'}</dd>
                  </div>
                )}
                {(draft.fields.expectedCloseAt || draft.deal?.expectedCloseAt) && (
                  <div>
                    <dt>Expected close date</dt>
                    <dd>{draft.fields.expectedCloseAt ?? 'Cleared'}</dd>
                  </div>
                )}
                {draft.fields.pipelineStage && (
                  <div>
                    <dt>Pipeline stage</dt>
                    <dd>{draft.fields.pipelineStage}</dd>
                  </div>
                )}
              </dl>
              {draft.choices?.map((deal) => (
                <button
                  className="secondary"
                  key={deal.id}
                  disabled={busy}
                  onClick={() => void ask(deal.title, deal.id)}
                >
                  {deal.title} · {deal.ownerName} · {money(deal.amount, session.currency)}
                </button>
              ))}
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void finishDraft('discard')}
                >
                  Discard draft
                </button>
                <button
                  className="primary"
                  disabled={busy || !draft.ready}
                  onClick={() => void finishDraft('confirm')}
                >
                  Confirm
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}

function AnswerView({
  answer,
  pdfUrl,
  session,
  onOpen,
  pending,
}: {
  pending: boolean
  answer: AskAnswer
  pdfUrl?: string
  session: Session
  onOpen: (deal: Deal) => void
}) {
  const { saved } = answer
  const label = answer.draft
    ? pending
      ? 'Pending action'
      : 'Draft'
    : saved
      ? saved.taskId
        ? 'Follow-up saved'
        : 'Deal saved'
      : answer.category === 'general'
        ? 'General answer'
        : answer.category === 'knowledge'
          ? 'Sales knowledge'
          : 'CRM answer'
  return (
    <section className="ask-turn">
      <h3>{label}</h3>
      <p className="answer-copy">{answer.text}</p>
      {pdfUrl && (
        <a className="secondary" href={pdfUrl} download>
          Download PDF
        </a>
      )}
      {answer.reference && (
        <button className="deal-link" onClick={() => answer.reference && onOpen(answer.reference)}>
          Open deal
        </button>
      )}

      {saved && (
        <Link className="deal-link" to={'/deals/' + saved.deal.id}>
          {saved.deal.title}
        </Link>
      )}
      {answer.result && (
        <span className="date-chip">
          {answer.currentPipeline
            ? 'Current pipeline'
            : answer.result.from === '0001-01-01'
              ? 'All recorded dates'
              : answer.result.from + ' to ' + answer.result.to}
        </span>
      )}
      {!!answer.alerts?.length && <RiskList alerts={answer.alerts} onOpen={onOpen} />}
      {!!answer.result?.deals.length && (
        <DealTable
          deals={answer.result.deals}
          currency={answer.context?.currency ?? session.currency}
          showOwner={session.permissions.includes('ask:team')}
          onOpen={onOpen}
        />
      )}
      {!!answer.tasks?.length && (
        <ul className="ask-tasks">
          {answer.tasks.map((task) => (
            <li key={task.id}>
              <button className="deal-link" onClick={() => onOpen(task.deal)}>
                {task.deal.title}
              </button>
              <span>
                {task.title} · {task.dueDate} · {task.assigneeName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
