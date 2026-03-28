import { redirect } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { VerifyForm } from "@/components/auth/verify-form"

interface VerifyEmailPageProps {
  searchParams: Promise<{ email?: string }>
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams

  if (!params.email) {
    redirect("/signup")
  }

  const email = decodeURIComponent(params.email)

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Check your email</CardTitle>
        <CardDescription>Enter the 6-digit code to verify your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <VerifyForm email={email} />
      </CardContent>
    </Card>
  )
}
