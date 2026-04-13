import { PermissionFlagsBits, type Guild, type GuildMember } from "discord.js"
import { summarizeVoiceForWeb } from "../lib/player-state.js"

/** Dashboard/bot-API capability flags — not Discord permission names; see role mapping in this file. */
export enum WebPermission {
    VIEW_PLAYER = "VIEW_PLAYER",
    /** Pause/skip/stop/seek from the website (voice rules still apply in the player UI). */
    CONTROL_PLAYBACK = "CONTROL_PLAYBACK",
    MANAGE_QUEUE = "MANAGE_QUEUE",
    MANAGE_GUILD_SETTINGS = "MANAGE_GUILD_SETTINGS",
    MANAGE_MESSAGES = "MANAGE_MESSAGES",
    DEVELOPER_ACCESS = "DEVELOPER_ACCESS",
}

/**
 * Minimal Discord client shape for permission resolution in the web stack.
 * Intentionally duck-typed so this module does not depend on the full `discord.js` `Client` type;
 * callers may pass a partial client — only the fields below are read. Do not assume full Guild
 * semantics on cached entries beyond what this file uses.
 */
type PermissionClient = {
    guilds: {
        cache: Map<
            string,
            {
                members: {
                    me?: { voice?: { channelId?: string | null } | null } | null
                    fetch: (userId: string) => Promise<{
                        permissions: { has: (permission: bigint) => boolean }
                    } | null>
                }
                voiceStates: { cache: Map<string, { channelId?: string | null }> }
            }
        >
    }
    lavalink: {
        getPlayer: (guildId: string) => { voiceChannelId?: string | null } | null | undefined
    }
}

/**
 * TTL for cached {@link CachedPermissionResult} entries (5 minutes): reduces repeated permission
 * resolution cost, but Discord role/permission changes can take up to this window to appear.
 */
const cacheTtlMs = 5 * 60 * 1000

interface CachedPermissionResult {
    value: PermissionResolution
    expiresAt: number
}

const permissionCache = new Map<string, Map<string, CachedPermissionResult>>()

function purgeExpiredFromInner(inner: Map<string, CachedPermissionResult>, now: number): void {
    for (const [uid, ent] of inner) {
        if (now > ent.expiresAt) {
            inner.delete(uid)
        }
    }
}

function readCached(guildId: string, userId: string): CachedPermissionResult | undefined {
    const inner = permissionCache.get(guildId)
    if (!inner) return undefined
    const entry = inner.get(userId)
    if (!entry) return undefined
    const now = Date.now()
    if (now > entry.expiresAt) {
        inner.delete(userId)
        if (inner.size === 0) {
            permissionCache.delete(guildId)
        }
        return undefined
    }
    return entry
}

function writeCached(guildId: string, userId: string, entry: CachedPermissionResult): void {
    const now = Date.now()
    let inner = permissionCache.get(guildId)
    if (!inner) {
        inner = new Map()
        permissionCache.set(guildId, inner)
    } else {
        purgeExpiredFromInner(inner, now)
        if (inner.size === 0) {
            permissionCache.delete(guildId)
            inner = new Map()
            permissionCache.set(guildId, inner)
        }
    }
    inner.set(userId, entry)
}

export interface PermissionResolution {
    permissions: WebPermission[]
    inVoiceWithBot: boolean
}

export function hasRequiredPermissions(
    available: WebPermission[],
    required: WebPermission[]
): boolean {
    if (required.length === 0) {
        return true
    }
    const availableSet = new Set(available)
    return required.every((permission) => availableSet.has(permission))
}

function addVoiceGatedPermissions(
    basePermissions: WebPermission[],
    inVoiceWithBot: boolean,
    canQueueTracks: boolean
): WebPermission[] {
    return basePermissions.filter((permission) => {
        if (permission === WebPermission.CONTROL_PLAYBACK) {
            return inVoiceWithBot
        }
        if (permission === WebPermission.MANAGE_QUEUE) {
            return canQueueTracks
        }
        return true
    })
}

function getOwnerPermissions(): WebPermission[] {
    return [
        WebPermission.VIEW_PLAYER,
        WebPermission.CONTROL_PLAYBACK,
        WebPermission.MANAGE_QUEUE,
        WebPermission.MANAGE_GUILD_SETTINGS,
        WebPermission.MANAGE_MESSAGES,
        WebPermission.DEVELOPER_ACCESS,
    ]
}

/**
 * Resolves a guild member for permission checks. Prefer the voice-state cache when the user is in
 * a channel — `members.fetch` alone can fail or lag while `verifyGuildAccess` still passes via OAuth.
 */
export async function resolveGuildMemberForPermissions(
    guild: Guild,
    userId: string
): Promise<GuildMember | null> {
    const voiceState = guild.voiceStates.cache.get(userId)
    let member: GuildMember | null = voiceState?.member ?? null
    if (member?.partial) {
        member = await member.fetch().catch(() => null)
    }
    if (member) {
        return member
    }
    return guild.members.fetch(userId).catch(() => null)
}

export interface ResolveUserPermissionsOptions {
    /**
     * When false, returns role/membership entitlements without stripping voice-gated perms. Use for
     * dashboard UI; the panel still disables controls until `inVoiceWithBot` from live player state.
     * API/WebSocket paths keep the default (true).
     */
    applyVoiceGating?: boolean
}

/**
 * Resolves web permissions from Discord guild membership + permission bits.
 */
const DISCORD_SNOWFLAKE_RE = /^\d{17,19}$/

function parseEnvBotOwnerId(): string | undefined {
    const raw = process.env.OWNER_ID?.trim()
    if (!raw) return undefined
    if (!DISCORD_SNOWFLAKE_RE.test(raw)) {
        console.warn(
            "[permissions] OWNER_ID is set but is not a valid Discord snowflake; bot-owner privileges from env are disabled."
        )
        return undefined
    }
    return raw
}

const CACHED_OWNER_ID = parseEnvBotOwnerId()

export async function resolveUserPermissions(
    client: PermissionClient,
    guildId: string,
    userId: string,
    options?: ResolveUserPermissionsOptions
): Promise<PermissionResolution> {
    const envBotOwnerId = CACHED_OWNER_ID
    const applyVoiceGating = options?.applyVoiceGating !== false
    const now = Date.now()
    if (applyVoiceGating) {
        const cached = readCached(guildId, userId)
        if (cached) {
            return cached.value
        }
    }

    // Cast: `PermissionClient` only types the cache shape we read; entries are treated as `Guild` for member/voice APIs.
    const guild = client.guilds.cache.get(guildId) as Guild | undefined
    if (!guild) {
        return { permissions: [], inVoiceWithBot: false }
    }

    const player = client.lavalink.getPlayer(guildId)
    const { inVoiceWithBot, canQueueTracks } = summarizeVoiceForWeb(guildId, userId, player, client)

    const applyGate = (permissions: WebPermission[]) =>
        applyVoiceGating
            ? addVoiceGatedPermissions(permissions, inVoiceWithBot, canQueueTracks)
            : permissions

    /** Discord server owner — same effective rights as admin; does not depend on member fetch. */
    if (guild.ownerId === userId) {
        const permissions: WebPermission[] =
            envBotOwnerId === userId
                ? getOwnerPermissions()
                : [
                      WebPermission.VIEW_PLAYER,
                      WebPermission.CONTROL_PLAYBACK,
                      WebPermission.MANAGE_QUEUE,
                      WebPermission.MANAGE_GUILD_SETTINGS,
                      WebPermission.MANAGE_MESSAGES,
                  ]
        const result: PermissionResolution = {
            permissions: applyGate(permissions),
            inVoiceWithBot,
        }
        if (applyVoiceGating) {
            writeCached(guildId, userId, { value: result, expiresAt: now + cacheTtlMs })
        }
        return result
    }

    const member = await resolveGuildMemberForPermissions(guild, userId)
    if (!member) {
        return { permissions: [], inVoiceWithBot: false }
    }

    // Separate from guild owner handling above: grants bot-owner rights to configured OWNER_ID
    // when they are a guild member but not the current guild owner.
    if (envBotOwnerId && envBotOwnerId === userId) {
        const result: PermissionResolution = {
            permissions: applyGate(getOwnerPermissions()),
            inVoiceWithBot,
        }
        if (applyVoiceGating) {
            writeCached(guildId, userId, { value: result, expiresAt: now + cacheTtlMs })
        }
        return result
    }

    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator)
    const canManageGuild = member.permissions.has(PermissionFlagsBits.ManageGuild)
    const canManageMessages = member.permissions.has(PermissionFlagsBits.ManageMessages)

    let permissions: WebPermission[]
    if (isAdmin || canManageGuild) {
        permissions = [
            WebPermission.VIEW_PLAYER,
            WebPermission.CONTROL_PLAYBACK,
            WebPermission.MANAGE_QUEUE,
            WebPermission.MANAGE_GUILD_SETTINGS,
            WebPermission.MANAGE_MESSAGES,
        ]
    } else if (canManageMessages) {
        permissions = [
            WebPermission.VIEW_PLAYER,
            WebPermission.CONTROL_PLAYBACK,
            WebPermission.MANAGE_QUEUE,
            WebPermission.MANAGE_MESSAGES,
        ]
    } else {
        permissions = [
            WebPermission.VIEW_PLAYER,
            WebPermission.CONTROL_PLAYBACK,
            WebPermission.MANAGE_QUEUE,
        ]
    }

    const result: PermissionResolution = {
        permissions: applyGate(permissions),
        inVoiceWithBot,
    }
    if (applyVoiceGating) {
        writeCached(guildId, userId, { value: result, expiresAt: now + cacheTtlMs })
    }
    return result
}

/**
 * When Discord OAuth proves guild membership but we never obtain a {@link GuildMember} (cache/API),
 * still allow the dashboard using voice-state + player data only. Does not grant mod permissions.
 */
export function resolveOauthGuildPermissionFallback(
    client: PermissionClient | null,
    guildId: string,
    userId: string
): PermissionResolution {
    if (!client) {
        return {
            permissions: [WebPermission.VIEW_PLAYER],
            inVoiceWithBot: false,
        }
    }

    // Cast: same duck-typed client/cache as {@link resolveUserPermissions}; not a full Client at runtime.
    const guild = client.guilds.cache.get(guildId) as Guild | undefined
    if (!guild) {
        return { permissions: [WebPermission.VIEW_PLAYER], inVoiceWithBot: false }
    }

    const player = client.lavalink.getPlayer(guildId)
    const { inVoiceWithBot, canQueueTracks } = summarizeVoiceForWeb(guildId, userId, player, client)

    const base: WebPermission[] = [
        WebPermission.VIEW_PLAYER,
        WebPermission.CONTROL_PLAYBACK,
        WebPermission.MANAGE_QUEUE,
    ]
    const permissions = addVoiceGatedPermissions(base, inVoiceWithBot, canQueueTracks)

    return { permissions, inVoiceWithBot }
}

export function invalidatePermissionCache(guildId?: string, userId?: string): void {
    if (!guildId && !userId) {
        permissionCache.clear()
        return
    }

    if (guildId && userId) {
        const inner = permissionCache.get(guildId)
        inner?.delete(userId)
        if (inner && inner.size === 0) {
            permissionCache.delete(guildId)
        }
        return
    }

    if (guildId) {
        permissionCache.delete(guildId)
        return
    }

    if (!userId) {
        return
    }

    for (const [gid, inner] of [...permissionCache.entries()]) {
        inner.delete(userId)
        if (inner.size === 0) {
            permissionCache.delete(gid)
        }
    }
}
