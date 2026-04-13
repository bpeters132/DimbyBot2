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

type SharedWebPermissionKey = keyof typeof import("../shared/permissions.js").WebPermission
type SharedWebPermissionValue = `${import("../shared/permissions.js").WebPermission}`
type LocalWebPermissionName = keyof typeof WEB_PERMISSION

type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time key parity assertion
type _WebPermissionNameParity = Assert<IsExact<LocalWebPermissionName, SharedWebPermissionKey>>
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time value parity assertion
type _WebPermissionValueParity = Assert<IsExact<WebPermissionKey, SharedWebPermissionValue>>
