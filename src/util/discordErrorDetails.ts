/** Numeric Discord REST/discord.js error code when present on a thrown value. */
export function getDiscordErrorCode(error: unknown): number | undefined {
    if (typeof error !== "object" || error === null || !("code" in error)) return undefined
    const raw = (error as { code?: unknown }).code
    if (typeof raw === "number" && Number.isFinite(raw)) return raw
    if (typeof raw === "string" && /^\d+$/.test(raw)) return parseInt(raw, 10)
    return undefined
}

/** Normalizes unknown delete/API errors for logging and retry heuristics (e.g. EAI_AGAIN). */
export function discordDeleteErrorDetails(err: unknown): { code?: string; message: string } {
    const message = err instanceof Error ? err.message : String(err)
    let code: string | undefined
    if (typeof err === "object" && err !== null && "code" in err) {
        const raw = (err as { code: unknown }).code
        code = typeof raw === "string" ? raw : raw != null ? String(raw) : undefined
    }
    return { code, message }
}
