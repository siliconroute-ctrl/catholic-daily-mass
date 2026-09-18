/**
 * Shared "18 September 2026"-style date formatting for post titles/messages
 * — used so a viewer (or a search) can tell which day's Mass a post is for
 * without needing platform metadata, and so YT/FB titles read consistently.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatLongDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
