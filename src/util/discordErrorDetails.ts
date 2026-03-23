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
