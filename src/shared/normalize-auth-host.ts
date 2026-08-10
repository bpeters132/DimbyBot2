/**
 * Lowercase and strip default ports only when they match the URL scheme (https→443, http→80).
 * Used by the dashboard proxy to compare request Host against `BETTER_AUTH_URL`.
 */
export function normalizeAuthHost(host: string, protocol: string): string {
    let hostPart = host.trim()
    let scheme = protocol
    const lowerInput = hostPart.toLowerCase()

    if (lowerInput.startsWith("https://") || lowerInput.startsWith("http://")) {
        const parsed = new URL(hostPart)
        hostPart = parsed.host
        scheme = parsed.protocol
    }

    let normalized = hostPart.toLowerCase()
    if (scheme === "https:" && normalized.endsWith(":443")) {
        normalized = normalized.slice(0, -4)
    } else if (scheme === "http:" && normalized.endsWith(":80")) {
        normalized = normalized.slice(0, -3)
    }
    return normalized
}
