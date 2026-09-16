import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveStopCommandReply, type StopCommandReplyFlags } from "./stopCommandReply.js"

const idle: StopCommandReplyFlags = {
    stoppedLocal: false,
    stoppedLavalink: false,
    lavalinkIdleCleaned: false,
    lavalinkDestroyFailed: false,
    cancelledPendingLocal: false,
    localPlayerWasActive: false,
}

describe("resolveStopCommandReply", () => {
    it("is ephemeral with the idle copy when nothing was playing", () => {
        assert.deepEqual(resolveStopCommandReply(idle), {
            content: "Nothing was playing.",
            confirmPublicly: false,
        })
    })

    it("keeps destroy failures ephemeral and prefers the local+Lavalink failure copy", () => {
        assert.deepEqual(
            resolveStopCommandReply({
                ...idle,
                lavalinkDestroyFailed: true,
                stoppedLocal: true,
                stoppedLavalink: true,
            }),
            {
                content:
                    "Local playback stopped, but clearing the online player failed. Try `/stop` or `/leave` again.",
                confirmPublicly: false,
            }
        )
        assert.deepEqual(
            resolveStopCommandReply({
                ...idle,
                lavalinkDestroyFailed: true,
                cancelledPendingLocal: true,
            }),
            {
                content: "Could not stop the player right now. Try again in a moment.",
                confirmPublicly: false,
            }
        )
    })

    it("confirms publicly for successful local, Lavalink, idle-clean, and pending-cancel stops", () => {
        assert.deepEqual(
            resolveStopCommandReply({ ...idle, stoppedLocal: true, stoppedLavalink: true }),
            {
                content: "All playback stopped and the queue was cleared.",
                confirmPublicly: true,
            }
        )
        assert.deepEqual(
            resolveStopCommandReply({ ...idle, stoppedLocal: true, lavalinkIdleCleaned: true }),
            {
                content: "Local playback stopped and idle Lavalink resources were cleaned up.",
                confirmPublicly: true,
            }
        )
        assert.deepEqual(resolveStopCommandReply({ ...idle, stoppedLocal: true }), {
            content: "Local playback stopped.",
            confirmPublicly: true,
        })
        assert.deepEqual(resolveStopCommandReply({ ...idle, stoppedLavalink: true }), {
            content: "Lavalink playback stopped and the queue was cleared.",
            confirmPublicly: true,
        })
        assert.deepEqual(resolveStopCommandReply({ ...idle, lavalinkIdleCleaned: true }), {
            content: "Lavalink player was idle; resources cleaned up.",
            confirmPublicly: true,
        })
        assert.deepEqual(resolveStopCommandReply({ ...idle, cancelledPendingLocal: true }), {
            content: "Local playback start was cancelled.",
            confirmPublicly: true,
        })
    })

    it("reports a local-stop failure as ephemeral when the player was active but did not stop", () => {
        assert.deepEqual(resolveStopCommandReply({ ...idle, localPlayerWasActive: true }), {
            content: "Could not stop the local player. Please check logs.",
            confirmPublicly: false,
        })
    })
})
