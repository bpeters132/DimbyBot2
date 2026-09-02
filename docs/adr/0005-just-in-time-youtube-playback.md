# Just-in-time YouTube playback with a prefetch window

Companion stream URLs expire and minting them for an entire playlist at enqueue made large queues wait minutes before the first song. We enqueue Queue metadata immediately, start YouTube playback as soon as the first playable item is ready, and mint Companion stream URLs only for the Prefetch window (current plus the next one or two). Catalog YouTube search happens at the same moment, not at enqueue. Unplayable items are skipped and the window is refilled; a companion HTTP play error re-resolves that item once, then skips.

**Considered options**

- Resolve every track before starting the player, but faster (higher concurrency, fewer hops) — rejected; encodings still expire and the user still waits on N.
- Resolve the first track, start playback, then companion-resolve the rest in the background — rejected; that still mints URLs that will be stale before later tracks play.
- Always mint a fresh Companion stream URL at `player.play()` with no prefetch — rejected; every skip would hitch even when the next item was already known.
