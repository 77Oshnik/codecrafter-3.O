import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    backendToken?: string
  }
  interface Session {
    user: {
      id: string
      backendToken?: string
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    backendToken?: string
  }
}
