export interface PostMention {
  userId: string;
  username: string;
}

export type RichTextSegment =
  | { type: 'text'; text: string }
  | { type: 'hashtag'; text: string; tag: string }
  | { type: 'mention'; text: string; userId: string };

/**
 * Must match the backend tokenisation exactly.
 *  - hashtag: '#' + 1..50 of [\p{L}\p{N}_]; '#' at text start or preceded by a char NOT in [\p{L}\p{N}_&/];
 *    the tag must contain at least one letter ('#123' is plain text)
 *  - mention: '@' + 3..30 of [\p{L}\p{N}_.-], trailing '.'/'-' trimmed; '@' at start or preceded by a char
 *    NOT in [\p{L}\p{N}_.@-]
 */
const TOKEN_RE = new RegExp(
  // trailing negative lookahead: a run of 51+ chars is NOT a tag (never a 50-char prefix) - same as the backend
  '(?<![\\p{L}\\p{N}_&/])#([\\p{L}\\p{N}_]{1,50})(?![\\p{L}\\p{N}_])' +
    '|(?<![\\p{L}\\p{N}_.@-])@([\\p{L}\\p{N}_.-]{3,30})',
  'gu'
);
const HAS_LETTER_RE = /\p{L}/u;

/** Number of Unicode code points (an emoji counts as one, unlike String.length). */
export function countChars(text: string): number {
  return [...text].length;
}

/**
 * Splits text into plain / hashtag / mention segments. A '@name' becomes a mention segment only when `name`
 * (case-insensitive) is in `mentions`; otherwise it stays plain text. Pure and escape-safe (no HTML involved).
 *
 * `hashtags`: the server's normalised tag list for this text. When given, a '#tag' is linked only if its lower-cased
 * form is in the list (posts created before hashtag indexing have no rows, so a link would lead to a timeline that
 * does not contain them). `null` = no filtering (used for text the server did not index, e.g. a shared post's
 * original content).
 */
export function tokenizeRichText(
  text: string,
  mentions: PostMention[] = [],
  hashtags: string[] | null = null
): RichTextSegment[] {
  const byName = new Map(mentions.map(m => [m.username.toLowerCase(), m.userId]));
  const knownTags = hashtags === null ? null : new Set(hashtags.map(t => t.toLowerCase()));
  const segments: RichTextSegment[] = [];
  let cursor = 0;

  const pushText = (to: number) => {
    if (to > cursor) segments.push({ type: 'text', text: text.slice(cursor, to) });
    cursor = to;
  };

  for (const match of text.matchAll(TOKEN_RE)) {
    const start = match.index!;
    if (match[1] !== undefined) {
      if (!HAS_LETTER_RE.test(match[1])) continue;
      if (knownTags !== null && !knownTags.has(match[1].toLowerCase())) continue;
      pushText(start);
      const end = start + 1 + match[1].length;
      segments.push({ type: 'hashtag', text: text.slice(start, end), tag: match[1].toLowerCase() });
      cursor = end;
    } else {
      const name = match[2].replace(/[.-]+$/, '');
      if (name.length < 3) continue;
      const userId = byName.get(name.toLowerCase());
      if (userId === undefined) continue;
      pushText(start);
      const end = start + 1 + name.length;
      segments.push({ type: 'mention', text: text.slice(start, end), userId });
      cursor = end;
    }
  }
  pushText(text.length);
  return segments;
}
