import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { UploadEventType } from "../types/index.js"
import {
    requireEventTypes,
    requireRoleIds,
    requireSnowflake,
    requireYoutubeChannelId,
} from "./youtubeAlertRepository.js"

const VALID_CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"
const VALID_SNOWFLAKE = "123456789012345678"

describe("youtubeAlertRepository validators", () => {
    describe("requireSnowflake", () => {
        it("trims and accepts a valid Discord snowflake", () => {
            assert.equal(requireSnowflake(`  ${VALID_SNOWFLAKE}  `, "guildId"), VALID_SNOWFLAKE)
        })

        it("rejects empty, non-digit, and zero values with the field label", () => {
            for (const bad of ["", "   ", "not-a-snowflake", "0", "-1"]) {
                assert.throws(
                    () => requireSnowflake(bad, "discordChannelId"),
                    /invalid Discord snowflake for discordChannelId/
                )
            }
        })
    })

    describe("requireYoutubeChannelId", () => {
        it("accepts a trimmed UC channel id", () => {
            assert.equal(requireYoutubeChannelId(`  ${VALID_CHANNEL_ID}  `), VALID_CHANNEL_ID)
        })

        it("rejects non-UC ids, wrong length, and handles", () => {
            for (const bad of [
                "",
                "UCshort",
                "UCxxxxxxxxxxxxxxxxxxxxxx!", // 22 body chars but invalid trailing
                "UUXuqSBlHAE6Xw-yeJA0Tunw",
                "@somehandle",
                "https://www.youtube.com/channel/" + VALID_CHANNEL_ID,
            ]) {
                assert.throws(() => requireYoutubeChannelId(bad), /invalid YouTube channel id/)
            }
        })
    })

    describe("requireEventTypes", () => {
        it("returns known types and drops unknown strings", () => {
            const mixed = ["video", "not-a-type", "short"] as unknown as UploadEventType[]
            assert.deepEqual(requireEventTypes(mixed), ["video", "short"])
        })

        it("rejects empty and all-unknown inputs so Alerts cannot match nothing", () => {
            assert.throws(() => requireEventTypes([]), /at least one Upload event type/)
            assert.throws(
                () => requireEventTypes(["bogus", "also-bogus"] as unknown as UploadEventType[]),
                /at least one Upload event type/
            )
        })
    })

    describe("requireRoleIds", () => {
        it("accepts an empty list (no mentions)", () => {
            assert.deepEqual(requireRoleIds([]), [])
        })

        it("dedupes while preserving first-seen order after trim", () => {
            assert.deepEqual(
                requireRoleIds([
                    ` ${VALID_SNOWFLAKE} `,
                    "987654321098765432",
                    VALID_SNOWFLAKE,
                    " 987654321098765432 ",
                ]),
                [VALID_SNOWFLAKE, "987654321098765432"]
            )
        })

        it("rejects any invalid role snowflake", () => {
            assert.throws(
                () => requireRoleIds([VALID_SNOWFLAKE, "not-a-role"]),
                /invalid Discord snowflake for mention role/
            )
        })
    })
})
