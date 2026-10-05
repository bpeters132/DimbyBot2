import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const state = {
    mode: "ok" as "ok" | "throw",
}

mock.module("@/server/fetch-bot-api", {
    namedExports: {
        serverFetchBot: async () => {
            if (state.mode === "throw") throw new Error("bot down")
            return new Response(
                JSON.stringify({
                    ok: true,
                    data: { guilds: [{ id: "100000000000000001", name: "Friends" }] },
                }),
                { status: 200, headers: { "content-type": "application/json" } }
            )
        },
    },
})

const { loadGuildListForDashboard, getGuildListAction } = await import("./guild.actions.js")

describe("guild list actions", () => {
    it("returns the parsed guild list", async () => {
        state.mode = "ok"
        const result = await loadGuildListForDashboard()
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.guilds[0]?.name, "Friends")
    })

    it("returns the same guild list from the client action", async () => {
        state.mode = "ok"
        const result = await getGuildListAction()
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.data.guilds[0]?.id, "100000000000000001")
    })

    it("returns a fetch failure from the dashboard loader", async () => {
        state.mode = "throw"
        const result = await loadGuildListForDashboard()
        assert.deepEqual(result, { ok: false, error: "Unable to fetch bot data." })
    })

    it("returns a fetch failure from the client action", async () => {
        state.mode = "throw"
        const result = await getGuildListAction()
        assert.deepEqual(result, { ok: false, error: "Unable to fetch bot data." })
    })
})
