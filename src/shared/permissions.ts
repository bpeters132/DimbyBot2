import { PermissionFlagsBits } from "discord.js"
import type BotClient from "../lib/BotClient.js"

export enum WebPermission {
    VIEW_PLAYER = "VIEW_PLAYER",
    CONTROL_PLAYBACK = "CONTROL_PLAYBACK",
    MANAGE_QUEUE = "MANAGE_QUEUE",
    MANAGE_GUILD_SETTINGS = "MANAGE_GUILD_SETTINGS",
    MANAGE_MESSAGES = "MANAGE_MESSAGES",
    DEVELOPER_ACCESS = "DEVELOPER_ACCESS",
}

const cacheTtlMs = 5 * 60 * 1000

interface CachedPermissionResult {
    value: PermissionResolution
    expiresAt: number
}

const permissionCache = new Map<string, CachedPermissionResult>()

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
    inVoiceWithBot: boolean
): WebPermission[] {
    if (inVoiceWithBot) {
        return basePermissions
    }

    return basePermissions.filter(
        (permission) =>
            permission !== WebPermission.CONTROL_PLAYBACK &&
            permission !== WebPermission.MANAGE_QUEUE
    )
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
 * Resolves web permissions from Discord guild membership + permission bits.
 */
export async function resolveUserPermissions(
    client: BotClient,
    guildId: string,
    userId: string
): Promise<PermissionResolution> {
    const cacheKey = `${guildId}:${userId}`
    const cached = permissionCache.get(cacheKey)
    const now = Date.now()
    if (cached && cached.expiresAt > now) {
        return cached.value
    }

    const guild = client.guilds.cache.get(guildId)
    if (!guild) {
        const result: PermissionResolution = { permissions: [], inVoiceWithBot: false }
        permissionCache.set(cacheKey, { value: result, expiresAt: now + cacheTtlMs })
        return result
    }

    const member = await guild.members.fetch(userId).catch(() => null)
    if (!member) {
        const result: PermissionResolution = { permissions: [], inVoiceWithBot: false }
        permissionCache.set(cacheKey, { value: result, expiresAt: now + cacheTtlMs })
        return result
    }

    const ownerId = process.env.OWNER_ID?.trim()
    const player = client.lavalink.getPlayer(guildId)
    const userVoiceChannelId = guild.voiceStates.cache.get(userId)?.channelId ?? null
    const botVoiceChannelId = player?.voiceChannelId ?? null
    const inVoiceWithBot =
        userVoiceChannelId !== null &&
        botVoiceChannelId !== null &&
        userVoiceChannelId === botVoiceChannelId

    if (ownerId && ownerId === userId) {
        const result: PermissionResolution = {
            permissions: addVoiceGatedPermissions(getOwnerPermissions(), inVoiceWithBot),
            inVoiceWithBot,
        }
        permissionCache.set(cacheKey, { value: result, expiresAt: now + cacheTtlMs })
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
        permissions: addVoiceGatedPermissions(permissions, inVoiceWithBot),
        inVoiceWithBot,
    }
    permissionCache.set(cacheKey, { value: result, expiresAt: now + cacheTtlMs })
    return result
}

export function invalidatePermissionCache(guildId?: string, userId?: string): void {
    if (!guildId && !userId) {
        permissionCache.clear()
        return
    }

    for (const key of permissionCache.keys()) {
        const [cacheGuildId, cacheUserId] = key.split(":")
        const guildMatches = guildId ? guildId === cacheGuildId : true
        const userMatches = userId ? userId === cacheUserId : true
        if (guildMatches && userMatches) {
            permissionCache.delete(key)
        }
    }
}
