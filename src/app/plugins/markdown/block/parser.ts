import { afterMatch, beforeMatch, MatchResult, replaceMatch } from '../internal';
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

/**
 * Parses block-level markdown text into HTML using defined block rules.
 *
 * The text after a match is parsed by the loop instead of by a call, so a long text nests calls
 * no deeper than it has rules (the text before a match holds no match of that rule).
 *
 * @param text - The markdown text to be parsed.
 * @param parseInline - Optional function to parse inline elements.
 * @returns The parsed HTML or the original text if no block-level markdown was found.
 */
export const parseBlockMD: BlockMDParser = (text, parseInline) => {
  let html = '';
  let rest = text;
  while (rest !== '') {
    let rule: BlockMDRule | undefined;
    let match: MatchResult | null = null;
    BLOCK_RULES.some((candidate) => {
      match = candidate.match(rest);
      if (match) rule = candidate;
      return match !== null;
    });
    if (!rule || !match) return html + parsePlainLines(rest, parseInline);

    html += parseBlockMD(beforeMatch(rest, match), parseInline) + rule.html(match, parseInline);
    rest = afterMatch(rest, match);
  }
  return html;
};
