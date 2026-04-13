/** Redacts common secret patterns from error / log text for safe console output. */
export function sanitizeErrorText(s: string, maxLen: number): string {
    let out = s
    out = out.replace(/Bearer\s+[\w-._~+/]+/gi, "Bearer [REDACTED]")
    out = out.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]")
    out = out.replace(/(?:password|passwd|pwd)\s*[=:]\s*[^\s&;"']+/gi, "password=[REDACTED]")
    out = out.replace(/(?:token|apikey|api[_-]?key)\s*[=:]\s*[^\s&;"']+/gi, "token=[REDACTED]")
    out = out.replace(/\b(?:secret|client_secret)\b\s*[=:]\s*[^\s&;"']+/gi, "secret=[REDACTED]")
    out = out.replace(/postgres(?:ql)?:\/\/[^@\s/"']+@/gi, "postgres://[REDACTED]@")
    out = out.replace(/redis:\/\/[^@\s/"']+@/gi, "redis://[REDACTED]@")
    out = out.replace(/mysql:\/\/[^@\s/"']+@/gi, "mysql://[REDACTED]@")
    out = out.replace(/mongodb((?:\+srv)?):\/\/[^@\s/"']+@/gi, "mongodb$1://[REDACTED]@")
    out = out.replace(/eyJ[\w-]*\.eyJ[\w-]*\.[\w-]*/g, "[REDACTED_JWT]")
    if (out.length > maxLen) {
        out = `${out.slice(0, maxLen)}…`
    }
    return out
}
