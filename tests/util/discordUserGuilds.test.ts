import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import {
    GUILD_LIST_MAX_RETRY_WAIT_MS,
    discordRetryAfterMs,
    fetchDiscordUserGuilds,
    guildListExponentialBackoffMs,
    isDiscordUserGuildRow,
    parseDiscordUserGuildsPayload,
} from "../../src/util/discordUserGuilds.js"

const previousFetch = globalThis.fetch
let tokenSeq = 0

function uniqueToken(): string {
    tokenSeq += 1
    return `oauth-token-${tokenSeq}-${Date.now()}`
}

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    })
}

function stubFetch(impl: typeof fetch) {
    globalThis.fetch = impl
}

afterEach(() => {
    globalThis.fetch = previousFetch
})

describe("isDiscordUserGuildRow", () => {
    it("accepts id/name with string or null icon", () => {
        assert.equal(isDiscordUserGuildRow({ id: "1", name: "A", icon: null }), true)
        assert.equal(isDiscordUserGuildRow({ id: "1", name: "A", icon: "abc" }), true)
    })

    it("rejects missing fields, wrong types, and non-objects", () => {
        assert.equal(isDiscordUserGuildRow(null), false)
        assert.equal(isDiscordUserGuildRow("guild"), false)
        assert.equal(isDiscordUserGuildRow({ id: 1, name: "A", icon: null }), false)
        assert.equal(isDiscordUserGuildRow({ id: "1", name: 2, icon: null }), false)
        assert.equal(isDiscordUserGuildRow({ id: "1", name: "A", icon: 3 }), false)
        assert.equal(isDiscordUserGuildRow({ name: "A", icon: null }), false)
        // icon must be present as string|null (undefined omitted keys fail closed)
        assert.equal(isDiscordUserGuildRow({ id: "1", name: "A" }), false)
    })
})

describe("parseDiscordUserGuildsPayload", () => {
    it("maps a valid array", () => {
        const parsed = parseDiscordUserGuildsPayload([
            { id: "10", name: "Alpha", icon: null },
            { id: "11", name: "Beta", icon: "hash" },
        ])
        assert.deepEqual(parsed, {
            ok: true,
            guilds: [
                { id: "10", name: "Alpha", icon: null },
                { id: "11", name: "Beta", icon: "hash" },
            ],
        })
    })

    it("rejects non-arrays and any malformed element (fail closed)", () => {
        assert.deepEqual(parseDiscordUserGuildsPayload({ id: "1", name: "A", icon: null }), {
            ok: false,
        })
        assert.deepEqual(
            parseDiscordUserGuildsPayload([
                { id: "1", name: "A", icon: null },
                { id: "2", name: "B" },
            ]),
            { ok: false }
        )
        assert.deepEqual(parseDiscordUserGuildsPayload([null]), { ok: false })
    })
})

describe("guildListExponentialBackoffMs", () => {
    it("doubles from 500ms and caps at the max retry wait", () => {
        assert.equal(guildListExponentialBackoffMs(1), 500)
        assert.equal(guildListExponentialBackoffMs(2), 1000)
        assert.equal(guildListExponentialBackoffMs(3), 2000)
        assert.equal(guildListExponentialBackoffMs(7), 32_000)
        assert.equal(guildListExponentialBackoffMs(8), GUILD_LIST_MAX_RETRY_WAIT_MS)
        assert.equal(guildListExponentialBackoffMs(20), GUILD_LIST_MAX_RETRY_WAIT_MS)
        assert.equal(guildListExponentialBackoffMs(0), 500)
        assert.equal(guildListExponentialBackoffMs(-5), 500)
    })
})

describe("discordRetryAfterMs", () => {
    function headers(map: Record<string, string | null>) {
        return {
            get(name: string) {
                const key = name.toLowerCase()
                return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null
            },
        }
    }

    it("prefers Retry-After header seconds and caps at max wait", () => {
        assert.equal(discordRetryAfterMs({ headers: headers({ "retry-after": "1.2" }) }, ""), 1200)
        assert.equal(
            discordRetryAfterMs({ headers: headers({ "retry-after": "999" }) }, ""),
            GUILD_LIST_MAX_RETRY_WAIT_MS
        )
        assert.equal(discordRetryAfterMs({ headers: headers({ "retry-after": "0" }) }, ""), 0)
    })

    it("falls back to JSON retry_after when the header is missing or invalid", () => {
        assert.equal(
            discordRetryAfterMs({ headers: headers({}) }, JSON.stringify({ retry_after: 2.4 })),
            2400
        )
        assert.equal(
            discordRetryAfterMs(
                { headers: headers({ "retry-after": "nope" }) },
                JSON.stringify({ retry_after: 3 })
            ),
            3000
        )
    })

    it("defaults to 2s when neither header nor body provides a delay", () => {
        assert.equal(discordRetryAfterMs({ headers: headers({}) }, "not-json"), 2000)
        assert.equal(discordRetryAfterMs({ headers: headers({}) }, "{}"), 2000)
        assert.equal(
            discordRetryAfterMs({ headers: headers({}) }, JSON.stringify({ retry_after: "soon" })),
            2000
        )
    })
})

describe("fetchDiscordUserGuilds", () => {
    it("returns parsed guilds and Authorization bearer on success", async () => {
        const token = uniqueToken()
        const guilds = [{ id: "10", name: "Alpha", icon: null }]
        let authHeader: string | null = null
        stubFetch(async (_input, init) => {
            authHeader = new Headers(init?.headers).get("authorization")
            return jsonResponse(200, guilds)
        })

        const result = await fetchDiscordUserGuilds(token)
        assert.deepEqual(result, { ok: true, guilds })
        assert.equal(authHeader, `Bearer ${token}`)
    })

    it("reuses a successful fetch for the same token without a second Discord call", async () => {
        const token = uniqueToken()
        let calls = 0
        stubFetch(async () => {
            calls += 1
            return jsonResponse(200, [{ id: "11", name: "Cached", icon: "hash" }])
        })

        const first = await fetchDiscordUserGuilds(token)
        const second = await fetchDiscordUserGuilds(token)
        assert.equal(calls, 1)
        assert.deepEqual(first, second)
        assert.equal(first.ok, true)
    })

    it("does not cache 401/403/5xx failures so a later call hits Discord again", async () => {
        const token = uniqueToken()
        const statuses = [401, 403, 502]
        stubFetch(async () => jsonResponse(statuses.shift() ?? 500, { message: "nope" }))

        const expired = await fetchDiscordUserGuilds(token)
        assert.equal(expired.ok, false)
        if (expired.ok === false) {
            assert.equal(expired.status, 401)
            assert.match(expired.message, /expired or revoked/i)
        }

        const denied = await fetchDiscordUserGuilds(token)
        assert.equal(denied.ok, false)
        if (denied.ok === false) {
            assert.equal(denied.status, 403)
            assert.match(denied.message, /guilds` scope/i)
        }

        const upstream = await fetchDiscordUserGuilds(token)
        assert.equal(upstream.ok, false)
        if (upstream.ok === false) {
            assert.equal(upstream.status, 502)
            assert.equal(upstream.message, "Discord API returned HTTP 502.")
        }
    })

    it("rejects a 200 body that is not a valid guild array (fail closed, status 0)", async () => {
        const token = uniqueToken()
        stubFetch(async () => jsonResponse(200, { id: "10", name: "not-an-array" }))
        const result = await fetchDiscordUserGuilds(token)
        assert.deepEqual(result, {
            ok: false,
            status: 0,
            message: "invalid-discord-guilds-response",
        })
    })

    it("coalesces concurrent calls for the same token into one Discord fetch", async () => {
        const token = uniqueToken()
        let calls = 0
        let release: ((value: Response) => void) | undefined
        let fetchEntered!: () => void
        const entered = new Promise<void>((resolve) => {
            fetchEntered = resolve
        })
        stubFetch(async () => {
            calls += 1
            fetchEntered()
            return await new Promise<Response>((resolve) => {
                release = resolve
            })
        })

        const pendingA = fetchDiscordUserGuilds(token)
        await entered
        const pendingB = fetchDiscordUserGuilds(token)
        assert.equal(calls, 1)
        assert.ok(release)
        release(jsonResponse(200, [{ id: "12", name: "Together", icon: null }]))

        const [a, b] = await Promise.all([pendingA, pendingB])
        assert.equal(calls, 1)
        assert.deepEqual(a, b)
        assert.equal(a.ok, true)
    })
})
