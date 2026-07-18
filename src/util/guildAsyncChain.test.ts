import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createGuildAsyncChain } from "./guildAsyncChain.js"

describe("createGuildAsyncChain", () => {
    it("evicts the guild map entry after the sole tail promise settles", async () => {
        const withLock = createGuildAsyncChain()
        assert.equal(withLock.pendingGuildCountForTests(), 0)

        let release!: () => void
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        const running = withLock("g1", async () => {
            await gate
        })
        assert.equal(withLock.pendingGuildCountForTests(), 1)
        release()
        await running
        // Eviction runs in tail.finally after the result promise settles.
        await Promise.resolve()
        assert.equal(withLock.pendingGuildCountForTests(), 0)
    })

    it("keeps a newer tail registered when an older tail settles (identity-guarded eviction)", async () => {
        const withLock = createGuildAsyncChain()
        const events: string[] = []
        let releaseFirst!: () => void
        let releaseSecond!: () => void
        const firstGate = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        const secondGate = new Promise<void>((resolve) => {
            releaseSecond = resolve
        })

        const first = withLock("g1", async () => {
            events.push("1-start")
            await firstGate
            events.push("1-end")
        })
        const second = withLock("g1", async () => {
            events.push("2-start")
            await secondGate
            events.push("2-end")
        })

        await Promise.resolve()
        assert.deepEqual(events, ["1-start"])
        assert.equal(withLock.pendingGuildCountForTests(), 1)

        // First settles; second is still the live tail and must remain registered.
        releaseFirst()
        await first
        await Promise.resolve()
        assert.deepEqual(events, ["1-start", "1-end", "2-start"])
        assert.equal(withLock.pendingGuildCountForTests(), 1)

        // Enqueue a third while second is still blocked — it must wait for second.
        const third = withLock("g1", async () => {
            events.push("3")
        })
        await Promise.resolve()
        assert.deepEqual(events, ["1-start", "1-end", "2-start"])
        assert.equal(withLock.pendingGuildCountForTests(), 1)

        releaseSecond()
        await Promise.all([second, third])
        assert.deepEqual(events, ["1-start", "1-end", "2-start", "2-end", "3"])
        await Promise.resolve()
        assert.equal(withLock.pendingGuildCountForTests(), 0)
    })
})
