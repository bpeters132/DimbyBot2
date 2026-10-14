/**
 * Pure playlist-move reorder used by {@link movePlaylistTrack}.
 *
 * `fromPosition` is matched by stored position value; `toPosition` is a 1-based
 * index into the position-sorted row list (not a position lookup). Same-slot
 * no-ops compare the resolved sorted index to `toPosition`, never raw position
 * equality — gaps make `position === toPosition` a real move (e.g. 4 → slot 4).
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
 * A no-op is when the track is already in that sorted-list slot (`fromIdx === toPosition - 1`),
 * not when the stored position value equals `toPosition` — those domains diverge when positions
 * have gaps (e.g. concurrent deletes leave `1,2,4,5`; dragging position 4 to slot 4 must move).
 */
export function reorderPlaylistTrackRows(
    rows: readonly PlaylistTrackRowRef[],
    fromPosition: number,
    toPosition: number
): PlaylistTrackReorderResult {
    if (rows.length === 0) {
        return { ok: false, reason: "empty", missingPosition: fromPosition }
    }

    const fromIdx = rows.findIndex((r) => r.position === fromPosition)
    if (fromIdx === -1) {
        return { ok: false, reason: "from_not_found", missingPosition: fromPosition }
    }
    if (toPosition < 1 || toPosition > rows.length) {
        return { ok: false, reason: "to_out_of_range", missingPosition: toPosition }
    }
    // Already in the destination slot (dense or gapped). Compare indexes, not position values.
    if (fromIdx === toPosition - 1) {
        return { ok: true, rows: [...rows] }
    }

    const reordered = [...rows]
    const [moved] = reordered.splice(fromIdx, 1)
    if (!moved) {
        return { ok: false, reason: "from_not_found", missingPosition: fromPosition }
    }
    reordered.splice(toPosition - 1, 0, moved)
    return { ok: true, rows: reordered }
}
