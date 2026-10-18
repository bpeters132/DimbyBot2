import path from "node:path"
import { guildDownloadFilePrefix, isResolvedPathInsideDir } from "./downloadArtifacts.js"
import { unwrapLavalinkSourcePrefix } from "./userMediaUrl.js"

/** User-facing copy when a query would open a host path via Lavalink `local`. */
export const USER_LOCAL_FILE_QUERY_BLOCKED = "That local file path isn't allowed."

/**
 * Candidates to inspect: the raw query plus one peeled `local:` / search-source prefix
 * (lavalink-client strips those before LocalAudioSourceManager sees the identifier).
 */
function filesystemQueryCandidates(query: string): string[] {
    const trimmed = query.trim()
    if (!trimmed) return []
    const out = [trimmed]
    const unwrapped = unwrapLavalinkSourcePrefix(trimmed)
    if (unwrapped != null) {
        const rest = unwrapped.trim()
        if (rest && rest !== trimmed) out.push(rest)
    }
    return out
}

/**
 * True when `query` looks like a host filesystem path that Lavalink's local source would
 * open. With `defaultSearchPlatform: "local"`, bare absolute paths and `local:/…` are sent
 * as `/loadtracks` identifiers — including other guilds' files on the shared downloads volume.
 *
 * Song titles (including those with `/`, e.g. "AC/DC") are not matches.
 */
export function looksLikeLocalFilesystemMediaQuery(query: string): boolean {
    for (const candidate of filesystemQueryCandidates(query)) {
        if (/^file:/i.test(candidate)) return true
        if (candidate.startsWith("/")) return true
        if (/^[A-Za-z]:[\\/]/.test(candidate)) return true
        if (
            candidate.startsWith("./") ||
            candidate.startsWith("../") ||
            candidate.startsWith(".\\") ||
            candidate.startsWith("..\\")
        ) {
            return true
        }
        if (candidate.startsWith("~/")) return true
        // Compose mounts the shared volume at `/app/downloads`; relative to Lavalink cwd.
        if (/^downloads[/\\]/i.test(candidate)) return true
    }
    return false
}

/**
 * Resolves the path portion of a filesystem-looking query (strips `local:` / `file://`).
 * Returns null when the query is not path-shaped.
 */
export function localFilesystemPathFromQuery(query: string): string | null {
    if (!looksLikeLocalFilesystemMediaQuery(query)) return null
    for (const candidate of filesystemQueryCandidates(query)) {
        if (/^file:/i.test(candidate)) {
            try {
                const u = new URL(candidate)
                if (u.protocol.toLowerCase() === "file:") {
                    // URL pathname is percent-decoded; Windows file URLs keep a leading `/`.
                    return decodeURIComponent(u.pathname)
                }
            } catch {
                return null
            }
        }
        if (
            candidate.startsWith("/") ||
            /^[A-Za-z]:[\\/]/.test(candidate) ||
            candidate.startsWith("./") ||
            candidate.startsWith("../") ||
            candidate.startsWith(".\\") ||
            candidate.startsWith("..\\") ||
            candidate.startsWith("~/") ||
            /^downloads[/\\]/i.test(candidate)
        ) {
            return candidate
        }
    }
    return null
}

export type PermittedGuildDownloadPathOptions = {
    /** Override downloads directory (tests). Defaults to `{cwd}/downloads`. */
    downloadsDir?: string
}

/**
 * True when `query` is an absolute path to this guild's download WAV under the shared
 * downloads directory (bot cwd `downloads/` ≡ Lavalink `/app/downloads` in Compose).
 * Used so `/download` autoplay can still `player.search` its own verified output path.
 */
export function isPermittedGuildDownloadPlaybackPath(
    guildId: string,
    query: string,
    options?: PermittedGuildDownloadPathOptions
): boolean {
    const filePath = localFilesystemPathFromQuery(query)
    if (!filePath) return false
    // Relative / home / file: forms are never trusted for autoplay allowlisting.
    if (!filePath.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(filePath)) return false

    const downloadsDir = options?.downloadsDir ?? path.join(process.cwd(), "downloads")
    if (!isResolvedPathInsideDir(downloadsDir, filePath)) return false

    const base = path.basename(filePath)
    if (!base.startsWith(guildDownloadFilePrefix(guildId))) return false
    if (!/\.wav$/i.test(base)) return false
    return true
}

/**
 * Block path-like play/search queries unless they are this guild's verified download WAV.
 * When `guildId` is omitted (playlist save / URI metadata), every filesystem-looking query
 * is blocked — playlists must not store host paths.
 */
export function isBlockedLocalFilesystemMediaQuery(
    query: string,
    options?: { guildId?: string; downloadsDir?: string }
): boolean {
    if (!looksLikeLocalFilesystemMediaQuery(query)) return false
    if (
        options?.guildId &&
        isPermittedGuildDownloadPlaybackPath(options.guildId, query, {
            downloadsDir: options.downloadsDir,
        })
    ) {
        return false
    }
    return true
}
