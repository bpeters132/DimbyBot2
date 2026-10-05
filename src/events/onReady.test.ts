import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const startup = {
    monitorThrows: false,
}

mock.module("../util/youtubeUploadMonitor.js", {
    namedExports: {
        startYoutubeUploadMonitor() {
            if (startup.monitorThrows) {
                throw new Error("monitor boom")
            }
        },
    },
})

mock.module("../util/countdownUpdater.js", {
    namedExports: {
        updateAllCountdowns: async () => undefined,
    },
})

const { default: onReady } = await import("./onReady.js")

type ReadyListener = () => void

function createReadyClient(
    user: { id: string; tag: string; username: string; setActivity?: () => void } | null
) {
    const listeners = new Map<string, ReadyListener>()
    const logs: Array<{ level: string; args: unknown[] }> = []
    const log =
        (level: string) =>
        (...args: unknown[]) => {
            logs.push({ level, args })
        }
    const client = {
        user,
        error: log("error"),
        info: log("info"),
        debug: log("debug"),
        warn: log("warn"),
        logger: { setDiscordForwarder() {} },
        guilds: { cache: new Map() },
        lavalink: { init() {} },
        on(event: string, cb: ReadyListener) {
            listeners.set(event, cb)
            return client
        },
        logs,
        listeners,
    }
    return client
}

describe("onReady", () => {
    it("logs an error when clientReady fires without client.user", async () => {
        mock.timers.enable({ apis: ["setInterval", "setTimeout"] })
        startup.monitorThrows = false
        try {
            const client = createReadyClient(null)
            await onReady(client as never)
            client.listeners.get("clientReady")?.()
            assert.equal(client.logs[0]?.args[0], "clientReady fired but client.user is null")
        } finally {
            mock.timers.reset()
        }
    })

    it("logs when a startup call throws", async () => {
        mock.timers.enable({ apis: ["setInterval", "setTimeout"] })
        startup.monitorThrows = true
        try {
            const client = createReadyClient({
                id: "bot-1",
                tag: "Dimby#0001",
                username: "Dimby",
                setActivity() {},
            })
            await onReady(client as never)
            client.listeners.get("clientReady")?.()
            const logged = client.logs.find(
                (entry) => entry.args[0] === "[onReady] startYoutubeUploadMonitor failed:"
            )
            assert.equal((logged?.args[1] as Error).message, "monitor boom")
        } finally {
            startup.monitorThrows = false
            mock.timers.reset()
        }
    })
})
