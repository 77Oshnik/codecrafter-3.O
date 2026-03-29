import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { SignupForm } from "@/components/auth/signup-form"

export default function SignupPage() {
  return (
    <Card className="w-full max-w-md border-border/70 bg-card/90">
      <CardHeader className="text-center">
        <CardTitle className="font-heading text-2xl">Create an account</CardTitle>
        <CardDescription>
          We&apos;ll send a verification code to your email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
    </Card>
  )
}
