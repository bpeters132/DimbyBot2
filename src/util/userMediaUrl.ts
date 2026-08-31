/** User-facing copy when a User media URL targets a private or Docker-internal host. */
export const USER_MEDIA_URL_BLOCKED = "That URL isn't allowed."

/**
 * Search-source prefixes that `lavalink-client` (DefaultSources) may strip before the
 * remainder is tested as an HTTP(S) `/loadtracks` identifier. `http` / `https` are
 * omitted: those tokens are the URL scheme, not wrappers to peel.
 *
 * Longest keys first so `ytsearch:` wins over `yt:` (stricter than the client's
 * Object.keys order, which can leave a non-URL remainder for some long forms).
 */
const LAVALINK_SOURCE_PREFIXES = [
    "youtube music",
    "music youtube",
    "apple music",
    "music apple",
    "spotify.com",
    "yandex music",
    "vk music",
    "pandora music",
    "flowery.tts",
    "tidal music",
    "youtubemusic",
    "musicyoutube",
    "ytmsearch",
    "applemusic",
    "amsearch",
    "musicapple",
    "soundcloud",
    "scsearch",
    "spsearch",
    "spotifycom",
    "spsuggestion",
    "dzsearch",
    "yandexmusic",
    "ymsearch",
    "vksearch",
    "vkmusic",
    "qbsearch",
    "pdsearch",
    "pandoramusic",
    "flowerytts",
    "bandcamp",
    "bcsearch",
    "phsearch",
    "pornhub",
    "tdsearch",
    "jiosaavn",
    "jssearch",
    "ytsearch",
    "youtube",
    "spotify",
    "deezer",
    "yandex",
    "pandora",
    "flowery",
    "tidal",
    "local",
    "link",
    "uri",
    "speak",
    "sprec",
    "dzisrc",
    "dzrec",
    "ymrec",
    "vkrec",
    "qobuz",
    "qbisrc",
    "qbrec",
    "pdisrc",
    "pdrec",
    "ftts",
    "tdrec",
    "jsrec",
    "ytm",
    "tts",
    "porn",
    "yt",
    "sc",
    "am",
    "sp",
    "dz",
    "vk",
    "qb",
    "pd",
    "bc",
    "td",
    "js",
].sort((a, b) => b.length - a.length)

/**
 * Strip one leading lavalink-client search-source prefix (`yt:`, `link:`, `local:`, …).
 * Returns the remainder, or `null` when no prefix matched.
 */
export function unwrapLavalinkSourcePrefix(query: string): string | null {
    const trimmed = query.trim()
    const lower = trimmed.toLowerCase()
    for (const prefix of LAVALINK_SOURCE_PREFIXES) {
        const token = `${prefix}:`
        if (lower.startsWith(token)) {
            return trimmed.slice(token.length)
        }
    }
    return null
}

/** True when `query` looks like an HTTP(S) URL (user paste or dashboard play). */
export function isHttpUrlQuery(query: string): boolean {
    return /^https?:\/\//i.test(query.trim())
}

/** Trimmed HTTP(S) string for Lavalink `player.search`, or `null` when `query` is not an HTTP URL. */
export function trimmedHttpUrlQuery(query: string): string | null {
    if (!isHttpUrlQuery(query)) return null
    return query.trim()
}

/**
 * True when a User media URL must not be sent to Lavalink: loopback, RFC1918,
 * link-local, or a single-label Docker DNS name. Non-URLs (ytsearch text) are allowed.
 *
 * Also rejects `link:` / `uri:` / `yt:` / `sc:` / `local:` / … wrappers that
 * lavalink-client strips before treating the remainder as a raw HTTP identifier.
 */
export function isBlockedUserMediaUrl(query: string): boolean {
    const trimmed = query.trim()
    const candidates = [trimmed]
    const unwrapped = unwrapLavalinkSourcePrefix(trimmed)
    if (unwrapped != null) candidates.push(unwrapped)

    for (const candidate of candidates) {
        if (!isHttpUrlQuery(candidate)) continue
        try {
            const hostname = new URL(candidate.trim()).hostname
            if (isBlockedUserMediaHost(hostname)) return true
        } catch {
            return true
        }
    }
    return false
}

function isBlockedUserMediaHost(hostname: string): boolean {
    const host = hostname
        .replace(/^\[|\]$/g, "")
        .toLowerCase()
        .replace(/\.+$/, "")
    if (host === "localhost" || host.endsWith(".localhost")) return true
    if (isBlockedIpLiteral(host)) return true
    if (!host.includes(".") && !host.includes(":")) return true
    return false
}

function isBlockedIpLiteral(host: string): boolean {
    if (isBlockedIpv4(host)) return true
    if (!host.includes(":")) return false
    if (host === "::" || host === "::1" || host === "0:0:0:0:0:0:0:1") return true
    const firstHextet = Number.parseInt(host.split(":", 1)[0] ?? "", 16)
    if (Number.isInteger(firstHextet) && (firstHextet & 0xffc0) === 0xfe80) return true
    if (Number.isInteger(firstHextet) && (firstHextet & 0xfe00) === 0xfc00) return true
    const mapped = mappedIpv4FromV6(host)
    return mapped != null && isBlockedIpv4(mapped)
}

function mappedIpv4FromV6(host: string): string | null {
    const lower = host.toLowerCase()
    const prefix = "::ffff:"
    if (!lower.startsWith(prefix)) return null
    const rest = lower.slice(prefix.length)
    if (rest.includes(".")) return rest
    const hextets = rest.split(":")
    if (hextets.length !== 2) return null
    const hi = Number.parseInt(hextets[0]!, 16)
    const lo = Number.parseInt(hextets[1]!, 16)
    if (!Number.isInteger(hi) || !Number.isInteger(lo)) return null
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`
}

function isBlockedIpv4(host: string): boolean {
    const parts = host.split(".")
    if (parts.length !== 4) return false
    const octets = parts.map((part) => Number(part))
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
    const a = octets[0]!
    const b = octets[1]!
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    return false
}
