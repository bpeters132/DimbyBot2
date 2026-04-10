/**
 * String keys aligned with {@link WebPermission} in `shared/permissions.ts` for client-safe checks
 * (no Discord.js imports).
 */
export const WEB_PERMISSION = {
    VIEW_PLAYER: "VIEW_PLAYER",
    CONTROL_PLAYBACK: "CONTROL_PLAYBACK",
    MANAGE_QUEUE: "MANAGE_QUEUE",
    MANAGE_GUILD_SETTINGS: "MANAGE_GUILD_SETTINGS",
    MANAGE_MESSAGES: "MANAGE_MESSAGES",
    DEVELOPER_ACCESS: "DEVELOPER_ACCESS",
} as const

export type WebPermissionKey = (typeof WEB_PERMISSION)[keyof typeof WEB_PERMISSION]
