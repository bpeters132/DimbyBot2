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

/**
 * Lavaplayer `HttpAudioSourceManager.getAsHttpReference` rewrites `icy://` to `http://`
 * before fetching. Treat the alias like HTTP at the user-media boundary so private hosts
 * cannot bypass {@link isBlockedUserMediaUrl} when `defaultSearchPlatform` is `local`
 * (lavalink-client sends the bare identifier with no search prefix).
 */
export function rewriteIcySchemeToHttp(query: string): string {
    const trimmed = query.trim()
    if (!/^icy:\/\//i.test(trimmed)) return trimmed
    return `http://${trimmed.slice(trimmed.indexOf("://") + 3)}`
}

/** True when `query` looks like an HTTP(S) or lavaplayer `icy://` URL (user paste or dashboard play). */
export function isHttpUrlQuery(query: string): boolean {
    return /^(?:https?|icy):\/\//i.test(query.trim())
}

/**
 * Strip lavalink-client direct-link source prefixes (`link:`, `uri:`).
 * Those prefixes make `player.search` send the remainder as a raw `/loadtracks`
 * identifier; SSRF checks must inspect the underlying HTTP(S) URL.
 */
export function unwrapDirectLinkSourcePrefix(query: string): string {
    const trimmed = query.trim()
    const match = /^(?:link|uri):/i.exec(trimmed)
    if (!match) return trimmed
    return trimmed.slice(match[0].length).trim()
}

/**
 * Trimmed HTTP(S) string for Lavalink `player.search`, or `null` when `query` is not an
 * HTTP / icy URL. `icy://` is normalized to `http://` (same rewrite lavaplayer applies).
 */
export function trimmedHttpUrlQuery(query: string): string | null {
    if (!isHttpUrlQuery(query)) return null
    return rewriteIcySchemeToHttp(query)
}

/**
 * True when a User media URL must not be sent to Lavalink: loopback, RFC1918,
 * link-local, single-label Docker DNS names, DNS-bounce hosts that encode a private
 * IP in the name (e.g. `10.0.0.1.nip.io` or `0a000001.rbndr.us`), or known
 * bounce-service suffixes. Non-URLs (ytsearch text) are allowed.
 *
 * Also rejects `link:` / `uri:` / `yt:` / `sc:` / `local:` / … wrappers that
 * lavalink-client strips before treating the remainder as a raw HTTP identifier,
 * lavaplayer `icy://` aliases that would otherwise skip the `https?://` gate,
 * hyphen-encoded IPv4 labels (`10-0-0-1` or `make-10-0-0-1-rr`) used by bounce DNS,
 * IPv6 dash-compressed labels (`0--1` → `::1`, `0--ffff-a00-1` → `::ffff:10.0.0.1`),
 * well-known IMDS hostnames (`metadata.goog`),
 * compact IPv4-mapped labels (`ffff-0a000001` → 10.0.0.1) used by sslip-style bounce DNS,
 * and leading-zero IPv4 literals (`010.0.0.1`, `172.017.0.1`) that WHATWG rewrites
 * to a public address while Java `InetAddress` (Lavaplayer) still connects privately.
 */
export function isBlockedUserMediaUrl(query: string): boolean {
    const trimmed = query.trim()
    const candidates = [trimmed]
    const unwrappedPrefix = unwrapLavalinkSourcePrefix(trimmed)
    if (unwrappedPrefix != null) candidates.push(unwrappedPrefix)
    const unwrappedLink = unwrapDirectLinkSourcePrefix(trimmed)
    if (unwrappedLink !== trimmed) candidates.push(unwrappedLink)

    for (const candidate of candidates) {
        if (!isHttpUrlQuery(candidate)) continue
        try {
            const httpUrl = rewriteIcySchemeToHttp(candidate)
            const hostname = new URL(httpUrl).hostname
            if (isBlockedUserMediaHost(hostname)) return true
            // WHATWG canonicalizes IPv4 with octal/dword/short forms. Lavalink search
            // still receives the original identifier; Java parses leading-zero octets
            // as decimal (`010.0.0.1` → 10.0.0.1, not 8.0.0.1).
            const rawHost = rawHttpUrlHostname(httpUrl)
            if (rawHost && rawHost !== hostname && isBlockedUserMediaHost(rawHost)) return true
        } catch {
            return true
        }
    }
    return false
}

/**
 * Authority hostname as written in the URL, before WHATWG IPv4 canonicalization.
 * `new URL(...).hostname` rewrites `010.0.0.1` to `8.0.0.1`; this returns `010.0.0.1`
 * so {@link isBlockedIpv4} can apply Java-style decimal octet parsing.
 */
export function rawHttpUrlHostname(url: string): string | null {
    const rewritten = rewriteIcySchemeToHttp(url.trim())
    const match = /^(?:https?):\/\/([^/?#]+)/i.exec(rewritten)
    if (!match) return null
    let authority = match[1]!
    const at = authority.lastIndexOf("@")
    if (at !== -1) authority = authority.slice(at + 1)
    if (authority.startsWith("[")) {
        const end = authority.indexOf("]")
        if (end === -1) return null
        return authority.slice(0, end + 1)
    }
    const colon = authority.lastIndexOf(":")
    if (colon !== -1 && /^\d*$/.test(authority.slice(colon + 1))) {
        authority = authority.slice(0, colon)
    }
    return authority || null
}

/**
 * Public DNS services that resolve `{ip}.service` (or the bare apex / a wildcard) to
 * that IP / loopback. Hostname-string denylists alone miss these; Lavalink `http:true`
 * would still fetch the private destination. Full resolve-and-pin is out of scope
 * (ADR 0004). `lndo.site` is Lando's public `*.lndo.site` → 127.0.0.1 zone (apex is a
 * public site). `backname.io` IPv4 hyphen/dot forms are also caught by generic IP
 * embed checks; the suffix still covers IPv6 dash labels. `ddev.site` is DDEV's public
 * `*.ddev.site` → 127.0.0.1 zone. `docksal.site` wildcards resolve to 192.168.64.100
 * (apex is a public site). `docker.amazee.io` is Lagoon/Pygmy's loopback zone (do not
 * deny `amazee.io`). `lagoon.cloud` wildcards resolve to 192.168.10.11.
 */
const DNS_BOUNCE_SUFFIXES = [
    "nip.io",
    "sslip.io",
    "xip.io",
    "localtest.me",
    "localtest.org",
    "localtest.dev",
    "lvh.me",
    "vcap.me",
    "traefik.me",
    "localho.st",
    "lacolhost.com",
    "localh.st",
    "1u.ms",
    "local.gd",
    "localhost.direct",
    "lcl.host",
    "plex.direct",
    "yoogle.com",
    "localhost.tv",
    "localhst.dev",
    "qip.sh",
    "localhst.co.uk",
    "local.sisteminha.com",
    "fbi.com",
    "mouse-potato.com",
    "nar0.com",
    "127001.it",
    "domaincontrol.com",
    "anyip.dev",
    "localhost.cloud",
    "localh.net",
    "rbndr.us",
    "lndo.site",
    "backname.io",
    "ddev.site",
    "docksal.site",
    "docker.amazee.io",
    "lagoon.cloud",
    // BrowserStack Local: documented localhost alias (apex → 127.0.0.1 on public DNS).
    "bs-local.com",
    // backloop.dev: public wildcard loopback. Apex is a public website
    // (suffix-deny tradeoff like localhost.tv).
    "backloop.dev",
    // Public wildcard loopback (apex has no A record today; suffix still covers it).
    "devlocal.me",
    "lhst.net",
    // Sibling public wildcard loopback zones, distinct from denied `devlocal.me`.
    // `devlocal.dev` / `devlocal.io` / `devlocal.us` / `devlocal.site`: apex + wildcards
    // → 127.0.0.1. `devlocal.net` wildcards → 127.0.0.1; apex/www are public parking
    // (suffix-deny tradeoff like localhost.tv).
    "devlocal.net",
    "devlocal.dev",
    "devlocal.io",
    "devlocal.us",
    "devlocal.site",
] as const

/** Public hostnames that always resolve to link-local IMDS (169.254.169.254), not IP-in-name. */
const IMDS_HOSTS = ["metadata.goog", "metadata.google.internal"] as const

function isBlockedUserMediaHost(hostname: string): boolean {
    const host = hostname
        .replace(/^\[|\]$/g, "")
        .toLowerCase()
        .replace(/\.+$/, "")
    if (host === "localhost" || host.endsWith(".localhost")) return true
    if (isBlockedIpLiteral(host)) return true
    if (!host.includes(".") && !host.includes(":")) return true
    if (isImdsHost(host)) return true
    if (isDnsBounceHost(host)) return true
    if (hostnameEmbedsBlockedIpv4(host)) return true
    if (hostnameEmbedsBlockedHexIpv4(host)) return true
    if (hostnameEmbedsBlockedDashIpv6(host)) return true
    if (hostnameEmbedsBlockedMappedHexIpv4(host)) return true
    return false
}

function isImdsHost(host: string): boolean {
    for (const name of IMDS_HOSTS) {
        if (host === name || host.endsWith(`.${name}`)) return true
    }
    return false
}

function isDnsBounceHost(host: string): boolean {
    for (const suffix of DNS_BOUNCE_SUFFIXES) {
        if (host === suffix || host.endsWith(`.${suffix}`)) return true
    }
    return false
}

/**
 * Hostnames that encode a blocked IPv4 without using a literal / known bounce suffix:
 * - `10.0.0.1.evil.example` — four consecutive decimal labels
 * - `10-0-0-1.evil.example` — one label of four hyphen-separated octets (sslip/traefik dash form)
 * - `make-10-0-0-1-rr.1u.ms` — four consecutive hyphen octets inside a longer label
 */
function hostnameEmbedsBlockedIpv4(host: string): boolean {
    const labels = host.split(".")
    for (let i = 0; i + 3 < labels.length; i++) {
        const candidate = `${labels[i]}.${labels[i + 1]}.${labels[i + 2]}.${labels[i + 3]}`
        if (isBlockedIpv4(candidate)) return true
    }
    for (const label of labels) {
        const parts = label.split("-")
        for (let i = 0; i + 3 < parts.length; i++) {
            const candidate = `${parts[i]}.${parts[i + 1]}.${parts[i + 2]}.${parts[i + 3]}`
            if (isBlockedIpv4(candidate)) return true
        }
    }
    return false
}

/**
 * sslip/backname IPv6 dash form: `--` is `::` and remaining `-` are `:`.
 * `0--1` → `::1`; `0--ffff-a00-1` → `::ffff:10.0.0.1`. IPv4 hyphen octets
 * (`10-0-0-1`) have no `--` and stay on {@link hostnameEmbedsBlockedIpv4}.
 */
function hostnameEmbedsBlockedDashIpv6(host: string): boolean {
    const labels = host.split(".")
    for (const label of labels) {
        if (!label.includes("--")) continue
        const rebuilt = label.replaceAll("--", "::").replaceAll("-", ":")
        try {
            const canonical = new URL(`http://[${rebuilt}]/`).hostname.replace(/^\[|\]$/g, "")
            if (isBlockedIpLiteral(canonical)) return true
        } catch {
            continue
        }
    }
    return false
}

/**
 * sslip-style compact IPv4-mapped label: `ffff-` plus 8 hex digits
 * (`ffff-0a000001` → 10.0.0.1). Not four decimal hyphen-octets and not a
 * standalone 8-char hex DNS label, so the other embed checks miss it.
 */
function hostnameEmbedsBlockedMappedHexIpv4(host: string): boolean {
    const labels = host.split(".")
    for (const label of labels) {
        const parts = label.split("-")
        for (let i = 0; i + 1 < parts.length; i++) {
            if (parts[i]!.toLowerCase() !== "ffff") continue
            const hex = parts[i + 1]!
            if (!/^[0-9a-f]{8}$/i.test(hex)) continue
            const n = Number.parseInt(hex, 16)
            if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) continue
            const ip = `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
            if (isBlockedIpv4(ip)) return true
        }
    }
    return false
}

/**
 * `0a000001.evil.example` / `7f000001.c0a80001.rbndr.us` style: an 8-char hex label
 * that decodes to a blocked IPv4 (taviso rbndr and similar encoders).
 */
function hostnameEmbedsBlockedHexIpv4(host: string): boolean {
    const labels = host.split(".")
    for (const label of labels) {
        if (!/^[0-9a-f]{8}$/i.test(label)) continue
        const n = Number.parseInt(label, 16)
        if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) continue
        const ip = `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
        if (isBlockedIpv4(ip)) return true
    }
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
