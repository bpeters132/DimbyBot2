import assert from "node:assert/strict"
import { describe, it } from "node:test"
import onError from "./onError.js"

describe("onError", () => {
    it("logs Discord client error events", async () => {
        const listeners = new Map<string, (err: Error) => void>()
        const logs: string[] = []
        const client = {
            error: (...args: unknown[]) => {
                logs.push(args.map(String).join(" "))
            },
            on(event: string, cb: (err: Error) => void) {
                listeners.set(event, cb)
                return client
            },
        }
        await onError(client as never)
        const err = new Error("socket reset")
        listeners.get("error")?.(err)
        assert.equal(logs[0], `Discord client error event: ${err}`)
    })
})
