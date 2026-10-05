import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { setPlayerSessionPersistenceDbForTests } from "../../util/playerSessionPersistence.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type FakeBotClient,
    type FakeInteractionInput,
} from "../../test-support/commandFakes.js"
import playNext from "./PlayNext.js"

setPlayerSessionPersistenceDbForTests({
    upsertPlayerSession: async () => undefined,
    deletePlayerSession: async () => undefined,
})

function botVoiceGuild(channelId: string | null) {
    return {
        id: "guild-1",
        members: {
            fetchMe: async () => ({
                voice: { channel: channelId ? { id: channelId } : null },
            }),
        },
    } as { id: string }
}

function trackResult(loadType = "track", tracks: unknown[] = [sampleTrack()]) {
    return { loadType, tracks }
}

function sampleTrack() {
    return {
        info: {
            title: "Song",
            uri: "https://example.com/song",
            author: "Artist",
            sourceName: "http",
            identifier: "song",
        },
    }
}

function searchablePlayer(search: () => Promise<unknown>) {
    return {
        guildId: "guild-1",
        voiceChannelId: "voice-1",
        get: () => undefined,
        search,
        queue: {
            tracks: [] as unknown[],
            current: null,
            add: async () => undefined,
        },
    }
}

function putPlayer(client: FakeBotClient, player: unknown) {
    ;(client.lavalink.players as unknown as Map<string, unknown>).set("guild-1", player)
}

async function executePlayNext(
    input: FakeInteractionInput = {},
    prepare?: (client: FakeBotClient) => void
) {
    const { interaction, calls } = createSlashInteraction({
        ...input,
        options: { query: "song", ...input.options },
    })
    const client = createBotClientFake()
    prepare?.(client)
    await playNext.execute(interaction, client)
    return calls
}

describe("playnext replies", () => {
    it("tells you to use the command in a server", async () => {
        const calls = await executePlayNext({ guild: null })
        assert.deepEqual(messageContents(calls), ["Use this command in a server."])
    })

    it("tells you when your member profile cannot be resolved", async () => {
        const calls = await executePlayNext({ inCachedGuild: false })
        assert.deepEqual(messageContents(calls), [
            "Could not resolve your member profile. Try again.",
        ])
    })

    it("tells you to join a voice channel", async () => {
        const calls = await executePlayNext({ member: { voice: { channel: null } } })
        assert.deepEqual(messageContents(calls), ["Join a voice channel first!"])
    })

    it("rejects a private media URL", async () => {
        const calls = await executePlayNext({
            options: { query: "http://localhost/secret.mp3" },
        })
        assert.deepEqual(messageContents(calls), ["That URL isn't allowed."])
    })

    it("tells you when the guild has no player", async () => {
        const calls = await executePlayNext()
        assert.deepEqual(messageContents(calls), ["No player found for this guild."])
    })

    it("denies playnext when you are not in the bot voice channel", async () => {
        const player = searchablePlayer(async () => trackResult())
        const calls = await executePlayNext({ guild: botVoiceGuild("voice-2") }, (client) => {
            putPlayer(client, player)
        })
        assert.deepEqual(messageContents(calls), [
            "You must be in the same voice channel as the bot to use this command.",
        ])
    })

    it("tells you when the player was replaced", async () => {
        const player = searchablePlayer(async () => trackResult())
        const calls = await executePlayNext({ guild: botVoiceGuild("voice-1") }, (client) => {
            let reads = 0
            putPlayer(client, player)
            const lavalink = client.lavalink as unknown as {
                getPlayer: (guildId: string) => unknown
            }
            lavalink.getPlayer = () => {
                reads += 1
                return reads === 1 ? player : { id: "successor" }
            }
        })
        assert.deepEqual(messageContents(calls), ["The player was replaced. Try again."])
    })

    it("tells you when search throws", async () => {
        const player = searchablePlayer(async () => {
            throw new Error("lavalink down")
        })
        const calls = await executePlayNext({ guild: botVoiceGuild("voice-1") }, (client) => {
            putPlayer(client, player)
        })
        assert.deepEqual(messageContents(calls), ["Search failed. Try again in a moment."])
    })

    it("tells you when search returns no tracks", async () => {
        const player = searchablePlayer(async () => trackResult("track", []))
        const calls = await executePlayNext({ guild: botVoiceGuild("voice-1") }, (client) => {
            putPlayer(client, player)
        })
        assert.deepEqual(messageContents(calls), ["No tracks found or an error occurred."])
    })

    it("refuses playlists", async () => {
        const player = searchablePlayer(async () => trackResult("playlist", [sampleTrack()]))
        const calls = await executePlayNext({ guild: botVoiceGuild("voice-1") }, (client) => {
            putPlayer(client, player)
        })
        assert.deepEqual(messageContents(calls), ["Playlists are not supported for this command."])
    })

    it("tells you when the player stops before enqueue", async () => {
        const player = searchablePlayer(async () => trackResult())
        const calls = await executePlayNext({ guild: botVoiceGuild("voice-1") }, (client) => {
            let reads = 0
            putPlayer(client, player)
            const lavalink = client.lavalink as unknown as {
                getPlayer: (guildId: string) => unknown
            }
            lavalink.getPlayer = () => {
                reads += 1
                return reads < 3 ? player : undefined
            }
        })
        assert.deepEqual(messageContents(calls), [
            "The player stopped before the track could be queued. Try again.",
        ])
    })

    it("confirms the track was added to the top of the queue", async () => {
        const player = searchablePlayer(async () => trackResult())
        const calls = await executePlayNext({ guild: botVoiceGuild("voice-1") }, (client) => {
            putPlayer(client, player)
        })
        assert.deepEqual(messageContents(calls), [
            "Added [Song](https://example.com/song) to the top of the queue.",
        ])
    })
})
