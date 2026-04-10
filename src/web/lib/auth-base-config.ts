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
 */
export const betterAuthBaseConfig = {
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: [process.env.BETTER_AUTH_URL || "http://localhost:3000"],
    socialProviders: {
        discord: {
            clientId: process.env.CLIENT_ID as string,
            clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
            scope: ["identify", "guilds"],
            /**
             * Discord often omits `refresh_token` in refresh responses. Better Auth otherwise may clear the stored
             * refresh token and break `getAccessToken` → `/users/@me/guilds` after the first expiry.
             */
            refreshAccessToken: async (refreshToken: string) => {
                const clientId = process.env.CLIENT_ID as string
                const clientSecret = process.env.DISCORD_CLIENT_SECRET as string
                const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        client_id: clientId,
                        client_secret: clientSecret,
                        grant_type: "refresh_token",
                        refresh_token: refreshToken,
                    }),
                })
                if (!tokenResponse.ok) {
                    const text = await tokenResponse.text()
                    throw new Error(`Discord OAuth refresh failed (${tokenResponse.status}): ${text}`)
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
