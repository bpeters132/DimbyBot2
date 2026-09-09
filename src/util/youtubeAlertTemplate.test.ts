import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    DEFAULT_UPLOAD_ALERT_TEMPLATE,
    formatRoleMentions,
    renderUploadAlertMessage,
} from "./youtubeAlertTemplate.js"

describe("formatRoleMentions", () => {
    it("joins Discord role mentions", () => {
        assert.equal(formatRoleMentions(["1", "2"]), "<@&1> <@&2>")
        assert.equal(formatRoleMentions([]), "")
    })
})

describe("renderUploadAlertMessage", () => {
    it("puts role mentions in content so they ping, and fills placeholders", () => {
        const { content, embed, components } = renderUploadAlertMessage({
            title: "Hello",
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            creator: "Linus Tech Tips",
            type: "video",
            mentionRoleIds: ["99"],
            template: null,
            thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        })
        assert.match(content, /^<@&99>\n/)
        assert.match(content, /Linus Tech Tips posted a video: Hello/)
        assert.match(content, /https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ/)
        assert.equal(embed.data.title, "Hello")
        assert.equal(embed.data.url, undefined)
        assert.equal(embed.data.footer?.text, "video")
        assert.equal(embed.data.image?.url, "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg")
        assert.equal(embed.data.thumbnail, undefined)
        const row = components[0]?.toJSON()
        const button = row && "components" in row ? row.components[0] : undefined
        assert.equal(
            button && "url" in button ? button.url : undefined,
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )
        assert.equal(button && "label" in button ? button.label : undefined, "Watch on YouTube")
    })

    it("uses View on YouTube for community posts", () => {
        const { components, embed } = renderUploadAlertMessage({
            title: "Community post",
            url: "https://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw/community",
            creator: "LTT",
            type: "community",
            mentionRoleIds: [],
            template: null,
        })
        assert.equal(embed.data.url, undefined)
        const row = components[0]?.toJSON()
        const button = row && "components" in row ? row.components[0] : undefined
        assert.equal(button && "label" in button ? button.label : undefined, "View on YouTube")
    })

    it("places mentions only at {role} when the template includes it", () => {
        const { content } = renderUploadAlertMessage({
            title: "Hello",
            url: "https://youtu.be/dQw4w9WgXcQ",
            creator: "LTT",
            type: "short",
            mentionRoleIds: ["11"],
            template: "{role} go watch {title}",
        })
        assert.equal(content, "<@&11> go watch Hello")
        assert.ok(!content.includes(DEFAULT_UPLOAD_ALERT_TEMPLATE))
    })
})
