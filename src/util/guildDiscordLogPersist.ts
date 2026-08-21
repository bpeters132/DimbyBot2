import { Prisma } from "@prisma/client"
import type { DiscordLogLevelName, GuildDiscordLogSettings } from "../types/index.js"

const LOG_LEVELS: ReadonlySet<DiscordLogLevelName> = new Set(["debug", "info", "warn", "error"])

/** Verifies a value roundtrips through JSON and is a plain object. */
export function toSafeJsonObject(candidate: unknown): Prisma.InputJsonValue | null {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null
    try {
        const serialized = JSON.stringify(candidate)
        const parsed: unknown = JSON.parse(serialized)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Prisma.InputJsonValue
        }
    } catch {
        /* non-serializable (circular refs, functions, etc.) */
    }
    return null
}

/**
 * Normalizes legacy `discordLog` for Prisma JSON writes
 * (object or JSON string → object; else DbNull).
 */
export function normalizeDiscordLogForDatabase(
    value: unknown
): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (value === null || value === undefined) return Prisma.DbNull
    if (typeof value === "string") {
        try {
            return toSafeJsonObject(JSON.parse(value)) ?? Prisma.DbNull
        } catch {
            return Prisma.DbNull
        }
    }
    if (typeof value === "object" && !Array.isArray(value)) {
        return toSafeJsonObject(value) ?? Prisma.DbNull
    }
    return Prisma.DbNull
}

export function isDiscordLogLevelName(v: unknown): v is DiscordLogLevelName {
    return typeof v === "string" && LOG_LEVELS.has(v as DiscordLogLevelName)
}

/**
 * Parses a Prisma JSON `discordLog` column into the in-memory guild settings shape.
 * Drops invalid levels / empty channel ids; returns undefined when nothing usable remains.
 */
export function parseGuildDiscordLog(
    value: Prisma.JsonValue | null
): GuildDiscordLogSettings | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined
    }
    const raw = value as Record<string, unknown>
    const out: GuildDiscordLogSettings = {}
    if (typeof raw.allChannelId === "string" && raw.allChannelId.trim()) {
        out.allChannelId = raw.allChannelId.trim()
    }
    if (raw.minLevel !== undefined && raw.minLevel !== null) {
        if (isDiscordLogLevelName(raw.minLevel)) {
            out.minLevel = raw.minLevel
        }
    }
    if (raw.byLevel !== undefined && raw.byLevel !== null) {
        if (typeof raw.byLevel === "object" && !Array.isArray(raw.byLevel)) {
            const by: Partial<Record<DiscordLogLevelName, string>> = {}
            for (const [k, v] of Object.entries(raw.byLevel as Record<string, unknown>)) {
                if (!isDiscordLogLevelName(k)) continue
                if (typeof v !== "string" || !v.trim()) continue
                by[k] = v.trim()
            }
            if (Object.keys(by).length > 0) out.byLevel = by
        }
    }
    if (!out.allChannelId && !out.byLevel && !out.minLevel) {
        return undefined
    }
    return out
}
