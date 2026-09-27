import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

type Poll = { id: string; code: string; host_id: string; question: string; options: string[]; is_open: boolean }

// Question/options are user input; escape before putting them in innerHTML.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// Renders the poll room for host and voters alike (the host gets extra controls).
// Returns a cleanup that leaves the realtime channel when the route changes.
export function showPoll(app: HTMLElement, code: string, userId: string): () => void {
  let poll: Poll | null = null
  let channel: RealtimeChannel | null = null
  const votes = new Map<string, number>() // user_id -> option_idx
  let here = 1
  let error = ''
  let alive = true

  const link = () => `${location.origin}${location.pathname}#/p/${code}`

  const render = () => {
    if (!alive || !poll) return
    const p = poll
    const counts = p.options.map(() => 0)
    for (const i of votes.values()) counts[i]++
    const total = votes.size
    const mine = votes.get(userId)

    app.innerHTML = `
      <p class="meta"><a href="#/">✋ handsup</a> · Room <strong>${p.code}</strong> · ${here} here</p>
      <h1>${esc(p.question)}</h1>
      ${p.is_open ? '' : '<p class="closed">Voting is closed</p>'}
      <ol class="options">
        ${p.options
          .map((o, i) => {
            const pct = total ? Math.round((counts[i] * 100) / total) : 0
            return `<li><button data-idx="${i}" aria-pressed="${mine === i}" ${p.is_open ? '' : 'disabled'} style="--pct:${pct}%">
              <span>${esc(o)}</span><span>${counts[i]} · ${pct}%</span></button></li>`
          })
          .join('')}
      </ol>
      <p class="meta">${total} vote${total === 1 ? '' : 's'}</p>
      <p class="error" role="alert">${esc(error)}</p>
      ${
        p.host_id === userId
          ? `<div class="host"><button id="copy">Copy invite link</button>
             <button id="toggle">${p.is_open ? 'Close voting' : 'Reopen voting'}</button></div>`
          : ''
      }`
  }

  app.onclick = async (e) => {
    const btn = (e.target as HTMLElement).closest('button')
    if (!btn || !poll) return

    if (btn.id === 'copy') {
      await navigator.clipboard.writeText(link())
      btn.textContent = 'Copied!'
      return
    }

    if (btn.id === 'toggle') {
      const { data, error: err } = await supabase
        .from('polls').update({ is_open: !poll.is_open }).eq('id', poll.id).select().single()
      if (data) poll = data
      error = err?.message ?? ''
      render()
      return
    }

    if (btn.dataset.idx === undefined) return
    const idx = Number(btn.dataset.idx)
    const prev = votes.get(userId)
    votes.set(userId, idx) // optimistic; realtime echoes the same row back
    error = ''
    render()
    const { error: err } = await supabase
      .from('votes').upsert({ poll_id: poll.id, user_id: userId, option_idx: idx })
    if (err) {
      if (prev === undefined) votes.delete(userId)
      else votes.set(userId, prev)
      // 42501 = RLS rejected it, which here means the poll closed meanwhile
      error = err.code === '42501' ? 'Voting is closed.' : err.message
      render()
    }
  }

  ;(async () => {
    const { data, error: err } = await supabase.from('polls').select('*').eq('code', code).maybeSingle()
    if (!alive) return
    if (err || !data) {
      app.innerHTML = `<p>${err ? esc(err.message) : `No poll with code <strong>${code}</strong>.`}</p><p><a href="#/">← Back</a></p>`
      return
    }
    poll = data as Poll
    const pollId = poll.id

    const ch = supabase
      .channel(`poll:${code}`, { config: { presence: { key: userId } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `poll_id=eq.${pollId}` }, (payload) => {
        const row = payload.new as { user_id?: string; option_idx: number }
        if (row.user_id) votes.set(row.user_id, row.option_idx)
        render()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'polls', filter: `id=eq.${pollId}` }, (payload) => {
        poll = payload.new as Poll
        render()
      })
      .on('presence', { event: 'sync' }, () => {
        here = Object.keys(ch.presenceState()).length
        render()
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        await ch.track({})
        // Fetch after subscribing (also re-runs on reconnect) so no vote falls in the gap.
        const { data: rows } = await supabase.from('votes').select('user_id, option_idx').eq('poll_id', pollId)
        for (const r of rows ?? []) votes.set(r.user_id, r.option_idx)
        render()
      })
    channel = ch
    render()
  })()

  return () => {
    alive = false
    app.onclick = null
    if (channel) supabase.removeChannel(channel)
  }
}
