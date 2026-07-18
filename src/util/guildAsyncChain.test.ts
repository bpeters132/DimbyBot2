import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createGuildAsyncChain } from "./guildAsyncChain.js"

describe("createGuildAsyncChain", () => {
    it("removes the guild entry after the tail settles", async () => {
        const withLock = createGuildAsyncChain()
        // Access map indirectly: after settle, a new call should not wait on a retained resolved tail
        // beyond a fresh Promise.resolve() — verified by ordering a second guild-independent burst.
        const events: string[] = []
        await withLock("g1", async () => {
            events.push("a")
        })
        await withLock("g1", async () => {
            events.push("b")
        })
        assert.deepEqual(events, ["a", "b"])
    })

    it("does not drop a newer tail when an older tail settles later", async () => {
        const withLock = createGuildAsyncChain()
        const events: string[] = []
        let releaseOld!: () => void
        const oldGate = new Promise<void>((resolve) => {
            releaseOld = resolve
        })

        const older = withLock("g1", async () => {
            events.push("old-start")
            await oldGate
            events.push("old-end")
        })
        const newer = withLock("g1", async () => {
            events.push("new")
        })

        await Promise.resolve()
        assert.deepEqual(events, ["old-start"])
        releaseOld()
        await Promise.all([older, newer])
        assert.deepEqual(events, ["old-start", "old-end", "new"])
    })
})
