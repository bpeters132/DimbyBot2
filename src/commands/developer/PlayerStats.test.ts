import assert from "node:assert/strict"
import { afterEach, describe, it, mock } from "node:test"
import { EmbedBuilder } from "discord.js"
import playerStats from "./PlayerStats.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"

const OWNER = "owner-1"
const previousOwner = process.env.OWNER_ID

afterEach(() => {
    if (previousOwner === undefined) delete process.env.OWNER_ID
    else process.env.OWNER_ID = previousOwner
})

function texts(calls: RecordedMessage[]): string[] {
    return messageContents(calls).filter((value): value is string => typeof value === "string")
}

function embedData(calls: RecordedMessage[]): { title?: string; description?: string } | undefined {
    for (const call of calls) {
        const embed = call.embeds?.[0] as
            | { data?: { title?: string; description?: string } }
            | undefined
        if (embed?.data) return embed.data
    }
    return undefined
}

describe("playerstats", () => {
    it("reports a missing developer id", async () => {
        delete process.env.OWNER_ID
        const { interaction, calls } = createSlashInteraction()
        await playerStats.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Command configuration error: Developer ID not set."])
    })

    it("denies users who are not the owner", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({ userId: "someone-else" })
        await playerStats.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Sorry, this command can only be used by the bot developer.",
        ])
    })

    it("says when no players are active", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({ userId: OWNER })
        await playerStats.execute(interaction, createBotClientFake())
        const embed = embedData(calls)
        assert.equal(embed?.title, "📊 Active Lavalink Players")
        assert.equal(embed?.description, "No active players found.")
    })

    it("lists a guild name and an unavailable guild id", async () => {
        process.env.OWNER_ID = OWNER
        const players = new Map<string, unknown>([
            ["known", { guildId: "known" }],
            ["missing", { guildId: "missing" }],
        ])
        const guilds = new Map<string, unknown>([["known", { name: "Radio" }]])
        const { interaction, calls } = createSlashInteraction({ userId: OWNER })
        await playerStats.execute(interaction, createBotClientFake({ players, guilds }))
        const description = embedData(calls)?.description ?? ""
        assert.match(description, /Total Players: 2/)
        assert.match(description, /Radio/)
        assert.match(description, /Guild ID: missing \(Name Unavailable\)/)
    })

    it("truncates a description that exceeds Discord's limit", async () => {
        process.env.OWNER_ID = OWNER
        mock.method(
            EmbedBuilder.prototype,
            "setDescription",
            function (this: EmbedBuilder, description: string) {
                this.data.description = description
                return this
            }
        )
        const players = new Map<string, unknown>()
        const guilds = new Map<string, unknown>()
        for (let index = 0; index < 80; index += 1) {
            const id = `g${index}`
            players.set(id, { guildId: id })
            guilds.set(id, { name: "N".repeat(80) })
        }
        const { interaction, calls } = createSlashInteraction({ userId: OWNER })
        await playerStats.execute(interaction, createBotClientFake({ players, guilds }))
        assert.match(embedData(calls)?.description ?? "", /\n\.\.\. \(list truncated\)$/)
        mock.restoreAll()
    })
})
