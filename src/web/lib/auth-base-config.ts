/**
 * Better Auth options that do not touch the database client (env + OAuth + session cookie policy only).
 *
 * **Runtime split**
 * - **Next.js** (`auth.ts`): OAuth callbacks, sign-in UI, `nextCookies()`, and `getSession` in RSC/server actions.
 *   `BETTER_AUTH_URL` must be the **dashboard origin** (e.g. `http://localhost:3000`).
 * - **Bot / Express** (`auth-node.ts`): Validates the same session cookies against the same Postgres when handling
 *   `/api/guilds/*` and `/ws`. No Next.js runtime; do not import `better-auth/next-js` there.
 *
 * Both use the same `BETTER_AUTH_SECRET`, `DATABASE_URL`, and Discord OAuth app — one identity store, two HTTP stacks.
 *
 * OAuth tokens on `Account` rows are sensitive: use a TLS `DATABASE_URL` in production and least-privilege DB roles.
 */
const betterAuthSecret = getRequiredEnv("BETTER_AUTH_SECRET")
const betterAuthUrl = getRequiredEnv("BETTER_AUTH_URL")

export const betterAuthBaseConfig = {
    secret: betterAuthSecret,
    baseURL: betterAuthUrl,
    trustedOrigins: [betterAuthUrl],
    socialProviders: {
        discord: {
            clientId: getRequiredEnv("CLIENT_ID"),
            clientSecret: getRequiredEnv("DISCORD_CLIENT_SECRET"),
            scope: ["identify", "guilds"],
            /**
             * Discord often omits `refresh_token` in refresh responses. Better Auth otherwise may clear the stored
             * refresh token and break `getAccessToken` → `/users/@me/guilds` after the first expiry.
             */
            refreshAccessToken: async (refreshToken: string) => {
                const clientId = getRequiredEnv("CLIENT_ID")
                const clientSecret = getRequiredEnv("DISCORD_CLIENT_SECRET")
                const controller = new AbortController()
                const timeoutHandle = setTimeout(() => controller.abort(), 10_000)
                try {
                    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams({
                            client_id: clientId,
                            client_secret: clientSecret,
                            grant_type: "refresh_token",
                            refresh_token: refreshToken,
                        }),
                        signal: controller.signal,
                    })
                    if (!tokenResponse.ok) {
                        const text = await tokenResponse.text()
                        throw new Error(
                            `Discord OAuth refresh failed (${tokenResponse.status}): ${text}`
                        )
                    }
                    const data = (await tokenResponse.json()) as {
                        access_token: string
                        expires_in: number
                        refresh_token?: string
                    }
                    return {
                        accessToken: data.access_token,
                        accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
                        refreshToken: data.refresh_token ?? refreshToken,
                    }
                } catch (error: unknown) {
                    if (error instanceof Error && error.name === "AbortError") {
                        throw new Error("Discord OAuth refresh timed out", { cause: error })
                    }
                    throw error
                } finally {
                    clearTimeout(timeoutHandle)
                }
            },
        },
    },
    session: {
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60,
        },
    },
}

function getRequiredEnv(
    name: "CLIENT_ID" | "DISCORD_CLIENT_SECRET" | "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL"
): string {
    const value = process.env[name]?.trim()
    if (!value) {
        throw new Error(`${name} is required for auth configuration.`)
    }
    return value
}
