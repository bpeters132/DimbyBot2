/**
 * Better Auth must be exposed as real HTTP GET/POST routes: OAuth providers (Discord) redirect the
 * browser to callback URLs on this origin. That flow cannot run inside a server action, so we use
 * `toNextJsHandler(auth)` here instead of `"use server"` mutations.
 */
import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@/auth"

export const { GET, POST } = toNextJsHandler(auth)
