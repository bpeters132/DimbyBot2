import {
    WebPermission,
    type PermissionResolution,
    hasRequiredPermissions,
    resolveGuildMemberForPermissions,
    resolveOauthGuildPermissionFallback,
    resolveUserPermissions,
} from "../shared/permissions.js"
import type { GuildDashboardSnapshotResult } from "../types/web.js"
import { fetchDiscordUserGuilds } from "./discord-rest.js"
import { resolveDiscordUserSnowflake } from "./discord-user-id.js"
import { auth } from "../auth-node.js"
import { tryGetBotClient } from "./botClient.js"
import { webPlayerDebug, webPlayerWarn } from "./web-player-debug-log.js"

export interface AuthenticatedSession {
    user: {
        id: string
        name?: string | null
        email?: string | null
        image?: string | null
    }
    session: {
        id: string
        expiresAt: string | Date
    }
}

interface GuardFailure {
    ok: false
    status: number
    error: string
    details?: string
}

interface SessionGuardSuccess {
    ok: true
    session: AuthenticatedSession
}

export type SessionGuardResult = GuardFailure | SessionGuardSuccess

interface PermissionGuardSuccess {
    ok: true
    session: AuthenticatedSession
    /** Discord snowflake for voice/member/owner checks (Better Auth `user.id` may differ). */
    discordUserId: string
    permissionResolution: PermissionResolution
}

export type PermissionGuardResult = GuardFailure | PermissionGuardSuccess

export type GuildAccessResult = { ok: true; memberResolved: boolean } | { ok: false }

export type AuthenticatedGuildAccessResult =
    | Extract<SessionGuardResult, { ok: false }>
    | AuthGuildForbidden
    | AuthGuildOk

interface AuthGuildForbidden {
    ok: false
    status: 403
    error: string
    details?: string
}

interface AuthGuildOk {
    ok: true
    session: AuthenticatedSession
    discordUserId: string
    memberResolved: boolean
}

function asHeaders(headers: Headers | Record<string, string>): Headers {
    if (headers instanceof Headers) {
        return headers
    }
    return new Headers(headers)
}

/**
 * Resolves the authenticated Better Auth session from request headers.
 */
export async function getAuthenticatedSession(
    headers: Headers | Record<string, string>
): Promise<SessionGuardResult> {
    const resolvedHeaders = asHeaders(headers)
    try {
        const session = (await auth.api.getSession({
            headers: resolvedHeaders,
        })) as AuthenticatedSession | null

        if (!session?.user?.id) {
            return {
                ok: false,
                status: 401,
                error: "Unauthorized",
            }
        }

        return {
            ok: true,
            session,
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error("[api-auth] getSession failed:", msg)
        return {
            ok: false,
            status: 401,
            error: "Unauthorized",
        }
    }
}

/**
 * Confirms that a user has access to the requested guild.
 * `memberResolved` is true only when the bot returned a {@link GuildMember}. It is **false** for
 * server owners (owner id check) and for OAuth guild-list verification — not a permission level.
 */
export async function verifyGuildAccess(
    session: AuthenticatedSession,
    guildId: string,
    headers: Headers | Record<string, string>,
    discordUserId: string
): Promise<GuildAccessResult> {
    try {
        async function verifyMembershipViaOAuth(): Promise<GuildAccessResult> {
            try {
                const accessTokenResult = (await auth.api.getAccessToken({
                    body: { providerId: "discord" },
                    headers: asHeaders(headers),
                })) as { accessToken?: string } | null

                const accessToken = accessTokenResult?.accessToken
                if (!accessToken) {
                    return { ok: false }
                }

                const discordGuilds = await fetchDiscordUserGuilds(accessToken)
                if (!discordGuilds.ok) {
                    return { ok: false }
                }

                if (discordGuilds.guilds.some((guildEntry) => guildEntry.id === guildId)) {
                    return { ok: true, memberResolved: false }
                }

                return { ok: false }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e)
                console.error("[api-auth] verifyMembershipViaOAuth failed:", msg)
                return { ok: false }
            }
        }

        const client = tryGetBotClient()
        if (!client) {
            return verifyMembershipViaOAuth()
        }

        const guild = client.guilds.cache.get(guildId) as import("discord.js").Guild | undefined
        if (!guild) {
            return verifyMembershipViaOAuth()
        }

        if (guild.ownerId === discordUserId) {
            return { ok: true, memberResolved: false }
        }

        const member = await resolveGuildMemberForPermissions(guild, discordUserId)
        if (member) {
            return { ok: true, memberResolved: true }
        }

        return verifyMembershipViaOAuth()
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error("[api-auth] verifyGuildAccess failed:", msg)
        return { ok: false }
    }
}

/**
 * Authenticates the session and verifies the user can access the guild (Discord member or OAuth
 * guild list). Does not evaluate role-based web permissions.
 */
export async function resolveAuthenticatedGuildAccess(
    headers: Headers | Record<string, string>,
    guildId: string
): Promise<AuthenticatedGuildAccessResult> {
    const sessionResult = await getAuthenticatedSession(headers)
    if (!sessionResult.ok) {
        const failure = sessionResult as Extract<SessionGuardResult, { ok: false }>
        return {
            ok: false,
            status: failure.status,
            error: failure.error,
        }
    }

    const resolvedHeaders = asHeaders(headers)
    let discordUserId: string | null
    try {
        discordUserId = await resolveDiscordUserSnowflake(
            sessionResult.session.user.id,
            resolvedHeaders
        )
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error("[api-auth] resolveDiscordUserSnowflake failed:", msg)
        return {
            ok: false,
            status: 403,
            error: "Discord account required",
        }
    }
    if (!discordUserId) {
        return {
            ok: false,
            status: 403,
            error: "Discord account required",
            details:
                "We could not resolve your Discord user id (needed for roles and voice state). Sign in with Discord, or sign out and sign in again.",
        }
    }

    const guildAccess = await verifyGuildAccess(
        sessionResult.session,
        guildId,
        headers,
        discordUserId
    )
    if (!guildAccess.ok) {
        return {
            ok: false,
            status: 403,
            error: "Forbidden",
            details:
                "Could not verify access to this server. The bot may not be in this guild, or your membership could not be confirmed (try re-logging in with Discord).",
        }
    }

    return {
        ok: true,
        session: sessionResult.session,
        discordUserId,
        memberResolved: guildAccess.memberResolved,
    }
}

/**
 * Primary + OAuth-fallback permission lists for dashboard UI gating (matches {@link requirePermissions}
 * merge rules per action).
 */
export async function getGuildDashboardPermissionSnapshot(
    headers: Headers | Record<string, string>,
    guildId: string
): Promise<GuildDashboardSnapshotResult> {
    const ctx = await resolveAuthenticatedGuildAccess(headers, guildId)
    if (ctx.ok === false) {
        return { ok: false, status: ctx.status, error: ctx.error, details: ctx.details }
    }

    const botClient = tryGetBotClient()
    if (!botClient) {
        /**
         * Next runs without `setBotClient` when using `yarn dev:web` only. Role-based resolution is
         * impossible here, but the **bot HTTP API** still enforces permissions for playback/queue.
         * Grant dashboard UI entitlements so controls/queue forms render; voice gating remains on
         * live `playerState` from the bot.
         */
        const noClientMsg =
            "getGuildDashboardPermissionSnapshot: no BotClient in this process — using optimistic dashboard web perms (run bot+web together or set API_PROXY_TARGET to a running bot)."
        const noClientCtx = { guildId, discordUserIdPrefix: ctx.discordUserId.slice(0, 8) }
        if (process.env.NODE_ENV === "development") {
            webPlayerDebug(noClientMsg, noClientCtx)
        } else {
            webPlayerWarn(noClientMsg, noClientCtx)
        }
        const defaultMemberWebPerms: WebPermission[] = [
            WebPermission.VIEW_PLAYER,
            WebPermission.CONTROL_PLAYBACK,
            WebPermission.MANAGE_QUEUE,
        ]
        return {
            ok: true,
            snapshot: {
                memberResolved: ctx.memberResolved,
                primaryPermissions: defaultMemberWebPerms,
                oauthPermissions: [],
            },
            discordUserId: ctx.discordUserId,
        }
    }

    try {
        const primary = await resolveUserPermissions(botClient, guildId, ctx.discordUserId, {
            applyVoiceGating: false,
        })
        /** Same voice-aware fallback as API; only primary snapshot skips voice stripping (role entitlements). */
        const oauth = resolveOauthGuildPermissionFallback(botClient, guildId, ctx.discordUserId)

        webPlayerDebug("getGuildDashboardPermissionSnapshot", {
            guildId,
            discordUserIdPrefix: ctx.discordUserId.slice(0, 8),
            memberResolved: ctx.memberResolved,
            primary: primary.permissions,
            oauth: oauth.permissions,
        })

        return {
            ok: true,
            snapshot: {
                memberResolved: ctx.memberResolved,
                primaryPermissions: primary.permissions,
                oauthPermissions: oauth.permissions,
            },
            discordUserId: ctx.discordUserId,
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(
            "[api-auth] getGuildDashboardPermissionSnapshot permission resolution failed:",
            msg
        )
        return {
            ok: false,
            status: 503,
            error: "Permission check unavailable",
            details:
                "Could not load dashboard permissions for this server. Try again shortly or refresh the page.",
        }
    }
}

/**
 * Authenticates and verifies permissions for a guild-scoped route.
 */
export async function requirePermissions(
    headers: Headers | Record<string, string>,
    guildId: string,
    requiredPerms: WebPermission[]
): Promise<PermissionGuardResult> {
    const ctx = await resolveAuthenticatedGuildAccess(headers, guildId)
    if (ctx.ok === false) {
        return ctx
    }

    const botClient = tryGetBotClient()
    let permissionResolution: PermissionResolution
    try {
        permissionResolution = botClient
            ? await resolveUserPermissions(botClient, guildId, ctx.discordUserId)
            : resolveOauthGuildPermissionFallback(null, guildId, ctx.discordUserId)

        if (
            botClient &&
            !hasRequiredPermissions(permissionResolution.permissions, requiredPerms) &&
            ctx.memberResolved === false
        ) {
            const fallback = resolveOauthGuildPermissionFallback(
                botClient,
                guildId,
                ctx.discordUserId
            )
            if (hasRequiredPermissions(fallback.permissions, requiredPerms)) {
                permissionResolution = fallback
            }
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error("[api-auth] requirePermissions permission resolution failed:", msg)
        return {
            ok: false,
            status: 403,
            error: "Forbidden",
            details:
                "Could not verify permissions for this server. Try again in a moment or re-open the dashboard.",
        }
    }

    if (!hasRequiredPermissions(permissionResolution.permissions, requiredPerms)) {
        return {
            ok: false,
            status: 403,
            error: "Forbidden",
            details:
                "You do not have permission for this action in this server (your Discord role may not include the required abilities).",
        }
    }

    return {
        ok: true,
        session: ctx.session,
        discordUserId: ctx.discordUserId,
        permissionResolution,
    }
}
