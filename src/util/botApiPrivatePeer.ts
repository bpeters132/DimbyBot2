/**
 * Optional bot API ingress policy: only accept TCP peers on private LAN (RFC1918) or IPv4 loopback.
 * IPv4 loopback is included so in-container probes (e.g. `wget http://127.0.0.1/health`) still work; it is not RFC1918.
 */

function parseIpv4(host: string): [number, number, number, number] | null {
    const parts = host.split(".")
    if (parts.length !== 4) {
        return null
    }
    const nums: number[] = []
    for (const p of parts) {
        if (p === "" || (p.length > 1 && p.startsWith("0"))) {
            return null
        }
        const n = Number(p)
        if (!Number.isInteger(n) || n < 0 || n > 255) {
            return null
        }
        nums.push(n)
    }
    return [nums[0], nums[1], nums[2], nums[3]]
}

/** True when `BOT_API_REQUIRE_PRIVATE_CLIENT_IP` is set to a truthy flag (1, true, yes, on). */
export function shouldEnforceBotApiPrivateClientIp(): boolean {
    const v = process.env.BOT_API_REQUIRE_PRIVATE_CLIENT_IP?.trim().toLowerCase()
    return v === "1" || v === "true" || v === "yes" || v === "on"
}

/**
 * Returns whether the HTTP/WS peer address is allowed when private-client enforcement is on:
 * RFC1918 IPv4, IPv4 loopback 127.0.0.0/8, IPv6 loopback ::1, or IPv4-mapped variants (e.g. ::ffff:10.0.0.1).
 */
export function isPrivateLanOrLoopbackPeer(remoteAddress: string | undefined): boolean {
    if (!remoteAddress) {
        return false
    }

    let s = remoteAddress.trim()
    if (s.startsWith("::ffff:")) {
        s = s.slice("::ffff:".length)
    }

    if (!s.includes(":")) {
        const parsed = parseIpv4(s)
        if (!parsed) {
            return false
        }
        return isRfc1918OrLoopbackIpv4(parsed[0], parsed[1])
    }

    const lowered = s.toLowerCase()
    return lowered === "::1" || lowered === "0:0:0:0:0:0:0:1"
}

function isRfc1918OrLoopbackIpv4(a: number, b: number): boolean {
    if (a === 10) {
        return true
    }
    if (a === 172 && b >= 16 && b <= 31) {
        return true
    }
    if (a === 192 && b === 168) {
        return true
    }
    if (a === 127) {
        return true
    }
    return false
}
