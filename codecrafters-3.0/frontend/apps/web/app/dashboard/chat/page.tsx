import { ChatInterface } from "@/components/chat/ChatInterface"
import { auth } from "@/auth"
import { signOut } from "@/auth"
import { LogOut, Brain, LayoutGrid } from "lucide-react"
import Link from "next/link"

export default async function ChatPage() {
  const session = await auth()

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background z-10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">CodeCrafter</span>
          <span className="text-xs text-muted-foreground">/ Chat</span>
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted transition-colors ml-2"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-primary" />
            Home
          </Link>
          <Link
            href="/dashboard/learn"
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Brain className="w-3.5 h-3.5 text-primary" />
            Learn
          </Link>
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

      <div className="flex flex-1 overflow-hidden">
        <ChatInterface />
      </div>
    </div>
  )
}
