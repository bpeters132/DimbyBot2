# DimbyBot2

Ubiquitous language for this Discord music bot and how change is reviewed. Product terms belong here as they are resolved; this first pass records Contribution vocabulary from PR consolidation.

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
Structured web / Discord OAuth / dashboard events written by `writeAuditLog`. Playback, Lavalink, and YouTube OAuth are not this trail.
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
A Google account credential used so YouTube search can act as a signed-in user. Distinct from Discord sign-in and from a dashboard “link YouTube” flow.
_Avoid_: Google login (unqualified), Discord OAuth, link YouTube account

**Catalog track**:
A Spotify (or similar) item that is title, artist, and URI only — it has no native audio stream.
_Avoid_: Spotify stream, playable Spotify track
