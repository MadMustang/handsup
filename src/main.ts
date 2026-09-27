import { ensureSignedIn } from './supabase'

const app = document.querySelector<HTMLElement>('#app')!

ensureSignedIn()
  .then((user) => {
    app.textContent = `Signed in anonymously as ${user.id.slice(0, 8)}…`
  })
  .catch((err: Error) => {
    app.textContent = `Sign-in failed: ${err.message}`
  })
