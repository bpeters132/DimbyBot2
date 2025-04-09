/**
 * Formats duration from milliseconds to HH:MM:SS or MM:SS format.
 * @param {number} ms Duration in milliseconds.
 * @returns {string} Formatted duration string.
 */
export default function formatDuration(ms) {
  if (ms < 0) ms = -ms // Handle negative durations

  // Calculate hours, minutes, and seconds
  const totalSeconds = Math.floor(ms / 1000)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = String(totalMinutes % 60).padStart(2, '0')
  const hours = Math.floor(totalMinutes / 60)

  // Construct the formatted string
  if (hours > 0) {
    return `${hours}:${minutes}:${seconds}`
  }
  if (totalMinutes > 0 || totalSeconds > 0) {
    return `${minutes}:${seconds}`
  }
  return '00:00' // Return 00:00 for zero duration
}
