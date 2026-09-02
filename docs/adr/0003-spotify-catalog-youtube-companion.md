# Spotify catalog tracks YouTube-search in the prefetch window, then companion HTTP

LavaSrc can load Spotify URLs as **catalog tracks**, but it has no native Spotify audio — it YouTube-searches at play time inside Lavalink, which hits the **youtube-source login wall** and bypasses companion. We translate when an item enters the **Prefetch window** (current plus the next one or two), not for the whole playlist at enqueue: ISRC then title/artist YouTube search, companion HTTP playback, **Spotify identity kept** on the queued item. SoundCloud and other native Lavalink sources stay unchanged. If both searches miss, that item fails closed (error on a single `/play`, skip in a playlist). Session restore keeps the persisted Spotify URI as Queue metadata rather than decoding expired companion encodings. See ADR 0005.

**Considered options**

- Leave LavaSrc to YouTube-search at play time — rejected; that is the login-wall path.
- Translate SoundCloud (and every non-YouTube source) the same way — rejected; SoundCloud already has a native Lavalink source.
- Replace queue identity with the YouTube hit — rejected; now-playing and restore should keep the Spotify URI.
- YouTube OAuth so LavaSrc can play catalog tracks through youtube-plugin — rejected; companion HTTP remains the playback path.
