/** Default guild download directory cap when no valid custom limit is configured. */
export const DEFAULT_DOWNLOADS_MAX_MB = 1000

/**
 * Rough upper bound on WAV output (~10 MiB/min for 16-bit 44.1kHz stereo).
 * Used only for yt-dlp duration filtering before download starts.
 */
export const APPROX_WAV_MIB_PER_MINUTE = 10

/**
 * Resolves a guild downloads size limit in MB.
 * Invalid, non-finite, or sub-1 values fall back to {@link DEFAULT_DOWNLOADS_MAX_MB}
 * (or `defaultMb`) so a corrupt settings row cannot enforce a zero/negative quota.
 */
export function resolveDownloadsMaxMb(
    configured: unknown,
    defaultMb: number = DEFAULT_DOWNLOADS_MAX_MB
): number {
    const parsed = Number.parseFloat(String(configured ?? ""))
    if (!Number.isFinite(parsed) || parsed < 1) {
        return defaultMb
    }
    return parsed
}

/** True when `configured` is a usable custom downloads limit (≥ 1 MB). */
export function isCustomDownloadsMaxMb(configured: unknown): boolean {
    const parsed = Number.parseFloat(String(configured ?? ""))
    return Number.isFinite(parsed) && parsed >= 1
}

/**
 * yt-dlp match-filter: reject live streams and media whose estimated WAV size
 * would exceed the guild downloads quota. Duration floor is 60s so short clips
 * are never rejected by a tiny quota alone.
 */
export function buildYtDlpMatchFilter(maxDirSizeMb: number): string {
    const maxDurationSec = Math.max(
        60,
        Math.floor((maxDirSizeMb / APPROX_WAV_MIB_PER_MINUTE) * 60)
    )
    return `!is_live & duration <= ${maxDurationSec}`
}
