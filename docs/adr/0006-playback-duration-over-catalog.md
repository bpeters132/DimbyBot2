# Playback duration over Catalog duration on overlay

Companion HTTP tracks keep Catalog track title, artist, and ISRC so now-playing still reads as the Spotify song. They must **not** keep Catalog duration or the Catalog URI as the clickable link: a music video’s Playback duration is often longer, and the Playback URL is the YouTube watch page for the stream. Copying the short Catalog duration made the dashboard and control channel hit 100% early while Lavalink kept playing until `trackEnd`. After prepare, stamp Playback duration (Lavalink HTTP length if known, else companion video length, else YouTube search duration) and leave `info.uri` as the YouTube watch URL. Auto-advance stays Lavalink `trackEnd`; Displayed duration may stretch if position overruns the stamp. Unprepared Queue metadata may still show a Catalog URI until prefetch.

**Considered options**

- Keep Catalog duration on the queued item so the list matches Spotify — rejected; the bar and “when is this over?” must match the stream.
- Force-skip when position reaches the stamped length — rejected; `trackEnd` is the real end of the Companion stream URL.
- Use YouTube search duration even when Lavalink HTTP already reported a length — rejected; `trackEnd` follows the encoded HTTP track.
