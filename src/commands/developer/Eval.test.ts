import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { afterEach, describe, it, mock } from "node:test"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"

const OWNER = "owner-1"
const previousOwner = process.env.OWNER_ID

type EvalGlobals = typeof globalThis & {
    __evalWorkerMode?: string
    __evalWorkerResult?: string
    __evalWorkerError?: string
}

const g = globalThis as EvalGlobals

registerHooks({
    resolve(specifier, context, nextResolve) {
        const parent = context.parentURL ?? ""
        if (!parent.includes("/commands/developer/Eval.ts")) {
            return nextResolve(specifier, context)
        }
        if (specifier === "node:fs") {
            return {
                url: "data:text/javascript," + encodeURIComponent(fsSource),
                shortCircuit: true,
            }
        }
        if (specifier === "node:worker_threads") {
            return {
                url: "data:text/javascript," + encodeURIComponent(workerSource),
                shortCircuit: true,
            }
        }
        return nextResolve(specifier, context)
    },
})

const fsSource = `
export const constants = { R_OK: 4 }
const fs = { constants, accessSync() {} }
export default fs
`

const workerSource = `
export class Worker {
    constructor() {
        if (globalThis.__evalWorkerMode === "throw") {
            throw new Error("spawn failed")
        }
        this.handlers = {}
    }
    on(event, fn) {
        this.handlers[event] = fn
        return this
    }
    postMessage() {
        const mode = globalThis.__evalWorkerMode ?? "success"
        queueMicrotask(() => {
            if (mode === "success") {
                this.handlers.message?.({
                    ok: true,
                    result: globalThis.__evalWorkerResult ?? "canned",
                })
            } else if (mode === "error") {
                this.handlers.message?.({
                    ok: false,
                    error: globalThis.__evalWorkerError ?? "boom",
                })
            } else if (mode === "invalid") {
                this.handlers.message?.({ nope: true })
            } else if (mode === "crash") {
                const err = new Error("worker crashed")
                err.stack = "worker crashed"
                this.handlers.error?.(err)
            } else if (mode === "exit") {
                this.handlers.exit?.(3)
            }
        })
    }
    terminate() {
        return Promise.resolve()
    }
}
`

const { default: evalCommand } = await import("./Eval.js")

afterEach(() => {
    if (previousOwner === undefined) delete process.env.OWNER_ID
    else process.env.OWNER_ID = previousOwner
    delete g.__evalWorkerMode
    delete g.__evalWorkerResult
    delete g.__evalWorkerError
    mock.timers.reset()
})

function texts(calls: RecordedMessage[]): string[] {
    return messageContents(calls).filter((value): value is string => typeof value === "string")
}

function embedData(calls: RecordedMessage[]):
    | {
          title?: string
          fields?: { name: string; value: string }[]
          footer?: { text?: string }
      }
    | undefined {
    for (const call of calls) {
        const embed = call.embeds?.[0] as
            | {
                  data?: {
                      title?: string
                      fields?: { name: string; value: string }[]
                      footer?: { text?: string }
                  }
              }
            | undefined
        if (embed?.data) return embed.data
    }
    return undefined
}

async function settle() {
    for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => setImmediate(resolve))
    }
}

describe("eval", () => {
    it("reports a missing developer id", async () => {
        delete process.env.OWNER_ID
        const { interaction, calls } = createSlashInteraction({ options: { code: "1" } })
        await evalCommand.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Command configuration error: Developer ID not set."])
    })

    it("denies users who are not the owner", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({
            userId: "someone-else",
            options: { code: "1" },
        })
        await evalCommand.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Sorry, this command can only be used by the bot developer.",
        ])
    })

    it("says the eval worker could not be started", async () => {
        process.env.OWNER_ID = OWNER
        g.__evalWorkerMode = "throw"
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            options: { code: "1+1" },
        })
        await evalCommand.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Could not start the eval worker. Check logs."])
    })

    it("shows a canned eval result without running the snippet", async () => {
        process.env.OWNER_ID = OWNER
        g.__evalWorkerMode = "success"
        g.__evalWorkerResult = "canned-result"
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            options: { code: "1+1" },
        })
        await evalCommand.execute(interaction, createBotClientFake())
        await settle()
        const embed = embedData(calls)
        assert.equal(embed?.title, "Eval Result ✅")
        assert.match(
            embed?.fields?.find((field) => field.name === "Output")?.value ?? "",
            /canned-result/
        )
    })

    it("shows an eval error embed", async () => {
        process.env.OWNER_ID = OWNER
        g.__evalWorkerMode = "error"
        g.__evalWorkerError = "boom"
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            options: { code: "1+1" },
        })
        await evalCommand.execute(interaction, createBotClientFake())
        await settle()
        assert.equal(embedData(calls)?.title, "Eval Error ❌")
    })

    it("attaches an error that is too long for an embed field", async () => {
        process.env.OWNER_ID = OWNER
        g.__evalWorkerMode = "error"
        g.__evalWorkerError = "e".repeat(2000)
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            options: { code: "1+1" },
        })
        await evalCommand.execute(interaction, createBotClientFake())
        await settle()
        const error = embedData(calls)?.fields?.find((field) => field.name === "Error")
        assert.equal(error?.value, "Error was too long. See attached file.")
    })

    it("attaches output that is too long for an embed field", async () => {
        process.env.OWNER_ID = OWNER
        g.__evalWorkerMode = "success"
        g.__evalWorkerResult = "o".repeat(2000)
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            options: { code: "1+1" },
        })
        await evalCommand.execute(interaction, createBotClientFake())
        await settle()
        const output = embedData(calls)?.fields?.find((field) => field.name === "Output")
        assert.equal(output?.value, "Output was too long. See attached file.")
    })

    it("notes when the input code was truncated", async () => {
        process.env.OWNER_ID = OWNER
        g.__evalWorkerMode = "success"
        g.__evalWorkerResult = "ok"
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            options: { code: "x".repeat(1200) },
        })
        await evalCommand.execute(interaction, createBotClientFake())
        await settle()
        assert.equal(embedData(calls)?.footer?.text, "Note: Input code was truncated in embed.")
    })

    it("reports an invalid worker response", async () => {
        process.env.OWNER_ID = OWNER
        g.__evalWorkerMode = "invalid"
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            options: { code: "1+1" },
        })
        await evalCommand.execute(interaction, createBotClientFake())
        await settle()
        const error = embedData(calls)?.fields?.find((field) => field.name === "Error")
        assert.match(error?.value ?? "", /Invalid worker response\./)
    })

    it("reports a worker crash", async () => {
        process.env.OWNER_ID = OWNER
        g.__evalWorkerMode = "crash"
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            options: { code: "1+1" },
        })
        await evalCommand.execute(interaction, createBotClientFake())
        await settle()
        const error = embedData(calls)?.fields?.find((field) => field.name === "Error")
        assert.match(error?.value ?? "", /worker crashed/)
    })

    it("reports an unexpected worker exit", async () => {
        process.env.OWNER_ID = OWNER
        g.__evalWorkerMode = "exit"
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            options: { code: "1+1" },
        })
        await evalCommand.execute(interaction, createBotClientFake())
        await settle()
        const error = embedData(calls)?.fields?.find((field) => field.name === "Error")
        assert.match(error?.value ?? "", /Worker exited unexpectedly \(code 3\)\./)
    })

    it("reports a worker wall-clock timeout", async () => {
        process.env.OWNER_ID = OWNER
        g.__evalWorkerMode = "silent"
        mock.timers.enable({ apis: ["setTimeout"] })
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            options: { code: "1+1" },
        })
        const pending = evalCommand.execute(interaction, createBotClientFake())
        await new Promise((resolve) => setImmediate(resolve))
        mock.timers.tick(15_001)
        await pending
        await settle()
        const error = embedData(calls)?.fields?.find((field) => field.name === "Error")
        assert.match(error?.value ?? "", /Eval timed out \(worker wall clock\)\./)
    })
})
