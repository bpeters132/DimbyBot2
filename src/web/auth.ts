import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { getBetterAuthBaseConfig } from "@/lib/auth-base-config.js"
import { getWebPrismaClient } from "@/lib/prisma.js"

function createAuthInstance() {
    return betterAuth({
        ...getBetterAuthBaseConfig(),
        database: prismaAdapter(getWebPrismaClient(), { provider: "postgresql" }),
        plugins: [nextCookies()],
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
 * Better Auth for **Next.js only** — `nextCookies()` pulls in the `next` package (not installed in the bot image).
 * Lazily initialised so `next build` does not require auth env when route modules are loaded.
 * @see {@link ../shared/auth-node.ts} for the Express/bot instance.
 */
export const auth: AuthInstance = new Proxy({} as AuthInstance, {
    get(_, prop) {
        return Reflect.get(initAuth() as object, prop) as never
    },
    /** `better-auth/next-js` uses `"handler" in auth`; without this, `in` only sees the empty target and calls `auth()` as a function. */
    has(_, prop) {
        return Reflect.has(initAuth() as object, prop)
    },
})

export type BetterAuthSession = AuthInstance["$Infer"]["Session"]
