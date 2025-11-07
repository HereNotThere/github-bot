/**
 * Strip markdown formatting from a string
 * Removes: **bold**, *italic*, `code`, ~~strikethrough~~
 * Note: Does NOT remove underscores (_) as they're valid in GitHub repo names
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, "") // Remove bold **
    .replace(/\*/g, "") // Remove italic *
    .replace(/`/g, "") // Remove code `
    .replace(/~~/g, "") // Remove strikethrough ~~
    .trim();
}
