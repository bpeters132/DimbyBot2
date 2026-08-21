# Diagnose Lavalink “sign in” before YouTube OAuth

Companion and yt-cipher do **not** silence Lavalink youtube-plugin login messages during **YouTube search**. Search still goes through youtube-plugin (`ytsearch` / YouTube URLs). **YouTube playback** is a separate path: the bot calls invidious-companion, then Lavalink plays an HTTP URL. yt-cipher only signs stream URLs after YouTube already returned them; it cannot skip a **youtube-source login wall**.

Treat youtube-plugin “Sign in to confirm you’re not a bot” / “This video requires login” during `ytsearch` as leftover noise **unless search returns no tracks**. Do not enable **YouTube OAuth** (burner Google refresh token) or a dashboard “link YouTube” flow until this runbook says search is dead.

See [ADR 0002](adr/0002-youtube-search-companion-playback.md) and [ADR 0003](adr/0003-spotify-catalog-youtube-companion.md).

## Prerequisites

- `INVIDIOUS_COMPANION_KEY` is exactly 16 alphanumeric characters.
- `INVIDIOUS_COMPANION_URL` stays `http://invidious-companion:8282` inside Compose (not `localhost`).
- Lavalink was recreated after `sources.http: true`.
- You are the configured bot owner (`OWNER_ID`) so developer commands work.

`/stackstatus` is a reachability probe only (companion, Lavalink, yt-cipher, Postgres). It does not run YouTube search or companion `/player`. If Discord does not list it, rebuild/redeploy the bot and redeploy slash commands.

Do **not** set `LAVALINK_YOUTUBE_OAUTH_ENABLED` without a refresh token (the Lavalink entrypoint skips OAuth or would start a device-code flow in logs).

## Runbook

1. `/verboselogging` so `[YoutubeCompanion]` **debug** lines are in the Bot log.
2. `/play` one ordinary public video (not age-restricted, not a live premiere). Stay in voice and listen for audio, not just the “now playing” embed.
3. Immediately:
    - `/logreview filter: YoutubeCompanion` (second pass with `filter: youtube` or `filter: companion` if needed).
    - `docker compose … logs --tail 200 invidious-companion` — look for `player`, `latest_version`, `videoplayback` (not only PO-token mint).
    - `docker compose … logs --tail 200 lavalink` — note whether “sign in” is on **loadTracks / ytsearch** vs **HTTP play**.

A window with only companion PO-token jobs, Lavalink `GET /version`, and WebSocket `1006` reconnects is **not** a failed `/play`. Run the test after verbose logging is on.

## Interpretation

| Observation                                                                                                                                | Meaning                                                                                   | Action                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Search returns tracks + `[YoutubeCompanion] resolved <videoId>` + companion `player` / `latest_version` + audio / `playerUpdate` advancing | youtube-plugin sign-in is search noise                                                    | Stop. No YouTube OAuth.                                                                                                           |
| Search returns **zero** tracks; Lavalink exception on `ytsearch`                                                                           | login wall on **YouTube search**                                                          | Later: Lavalink **env** YouTube OAuth (burner refresh token), recreate Lavalink. Still no dashboard Google UI.                    |
| Search OK, **no** `[YoutubeCompanion]`                                                                                                     | enqueue path not hitting companion resolve (stale `dist/`, missed call site)              | Rebuild/recreate **dimbybot**; confirm enqueue sites (`musicManager`, `enqueueSearchTracks`, `playlistQueue`, autoplay, restore). |
| `[YoutubeCompanion] playability not OK` or companion player 4xx/5xx                                                                        | companion blocked for that video                                                          | Later: companion session/cookies — **not** Lavalink YouTube OAuth first.                                                          |
| Companion resolved, Lavalink HTTP search empty / HTTP play fail                                                                            | `http` source or URL rewrite                                                              | Confirm `sources.http: true` and companion-origin rewrite (never enqueue user HTTP).                                              |
| Bot Lavalink WS `1006` loops during the test                                                                                               | player never stable                                                                       | Fix reconnect first; sign-in lines from a flapping node are untrustworthy.                                                        |
| Spotify `TrackException` + `YoutubeAudioTrack.process` / sign-in on `sourceName: spotify`                                                  | catalog track played through youtube-plugin instead of enqueue YouTube search + companion | Confirm `[YoutubeCompanion] catalog searching`; rebuild bot if stale `dist/`. Never play the Spotify encoded track.               |
