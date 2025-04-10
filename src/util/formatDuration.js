/**
 * Formats duration from milliseconds to HH:MM:SS or MM:SS format.
 * @param {number} ms Duration in milliseconds.
 * @returns {string} Formatted duration string.
 */
export default function formatDuration(ms) {
  // Ensure the duration is positive.
  if (ms < 0) ms = -ms

  // Calculate total seconds from milliseconds.
  const totalSeconds = Math.floor(ms / 1000)
  // Calculate remaining seconds (0-59) and pad with leading zero if needed.
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  // Calculate total minutes from total seconds.
  const totalMinutes = Math.floor(totalSeconds / 60)
  // Calculate remaining minutes (0-59) and pad with leading zero if needed.
  const minutes = String(totalMinutes % 60).padStart(2, '0')
  // Calculate total hours from total minutes.
  const hours = Math.floor(totalMinutes / 60)

  // If there are hours, format as HH:MM:SS.
  if (hours > 0) {
    return `${hours}:${minutes}:${seconds}`
  }
  // If there are minutes or seconds (but no hours), format as MM:SS.
  if (totalMinutes > 0 || totalSeconds > 0) {
    return `${minutes}:${seconds}`
  }
  // If duration is zero, return 00:00.
  return '00:00'
}
