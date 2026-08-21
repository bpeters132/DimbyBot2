# Deny private and Docker-internal hosts on user media URLs, not companion-only allowlisting

Lavalink `http: true` is required for **Companion stream URL** playback. Allowlisting only the companion origin at `player.search` would reject public YouTube, Spotify, and SoundCloud **User media URLs** (those are YouTube search / catalog lookup, not HTTP-source play). We instead reject loopback, RFC1918, link-local, and Docker-internal (single-label) hosts at the user query boundary, and we do not apply that check to bot-minted companion streams.

**Considered options**

- Allow only the companion origin — rejected; it would break catalog URL play.
- Leave user URLs unfiltered — rejected; a pasted `http://postgres-db:5432` could reach the compose network through Lavalink HTTP.
- Allowlist known public music hosts only — rejected for this slice; public HTTP(S) URLs stay valid search input as long as the host is not private or Docker-internal.
- Destination-IP pinning inside Lavalink (or an HTTP proxy that resolves, validates, and pins the dest IP) — out of scope; Lavalink’s HTTP source has no pin-IP hook, and bot-side DNS would be TOCTOU. Hostname denial at the user search boundary is the chosen control.
