/**
 * HTML escape utility to prevent XSS attacks
 *
 * Escapes HTML special characters to their HTML entity equivalents.
 * Use this for any user-controlled or external data that will be rendered in HTML.
 */

/**
 * Escape HTML special characters to prevent XSS attacks
 *
 * @param unsafe - Untrusted string that may contain HTML/JavaScript
 * @returns Safely escaped string for use in HTML
 *
 * @example
 * escapeHtml('<script>alert("XSS")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
