"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5001"

interface VerifyFormProps {
  email: string
}

export function VerifyForm({ email }: VerifyFormProps) {
  const router = useRouter()
  const [otp, setOtp] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (otp.trim().length !== 6) {
      setError("Please enter the 6-digit code.")
      return
    }

    setLoading(true)

    const res = await fetch(`${BACKEND_URL}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp: otp.trim() }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? "Verification failed.")
      setLoading(false)
      return
    }

    setSuccess("Email verified! Redirecting to login…")
    setTimeout(() => router.push("/login?verified=true"), 1500)
  }

  async function handleResend() {
    setError("")
    setSuccess("")
    setResending(true)

    const res = await fetch(`${BACKEND_URL}/api/auth/resend-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    const data = await res.json()
    setResending(false)

    if (!res.ok) {
      setError(data.error ?? "Failed to resend code.")
      return
    }

    setSuccess("A new code has been sent to your email.")
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground text-center">
        We sent a 6-digit code to <span className="text-foreground font-medium">{email}</span>
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="otp">Verification code</Label>
        <Input
          id="otp"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="123456"
          autoComplete="one-time-code"
          required
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          className="text-center text-xl tracking-widest font-mono"
        />
      </div>

      {error && <p className="text-sm text-destructive text-center">{error}</p>}
      {success && <p className="text-sm text-green-600 text-center">{success}</p>}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Verifying…" : "Verify email"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Didn&apos;t receive a code?{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="text-foreground underline underline-offset-4 hover:text-primary disabled:opacity-50"
        >
          {resending ? "Sending…" : "Resend"}
        </button>
      </p>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/signup" className="text-foreground underline underline-offset-4 hover:text-primary">
          Back to sign up
        </Link>
      </p>
    </form>
  )
}
