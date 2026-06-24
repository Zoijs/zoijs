// Type definitions for @zoijs/head.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

/**
 * Set `document.title`. The previous title is restored when the calling
 * component unmounts.
 */
export function title(value: string): void;

/**
 * Set `<meta name="description">` (creating it if needed). Restored on unmount.
 */
export function description(value: string): void;

/**
 * Set `<meta name="...">` (creating it if needed) to `content`. Restored — or
 * removed, if this call created the tag — when the calling component unmounts.
 */
export function meta(name: string, content: string): void;
