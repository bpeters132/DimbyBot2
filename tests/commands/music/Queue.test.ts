import assert from "node:assert/strict"
import { describe, it } from "node:test"
import queueCommand from "../../../src/commands/music/Queue.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"

function embedJson(calls: RecordedMessage[]) {
    const embed = calls.find((call) => call.embeds && call.embeds.length > 0)?.embeds?.[0] as
        | {
              data?: {
                  title?: string
                  description?: string
                  fields?: Array<{ name: string; value: string }>
              }
          }
        | undefined
    return embed?.data
}

function track(title: string) {
    return {
        info: {
            title,
            uri: `https://example.com/${title}`,
            duration: 1_000,
        },
    }
}

describe("queue", () => {
    it("tells the user to run it in a server", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: null })
        await queueCommand.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Use this command in a server."))
    })

    it("tells the user the member profile could not be resolved", async () => {
        const { interaction, calls } = createSlashInteraction({ inCachedGuild: false })
        await queueCommand.execute(interaction, createBotClientFake())
        assert.ok(
            messageContents(calls).includes("Could not resolve your member profile. Try again.")
        )
    })

    it("tells the user to join a voice channel", async () => {
        const { interaction, calls } = createSlashInteraction({
            member: { voice: { channel: null } },
        })
        await queueCommand.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Join a voice channel first!"))
    })

    it("tells the user nothing is playing", async () => {
        const { interaction, calls } = createSlashInteraction()
        await queueCommand.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Nothing is playing."))
    })

    it("shows an empty upcoming queue", async () => {
        const player = {
            queue: {
                current: track("Live"),
                tracks: [] as ReturnType<typeof track>[],
            },
        }
        const { interaction, calls } = createSlashInteraction()
        await queueCommand.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        const embed = embedJson(calls)
        assert.equal(embed?.title, "Queue")
        assert.match(embed?.description ?? "", /Live/)
        assert.equal(
            embed?.fields?.find((field) => field.name === "Up Next")?.value,
            "_Queue is empty._"
        )
    })

    it("lists upcoming tracks", async () => {
        const player = {
            queue: {
                current: track("Live"),
                tracks: [track("Later")],
            },
        }
        const { interaction, calls } = createSlashInteraction()
        await queueCommand.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        const embed = embedJson(calls)
        assert.equal(embed?.title, "Queue")
        const upNext = embed?.fields?.find((field) => field.name === "Up Next")?.value ?? ""
        assert.match(upNext, /Later/)
    })
})
