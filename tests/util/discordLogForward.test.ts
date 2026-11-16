import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { GuildDiscordLogSettings } from "../../src/types/index.js"
import {
    discordLogLevelAllowed,
    logMessageBelongsToGuild,
    resolveDiscordLogChannelId,
} from "../../src/util/discordLogForward.js"

describe("resolveDiscordLogChannelId", () => {
    it("prefers per-level overrides over allChannelId", () => {
        const cfg: GuildDiscordLogSettings = {
            allChannelId: "all-chan",
            byLevel: { error: "error-chan", warn: "warn-chan" },
        }
        assert.equal(resolveDiscordLogChannelId(cfg, "error"), "error-chan")
        assert.equal(resolveDiscordLogChannelId(cfg, "warn"), "warn-chan")
        assert.equal(resolveDiscordLogChannelId(cfg, "info"), "all-chan")
        assert.equal(resolveDiscordLogChannelId(cfg, "debug"), "all-chan")
    })

    it("returns null when neither per-level nor allChannelId is set", () => {
        assert.equal(resolveDiscordLogChannelId({}, "error"), null)
        assert.equal(resolveDiscordLogChannelId({ byLevel: {} }, "info"), null)
    })
})

describe("logMessageBelongsToGuild", () => {
    const guildA = "123456789012345678"
    const guildB = "987654321098765432"

    it("requires the guild snowflake to appear as its own digit run", () => {
        assert.equal(
            logMessageBelongsToGuild(
                `[MusicManager] handleQueryAndPlay called for guild ${guildA}. Query: "song"`,
                guildA
            ),
            true
        )
        assert.equal(
            logMessageBelongsToGuild(
                `[MusicManager] handleQueryAndPlay called for guild ${guildA}. Query: "song"`,
                guildB
            ),
            false
        )
    })

    it("rejects process-wide logs with no guild id (prevents cross-tenant fan-out)", () => {
        assert.equal(
            logMessageBelongsToGuild("[Database] Database connection verified.", guildA),
            false
        )
        assert.equal(logMessageBelongsToGuild("Lavalink Node main CONNECTED", guildA), false)
    })

    it("rejects invalid guild ids and substring digit matches", () => {
        assert.equal(logMessageBelongsToGuild(`guild ${guildA}`, ""), false)
        assert.equal(logMessageBelongsToGuild(`guild ${guildA}`, "not-a-snowflake"), false)
        assert.equal(logMessageBelongsToGuild(`id ${guildA}9`, guildA), false)
    })

    it("does not route a quoted query that contains another guild snowflake", () => {
        const line = `[MusicManager] handleQueryAndPlay called for guild ${guildA}. Query: "${guildB}"`
        assert.equal(logMessageBelongsToGuild(line, guildA), true)
        assert.equal(logMessageBelongsToGuild(line, guildB), false)
    })

    it("does not route a query-only line or a quote breakout to the embedded guild", () => {
        const queryOnly = `[MusicManager] No matches found for query "guild ${guildB}".`
        assert.equal(logMessageBelongsToGuild(queryOnly, guildB), false)
        assert.equal(logMessageBelongsToGuild(queryOnly, guildA), false)

        const breakout = `[MusicManager] Direct search (non-URL) failed for query "x" guild ${guildB}". Error: no`
        assert.equal(logMessageBelongsToGuild(breakout, guildB), false)
    })

    it("keeps an unquoted track title from adding a second guild", () => {
        const line = `[LavaMgrEvents] Track error in Guild: ${guildA}, Track: guild ${guildB}`
        assert.equal(logMessageBelongsToGuild(line, guildA), true)
        assert.equal(logMessageBelongsToGuild(line, guildB), false)
    })

    it("routes session-restore lines written as for <guildId>", () => {
        const line = `[playerSession] restore skipped for ${guildA}: local playback in progress`
        assert.equal(logMessageBelongsToGuild(line, guildA), true)
        assert.equal(logMessageBelongsToGuild(line, guildB), false)
    })

    it("keeps for <guildId> when a later reason contains a quote", () => {
        const line = `[playerSession] restore deferred for ${guildA}: voice channel "General" missing`
        assert.equal(logMessageBelongsToGuild(line, guildA), true)
        assert.equal(logMessageBelongsToGuild(line, guildB), false)
    })

    it("routes prefetch and alone-destroy lines that use for <guildId>", () => {
        const prefetch = `[yt-window] prefetch failed for ${guildA}: timeout`
        assert.equal(logMessageBelongsToGuild(prefetch, guildA), true)
        assert.equal(logMessageBelongsToGuild(prefetch, guildB), false)

        const alone = `[LavaMgrEvents] Skipping alone destroy for ${guildA}; humans present or channel gone.`
        assert.equal(logMessageBelongsToGuild(alone, guildA), true)
        assert.equal(logMessageBelongsToGuild(alone, guildB), false)
    })

    it("routes Lavalink player lines that place the guild id after player", () => {
        const line = `[LavaMgrEvents] Setting standard timeout to destroy player ${guildA} after queue end.`
        assert.equal(logMessageBelongsToGuild(line, guildA), true)
        assert.equal(logMessageBelongsToGuild(line, guildB), false)
    })

    it("routes structured logger JSON on the guildId key", () => {
        const line = `[queueIndexDELETE] unhandled error {"guildId":"${guildA}","message":"guild ${guildB}"}`
        assert.equal(logMessageBelongsToGuild(line, guildA), true)
        assert.equal(logMessageBelongsToGuild(line, guildB), false)
    })

    it("routes structured JSON when guildId is not the first key", () => {
        const afterString = `{"message":"failed","guildId":"${guildA}"}`
        assert.equal(logMessageBelongsToGuild(afterString, guildA), true)
        assert.equal(logMessageBelongsToGuild(afterString, guildB), false)

        const afterObject = `{"err":{"code":1},"guildId":"${guildA}"}`
        assert.equal(logMessageBelongsToGuild(afterObject, guildA), true)
        assert.equal(logMessageBelongsToGuild(afterObject, guildB), false)
    })

    it("routes a numeric guildId JSON value and ignores an escaped quote in an earlier field", () => {
        const numeric = `{"guildId":${guildA}}`
        assert.equal(logMessageBelongsToGuild(numeric, guildA), true)
        assert.equal(logMessageBelongsToGuild(numeric, guildB), false)

        const escaped = `[searchAndEnqueue] companion resolve failed {"message":"say \\"hi\\"","guildId":"${guildA}"}`
        assert.equal(logMessageBelongsToGuild(escaped, guildA), true)
        assert.equal(logMessageBelongsToGuild(escaped, guildB), false)
    })

    it("routes guildId= and in guild markers that follow one quoted filename or title", () => {
        const downloads = `[Downloads] Refusing path traversal for metadata file "song.wav" (guildId=${guildA})`
        assert.equal(logMessageBelongsToGuild(downloads, guildA), true)
        assert.equal(logMessageBelongsToGuild(downloads, guildB), false)

        const localFile = `[LocalPlayer] Attempting to play local file: "My Song" in guild ${guildA}`
        assert.equal(logMessageBelongsToGuild(localFile, guildA), true)
        assert.equal(logMessageBelongsToGuild(localFile, guildB), false)

        const quotedTitle = `[LocalPlayer] Started playing local file: "guild ${guildB}" in guild ${guildA}`
        assert.equal(logMessageBelongsToGuild(quotedTitle, guildA), true)
        assert.equal(logMessageBelongsToGuild(quotedTitle, guildB), false)
    })

    it("routes command logs to the parenthesized guild id, not the user id or guild name", () => {
        const line =
            `[InteractionCreate] Executing command "play" for user ada (${guildB}) ` +
            `in guild Cool Server (${guildA})`
        assert.equal(logMessageBelongsToGuild(line, guildA), true)
        assert.equal(logMessageBelongsToGuild(line, guildB), false)

        const nameIsSnowflake =
            `[InteractionCreate] Executing command "play" for user ada (${guildB}) ` +
            `in guild ${guildB} (${guildA})`
        assert.equal(logMessageBelongsToGuild(nameIsSnowflake, guildA), true)
        assert.equal(logMessageBelongsToGuild(nameIsSnowflake, guildB), false)
    })

    it("does not let a snowflake in a quoted query, title, or JSON key choose the guild", () => {
        const query = `[MusicManager] No matches found for query "${guildB}".`
        assert.equal(logMessageBelongsToGuild(query, guildB), false)

        const forQuery = `[MusicManager] No matches found for query "for ${guildB}".`
        assert.equal(logMessageBelongsToGuild(forQuery, guildB), false)

        const title = `[LavaMgrEvents] Track started in Guild: ${guildA}, Title: "${guildB}"`
        assert.equal(logMessageBelongsToGuild(title, guildA), true)
        assert.equal(logMessageBelongsToGuild(title, guildB), false)

        const titleFor = `[LavaMgrEvents] Track started in Guild: ${guildA}, Title: song for ${guildB}`
        assert.equal(logMessageBelongsToGuild(titleFor, guildA), true)
        assert.equal(logMessageBelongsToGuild(titleFor, guildB), false)

        const jsonQuery = `[MusicManager] No matches found for query "{"guildId":"${guildB}"}".`
        assert.equal(logMessageBelongsToGuild(jsonQuery, guildB), false)
        assert.equal(logMessageBelongsToGuild(jsonQuery, guildA), false)
    })

    it("does not let a quote breakout or a rebalanced guildId= injection choose the guild", () => {
        const rebalancedGuild = `[MusicManager] Direct search (non-URL) failed for query "x" guild ${guildB} "". Error: no`
        assert.equal(logMessageBelongsToGuild(rebalancedGuild, guildB), false)

        const rebalancedAssignment =
            `[Downloads] Refusing path traversal for metadata file "x" (guildId=${guildB}) "" ` +
            `(guildId=${guildA})`
        assert.equal(logMessageBelongsToGuild(rebalancedAssignment, guildA), true)
        assert.equal(logMessageBelongsToGuild(rebalancedAssignment, guildB), false)

        const oddBreakout = `[Downloads] Refusing path traversal for metadata file "x" (guildId=${guildB})" (guildId=${guildA})`
        assert.equal(logMessageBelongsToGuild(oddBreakout, guildB), false)
        assert.equal(logMessageBelongsToGuild(oddBreakout, guildA), false)
    })

    it("rejects a snowflake glued to an extra digit", () => {
        assert.equal(logMessageBelongsToGuild(`for ${guildA}9`, guildA), false)
        assert.equal(logMessageBelongsToGuild(`player ${guildA}9`, guildA), false)
        assert.equal(logMessageBelongsToGuild(`guild ${guildA}9`, guildA), false)
        assert.equal(logMessageBelongsToGuild(`{"guildId":"${guildA}9"}`, guildA), false)
    })
})

describe("discordLogLevelAllowed", () => {
    it("defaults minLevel to debug (all levels allowed)", () => {
        const cfg: GuildDiscordLogSettings = {}
        assert.equal(discordLogLevelAllowed(cfg, "debug"), true)
        assert.equal(discordLogLevelAllowed(cfg, "error"), true)
    })

    it("filters below the configured threshold and allows equal/higher", () => {
        const cfg: GuildDiscordLogSettings = { minLevel: "warn" }
        assert.equal(discordLogLevelAllowed(cfg, "debug"), false)
        assert.equal(discordLogLevelAllowed(cfg, "info"), false)
        assert.equal(discordLogLevelAllowed(cfg, "warn"), true)
        assert.equal(discordLogLevelAllowed(cfg, "error"), true)
    })

    it("allows only error when minLevel is error", () => {
        const cfg: GuildDiscordLogSettings = { minLevel: "error" }
        assert.equal(discordLogLevelAllowed(cfg, "warn"), false)
        assert.equal(discordLogLevelAllowed(cfg, "error"), true)
    })
})
