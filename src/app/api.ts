import type {
  AskStreamEvent,
  AskThread,
  Deal,
  DealEvent,
  PipelineStage,
  Member,
  Session,
  Stage,
  Target,
} from '../../../backend/shared/types'

import { jsonLines } from '../../../backend/shared/ndjson'

export async function askTurn(
  path: string,
  body: unknown,
  append: (text: string) => void,
  signal: AbortSignal,
): Promise<AskThread> {
  try {
    const response = await fetch('/api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok || !response.headers.get('Content-Type')?.includes('application/x-ndjson')) {
      const value = await response.json()
      if (!response.ok)
        throw new RequestError(
          value.message || 'The request could not be completed.',
          response.status,
        )
      return value as AskThread
    }
    if (response.body) {
      for await (const value of jsonLines(response.body)) {
        const event = value as AskStreamEvent
        if (event.type === 'delta') append(event.text)
        if (event.type === 'complete') return event.thread
        if (event.type === 'interrupted') throw new RequestError(event.message, 503)
      }
    }
  } catch (error) {
    if (error instanceof RequestError) throw error
  }
  throw new RequestError('Reply interrupted. Retry to finish this request.', 503)
}

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const value = await response.json()
  if (!response.ok)
    throw new RequestError(value.message || 'The request could not be completed.', response.status)
  return value as T
}

export type TeamMember = Member & { active: number; disabled: string[] }
export type Invite = { email: string; role: 'admin' | 'employee'; expires: number }
export type Records = { deals: Deal[]; members: TeamMember[]; targets: Target[] }
export type DealInput = {
  title: string
  company: string
  amount: number
  stage: Stage
  ownerId?: string
  closedAt?: string | null
  expectedCloseAt?: string | null
  pipelineStage?: PipelineStage
}

export const loadSession = () => api<{ session: Session | null }>('/session')
export const loadDeal = (id: string) => api<{ deal: Deal; history: DealEvent[] }>('/deals/' + id)
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.'
