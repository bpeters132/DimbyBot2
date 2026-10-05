import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const state = {
    guard: { ok: true as const } as
        | { ok: true }
        | { ok: false; status: number; error: string; details?: string },
}

mock.module("../../../../src/shared/api-auth.js", {
    namedExports: {
        requireDeveloperAccess: async () => state.guard,
    },
})

mock.module("../../../../src/lib/botClientRegistry.js", {
    namedExports: {
        getBotClient: () => ({
            guilds: {
                cache: new Map([
                    [
                        "100000000000000002",
                        { id: "100000000000000002", name: "Beta", memberCount: 2 },
                    ],
                    [
                        "100000000000000001",
                        { id: "100000000000000001", name: "Alpha", memberCount: 4 },
                    ],
                ]),
            },
            lavalink: {
                players: new Map([
                    [
                        "100000000000000001",
                        {
                            guildId: "100000000000000001",
                            playing: true,
                            paused: false,
                            queue: {
                                tracks: [{}],
                                current: {
                                    info: {
                                        title: "Song",
                                        author: "Artist",
                                        uri: "https://example.com/s",
                                    },
                                },
                            },
                        },
                    ],
                ]),
                nodeManager: { nodes: { size: 1 } },
            },
        }),
    },
})

const { adminMetricsGET } = await import("../../../../src/botApi/handlers/admin/metrics.js")

describe("adminMetricsGET", () => {
    it("returns the developer access failure", async () => {
        state.guard = { ok: false, status: 403, error: "Forbidden", details: "Developers only." }
        const result = await adminMetricsGET(new Headers())
        assert.equal(result.status, 403)
        assert.equal(result.body.ok === false && result.body.error.error, "Forbidden")
        state.guard = { ok: true }
    })

    it("returns guild and player summaries", async () => {
        const result = await adminMetricsGET(new Headers())
        assert.equal(result.status, 200)
        if (result.body.ok) {
            assert.equal(result.body.data.guilds[0]?.guildName, "Alpha")
            assert.equal(result.body.data.players[0]?.currentTrack?.title, "Song")
            assert.equal(result.body.data.nodeCount, 1)
        }
    })
})
