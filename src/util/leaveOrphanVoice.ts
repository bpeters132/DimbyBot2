/**
 * True when /leave has no Lavalink player but the bot still occupies a Discord voice channel.
 * `destroyPlayer` is a no-op without a manager entry, so Discord must be disconnected explicitly.
 */
export function shouldDisconnectOrphanVoice(
    hasLavalinkPlayer: boolean,
    botInVoice: boolean
): boolean {
    return !hasLavalinkPlayer && botInVoice
}

/**
 * When /leave observed no Lavalink player at command start, whether it may still
 * disconnect orphan Discord voice / force-clear a leftover session row.
 * A concurrent `/play` can install a successor after the null check; tearing that
 * player down (or wiping its session) must not run.
 *
 * Do **not** call `destroyPlayer(guildId)` on this path: with a null live player it is
 * a no-op, and if a successor appears between the check and the call it destroys the
 * wrong player.
 */
export function shouldTearDownAbsentLavalinkOnLeave(
    livePlayer: object | null | undefined
): boolean {
    return livePlayer == null
}

/**
 * Destructive Lavalink/session steps on `/leave` when command start saw no player.
 * `destroyPlayerByGuildId` is always false: `lavalink.destroyPlayer(guildId)` is
 * guild-keyed and would tear down a racing `/play` successor.
 */
export type LeaveAbsentLavalinkPlan = {
    destroyPlayerByGuildId: false
    disconnectOrphanVoice: boolean
    forceClearSession: boolean
}

/**
 * Snapshot of absent-path `/leave` actions. Re-evaluate after each await: a successor
 * can appear between orphan disconnect and session force-clear.
 */
export function planLeaveAbsentLavalinkActions(input: {
    livePlayer: object | null | undefined
    botInVoice: boolean
    stoppedLocal: boolean
}): LeaveAbsentLavalinkPlan {
    const none: LeaveAbsentLavalinkPlan = {
        destroyPlayerByGuildId: false,
        disconnectOrphanVoice: false,
        forceClearSession: false,
    }
    // "I'm not in a voice channel" path: no local leftover and no orphan Discord VC.
    if (!input.stoppedLocal && !input.botInVoice) {
        return none
    }
    if (!shouldTearDownAbsentLavalinkOnLeave(input.livePlayer)) {
        return none
    }
    return {
        destroyPlayerByGuildId: false,
        disconnectOrphanVoice: shouldDisconnectOrphanVoice(false, input.botInVoice),
        forceClearSession: true,
    }
}
