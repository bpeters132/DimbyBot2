import type { UploadEventType } from "../types/index.js"
import { ALL_UPLOAD_EVENT_TYPES } from "./uploadEventType.js"

/** Slash boolean option names for `/yt-alerts` event-type filters. */
export const YT_ALERT_TYPE_OPTION_NAMES = [
    "video",
    "short",
    "premiere",
    "live",
    "community",
] as const

/** Slash role option names for `/yt-alerts` mention roles. */
export const YT_ALERT_ROLE_OPTION_NAMES = ["role", "role2", "role3", "role4", "role5"] as const

export type YtAlertTypeOptionName = (typeof YT_ALERT_TYPE_OPTION_NAMES)[number]

/**
 * Resolves Discord slash boolean type flags into Alert `eventTypes`.
 *
 * - No type options set → all known types (add default / “match everything”).
 * - At least one option set true → only those types.
 * - Options set but all false → `null` (caller must reject; empty match set is invalid).
 */
export function resolveYtAlertEventTypes(
    flags: Readonly<Partial<Record<YtAlertTypeOptionName, boolean | null | undefined>>>
): UploadEventType[] | null {
    const provided: { type: UploadEventType; value: boolean }[] = []
    for (const name of YT_ALERT_TYPE_OPTION_NAMES) {
        const value = flags[name]
        if (value !== null && value !== undefined) {
            provided.push({ type: name, value })
        }
    }
    if (provided.length === 0) return [...ALL_UPLOAD_EVENT_TYPES]
    const selected = provided.filter((row) => row.value).map((row) => row.type)
    return selected.length > 0 ? selected : null
}

/** True when any type boolean option was explicitly set (edit: leave types unchanged when false). */
export function ytAlertTypeFlagsPresent(
    flags: Readonly<Partial<Record<YtAlertTypeOptionName, boolean | null | undefined>>>
): boolean {
    return YT_ALERT_TYPE_OPTION_NAMES.some((name) => {
        const value = flags[name]
        return value !== null && value !== undefined
    })
}

/**
 * Dedupe mention role ids while preserving first-seen order.
 * Nullish entries are skipped (matches `getRole` miss / empty option slots).
 */
export function dedupeYtAlertRoleIds(roleIds: ReadonlyArray<string | null | undefined>): string[] {
    const ids: string[] = []
    for (const id of roleIds) {
        if (id && !ids.includes(id)) ids.push(id)
    }
    return ids
}

/**
 * Edit-path mention role update: `clear_roles` wins; else replace when any role option was
 * provided; else leave unchanged (`undefined`).
 */
export function resolveYtAlertMentionRoleIdsUpdate(opts: {
    clearRoles: boolean
    rolesProvided: boolean
    collectedRoleIds: readonly string[]
}): string[] | undefined {
    if (opts.clearRoles) return []
    if (opts.rolesProvided) return [...opts.collectedRoleIds]
    return undefined
}
