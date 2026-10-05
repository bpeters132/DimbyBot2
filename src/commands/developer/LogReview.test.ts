import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { afterEach, describe, it } from "node:test"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"

const OWNER = "owner-1"
const LOG_PATH = "C:/logs/dimby.log"
const previousOwner = process.env.OWNER_ID

type LogGlobals = typeof globalThis & {
    __logExists?: boolean
    __logReadError?: boolean
    __logBody?: string
}

const g = globalThis as LogGlobals

registerHooks({
    resolve(specifier, context, nextResolve) {
        const parent = context.parentURL ?? ""
        if (specifier === "fs" && parent.includes("/commands/developer/LogReview.ts")) {
            return {
                url: "data:text/javascript," + encodeURIComponent(fsSource),
                shortCircuit: true,
            }
        }
        return nextResolve(specifier, context)
    },
})

const fsSource = `
function existsSync() {
    return globalThis.__logExists === true
}
function readFileSync() {
    if (globalThis.__logReadError) throw new Error("read failed")
    return globalThis.__logBody ?? ""
}
export { existsSync, readFileSync }
export default { existsSync, readFileSync }
`

const { default: logReview } = await import("./LogReview.js")

afterEach(() => {
    if (previousOwner === undefined) delete process.env.OWNER_ID
    else process.env.OWNER_ID = previousOwner
    delete g.__logExists
    delete g.__logReadError
    delete g.__logBody
})

function texts(calls: RecordedMessage[]): string[] {
    return messageContents(calls).filter((value): value is string => typeof value === "string")
}

function ownerClient(logPath: string | null) {
    return createBotClientFake({
        extra: {
            logger: {
                setDebugEnabled() {},
                getLogFilePath: () => logPath,
            },
        },
    })
}

describe("logreview", () => {
    it("reports a missing developer id", async () => {
        delete process.env.OWNER_ID
        const { interaction, calls } = createSlashInteraction()
        await logReview.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Command configuration error: Developer ID not set."])
    })

    it("denies users who are not the owner", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({ userId: "someone-else" })
        await logReview.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Sorry, this command can only be used by the bot developer.",
        ])
    })

    it("says the log file path is not configured", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({ userId: OWNER })
        await logReview.execute(interaction, ownerClient(null))
        assert.deepEqual(texts(calls), [
            "Log file path is not configured; file logging may be disabled.",
        ])
    })

    it("says the log file was not found", async () => {
        process.env.OWNER_ID = OWNER
        g.__logExists = false
        const { interaction, calls } = createSlashInteraction({ userId: OWNER })
        await logReview.execute(interaction, ownerClient(LOG_PATH))
        assert.deepEqual(texts(calls), [`Log file not found at ${LOG_PATH}.`])
    })

    it("says the log file could not be read", async () => {
        process.env.OWNER_ID = OWNER
        g.__logExists = true
        g.__logReadError = true
        const { interaction, calls } = createSlashInteraction({ userId: OWNER })
        await logReview.execute(interaction, ownerClient(LOG_PATH))
        assert.deepEqual(texts(calls), ["Failed to read log file. Check server logs for details."])
    })

    it("says the log file is empty", async () => {
        process.env.OWNER_ID = OWNER
        g.__logExists = true
        g.__logBody = ""
        const { interaction, calls } = createSlashInteraction({ userId: OWNER })
        await logReview.execute(interaction, ownerClient(LOG_PATH))
        assert.deepEqual(texts(calls), ["Log file is empty."])
    })

    it("says no lines matched the filter", async () => {
        process.env.OWNER_ID = OWNER
        g.__logExists = true
        g.__logBody = "hello\n"
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            options: { filter: "nope" },
        })
        await logReview.execute(interaction, ownerClient(LOG_PATH))
        assert.deepEqual(texts(calls), ["No log lines matched filter `nope`."])
    })

    it("shows recent log lines inline", async () => {
        process.env.OWNER_ID = OWNER
        g.__logExists = true
        g.__logBody = "hello\n"
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            options: { lines: 1 },
        })
        await logReview.execute(interaction, ownerClient(LOG_PATH))
        const content = texts(calls)[0] ?? ""
        assert.match(content, /Showing last 1 lines from dimby\.log\./)
        assert.match(content, /hello/)
    })

    it("sends a header when the log body is too long to inline", async () => {
        process.env.OWNER_ID = OWNER
        g.__logExists = true
        g.__logBody = "z".repeat(2000)
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            options: { lines: 1 },
        })
        await logReview.execute(interaction, ownerClient(LOG_PATH))
        assert.equal(texts(calls)[0], "Showing last 1 lines from dimby.log.")
    })
})
