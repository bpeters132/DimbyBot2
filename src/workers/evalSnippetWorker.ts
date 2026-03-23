/** Runs developer `/eval` snippets off the main thread with a VM timeout (spawned from Eval command). */
import { parentPort } from "node:worker_threads"
import { inspect } from "node:util"
import vm from "node:vm"

const VM_SYNC_MS = 8000
/** Bounds async continuations after sync VM return (sync phase is still limited by VM_SYNC_MS). */
const ASYNC_EVAL_MS = 12_000
const MAX_RESULT_CHARS = 500_000

if (!parentPort) {
    throw new Error("evalSnippetWorker must be run as a worker_threads Worker")
}

parentPort.on("message", (code: unknown) => {
    if (typeof code !== "string") {
        parentPort!.postMessage({
            ok: false as const,
            error: "Invalid worker payload (expected code string).",
        })
        return
    }
    void runUserCode(code)
})

async function runUserCode(code: string) {
    try {
        const sandbox: Record<string, unknown> = {
            console: {
                log: () => {},
                info: () => {},
                warn: () => {},
                error: () => {},
                debug: () => {},
            },
        }
        const context = vm.createContext(sandbox)
        const wrapped = `;(async () => {\n${code}\n})()`
        const script = new vm.Script(wrapped, { filename: "eval-user.js" })
        const maybePromise = script.runInContext(context, { timeout: VM_SYNC_MS })
        const asyncTimeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Eval async execution timed out.")), ASYNC_EVAL_MS)
        })
        const settled = await Promise.race([Promise.resolve(maybePromise), asyncTimeout])
        let out: string
        if (typeof settled === "string") {
            out = settled
        } else {
            out = inspect(settled, { depth: 6, maxArrayLength: 50 })
        }
        if (out.length > MAX_RESULT_CHARS) {
            out = out.slice(0, MAX_RESULT_CHARS) + "\n...[truncated]"
        }
        parentPort!.postMessage({ ok: true as const, result: out })
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e))
        parentPort!.postMessage({ ok: false as const, error: err.stack || err.message })
    }
}
