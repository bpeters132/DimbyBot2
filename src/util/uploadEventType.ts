import type { UploadEventType } from "../types/index.js"

export const ALL_UPLOAD_EVENT_TYPES: readonly UploadEventType[] = [
    "video",
    "short",
    "premiere",
    "live",
    "community",
]

const UPLOAD_EVENT_TYPE_SET = new Set<string>(ALL_UPLOAD_EVENT_TYPES)

/** True when `value` is a known {@link UploadEventType}. */
export function isUploadEventType(value: string): value is UploadEventType {
    return UPLOAD_EVENT_TYPE_SET.has(value)
}

/** Filters unknown strings so persisted Alert rows stay typed. */
export function parseUploadEventTypes(values: string[]): UploadEventType[] {
    return values.filter(isUploadEventType)
}
