import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Button, ErrorBanner, Field, Input } from '../components/ui'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      const message = await signIn(email, password)
      if (message) setError(message)
      // On success the auth listener re-renders the app — nothing else to do.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <img src="/pwa-192.png" alt="In N Out app icon" className="h-24 w-24 rounded-3xl shadow-card" />
        <h1 className="mt-5 text-[28px] font-bold tracking-tight text-ios-label">In N Out</h1>
        <p className="mt-1 text-[17px] text-ios-label2">Staff car movement tracker</p>
      </div>

      <ErrorBanner message={error} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Email">
          <Input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="you@example.com"
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Password"
            required
          />
        </Field>
        <Button type="submit" full loading={submitting} className="mt-2">
          Sign in
        </Button>
      </form>

      <p className="mt-8 text-center text-[13px] text-ios-gray">
        Accounts are created by the office admin. Ask them if you can&apos;t log in.
      </p>
    </div>
  )
}
