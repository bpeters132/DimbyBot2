import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ALL_UPLOAD_EVENT_TYPES } from "./uploadEventType.js"
import {
    dedupeYtAlertRoleIds,
    resolveYtAlertEventTypes,
    resolveYtAlertMentionRoleIdsUpdate,
    ytAlertTypeFlagsPresent,
} from "./ytAlertCommandOptions.js"

describe("resolveYtAlertEventTypes", () => {
    it("defaults to every known type when no flags are set", () => {
        assert.deepEqual(resolveYtAlertEventTypes({}), [...ALL_UPLOAD_EVENT_TYPES])
        assert.deepEqual(
            resolveYtAlertEventTypes({
                video: null,
                short: undefined,
                premiere: null,
                live: null,
                community: null,
            }),
            [...ALL_UPLOAD_EVENT_TYPES]
        )
    })

    it("keeps only types explicitly set to true", () => {
        assert.deepEqual(resolveYtAlertEventTypes({ video: true, short: false, live: true }), [
            "video",
            "live",
        ])
        assert.deepEqual(resolveYtAlertEventTypes({ community: true }), ["community"])
    })

    it("returns null when flags are present but every value is false", () => {
        assert.equal(
            resolveYtAlertEventTypes({
                video: false,
                short: false,
                premiere: false,
                live: false,
                community: false,
            }),
            null
        )
        assert.equal(resolveYtAlertEventTypes({ short: false }), null)
    })

    it("preserves TYPE_OPTION_NAMES order for mixed selections", () => {
        assert.deepEqual(
            resolveYtAlertEventTypes({
                community: true,
                video: true,
                premiere: true,
            }),
            ["video", "premiere", "community"]
        )
    })
})

describe("ytAlertTypeFlagsPresent", () => {
    it("is false when every type option is unset", () => {
        assert.equal(ytAlertTypeFlagsPresent({}), false)
        assert.equal(
            ytAlertTypeFlagsPresent({
                video: null,
                short: null,
                premiere: null,
                live: null,
                community: null,
            }),
            false
        )
    })

    it("is true when any type option is explicitly true or false", () => {
        assert.equal(ytAlertTypeFlagsPresent({ live: false }), true)
        assert.equal(ytAlertTypeFlagsPresent({ video: true }), true)
    })
})

describe("dedupeYtAlertRoleIds", () => {
    it("skips nullish entries and preserves first-seen order", () => {
        assert.deepEqual(dedupeYtAlertRoleIds([null, "1", undefined, "2", "1", "3", "2"]), [
            "1",
            "2",
            "3",
        ])
        assert.deepEqual(dedupeYtAlertRoleIds([]), [])
        assert.deepEqual(dedupeYtAlertRoleIds([null, undefined, ""]), [])
    })
})

describe("resolveYtAlertMentionRoleIdsUpdate", () => {
    it("clears mentions when clear_roles is set, even if roles were also provided", () => {
        assert.deepEqual(
            resolveYtAlertMentionRoleIdsUpdate({
                clearRoles: true,
                rolesProvided: true,
                collectedRoleIds: ["111", "222"],
            }),
            []
        )
    })

    it("replaces mentions when role options were provided", () => {
        assert.deepEqual(
            resolveYtAlertMentionRoleIdsUpdate({
                clearRoles: false,
                rolesProvided: true,
                collectedRoleIds: ["111"],
            }),
            ["111"]
        )
        assert.deepEqual(
            resolveYtAlertMentionRoleIdsUpdate({
                clearRoles: false,
                rolesProvided: true,
                collectedRoleIds: [],
            }),
            []
        )
    })

    it("leaves mentions unchanged when neither clear nor role options apply", () => {
        assert.equal(
            resolveYtAlertMentionRoleIdsUpdate({
                clearRoles: false,
                rolesProvided: false,
                collectedRoleIds: ["111"],
            }),
            undefined
        )
    })
})
