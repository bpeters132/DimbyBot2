/**
 * Clamps the insert index after removing a queue track for reorder.
 * After `splice(sourceIndex, 1)`, the queue length is `lenAfterRemove`; inserting beyond
 * that would throw or drop the track, so destination is clamped into `[0, lenAfterRemove]`.
 */
export function clampQueueReorderInsertIndex(
    destinationIndex: number,
    lenAfterRemove: number
): number {
    return Math.min(Math.max(destinationIndex, 0), lenAfterRemove)
}
