/**
 * Pure playlist-move reorder used by {@link movePlaylistTrack}.
 *
 * `fromPosition` is matched by stored position value; `toPosition` is a 1-based
 * index into the position-sorted row list (not a position lookup). Keeping that
 * asymmetry explicit avoids silent off-by-ones that corrupt saved playlist order.
 */

export type PlaylistTrackRowRef = { id: number; position: number }

export type PlaylistTrackReorderFailure =
    | { ok: false; reason: "empty"; missingPosition: number }
    | { ok: false; reason: "from_not_found"; missingPosition: number }
    | { ok: false; reason: "to_out_of_range"; missingPosition: number }

export type PlaylistTrackReorderResult =
    | { ok: true; rows: PlaylistTrackRowRef[] }
    | PlaylistTrackReorderFailure

/**
 * Returns the new row order after moving `fromPosition` to 1-based slot `toPosition`.
 * Same-position moves are a no-op that still returns `{ ok: true }`.
 */
export function reorderPlaylistTrackRows(
    rows: readonly PlaylistTrackRowRef[],
    fromPosition: number,
    toPosition: number
): PlaylistTrackReorderResult {
    if (rows.length === 0) {
        return { ok: false, reason: "empty", missingPosition: fromPosition }
    }
    if (fromPosition === toPosition) {
        return { ok: true, rows: [...rows] }
    }

    const fromIdx = rows.findIndex((r) => r.position === fromPosition)
    if (fromIdx === -1) {
        return { ok: false, reason: "from_not_found", missingPosition: fromPosition }
    }
    if (toPosition < 1 || toPosition > rows.length) {
        return { ok: false, reason: "to_out_of_range", missingPosition: toPosition }
    }

    const reordered = [...rows]
    const [moved] = reordered.splice(fromIdx, 1)
    if (!moved) {
        return { ok: false, reason: "from_not_found", missingPosition: fromPosition }
    }
    reordered.splice(toPosition - 1, 0, moved)
    return { ok: true, rows: reordered }
}
