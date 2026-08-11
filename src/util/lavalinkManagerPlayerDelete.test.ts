import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { shouldDeleteLavalinkPlayerAfterDestroy } from "./lavalinkManagerPlayerDelete.js"

describe("shouldDeleteLavalinkPlayerAfterDestroy", () => {
    it("never deletes when destroy already cleared the manager slot", () => {
        assert.equal(shouldDeleteLavalinkPlayerAfterDestroy(false), false)
    })

    it("never deletes when a concurrent successor occupies the slot after destroy", () => {
        // Simulate lavalink-client destroy ordering:
        // deletePlayer(guildId) → await node.destroyPlayer → emit → resolve.
        // During the await, createPlayer can insert a successor.
        const players = new Map<string, { id: string }>()
        const guildId = "guild-1"
        players.set(guildId, { id: "old" })
        players.delete(guildId) // destroy's cache delete
        players.set(guildId, { id: "successor" }) // concurrent createPlayer

        assert.equal(players.has(guildId), true)
        assert.equal(shouldDeleteLavalinkPlayerAfterDestroy(players.has(guildId)), false)
        // Calling players.delete here would drop the successor — the bug we prevent.
        assert.equal(players.get(guildId)?.id, "successor")
    })
})
