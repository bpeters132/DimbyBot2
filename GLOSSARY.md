# DimbyBot2

Ubiquitous language for the Bot, the Dashboard, and how change is reviewed. Product terms belong here as they are resolved.

## Applications

**Bot**:
The Discord process that handles slash commands, playback, and the Bot API. Not the Dashboard.
_Avoid_: backend (unqualified), server (unqualified), app

**Dashboard**:
The Next.js UI people use to control the Bot.
_Avoid_: portal, control panel, web app (as a second name)

**Bot API**:
The Bot’s HTTP and WebSocket surface that the Dashboard calls. Not Discord’s API.
_Avoid_: dashboard API, backend API, web API

## Contribution

**Source PR**:
An open bot or automation pull request whose commits are cherry-picked onto the Integration Branch.
_Avoid_: original PR, constituent PR, wave PR

**Integration Branch**:
A `chore/consolidated-<topic>` branch created from current `main`, holding every confirmed Source PR as one review unit.
_Avoid_: wave branch, stack, batch branch

**Supersede**:
Closing a Source PR with a comment that names the Integration Branch pull request as soon as that pull request exists, so Source PRs cannot be merged one-by-one.
_Avoid_: close after merge, leave open

## Observability

**Bot log**:
The process Winston file and console stream written by the bot logger (`info` / `warn` / `error` / `debug`).
_Avoid_: audit log, console dump, winston log (as a product name)

**Discord log forward**:
Per-guild routing of Bot log lines into Discord channels configured with `/discord-logs`.
_Avoid_: discord logs (unqualified), log channel dump

**Error history**:
The in-memory ring of recent `warn` and `error` Bot log lines used by the owner admin errors API.
_Avoid_: error log, audit trail

**Audit log**:
Structured web / Discord OAuth / Dashboard events written by `writeAuditLog`. Playback, Lavalink, and YouTube OAuth are not this trail.
_Avoid_: bot log, security log, YouTube OAuth

**Developer command**:
A slash command gated to the configured bot owner (`OWNER_ID`), such as `/logreview` and `/stackstatus`.
_Avoid_: admin command, owner-only command (as a second name)

## YouTube

**YouTube search**:
Resolving a query or YouTube URL into track metadata (title, author, identifier) before any audio is streamed.
_Avoid_: playback, play (when you mean metadata lookup), ytsearch (as a product name)

**YouTube playback**:
Streaming the audio of a YouTube track after YouTube search has produced metadata.
_Avoid_: search, youtube-source stream (when you mean this path)

**youtube-source login wall**:
YouTube’s “sign in to confirm you’re not a bot” or login-required challenge during YouTube search or youtube-plugin load. It is not, by itself, a YouTube playback failure.
_Avoid_: captcha, bot check (unqualified), sign-in error (when you have not checked whether search returned tracks)

**YouTube OAuth**:
A Google account credential used so YouTube search can act as a signed-in user. Distinct from Discord sign-in and from a Dashboard “link YouTube” flow.
_Avoid_: Google login (unqualified), Discord OAuth, link YouTube account

**Catalog track**:
A Spotify (or similar) item that is title, artist, and URI only — it has no native audio stream.
_Avoid_: Spotify stream, playable Spotify track

**User media URL**:
An HTTP(S) address a person types into `/play`, the Dashboard, or playlist search to look up a track.
_Avoid_: stream URL, companion URL, Lavalink HTTP source

**Companion stream URL**:
An HTTP address the bot mints from invidious-companion so Lavalink can play YouTube audio.
_Avoid_: User media URL, youtube-source stream

**Queue metadata**:
A queued item that still has Catalog track or YouTube search identity (title, artist, URI) and is not yet YouTube playback.
_Avoid_: unresolved track, pending track, placeholder, lazy track

**Prefetch window**:
The current queued item plus the next one or two upcoming items that should already have YouTube playback prepared.
_Avoid_: look-ahead buffer, resolve window, play-ahead

**Playback duration**:
The length of the audio actually being streamed after YouTube playback is prepared.
_Avoid_: runtime, timeline, Catalog duration (after prepare)

**Catalog duration**:
The length on a Catalog track. It is a hint until YouTube playback is prepared.
_Avoid_: Playback duration, Spotify length (as a second name)

**Displayed duration**:
What the Dashboard and Discord control channel show: Catalog duration or YouTube search length until prepare, then Playback duration. It may grow if playback runs past the stamp.
_Avoid_: progress bar max, timeline

**Playback URL**:
The YouTube watch URL of the video being streamed after YouTube playback is prepared. Unprepared Queue metadata may still show a Catalog track URI.
_Avoid_: Companion stream URL, Catalog URI (as the clickable now-playing link)

## Upload alerts

**Upload Watch**:
The Bot’s subscription to one YouTube channel for one guild. Unique per guild and YouTube channel; created and removed with that guild’s Upload Alerts.
_Avoid_: YouTube search, YouTube playback, monitor (unqualified), subscription (unqualified)

**Upload Alert**:
A guild admin’s notify-only posting rule: Discord channel, role mentions, message template, and Upload event types. Many Upload Alerts may share one Upload Watch.
_Avoid_: announcement (unqualified), notification (as the persisted object), YouTube playback

**Upload event type**:
The kind of YouTube activity an Upload Alert can match: video, short, premiere, live, or community.
_Avoid_: announcement (unqualified), YouTube search
