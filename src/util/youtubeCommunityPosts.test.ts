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
})
