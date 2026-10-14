import assert from "node:assert/strict"
import { after, before, describe, it, mock } from "node:test"
import {
    getSessionClearEpochForTests,
    setPlayerSessionPersistenceDbForTests,
} from "../../../src/util/playerSessionPersistence.js"
import { createBotClientFake, createSlashInteraction } from "../../test-support/commandFakes.js"

const localGuilds = new Set<string>()

mock.module("../../../src/util/localPlayer.js", {
    namedExports: {
        getLocalPlayerState(guildId: string) {
            if (!localGuilds.has(guildId)) return null
            return {
                isPlaying: true,
                trackTitle: "local-track",
                requesterId: "user-1",
                startedAt: Date.now(),
            }
        },
        stopLocalPlayer(_client: unknown, guildId: string) {
            if (!localGuilds.has(guildId)) return false
            localGuilds.delete(guildId)
            return true
        },
        cancelPendingLocalPlay() {
            /* no-op */
        },
        isPendingLocalPlay() {
            return false
        },
    },
})

const { default: stop } = await import("../../../src/commands/music/Stop.js")

describe("stop force-clears session after local-only teardown", () => {
    before(() => {
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async () => undefined,
            upsertPlayerSession: async () => undefined,
        })
    })

    after(() => {
        setPlayerSessionPersistenceDbForTests(null)
        localGuilds.clear()
    })

    it("deletes the leftover session row when stopping local with no Lavalink player", async () => {
        // Preserve-prior LocalHandoffReady leaves the fuller snapshot; /leave force-clears
        // on the absent path, but /stop previously only cleared via Lavalink destroy.
        const guildId = "guild-1"
        const deletes: string[] = []
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async (id) => {
                deletes.push(id)
            },
            upsertPlayerSession: async () => undefined,
        })
        localGuilds.add(guildId)
        const epochBefore = getSessionClearEpochForTests(guildId)

        const { interaction } = createSlashInteraction({
            guild: {
                id: guildId,
                members: {
                    me: {
                        voice: {
                            channelId: "voice-1",
                            channel: { id: "voice-1" },
                        },
                    },
                },
            } as { id: string },
        })
        await stop.execute(interaction, createBotClientFake())

        assert.deepEqual(deletes, [guildId])
        assert.equal(getSessionClearEpochForTests(guildId), epochBefore + 1)
        assert.equal(localGuilds.has(guildId), false)
    })
})
