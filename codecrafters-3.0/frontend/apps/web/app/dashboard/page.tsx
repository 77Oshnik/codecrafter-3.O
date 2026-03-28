import { ChatInterface } from "@/components/chat/ChatInterface"
import { auth } from "@/auth"
import { signOut } from "@/auth"
import { LogOut } from "lucide-react"

export default async function DashboardPage() {
  const session = await auth()

  return (
    <div className="flex flex-col w-full h-full">
      {/* Top nav */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background z-10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">CodeCrafter</span>
          <span className="text-xs text-muted-foreground">/ Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {session?.user?.name ?? session?.user?.email}
          </span>
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/login" })
            }}
          >
            <button
              type="submit"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Chat fills remaining height */}
      <div className="flex flex-1 overflow-hidden">
        <ChatInterface />
      </div>
    </div>
  )
}
