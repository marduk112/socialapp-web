import { countChars } from './rich-text';

/** Max length (Unicode code points) of post content / share comment — enforced by the server too. */
export const POST_MAX_CHARS = 500;

/** True when the text is non-blank and within the limit. */
export function isValidPostText(text: string): boolean {
  const n = countChars(text.trim());
  return n > 0 && n <= POST_MAX_CHARS;
}

/** Share comment is optional: blank is fine, over-limit is not. */
export function isWithinLimit(text: string): boolean {
  return countChars(text) <= POST_MAX_CHARS;
}
