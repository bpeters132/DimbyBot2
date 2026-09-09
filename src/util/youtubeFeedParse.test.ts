import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    decodeYoutubeXmlEntities,
    parseIso8601Duration,
    parseYoutubeAtomFeed,
    youtubeChannelIdFromTopic,
    youtubeRssUrl,
} from "./youtubeFeedParse.js"

const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Linus Tech Tips</title>
  <entry>
    <id>yt:video:dQw4w9WgXcQ</id>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <yt:channelId>${CHANNEL_ID}</yt:channelId>
    <title>New video &amp; friends</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
    <published>2026-09-01T12:00:00+00:00</published>
    <media:group>
      <media:description>#video description</media:description>
      <media:content url="https://example.invalid/x" duration="125"/>
    </media:group>
  </entry>
  <entry>
    <yt:videoId>abcdefghijk</yt:videoId>
    <yt:channelId>${CHANNEL_ID}</yt:channelId>
    <title>Short one</title>
    <link rel="alternate" href="https://www.youtube.com/shorts/abcdefghijk"/>
  </entry>
</feed>`

describe("parseYoutubeAtomFeed", () => {
    it("parses titles, ids, duration, and decoded entities", () => {
        const parsed = parseYoutubeAtomFeed(SAMPLE_FEED)
        assert.equal(parsed.channelTitle, "Linus Tech Tips")
        assert.equal(parsed.entries.length, 2)
        assert.equal(parsed.entries[0]?.videoId, "dQw4w9WgXcQ")
        assert.equal(parsed.entries[0]?.channelId, CHANNEL_ID)
        assert.equal(parsed.entries[0]?.title, "New video & friends")
        assert.equal(parsed.entries[0]?.durationSeconds, 125)
        assert.equal(parsed.entries[1]?.url, "https://www.youtube.com/shorts/abcdefghijk")
    })
})

describe("decodeYoutubeXmlEntities", () => {
    it("decodes in one pass so &amp;lt; stays &lt;", () => {
        assert.equal(decodeYoutubeXmlEntities("A &amp; B"), "A & B")
        assert.equal(decodeYoutubeXmlEntities("&amp;lt;script&amp;gt;"), "&lt;script&gt;")
        assert.equal(decodeYoutubeXmlEntities("&quot;x&#39;"), `"x'`)
        assert.equal(decodeYoutubeXmlEntities("It&apos;s fine"), "It's fine")
    })

    it("decodes &apos; in feed titles and descriptions", () => {
        const parsed = parseYoutubeAtomFeed(`<feed>
  <title>It&apos;s a channel</title>
  <entry>
    <yt:videoId>xxxxxxxxxxx</yt:videoId>
    <title>Creator&apos;s cut</title>
    <media:group><media:description>Don&apos;t skip</media:description></media:group>
  </entry>
</feed>`)
        assert.equal(parsed.channelTitle, "It's a channel")
        assert.equal(parsed.entries[0]?.title, "Creator's cut")
        assert.equal(parsed.entries[0]?.description, "Don't skip")
    })
})

describe("parseIso8601Duration", () => {
    it("parses hours minutes seconds", () => {
        assert.equal(parseIso8601Duration("PT1H2M3S"), 3723)
        assert.equal(parseIso8601Duration("PT45S"), 45)
        assert.equal(parseIso8601Duration("nope"), null)
    })
})

describe("youtube feed urls", () => {
    it("builds RSS and reads a topic channel id", () => {
        assert.equal(
            youtubeRssUrl(CHANNEL_ID),
            `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`
        )
        assert.equal(
            youtubeChannelIdFromTopic(
                `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`
            ),
            CHANNEL_ID
        )
        assert.equal(youtubeChannelIdFromTopic("https://example.com"), null)
    })
})
