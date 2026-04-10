import fs from "fs"

const p = ".next/dev/lock"
if (!fs.existsSync(p)) {
    process.exit(0)
}
try {
    const lock = JSON.parse(fs.readFileSync(p, "utf8"))
    if (lock && typeof lock.pid === "number") {
        try {
            process.kill(lock.pid, 0)
            console.log("Next dev lock active for PID", lock.pid)
        } catch (e) {
            const code = e && typeof e === "object" && "code" in e ? e.code : undefined
            if (code === "ESRCH") {
                fs.rmSync(p, { force: true })
                console.log("Removed stale Next dev lock")
            } else {
                throw e
            }
        }
    } else {
        fs.rmSync(p, { force: true })
        console.log("Removed invalid Next dev lock")
    }
} catch {
    fs.rmSync(p, { force: true })
    console.log("Removed unreadable Next dev lock")
}
