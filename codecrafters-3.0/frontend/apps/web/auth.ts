import NextAuth, { type NextAuthConfig, type NextAuthResult } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5001"

const AUTH_SECRET =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  (process.env.NODE_ENV === "development" ? "dev-auth-secret-change-me" : undefined)

if (!AUTH_SECRET) {
  throw new Error("Missing AUTH_SECRET or NEXTAUTH_SECRET for NextAuth")
}

const authConfig = {
  secret: AUTH_SECRET,
  trustHost: true,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        try {
          const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          })

          if (!res.ok) return null

          const user = await res.json()
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            backendToken: user.token,
          }
        } catch {
          return null
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.backendToken = (user as any).backendToken
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(session.user as any).backendToken = token.backendToken as string
      }
      return session
    },
  },
} satisfies NextAuthConfig

const nextAuth: NextAuthResult = NextAuth(authConfig)

export const { handlers, auth, signIn, signOut } = nextAuth
