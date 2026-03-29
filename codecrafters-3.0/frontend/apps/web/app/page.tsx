import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { FileText, MessageSquare, Zap, Shield } from "lucide-react"

export default async function LandingPage() {
  const session = await auth()
  if (session) redirect("/dashboard")

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border max-w-6xl mx-auto w-full">
        <span className="font-bold text-lg tracking-tight">NeuroTrack </span>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-col items-center text-center px-6 py-24 flex-1 max-w-4xl mx-auto w-full">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground mb-8">
          <Zap className="w-3 h-3 text-primary" />
          Powered by Gemini &amp; Pinecone
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
          Chat with your
          <br />
          <span className="text-primary">documents</span>
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground max-w-xl mb-10 leading-relaxed">
          Upload PDFs and ask questions in plain English. NeuroTrack uses RAG to retrieve the
          most relevant passages and generate accurate, cited answers — instantly.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/signup"
            className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors"
          >
            Start for free
          </Link>
          <Link
            href="/login"
            className="border border-border px-6 py-3 rounded-xl font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </main>

      {/* Features */}
      <section className="border-t border-border py-20 px-6">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-8">
          {[
            {
              icon: FileText,
              title: "Upload PDFs",
              desc: "Drop in any PDF — research papers, contracts, manuals. We extract and index every word.",
            },
            {
              icon: MessageSquare,
              title: "Ask anything",
              desc: "Ask questions naturally. The AI retrieves the most relevant chunks before answering.",
            },
            {
              icon: Shield,
              title: "Cited answers",
              desc: "Every response links back to the exact source passages so you can verify instantly.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6 px-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} NeuroTrack
      </footer>
    </div>
  )
}
