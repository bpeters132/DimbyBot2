/** Trusted Origin for dashboard→bot requests when the inbound request has no `Origin` header. */
export function getOriginFallback(): string | null {
    const authUrl = process.env.BETTER_AUTH_URL?.trim()
    if (!authUrl) return null
    try {
        return new URL(authUrl).origin
    } catch {
        return null
    }
}
