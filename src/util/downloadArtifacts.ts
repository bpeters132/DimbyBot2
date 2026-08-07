import fs from "fs"
import path from "path"

/** Wall-clock limit for a single yt-dlp run (live / very long media). */
export const DOWNLOAD_PROCESS_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Untracked guild-prefixed files older than this are treated as failed-run orphans.
 * Must exceed {@link DOWNLOAD_PROCESS_TIMEOUT_MS} so in-flight downloads are not deleted.
 */
export const UNTRACKED_DOWNLOAD_ORPHAN_AGE_MS = DOWNLOAD_PROCESS_TIMEOUT_MS + 5 * 60 * 1000

/** Filename prefix for guild-scoped downloads in the flat `downloads/` directory. */
export function guildDownloadFilePrefix(guildId: string): string {
    return `${guildId}_`
}

/**
 * True when `filePath` resolves strictly inside `dir` (blocks `../` traversal via metadata names).
 */
export function isResolvedPathInsideDir(dir: string, filePath: string): boolean {
    const resolvedDir = path.resolve(dir)
    const resolvedFile = path.resolve(filePath)
    const relative = path.relative(resolvedDir, resolvedFile)
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

export type DownloadDirFile = {
    name: string
    path: string
    mtimeMs: number
    size: number
}

/**
 * Lists files in `downloadsDir` whose names start with `fileNamePrefix`.
 * Skips directories and paths that escape the downloads directory.
 */
export function listDownloadFilesWithPrefix(
    downloadsDir: string,
    fileNamePrefix: string
): DownloadDirFile[] {
    let names: string[]
    try {
        names = fs.readdirSync(downloadsDir)
    } catch {
        return []
    }
    const out: DownloadDirFile[] = []
    for (const name of names) {
        if (!name.startsWith(fileNamePrefix)) continue
        const filePath = path.join(downloadsDir, name)
        if (!isResolvedPathInsideDir(downloadsDir, filePath)) continue
        let stats: fs.Stats
        try {
            stats = fs.statSync(filePath)
        } catch {
            continue
        }
        if (!stats.isFile()) continue
        out.push({ name, path: filePath, mtimeMs: stats.mtimeMs, size: stats.size })
    }
    return out
}

/**
 * Unlinks every file whose name starts with `fileNamePrefix` under `downloadsDir`.
 * Used to reclaim yt-dlp artifacts after timeout/failure for a single download run.
 */
export function removeDownloadFilesWithPrefix(
    downloadsDir: string,
    fileNamePrefix: string
): { deletedCount: number; deletedSize: number } {
    let deletedCount = 0
    let deletedSize = 0
    for (const file of listDownloadFilesWithPrefix(downloadsDir, fileNamePrefix)) {
        try {
            fs.unlinkSync(file.path)
            deletedCount++
            deletedSize += file.size
        } catch {
            // Best-effort cleanup; caller may log aggregate results.
        }
    }
    return { deletedCount, deletedSize }
}

/**
 * Guild-prefixed files on disk that are not tracked in metadata (failed/timed-out downloads).
 * Only returns files whose mtime is older than `minAgeMs` so in-flight concurrent downloads
 * are not deleted mid-write.
 */
export function listAgedUntrackedGuildDownloadFiles(
    downloadsDir: string,
    guildId: string,
    trackedFileNames: ReadonlySet<string>,
    minAgeMs: number,
    nowMs: number = Date.now()
): DownloadDirFile[] {
    const prefix = guildDownloadFilePrefix(guildId)
    return listDownloadFilesWithPrefix(downloadsDir, prefix).filter((file) => {
        if (trackedFileNames.has(file.name)) return false
        return nowMs - file.mtimeMs >= minAgeMs
    })
}
