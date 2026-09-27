import { ensureSignedIn, supabase } from './supabase'
import { showPoll } from './poll'

const app = document.querySelector<HTMLElement>('#app')!
let cleanup = () => {}

function showHome() {
  app.innerHTML = `
    <h1>✋ handsup</h1>
    <form id="join">
      <h2>Join a poll</h2>
      <input name="code" aria-label="Room code" placeholder="Room code" required
             maxlength="6" pattern="[A-Za-z0-9]{6}" autocomplete="off" />
      <button>Join</button>
    </form>
    <form id="create">
      <h2>Start a poll</h2>
      <input name="question" aria-label="Question" placeholder="Your question" required maxlength="200" />
      <textarea name="options" aria-label="Options" rows="4" required
                placeholder="One option per line (2–6)"></textarea>
      <button>Create poll</button>
      <p class="error" role="alert"></p>
    </form>`

  app.querySelector<HTMLFormElement>('#join')!.onsubmit = (e) => {
    e.preventDefault()
    const code = String(new FormData(e.target as HTMLFormElement).get('code')).trim().toUpperCase()
    location.hash = `#/p/${code}`
  }

  const create = app.querySelector<HTMLFormElement>('#create')!
  const errorEl = create.querySelector<HTMLElement>('.error')!
  create.onsubmit = async (e) => {
    e.preventDefault()
    const form = new FormData(create)
    const question = String(form.get('question')).trim()
    const options = [...new Set(String(form.get('options')).split('\n').map((s) => s.trim()).filter(Boolean))]
    if (options.length < 2 || options.length > 6) {
      errorEl.textContent = 'Give 2 to 6 different options, one per line.'
      return
    }
    // The room code is random; retry the rare collision (23505 = unique violation).
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.from('polls').insert({ question, options }).select('code').single()
      if (data) {
        location.hash = `#/p/${data.code}`
        return
      }
      if (error.code !== '23505') {
        errorEl.textContent = error.message
        return
      }
    }
    errorEl.textContent = 'Could not get a free room code, try again.'
  }
}

function route(userId: string) {
  cleanup()
  cleanup = () => {}
  const code = location.hash.match(/^#\/p\/([a-z0-9]{6})$/i)?.[1].toUpperCase()
  if (code) cleanup = showPoll(app, code, userId)
  else showHome()
}

ensureSignedIn()
  .then((user) => {
    route(user.id)
    addEventListener('hashchange', () => route(user.id))
  })
  .catch((err: Error) => {
    app.textContent = `Sign-in failed: ${err.message}`
  })
