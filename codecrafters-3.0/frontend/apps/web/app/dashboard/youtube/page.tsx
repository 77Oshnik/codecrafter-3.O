import Link from "next/link"
import { ArrowLeft, LogOut, PlayCircle } from "lucide-react"
import { auth, signOut } from "@/auth"
import { YoutubeLearnWorkspace } from "@/components/youtube/YoutubeLearnWorkspace"

interface PageProps {
  searchParams?: {
    conversationId?: string
  }
}

export default async function YoutubePage({ searchParams }: PageProps) {
  const session = await auth()

  return (
    <div className="flex h-full w-full flex-col">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <span className="text-sm font-semibold">CodeCrafter</span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <PlayCircle className="h-3.5 w-3.5" />
            / YouTube Learn
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:block">
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
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <YoutubeLearnWorkspace initialConversationId={searchParams?.conversationId} />
    </div>
  )
}
