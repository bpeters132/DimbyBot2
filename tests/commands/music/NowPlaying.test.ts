import assert from "node:assert/strict"
import { describe, it } from "node:test"
import nowPlaying from "../../../src/commands/music/NowPlaying.js"
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

describe("nowplaying", () => {
    it("tells the user to run it in a server", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: null })
        await nowPlaying.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Use this command in a server."))
    })

    it("tells the user the member profile could not be resolved", async () => {
        const { interaction, calls } = createSlashInteraction({ inCachedGuild: false })
        await nowPlaying.execute(interaction, createBotClientFake())
        assert.ok(
            messageContents(calls).includes("Could not resolve your member profile. Try again.")
        )
    })

    it("tells the user to join a voice channel", async () => {
        const { interaction, calls } = createSlashInteraction({
            member: { voice: { channel: null } },
        })
        await nowPlaying.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Join a voice channel first!"))
    })

    it("tells the user nothing is playing", async () => {
        const { interaction, calls } = createSlashInteraction()
        await nowPlaying.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Nothing is playing."))
    })

    it("shows the Lavalink now playing embed", async () => {
        const player = {
            position: 5_000,
            node: { id: "node-a" },
            queue: {
                current: {
                    info: {
                        title: "Song",
                        uri: "https://example.com/song",
                        duration: 125_000,
                        author: "Artist",
                        sourceName: "youtube",
                        identifier: "dQw4w9wgxcQ",
                    },
                    requester: "user-9",
                },
            },
        }
        const { interaction, calls } = createSlashInteraction()
        await nowPlaying.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        const embed = embedJson(calls)
        assert.equal(embed?.title, "Now Playing (Lavalink)")
        assert.match(embed?.description ?? "", /Song/)
        assert.equal(embed?.fields?.find((field) => field.name === "Source")?.value, "YouTube")
    })
})
