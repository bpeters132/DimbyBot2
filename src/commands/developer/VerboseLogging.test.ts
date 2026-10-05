import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import verboseLogging from "./VerboseLogging.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
} from "../../test-support/commandFakes.js"

const OWNER = "owner-1"
const previousOwner = process.env.OWNER_ID

afterEach(() => {
    if (previousOwner === undefined) delete process.env.OWNER_ID
    else process.env.OWNER_ID = previousOwner
})

function texts(calls: Parameters<typeof messageContents>[0]): string[] {
    return messageContents(calls).filter((value): value is string => typeof value === "string")
}

function logger(initial = false) {
    let enabled = initial
    return {
        setDebugEnabled(next: boolean) {
            enabled = next
        },
        getDebugEnabled() {
            return enabled
        },
    }
}

describe("verboselogging", () => {
    it("reports a missing developer id", async () => {
        delete process.env.OWNER_ID
        const { interaction, calls } = createSlashInteraction({ subcommand: "status" })
        await verboseLogging.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Command configuration error: Developer ID not set."])
    })

    it("denies users who are not the owner", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({
            userId: "someone-else",
            subcommand: "status",
        })
        await verboseLogging.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Sorry, this command can only be used by the bot developer.",
        ])
    })

    it("reports when the logger cannot be toggled", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "status",
        })
        await verboseLogging.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Logger is not available to toggle verbose logging."])
    })

    it("confirms verbose logging was enabled", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "enable",
        })
        await verboseLogging.execute(
            interaction,
            createBotClientFake({
                logger: logger(false) as NonNullable<
                    Parameters<typeof createBotClientFake>[0]
                >["logger"],
            })
        )
        assert.deepEqual(texts(calls), ["✅ Verbose logging enabled for this process."])
    })

    it("confirms verbose logging was disabled", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "disable",
        })
        await verboseLogging.execute(
            interaction,
            createBotClientFake({
                logger: logger(true) as NonNullable<
                    Parameters<typeof createBotClientFake>[0]
                >["logger"],
            })
        )
        assert.deepEqual(texts(calls), ["✅ Verbose logging disabled for this process."])
    })

    it("reports that verbose logging is enabled", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "status",
        })
        await verboseLogging.execute(
            interaction,
            createBotClientFake({
                logger: logger(true) as NonNullable<
                    Parameters<typeof createBotClientFake>[0]
                >["logger"],
            })
        )
        assert.deepEqual(texts(calls), ["Verbose logging is currently enabled."])
    })

    it("reports that verbose logging is disabled", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "status",
        })
        await verboseLogging.execute(
            interaction,
            createBotClientFake({
                logger: logger(false) as NonNullable<
                    Parameters<typeof createBotClientFake>[0]
                >["logger"],
            })
        )
        assert.deepEqual(texts(calls), ["Verbose logging is currently disabled."])
    })
})
