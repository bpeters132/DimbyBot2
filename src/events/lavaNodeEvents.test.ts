import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const restoreState: { impl: () => Promise<void> } = {
    impl: async () => undefined,
}

mock.module("../util/restorePlayerSessions.js", {
    namedExports: {
        tryRestorePlayerSessionsOnLavalinkConnect: () => restoreState.impl(),
    },
})

const { default: lavaNodeEvents } = await import("./lavaNodeEvents.js")

type Listener = (...args: unknown[]) => void

function createNodeClient() {
    const handlers = new Map<string, Listener[]>()
    const logs: Array<{ level: string; message: string }> = []
    const log = (level: string) => (message: string) => {
        logs.push({ level, message })
    }
    const nodeManager = {
        on(event: string, cb: Listener) {
            const list = handlers.get(event) ?? []
            list.push(cb)
            handlers.set(event, list)
            return nodeManager
        },
    }
    const client = {
        info: log("info"),
        warn: log("warn"),
        error: log("error"),
        debug: log("debug"),
        lavalink: { nodeManager },
    }
    return { client, handlers, logs }
}

function messages(logs: Array<{ level: string; message: string }>, level: string) {
    return logs.filter((entry) => entry.level === level).map((entry) => entry.message)
}

describe("lavaNodeEvents", () => {
    it("logs node create", async () => {
        const { client, handlers, logs } = createNodeClient()
        await lavaNodeEvents(client as never)
        handlers.get("create")?.[0]?.({ id: "main" })
        assert.deepEqual(messages(logs, "info"), ["Lavalink Node main CREATED"])
    })

    it("logs node destroy with a reason", async () => {
        const { client, handlers, logs } = createNodeClient()
        await lavaNodeEvents(client as never)
        handlers.get("destroy")?.[0]?.({ id: "main" }, "shutdown")
        assert.deepEqual(messages(logs, "warn"), ["Lavalink Node main DESTROYED Reason: shutdown"])
    })

    it("logs node destroy without a reason", async () => {
        const { client, handlers, logs } = createNodeClient()
        await lavaNodeEvents(client as never)
        handlers.get("destroy")?.[0]?.({ id: "main" }, "")
        assert.deepEqual(messages(logs, "warn"), ["Lavalink Node main DESTROYED"])
    })

    it("logs node connect", async () => {
        const { client, handlers, logs } = createNodeClient()
        restoreState.impl = async () => undefined
        await lavaNodeEvents(client as never)
        handlers.get("connect")?.[0]?.({ id: "main" })
        await new Promise((resolve) => setImmediate(resolve))
        assert.deepEqual(messages(logs, "info"), ["Lavalink Node main CONNECTED"])
    })

    it("logs player session restore failure after connect", async () => {
        const { client, handlers, logs } = createNodeClient()
        restoreState.impl = async () => {
            throw new Error("restore down")
        }
        await lavaNodeEvents(client as never)
        handlers.get("connect")?.[0]?.({ id: "main" })
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(
            messages(logs, "error")[0],
            "[lavaNodeEvents] player session restore failed: restore down"
        )
    })

    it("logs node disconnect", async () => {
        const { client, handlers, logs } = createNodeClient()
        await lavaNodeEvents(client as never)
        handlers.get("disconnect")?.[0]?.({ id: "main" }, { code: 1006, reason: "lost" })
        assert.deepEqual(messages(logs, "warn"), [
            "Lavalink Node main DISCONNECTED. Code: 1006, Reason: lost",
        ])
    })

    it("logs node reconnecting", async () => {
        const { client, handlers, logs } = createNodeClient()
        await lavaNodeEvents(client as never)
        handlers.get("reconnecting")?.[0]?.({ id: "main" })
        assert.deepEqual(messages(logs, "warn"), ["Lavalink Node main RECONNECTING"])
    })

    it("logs reconnect in progress", async () => {
        const { client, handlers, logs } = createNodeClient()
        await lavaNodeEvents(client as never)
        handlers.get("reconnectinprogress")?.[0]?.({ id: "main" })
        assert.deepEqual(messages(logs, "info"), ["Lavalink Node main RECONNECT IN PROGRESS"])
    })

    it("logs node resumed payload", async () => {
        const { client, handlers, logs } = createNodeClient()
        await lavaNodeEvents(client as never)
        handlers.get("resumed")?.[0]?.({ id: "main" }, { resumed: true })
        assert.deepEqual(messages(logs, "info"), [
            'Lavalink Node main RESUMED. Payload: {"resumed":true}',
        ])
    })

    it("logs a node error with its payload", async () => {
        const { client, handlers, logs } = createNodeClient()
        const original = console.error
        console.error = () => undefined
        try {
            await lavaNodeEvents(client as never)
            handlers.get("error")?.[0]?.({ id: "main" }, new Error("boom"), { op: "x" })
            assert.equal(
                messages(logs, "error")[0],
                'Lavalink Node main ERRORED: boom Payload: {"op":"x"}'
            )
        } finally {
            console.error = original
        }
    })

    it("logs a node error without a payload", async () => {
        const { client, handlers, logs } = createNodeClient()
        const original = console.error
        console.error = () => undefined
        try {
            await lavaNodeEvents(client as never)
            handlers.get("error")?.[0]?.({ id: "main" }, "plain", undefined)
            assert.equal(messages(logs, "error")[0], "Lavalink Node main ERRORED: plain")
        } finally {
            console.error = original
        }
    })

    it("logs raw node payloads at debug", async () => {
        const { client, handlers, logs } = createNodeClient()
        await lavaNodeEvents(client as never)
        handlers.get("raw")?.[0]?.({ id: "main" }, { op: "ready" })
        assert.deepEqual(messages(logs, "debug"), ['Lavalink Node main RAW: {"op":"ready"}'])
    })
})
