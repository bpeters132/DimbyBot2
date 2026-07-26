import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { WebPermission } from "./permissions.js"
import {
    dashboardHasAllWebPermissions,
    dashboardHasWebPermission,
    explainDashboardWebPermission,
} from "./dashboard-web-permission.js"

describe("dashboard web permission merge", () => {
    it("allows from primaryPermissions regardless of memberResolved", () => {
        const snapshot = {
            memberResolved: true,
            primaryPermissions: [WebPermission.CONTROL_PLAYBACK],
            oauthPermissions: [],
        }
        assert.equal(
            dashboardHasWebPermission(snapshot, WebPermission.CONTROL_PLAYBACK),
            true
        )
        assert.equal(
            explainDashboardWebPermission(snapshot, WebPermission.CONTROL_PLAYBACK),
            "allow:primaryPermissions"
        )
    })

    it("allows OAuth fallback only when the bot has not resolved a member", () => {
        const unresolved = {
            memberResolved: false,
            primaryPermissions: [],
            oauthPermissions: [WebPermission.MANAGE_QUEUE],
        }
        assert.equal(dashboardHasWebPermission(unresolved, WebPermission.MANAGE_QUEUE), true)
        assert.match(
            explainDashboardWebPermission(unresolved, WebPermission.MANAGE_QUEUE),
            /oauthPermissions/
        )

        const resolved = {
            memberResolved: true,
            primaryPermissions: [],
            oauthPermissions: [WebPermission.MANAGE_QUEUE],
        }
        assert.equal(dashboardHasWebPermission(resolved, WebPermission.MANAGE_QUEUE), false)
        assert.match(
            explainDashboardWebPermission(resolved, WebPermission.MANAGE_QUEUE),
            /memberResolved=true/
        )
    })

    it("denies when neither list includes the permission", () => {
        const snapshot = {
            memberResolved: false,
            primaryPermissions: [WebPermission.VIEW_PLAYER],
            oauthPermissions: [],
        }
        assert.equal(dashboardHasWebPermission(snapshot, WebPermission.MANAGE_QUEUE), false)
        assert.match(
            explainDashboardWebPermission(snapshot, WebPermission.MANAGE_QUEUE),
            /neither primary nor oauth/
        )
    })

    it("requires every permission for dashboardHasAllWebPermissions", () => {
        const snapshot = {
            memberResolved: false,
            primaryPermissions: [WebPermission.VIEW_PLAYER],
            oauthPermissions: [WebPermission.MANAGE_QUEUE],
        }
        assert.equal(
            dashboardHasAllWebPermissions(snapshot, [
                WebPermission.VIEW_PLAYER,
                WebPermission.MANAGE_QUEUE,
            ]),
            true
        )
        assert.equal(
            dashboardHasAllWebPermissions(snapshot, [
                WebPermission.VIEW_PLAYER,
                WebPermission.CONTROL_PLAYBACK,
            ]),
            false
        )
    })
})
