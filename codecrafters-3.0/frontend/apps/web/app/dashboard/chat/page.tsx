import { ChatInterface } from "@/components/chat/ChatInterface"
import { auth } from "@/auth"
import { signOut } from "@/auth"
import { LogOut, Brain, LayoutGrid } from "lucide-react"
import Link from "next/link"

export default async function ChatPage() {
  const session = await auth()

  return (
    <div className="flex h-svh w-full flex-col overflow-hidden px-2 pb-2 pt-2 md:px-3 md:pb-3 md:pt-3">
      <header className="surface-elevated mb-2 flex shrink-0 items-center justify-between rounded-2xl border border-border/70 bg-background/80 px-4 py-2.5 md:mb-3 md:px-5">
        <div className="flex items-center gap-2.5">
          <span className="font-heading text-base font-semibold tracking-wide">NeuroTrack </span>
          <span className="text-xs text-muted-foreground">Chat Workspace</span>
          <Link
            href="/dashboard"
            className="animated-button ml-1 inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/75 px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary/45 hover:text-primary"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-primary" />
            Home
          </Link>
          <Link
            href="/dashboard/learn"
            className="animated-button inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/75 px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary/45 hover:text-primary"
          >
            <Brain className="w-3.5 h-3.5 text-primary" />
            Learn
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-border/70 bg-background/65 px-2.5 py-1 text-xs text-muted-foreground sm:block">
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
              className="animated-button inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/45 hover:text-primary"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ChatInterface />
      </div>
    </div>
  )
}
