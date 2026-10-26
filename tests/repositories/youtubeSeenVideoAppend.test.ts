import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"

const db = {
    createManyCalls: 0,
    lastCreateManyArgs: null as unknown,
    createManyThrows: false,
}

function resetDb() {
    db.createManyCalls = 0
    db.lastCreateManyArgs = null
    db.createManyThrows = false
}

mock.module("../../src/lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            youtubeSeenVideo: {
                createMany: async (args: unknown) => {
                    db.createManyCalls += 1
                    db.lastCreateManyArgs = args
                    if (db.createManyThrows) throw new Error("connection lost")
                    return { count: 0 }
                },
            },
        }),
    },
})

const { addYoutubeSeenVideos } = await import("../../src/repositories/youtubeAlertRepository.js")

describe("addYoutubeSeenVideos trim, dedupe, and skipDuplicates", () => {
    beforeEach(() => {
        resetDb()
    })

    it("skips createMany when every id is empty or whitespace", async () => {
        for (const ids of [[], [""], ["   ", "\t", "\n"], ["", "  "]]) {
            resetDb()
            await addYoutubeSeenVideos(7, ids)
            assert.equal(db.createManyCalls, 0)
            assert.equal(db.lastCreateManyArgs, null)
        }
    })

    it("trims and dedupes ids, then createMany with skipDuplicates on the Watch composite", async () => {
        await addYoutubeSeenVideos(7, ["  abc  ", "abc", "def", "  def", "", "   "])

        assert.equal(db.createManyCalls, 1)
        assert.deepEqual(db.lastCreateManyArgs, {
            data: [
                { watchId: 7, videoId: "abc" },
                { watchId: 7, videoId: "def" },
            ],
            skipDuplicates: true,
        })
        const args = db.lastCreateManyArgs as { data: Array<{ watchId: number; videoId: string }> }
        for (const row of args.data) {
            assert.equal(row.watchId, 7)
            assert.equal("id" in row, false)
        }
    })

    it("rethrows when createMany fails so seen ids are not silently dropped", async () => {
        db.createManyThrows = true
        await assert.rejects(() => addYoutubeSeenVideos(7, ["abc"]), /connection lost/)
        assert.equal(db.createManyCalls, 1)
        assert.deepEqual(db.lastCreateManyArgs, {
            data: [{ watchId: 7, videoId: "abc" }],
            skipDuplicates: true,
        })
    })
})
