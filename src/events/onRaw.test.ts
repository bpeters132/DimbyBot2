import assert from "node:assert/strict"
import { describe, it } from "node:test"
import onRaw from "./onRaw.js"

describe("onRaw", () => {
    it("logs when Lavalink sendRawData rejects", async () => {
        const listeners = new Map<string, (data: unknown) => void>()
        const logs: unknown[][] = []
        const client = {
            error: (...args: unknown[]) => {
                logs.push(args)
            },
            lavalink: {
                sendRawData: async () => {
                    throw new Error("raw down")
                },
            },
            on(event: string, cb: (data: unknown) => void) {
                listeners.set(event, cb)
                return client
            },
        }
        await onRaw(client as never)
        listeners.get("raw")?.({ t: "VOICE_STATE_UPDATE" })
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(logs[0]?.[0], "[onRaw] sendRawData failed:")
        assert.equal((logs[0]?.[1] as Error).message, "raw down")
    })
})
