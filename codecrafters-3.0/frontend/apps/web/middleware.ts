import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextMiddleware } from "next/server"

const protectedRoutes = ["/dashboard"]
const authRoutes = ["/login", "/signup", "/verify-email"]

const middleware: NextMiddleware = auth((req) => {
  const { nextUrl, auth: session } = req
  const isLoggedIn = !!session?.user

  const isProtected = protectedRoutes.some((route) => nextUrl.pathname.startsWith(route))
  const isAuthRoute = authRoutes.some((route) => nextUrl.pathname.startsWith(route))

  if (isProtected && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl))
  }

  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl))
  }

  return NextResponse.next()
})

export default middleware

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
