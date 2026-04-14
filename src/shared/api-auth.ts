import {
    WebPermission,
    type PermissionResolution,
    hasRequiredPermissions,
    resolveGuildMemberForPermissions,
    resolveOauthGuildPermissionFallback,
    resolveUserPermissions,
} from "./permissions.js"
import type { GuildDashboardSnapshotResult } from "../types/web.js"
import type BotClient from "../lib/BotClient.js"
import { fetchDiscordUserGuilds } from "./discord-rest.js"
import { resolveDiscordUserSnowflake } from "./discord-user-id.js"
import { auth } from "./auth-node.js"
import { tryGetBotClient } from "../lib/botClientRegistry.js"
import { webPlayerDebug, webPlayerWarn } from "./web-player-debug-log.js"
import { getBotApiOrigin } from "../lib/bot-api-origin.js"

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

export interface PermissionGuardSuccess {
    ok: true
    session: AuthenticatedSession
    /** Discord snowflake for voice/member/owner checks (Better Auth `user.id` may differ). */
    discordUserId: string
    permissionResolution: PermissionResolution
}

export type PermissionGuardResult = GuardFailure | PermissionGuardSuccess

export type GuildAccessResult =
    | { ok: true; memberResolved: boolean }
    | { ok: false; retryable: boolean; error?: string }

export type AuthenticatedGuildAccessResult =
    | Extract<SessionGuardResult, { ok: false }>
    | AuthGuildForbidden
    | AuthGuildOk

/** Narrow success type for {@link finishGuildDashboardPermissionSnapshot}. */
export type AuthenticatedGuildAccessOk = Extract<AuthenticatedGuildAccessResult, { ok: true }>

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
                    return {
                        ok: false,
                        retryable: true,
                        error: "Missing or expired Discord access token.",
                    }
                }

                const discordGuilds = await fetchDiscordUserGuilds(accessToken)
                if (discordGuilds.ok === false) {
                    const retryable = discordGuilds.status >= 500
                    return {
                        ok: false,
                        retryable,
                        error: discordGuilds.message,
                    }
                }

                if (discordGuilds.guilds.some((guildEntry) => guildEntry.id === guildId)) {
                    return { ok: true, memberResolved: false }
                }

                return { ok: false, retryable: false }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e)
                console.error("[api-auth] verifyMembershipViaOAuth failed:", msg)
                return { ok: false, retryable: true, error: msg }
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
        return { ok: false, retryable: true, error: msg }
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
    if (guildAccess.ok === false) {
        const retryable = guildAccess.retryable === true
        return {
            ok: false,
            status: retryable ? 503 : 403,
            error: retryable ? "Service temporarily unavailable" : "Forbidden",
            details: retryable
                ? (guildAccess.error ??
                  "Could not verify Discord membership right now. Try again in a moment.")
                : "Could not verify access to this server. The bot may not be in this guild, or your membership could not be confirmed (try re-logging in with Discord).",
        }
    }

    return {
        ok: true,
        session: sessionResult.session,
        discordUserId,
        memberResolved: guildAccess.memberResolved,
    }
}

const DASHBOARD_PERM_UPSTREAM_FETCH_MS = 10_000

function snapshotErrorMessageFromPayload(body: Record<string, unknown>): string {
    if (typeof body.error === "string") return body.error
    const nested = body.error
    if (nested && typeof nested === "object" && nested !== null && "error" in nested) {
        const inner = (nested as { error?: unknown }).error
        if (typeof inner === "string") return inner
    }
    return "Request failed"
}

function snapshotErrorDetailsFromPayload(body: Record<string, unknown>): string | undefined {
    if (typeof body.details === "string") return body.details
    const nested = body.error
    if (nested && typeof nested === "object" && nested !== null && "details" in nested) {
        const d = (nested as { details?: unknown }).details
        if (typeof d === "string") return d
    }
    return undefined
}

/**
 * Maps bot Express JSON (including generic `{ ok: false, error: { error } }` errors) into
 * {@link GuildDashboardSnapshotResult}.
 */
function normalizeDashboardPermissionSnapshotResponse(
    parsed: unknown,
    httpStatus: number
): GuildDashboardSnapshotResult {
    if (!parsed || typeof parsed !== "object" || !("ok" in parsed)) {
        return {
            ok: false,
            status: httpStatus >= 400 ? httpStatus : 502,
            error: "Invalid bot response",
            details: "The bot API returned an unexpected payload for dashboard permissions.",
        }
    }
    const body = parsed as Record<string, unknown>
    if (body.ok === false) {
        const status =
            typeof body.status === "number" && Number.isFinite(body.status)
                ? Math.floor(body.status)
                : httpStatus >= 400
                  ? httpStatus
                  : 502
        return {
            ok: false,
            status,
            error: snapshotErrorMessageFromPayload(body),
            details: snapshotErrorDetailsFromPayload(body),
        }
    }
    if (body.ok !== true) {
        return {
            ok: false,
            status: 502,
            error: "Invalid bot response",
            details: "The bot API returned an unexpected `ok` field for dashboard permissions.",
        }
    }

    const discordUserId = body.discordUserId
    if (typeof discordUserId !== "string") {
        return {
            ok: false,
            status: 502,
            error: "Invalid bot response",
            details: "Dashboard permission snapshot is missing `discordUserId`.",
        }
    }

    const snap = body.snapshot
    if (!snap || typeof snap !== "object") {
        return {
            ok: false,
            status: 502,
            error: "Invalid bot response",
            details: "Dashboard permission snapshot is missing `snapshot`.",
        }
    }
    const s = snap as Record<string, unknown>
    const primary = s.primaryPermissions
    const oauth = s.oauthPermissions
    if (!Array.isArray(primary) || !Array.isArray(oauth)) {
        return {
            ok: false,
            status: 502,
            error: "Invalid bot response",
            details: "Dashboard permission snapshot has invalid permission arrays.",
        }
    }

    return {
        ok: true,
        snapshot: {
            memberResolved: Boolean(s.memberResolved),
            primaryPermissions: primary as string[],
            oauthPermissions: oauth as string[],
            ...(typeof s.optimisticBotUnavailable === "boolean"
                ? { optimisticBotUnavailable: s.optimisticBotUnavailable }
                : {}),
        },
        discordUserId,
    }
}

/**
 * Resolves primary + OAuth permission lists when a {@link BotClient} is already available (in-process
 * or in the bot HTTP handler).
 */
export async function finishGuildDashboardPermissionSnapshot(
    ctx: AuthenticatedGuildAccessOk,
    botClient: BotClient,
    guildId: string
): Promise<GuildDashboardSnapshotResult> {
    try {
        const primary = await resolveUserPermissions(botClient, guildId, ctx.discordUserId, {
            applyVoiceGating: false,
        })
        /** Same voice-aware fallback as API; only primary snapshot skips voice stripping (role entitlements). */
        const oauth = resolveOauthGuildPermissionFallback(botClient, guildId, ctx.discordUserId)

        webPlayerDebug("finishGuildDashboardPermissionSnapshot", {
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
            "[api-auth] finishGuildDashboardPermissionSnapshot permission resolution failed:",
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
 * Calls the bot HTTP API for a permission snapshot (Next.js runs without an in-process {@link BotClient}).
 * Always returns a structured result (never `null`); normalizes Express error bodies that omit top-level `status`.
 */
async function fetchGuildDashboardPermissionSnapshotFromBot(
    headers: Headers | Record<string, string>,
    guildId: string
): Promise<GuildDashboardSnapshotResult> {
    let origin: string | null
    try {
        origin = getBotApiOrigin()
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        webPlayerWarn("getBotApiOrigin failed for dashboard permission snapshot", {
            guildId,
            message: msg,
        })
        return {
            ok: false,
            status: 503,
            error: "Bot API misconfigured",
            details:
                "API_PROXY_TARGET is invalid. Set it to the bot HTTP origin (origin only, no path).",
        }
    }

    if (!origin) {
        return {
            ok: false,
            status: 503,
            error: "Bot API not configured",
            details:
                "Set API_PROXY_TARGET to your bot HTTP origin (e.g. http://localhost:3001 locally, or http://dimbybot:3001 in Docker).",
        }
    }

    const url = `${origin}/api/guilds/${encodeURIComponent(guildId)}/dashboard-permissions`
    const h = asHeaders(headers)
    const outHeaders = new Headers()
    const cookie = h.get("cookie")
    if (cookie) outHeaders.set("cookie", cookie)
    const authorization = h.get("authorization")
    if (authorization) outHeaders.set("authorization", authorization)

    let res: Response
    try {
        res = await fetch(url, {
            method: "GET",
            headers: outHeaders,
            signal: AbortSignal.timeout(DASHBOARD_PERM_UPSTREAM_FETCH_MS),
            cache: "no-store",
        } as RequestInit)
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        webPlayerWarn("dashboard permission snapshot upstream fetch failed", {
            guildId,
            message: msg,
        })
        return {
            ok: false,
            status: 503,
            error: "Bot API unreachable",
            details:
                "Could not reach the bot HTTP server for permission data. Confirm the bot is running and API_PROXY_TARGET matches BOT_API_PORT.",
        }
    }

    const ct = res.headers.get("content-type") ?? ""
    if (!ct.includes("application/json")) {
        webPlayerWarn("dashboard permission snapshot upstream returned non-JSON", {
            guildId,
            status: res.status,
            contentType: ct || undefined,
        })
        return {
            ok: false,
            status: res.status >= 400 ? res.status : 502,
            error:
                res.status === 404
                    ? "Dashboard permission route not found"
                    : "Invalid bot response",
            details:
                res.status === 404
                    ? "The bot process may be running an older build without GET /api/guilds/:guildId/dashboard-permissions — rebuild the bot (yarn build:bot) and restart it."
                    : "Expected JSON from the bot API for dashboard permissions.",
        }
    }

    let parsed: unknown
    try {
        parsed = await res.json()
    } catch {
        webPlayerWarn("dashboard permission snapshot upstream JSON parse failed", {
            guildId,
            status: res.status,
        })
        return {
            ok: false,
            status: res.status >= 400 ? res.status : 502,
            error: "Invalid bot response",
            details: "The bot API returned malformed JSON for dashboard permissions.",
        }
    }

    const normalized = normalizeDashboardPermissionSnapshotResponse(parsed, res.status)
    if (normalized.ok === false) {
        webPlayerWarn("dashboard permission snapshot upstream returned error payload", {
            guildId,
            httpStatus: res.status,
            status: normalized.status,
            error: normalized.error,
        })
    }
    return normalized
}

/**
 * Primary + OAuth-fallback permission lists for dashboard UI gating (matches {@link requirePermissions}
 * merge rules per action). When this Node process has no {@link BotClient} (typical for the Next
 * server), delegates to the bot HTTP API using {@link getBotApiOrigin} (`cache: no-store` so Next
 * does not reuse a stale first response).
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
    if (botClient) {
        return finishGuildDashboardPermissionSnapshot(ctx, botClient, guildId)
    }

    const upstream = await fetchGuildDashboardPermissionSnapshotFromBot(headers, guildId)
    if (upstream.ok === true) {
        webPlayerDebug("getGuildDashboardPermissionSnapshot via bot HTTP", {
            guildId,
            discordUserIdPrefix: ctx.discordUserId.slice(0, 8),
        })
    }
    return upstream
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
            status: 503,
            error: "Service Unavailable",
            details:
                "Permission resolution is temporarily unavailable. Please retry in a moment or re-open the dashboard.",
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
