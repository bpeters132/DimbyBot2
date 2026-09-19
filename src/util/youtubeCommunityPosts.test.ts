import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    communitySeenId,
    fetchYoutubeCommunityPosts,
    parseYoutubeCommunityPostsHtml,
} from "./youtubeCommunityPosts.js"

const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"

describe("parseYoutubeCommunityPostsHtml", () => {
    it("dedupes post ids", () => {
        const html = `"postId":"Ug1abc_def-ghi","postId":"Ug1abc_def-ghi","sharedPostId":"Ug2xyz"`
        const posts = parseYoutubeCommunityPostsHtml(html)
        assert.deepEqual(
            posts.map((p) => p.postId),
            ["Ug1abc_def-ghi", "Ug2xyz"]
        )
        assert.equal(posts[0]?.url, "https://www.youtube.com/post/Ug1abc_def-ghi")
    })
})

describe("communitySeenId", () => {
    it("prefixes so post ids cannot collide with video ids", () => {
        assert.equal(communitySeenId("Ug1"), "community:Ug1")
    })
})

describe("fetchYoutubeCommunityPosts", () => {
    it("returns [] when both pages fail", async () => {
        const posts = await fetchYoutubeCommunityPosts(CHANNEL_ID, async () => ({
            ok: false,
            text: "",
        }))
        assert.deepEqual(posts, [])
    })

    it("returns posts from /posts without fetching /community", async () => {
        const urls: string[] = []
        const posts = await fetchYoutubeCommunityPosts(CHANNEL_ID, async (url) => {
            urls.push(url)
            return { ok: true, text: `"postId":"UgFromPosts"` }
        })
        assert.deepEqual(
            posts.map((p) => p.postId),
            ["UgFromPosts"]
        )
        assert.deepEqual(urls, [`https://www.youtube.com/channel/${CHANNEL_ID}/posts`])
    })

    it("falls back to /community when /posts is empty, fails, or throws", async () => {
        const emptyThenCommunity = await fetchYoutubeCommunityPosts(CHANNEL_ID, async (url) => {
            if (url.endsWith("/posts")) return { ok: true, text: "no ids here" }
            return { ok: true, text: `"sharedPostId":"UgFromCommunity"` }
        })
        assert.deepEqual(
            emptyThenCommunity.map((p) => p.postId),
            ["UgFromCommunity"]
        )

        const failThenCommunity = await fetchYoutubeCommunityPosts(CHANNEL_ID, async (url) => {
            if (url.endsWith("/posts")) return { ok: false, text: "" }
            return { ok: true, text: `"postId":"UgAfterFail"` }
        })
        assert.deepEqual(
            failThenCommunity.map((p) => p.postId),
            ["UgAfterFail"]
        )

        const throwThenCommunity = await fetchYoutubeCommunityPosts(CHANNEL_ID, async (url) => {
            if (url.endsWith("/posts")) throw new Error("network")
            return { ok: true, text: `"postId":"UgAfterThrow"` }
        })
        assert.deepEqual(
            throwThenCommunity.map((p) => p.postId),
            ["UgAfterThrow"]
        )
    })
})
