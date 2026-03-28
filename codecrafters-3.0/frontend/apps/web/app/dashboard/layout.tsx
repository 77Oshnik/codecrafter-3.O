import type { ReactNode } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { SessionProvider } from "next-auth/react"

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <SessionProvider session={session}>
      <div className="flex h-svh w-full overflow-hidden bg-background">{children}</div>
    </SessionProvider>
  )
}
