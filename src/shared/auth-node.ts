import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { betterAuthBaseConfig } from "./auth-base-config.js"
import { getWebPrismaClient } from "../lib/webPrisma.js"

function createAuthInstance() {
    return betterAuth({
        ...betterAuthBaseConfig,
        database: prismaAdapter(getWebPrismaClient(), { provider: "postgresql" }),
    })
}

type AuthInstance = ReturnType<typeof createAuthInstance>

let _authInstance: AuthInstance | undefined

function initAuth(): AuthInstance {
    if (!_authInstance) {
        _authInstance = createAuthInstance()
    }
    return _authInstance
}

/**
 * Better Auth for the **bot process** (Express `/api/guilds/*`, WebSocket upgrade).
 * Same DB and secrets as Next; no `better-auth/next-js` / `next` dependency.
 * Lazily initialised on first property access so importing this module does not
 * eagerly construct the Prisma client (safe when `DATABASE_URL` is absent at load time).
 * @see {@link ./auth.ts} for the Next.js dashboard instance.
 */
export const auth: AuthInstance = new Proxy({} as AuthInstance, {
    get(_, prop) {
        return (initAuth() as never)[prop]
    },
})

export type BetterAuthSession = typeof auth.$Infer.Session
