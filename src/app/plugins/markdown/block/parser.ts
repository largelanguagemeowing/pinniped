import { MatchResult, replaceMatch } from '../internal';
import {
  BlockQuoteRule,
  CodeBlockRule,
  ESC_BLOCK_SEQ,
  HeadingRule,
  ListRule,
  MultilineBlockQuoteRule,
  SubtextRule,
} from './rules';
import { BlockMDParser, BlockMDRule } from './type';

// in the order they are tried: the first rule that matches anywhere in the text wins
const BLOCK_RULES: BlockMDRule[] = [
  CodeBlockRule,
  MultilineBlockQuoteRule,
  BlockQuoteRule,
  ListRule,
  HeadingRule,
  SubtextRule,
];

// replace \n with <br/> because want to preserve empty lines
const parsePlainLines = (text: string, parseInline?: (txt: string) => string): string =>
  text
    .split('\n')
    .map((lineText) => {
      const match = lineText.match(ESC_BLOCK_SEQ);
      if (!match) {
        return parseInline?.(lineText) ?? lineText;
      }

      const [, g1] = match;
      return replaceMatch(lineText, match, g1, (t) => [parseInline?.(t) ?? t]).join('');
    })
    .join('<br/>');

/** A rule's first match in the text from `from` on; `match.index` is relative to `from`. */
type FoundMatch = { from: number; match: MatchResult | null };

/**
 * The rule's first match in the text from `pos` on. A match found from an earlier position holds
 * while it still lies ahead and `pos` starts a line, since `^` then matches the same places in
 * both texts; otherwise (or when it was consumed) the rule scans again. A match that ends inside
 * a line (a closing code fence followed by text) leaves `pos` mid-line, where `^` would match.
 */
const findMatch = (
  rule: BlockMDRule,
  text: string,
  pos: number,
  cached: FoundMatch | undefined
): FoundMatch => {
  const startsLine = pos === 0 || text[pos - 1] === '\n';
  if (cached && (cached.from === pos || startsLine)) {
    if (!cached.match) return cached;
    if (cached.from + (cached.match.index ?? 0) >= pos) return cached;
  }
  return { from: pos, match: rule.match(text.slice(pos)) };
};

/**
 * Parses block-level markdown text into HTML using defined block rules.
 *
 * The text after a match is parsed by the loop instead of by a call, so a long text nests calls
 * no deeper than it has rules (the text before a match holds no match of that rule). Each rule's
 * next match is kept between iterations, so a text of many blocks is scanned once per rule
 * instead of once per block.
 *
 * @param text - The markdown text to be parsed.
 * @param parseInline - Optional function to parse inline elements.
 * @returns The parsed HTML or the original text if no block-level markdown was found.
 */
export const parseBlockMD: BlockMDParser = (text, parseInline) => {
  let html = '';
  let pos = 0;
  const found: (FoundMatch | undefined)[] = [];
  while (pos < text.length) {
    let rule: BlockMDRule | undefined;
    let hit: FoundMatch | undefined;
    BLOCK_RULES.some((candidate, i) => {
      found[i] = findMatch(candidate, text, pos, found[i]);
      if (!found[i]!.match) return false;
      rule = candidate;
      hit = found[i];
      return true;
    });
    if (!rule || !hit?.match) return html + parsePlainLines(text.slice(pos), parseInline);

    const index = hit.from + (hit.match.index ?? 0);
    html += parseBlockMD(text.slice(pos, index), parseInline) + rule.html(hit.match, parseInline);
    pos = index + hit.match[0].length;
  }
  return html;
};
