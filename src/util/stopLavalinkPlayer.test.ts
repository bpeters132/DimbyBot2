import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { destroyLavalinkPlayerForStop } from "./stopLavalinkPlayer.js"

describe("destroyLavalinkPlayerForStop", () => {
    it("awaits destroy so callers can catch failures", async () => {
        let resolved = false
        const player = {
            destroy: async () => {
                await Promise.resolve()
                resolved = true
            },
        }
        await destroyLavalinkPlayerForStop(player)
        assert.equal(resolved, true)
    })

    it("propagates destroy rejection to the caller (no floating promise)", async () => {
        const player = {
            destroy: async () => {
                throw new Error("node_unavailable")
            },
        }
        await assert.rejects(() => destroyLavalinkPlayerForStop(player), /node_unavailable/)
    })
})
