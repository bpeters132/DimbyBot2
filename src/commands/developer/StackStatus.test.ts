import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it, mock } from "node:test"
import stackStatus from "./StackStatus.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"

const OWNER = "owner-1"
const previousOwner = process.env.OWNER_ID
const previousKey = process.env.INVIDIOUS_COMPANION_KEY
const previousFetch = globalThis.fetch

beforeEach(() => {
    mock.timers.enable({ apis: ["setTimeout"] })
})

afterEach(() => {
    mock.timers.reset()
    if (previousOwner === undefined) delete process.env.OWNER_ID
    else process.env.OWNER_ID = previousOwner
    if (previousKey === undefined) delete process.env.INVIDIOUS_COMPANION_KEY
    else process.env.INVIDIOUS_COMPANION_KEY = previousKey
    globalThis.fetch = previousFetch
})

function texts(calls: RecordedMessage[]): string[] {
    return messageContents(calls).filter((value): value is string => typeof value === "string")
}

function embedData(
    calls: RecordedMessage[]
): { title?: string; fields?: { name: string; value: string }[] } | undefined {
    for (const call of calls) {
        const embed = call.embeds?.[0] as
            | { data?: { title?: string; fields?: { name: string; value: string }[] } }
            | undefined
        if (embed?.data) return embed.data
    }
    return undefined
}

function stubFetch() {
    globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch
}

describe("stackstatus", () => {
    it("reports a missing developer id", async () => {
        delete process.env.OWNER_ID
        const { interaction, calls } = createSlashInteraction()
        await stackStatus.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Command configuration error: Developer ID not set."])
    })

    it("denies users who are not the owner", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({ userId: "someone-else" })
        await stackStatus.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Sorry, this command can only be used by the bot developer.",
        ])
    })

    it("shows a stack status embed when the companion key is the right length", async () => {
        process.env.OWNER_ID = OWNER
        process.env.INVIDIOUS_COMPANION_KEY = "abcdefghijklmnop"
        stubFetch()
        const { interaction, calls } = createSlashInteraction({ userId: OWNER })
        await stackStatus.execute(interaction, createBotClientFake())
        const embed = embedData(calls)
        assert.equal(embed?.title, "Stack status")
        const key = embed?.fields?.find((field) => field.name === "INVIDIOUS_COMPANION_KEY")
        assert.equal(key?.value, "length 16 alphanumeric")
        assert.match(
            embed?.fields?.find((field) => field.name === "Postgres")?.value ?? "",
            /^down/
        )
    })

    it("shows when the companion key is missing or the wrong length", async () => {
        process.env.OWNER_ID = OWNER
        delete process.env.INVIDIOUS_COMPANION_KEY
        stubFetch()
        const { interaction, calls } = createSlashInteraction({ userId: OWNER })
        await stackStatus.execute(interaction, createBotClientFake())
        const embed = embedData(calls)
        const key = embed?.fields?.find((field) => field.name === "INVIDIOUS_COMPANION_KEY")
        assert.equal(key?.value, "missing or not 16 alphanumeric")
    })
})
