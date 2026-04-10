import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { betterAuthBaseConfig } from "./lib/auth-base-config.js"
import { getWebPrismaClient } from "./lib/prisma.js"

/**
 * Better Auth for the **bot process** (Express `/api/guilds/*`, WebSocket upgrade).
 * Same DB and secrets as Next; no `better-auth/next-js` / `next` dependency.
 * @see {@link ./auth.ts} for the Next.js dashboard instance.
 */
export const auth = betterAuth({
    ...betterAuthBaseConfig,
    database: prismaAdapter(getWebPrismaClient(), { provider: "postgresql" }),
})

export type BetterAuthSession = typeof auth.$Infer.Session
