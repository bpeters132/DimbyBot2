# Spotify catalog tracks YouTube-search at enqueue, then companion HTTP

LavaSrc can load Spotify URLs as **catalog tracks**, but it has no native Spotify audio — it YouTube-searches at play time inside Lavalink, which hits the **youtube-source login wall** and bypasses companion. We translate at enqueue instead: ISRC then title/artist YouTube search, companion HTTP playback, **Spotify identity kept** on the queued track. SoundCloud and other native Lavalink sources stay unchanged. If both searches miss, that item fails closed (error on a single `/play`, skip in a playlist). Session restore re-searches the persisted Spotify URI rather than decoding expired companion encodings.

**Considered options**

- Leave LavaSrc to YouTube-search at play time — rejected; that is the login-wall path.
- Translate SoundCloud (and every non-YouTube source) the same way — rejected; SoundCloud already has a native Lavalink source.
- Replace queue identity with the YouTube hit — rejected; now-playing and restore should keep the Spotify URI.
- YouTube OAuth so LavaSrc can play catalog tracks through youtube-plugin — rejected; companion HTTP remains the playback path.
