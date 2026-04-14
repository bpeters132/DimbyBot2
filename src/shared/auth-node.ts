import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { getBetterAuthBaseConfig } from "./auth-base-config.js"
import { getWebPrismaClient } from "../lib/webPrisma.js"

function createAuthInstance() {
    return betterAuth({
        ...getBetterAuthBaseConfig(),
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
        return Reflect.get(initAuth() as object, prop) as never
    },
    has(_, prop) {
        return Reflect.has(initAuth() as object, prop)
    },
})

export type BetterAuthSession = typeof auth.$Infer.Session
