/**
 * Formats duration in milliseconds to HH:MM:SS or MM:SS format.
 * @param {number} ms Duration in milliseconds.
 * @returns {string} Formatted duration string.
 */
export function formatDuration(ms) {
  if (ms <= 0 || !Number.isFinite(ms)) {
    return "00:00"
  }

  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const paddedSeconds = seconds.toString().padStart(2, "0")
  const paddedMinutes = minutes.toString().padStart(2, "0")

  if (hours > 0) {
    const paddedHours = hours.toString().padStart(2, "0")
    return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`
  }
  
  return `${paddedMinutes}:${paddedSeconds}`
}
