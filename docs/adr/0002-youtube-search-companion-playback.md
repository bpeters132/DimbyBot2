# YouTube search stays on youtube-source; playback goes through companion HTTP

YouTube’s login wall and missing stream URLs made youtube-plugin playback unreliable. We split the path: **YouTube search** still uses Lavalink youtube-plugin (`ytsearch` / YouTube URLs) for metadata; **YouTube playback** is resolved by the bot through invidious-companion and played as an HTTP track. yt-cipher stays for youtube-plugin signatures during search. We do not enable Lavalink **YouTube OAuth** or a dashboard “link YouTube” Google login until a real `/play` shows YouTube search returning zero tracks. Dashboard Discord sign-in is unrelated.

**Considered options**

- youtube-plugin for both search and play — rejected; the login wall and SABR break streams even when metadata succeeds.
- Companion for both search and play — rejected for this slice; metadata still comes from youtube-plugin.
- Burner YouTube OAuth or dashboard Google-link first — rejected; OAuth is for a search wall, not a substitute for companion playback, and a dashboard link would still require a Lavalink recreate.
