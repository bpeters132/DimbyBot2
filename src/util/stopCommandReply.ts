/**
 * User-visible `/stop` reply: which playback layers actually stopped, and whether
 * the confirmation is public (channel) vs ephemeral.
 */
export type StopCommandReplyFlags = {
    stoppedLocal: boolean
    stoppedLavalink: boolean
    lavalinkIdleCleaned: boolean
    lavalinkDestroyFailed: boolean
    cancelledPendingLocal: boolean
    localPlayerWasActive: boolean
}

export type StopCommandReply = {
    content: string
    /** Public channel confirmation; ephemeral when false (including destroy failures). */
    confirmPublicly: boolean
}

/**
 * Maps `/stop` outcome flags to reply copy and visibility.
 * Destroy failures stay ephemeral and never claim a successful public stop.
 */
export function resolveStopCommandReply(flags: StopCommandReplyFlags): StopCommandReply {
    let content = "Nothing was playing."
    if (flags.lavalinkDestroyFailed && flags.stoppedLocal) {
        content =
            "Local playback stopped, but clearing the online player failed. Try `/stop` or `/leave` again."
    } else if (flags.lavalinkDestroyFailed) {
        content = "Could not stop the player right now. Try again in a moment."
    } else if (flags.stoppedLocal && flags.stoppedLavalink) {
        content = "All playback stopped and the queue was cleared."
    } else if (flags.stoppedLocal && flags.lavalinkIdleCleaned) {
        content = "Local playback stopped and idle Lavalink resources were cleaned up."
    } else if (flags.stoppedLocal) {
        content = "Local playback stopped."
    } else if (flags.stoppedLavalink) {
        content = "Lavalink playback stopped and the queue was cleared."
    } else if (flags.lavalinkIdleCleaned) {
        content = "Lavalink player was idle; resources cleaned up."
    } else if (flags.cancelledPendingLocal) {
        content = "Local playback start was cancelled."
    } else if (flags.localPlayerWasActive && !flags.stoppedLocal) {
        content = "Could not stop the local player. Please check logs."
    }

    const stoppedSomething =
        flags.stoppedLocal ||
        flags.stoppedLavalink ||
        flags.lavalinkIdleCleaned ||
        flags.cancelledPendingLocal
    return {
        content,
        confirmPublicly: stoppedSomething && !flags.lavalinkDestroyFailed,
    }
}
