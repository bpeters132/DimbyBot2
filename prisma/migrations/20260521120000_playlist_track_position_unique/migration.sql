-- Index already created in 20260519120000_add_user_playlists; idempotent for DBs that lack it.
CREATE UNIQUE INDEX IF NOT EXISTS "PlaylistTrack_playlistId_position_key" ON "PlaylistTrack"("playlistId", "position");
