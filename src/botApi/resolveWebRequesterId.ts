/**
 * Optional explicit Discord snowflake from the dashboard body; must match the authenticated user.
 */
export function resolveWebRequesterDiscordId(
    rawBody: unknown,
    sessionDiscordUserId: string
):
    | { ok: true; requesterId: string }
    | { ok: false; status: number; error: string; details?: string } {
    const body =
        typeof rawBody === "object" && rawBody !== null
            ? (rawBody as Record<string, unknown>)
            : {}
    const fromBody = body.requesterDiscordUserId
    if (fromBody !== undefined && fromBody !== null) {
        if (typeof fromBody !== "string" || !fromBody.trim()) {
            return {
                ok: false,
                status: 400,
                error: "Invalid requesterDiscordUserId.",
                details: "Must be a non-empty string when provided.",
            }
        }
        const trimmed = fromBody.trim()
        if (trimmed !== sessionDiscordUserId) {
            return {
                ok: false,
                status: 403,
                error: "Forbidden",
                details: "requesterDiscordUserId does not match the signed-in account.",
            }
        }
        return { ok: true, requesterId: trimmed }
    }
    return { ok: true, requesterId: sessionDiscordUserId }
}
