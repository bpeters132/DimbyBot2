import fs from "fs"

function main() {
    // Invoked via `yarn --cwd src/web`; cwd is `src/web`, so this relative path resolves correctly.
    const p = ".next/dev/lock"
    let lockRaw
    try {
        lockRaw = fs.readFileSync(p, "utf8")
    } catch (err) {
        if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
            process.exit(0)
        }
        console.error("[predev] Failed to read Next dev lock:", err)
        process.exit(1)
    }
    try {
        const lock = JSON.parse(lockRaw)
        const pid = lock?.pid
        const pidOk = typeof pid === "number" && Number.isInteger(pid) && pid > 0
        if (lock && pidOk) {
            try {
                process.kill(pid, 0)
                console.log("Next dev lock active for PID", pid)
            } catch (e) {
                const code = e && typeof e === "object" && "code" in e ? e.code : undefined
                if (code === "ESRCH") {
                    fs.rmSync(p, { force: true })
                    console.log("Removed stale Next dev lock")
                } else if (code === "EPERM") {
                    console.log("Next dev lock owned by another user (EPERM), leaving lock")
                } else {
                    console.error("[predev] Unexpected error while probing Next dev lock PID:", e)
                    process.exit(1)
                }
            }
        } else {
            fs.rmSync(p, { force: true })
            console.log("Removed invalid Next dev lock")
        }
    } catch (err) {
        const isSyntax =
            err instanceof SyntaxError ||
            (err && typeof err === "object" && err.name === "SyntaxError")
        if (isSyntax) {
            fs.rmSync(p, { force: true })
            console.log("Removed malformed Next dev lock")
        } else {
            console.error("[predev] Unexpected error while handling Next dev lock:", err)
            process.exit(1)
        }
    }
}

try {
    main()
} catch (err) {
    console.error("[predev] Unhandled error:", err)
    process.exit(1)
}
