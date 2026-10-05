import assert from "node:assert/strict"
import { describe, it } from "node:test"
import ping from "../../../src/commands/admin/Ping.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"

function embedTitle(calls: RecordedMessage[]): string | undefined {
    for (const call of calls) {
        const embed = call.embeds?.[0] as { data?: { title?: string } } | undefined
        if (embed?.data?.title) return embed.data.title
    }
    return undefined
}

describe("ping", () => {
    it("replies Pinging while it measures latency", async () => {
        const { interaction, calls } = createSlashInteraction()
        const client = createBotClientFake()
        await ping.execute(interaction, client)
        assert.equal(messageContents(calls)[0], "Pinging...")
    })

    it("edits the reply to an embed titled Pong!", async () => {
        const { interaction, calls } = createSlashInteraction()
        const client = createBotClientFake()
        await ping.execute(interaction, client)
        assert.equal(embedTitle(calls), "Pong!")
    })
})
