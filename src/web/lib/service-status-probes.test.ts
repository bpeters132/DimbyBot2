import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    DATABASE_PROBE_UNREACHABLE,
    SERVICE_STATUS_CRASH_MESSAGE,
    mapBotApiOriginProbeMessage,
    mapBotHealthProbeFailure,
    mapServiceStatusProbeCrash,
} from "@/lib/service-status-probes.js"

describe("mapBotApiOriginProbeMessage", () => {
    it("distinguishes invalid, unset, and unusable origins so ops can fix the right env", () => {
        assert.equal(
            mapBotApiOriginProbeMessage("invalid_parse"),
            "API_PROXY_TARGET is invalid; cannot probe bot /health."
        )
        assert.equal(
            mapBotApiOriginProbeMessage("unset"),
            "API_PROXY_TARGET is not set; cannot probe bot /health in this environment."
        )
        assert.equal(
            mapBotApiOriginProbeMessage("invalid_origin"),
            "API_PROXY_TARGET is not a valid origin; cannot probe bot /health."
        )
    })
})

describe("mapBotHealthProbeFailure", () => {
    it("reports non-ok HTTP status codes from /health", () => {
        assert.equal(
            mapBotHealthProbeFailure({ kind: "http", status: 503 }),
            "Bot /health returned HTTP 503"
        )
        assert.equal(
            mapBotHealthProbeFailure({ kind: "http", status: 500 }),
            "Bot /health returned HTTP 500"
        )
    })

    it("distinguishes abort timeouts from other fetch failures", () => {
        assert.equal(
            mapBotHealthProbeFailure({ kind: "timeout" }),
            "Timed out connecting to bot /health"
        )
        assert.equal(
            mapBotHealthProbeFailure({ kind: "request_failed" }),
            "Bot /health request failed"
        )
    })
})

describe("mapServiceStatusProbeCrash", () => {
    it("returns a fail-closed 503-shaped payload without marking either probe ok", () => {
        const payload = mapServiceStatusProbeCrash("2026-09-29T10:00:00.000Z")
        assert.deepEqual(payload, {
            ok: false,
            checkedAt: "2026-09-29T10:00:00.000Z",
            database: { ok: false, message: SERVICE_STATUS_CRASH_MESSAGE },
            botApi: { ok: false, message: SERVICE_STATUS_CRASH_MESSAGE },
        })
        assert.equal(payload.ok, false)
        assert.equal(payload.database.ok, false)
        assert.equal(payload.botApi.ok, false)
    })
})

describe("DATABASE_PROBE_UNREACHABLE", () => {
    it("keeps a stable operator message for any database probe catch", () => {
        assert.equal(DATABASE_PROBE_UNREACHABLE, "Database unreachable")
    })
})
