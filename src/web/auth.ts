import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { betterAuthBaseConfig } from "@/lib/auth-base-config.js"
import { getWebPrismaClient } from "@/lib/prisma.js"

/**
 * Better Auth for **Next.js only** — `nextCookies()` pulls in the `next` package (not installed in the bot image).
 * @see {@link ./auth-node.ts} for the Express/bot instance.
 */
export const auth = betterAuth({
    ...betterAuthBaseConfig,
    database: prismaAdapter(getWebPrismaClient(), { provider: "postgresql" }),
    plugins: [nextCookies()],
})

export type BetterAuthSession = typeof auth.$Infer.Session
