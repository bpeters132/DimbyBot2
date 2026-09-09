# Hybrid PubSubHubbub plus RSS for Upload Alerts

Upload Alerts need timely notice of new YouTube videos without burning Data API quota or depending on a public webhook in every environment. We use YouTube’s [PubSubHubbub push notifications](https://developers.google.com/youtube/v3/guides/push_notifications) when `YOUTUBE_PUBSUB_CALLBACK_URL` is a public HTTPS callback the Bot can serve at `/youtube/pubsub`, and we always poll the channel RSS feed every five minutes as a safety net (and as the only detector in local/dev). Community posts are not in PubSub or RSS; they stay on a separate fifteen-minute best-effort path. Seen video IDs are stored per Upload Watch so title/description edits and re-polls do not re-announce.

**Considered options**

- YouTube Data API polling only — rejected; `search.list` is expensive against the daily quota and is slower than push.
- PubSub only — rejected; leases expire, Google can miss pings, and local/dev has no public callback.
- RSS only — rejected for production; announcements would always lag the poll interval.
