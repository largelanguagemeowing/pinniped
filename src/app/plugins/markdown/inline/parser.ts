import {
  AngleLinkRule,
  BoldRule,
  CodeRule,
  EscapeRule,
  ItalicRule1,
  ItalicRule2,
  LinkRule,
  SpoilerRule,
  StrikeRule,
  UnderlineRule,
} from './rules';
import { InlineMDRange, findInlineRule, tokenizeInline } from './runner';
import { InlineMDParser } from './type';
import { afterMatch, beforeMatch } from '../internal';

const LeveledRules = [
  BoldRule,
  ItalicRule1,
  UnderlineRule,
  ItalicRule2,
  StrikeRule,
  SpoilerRule,
  LinkRule,
  AngleLinkRule,
  EscapeRule,
];

// a code span wins over every other rule wherever it is; the others compete by position
const findRule = (text: string): ReturnType<typeof findInlineRule> => {
  const codeMatch = CodeRule.match(text);
  if (codeMatch) return [CodeRule, codeMatch];
  return findInlineRule(text, LeveledRules);
};

/**
 * Parses inline markdown text into HTML using defined rules.
 *
 * The text after a match is parsed by the loop instead of by a call, so a long text nests calls
 * only as deep as its markup does.
 *
 * @param text - The markdown text to be parsed.
 * @returns The parsed HTML or the original text if no markdown was found.
 */
export const parseInlineMD: InlineMDParser = (text) => {
  let html = '';
  let rest = text;
  while (rest !== '') {
    const found = findRule(rest);
    if (!found) return html + rest;

    const [rule, match] = found;
    html += parseInlineMD(beforeMatch(rest, match)) + rule.html(parseInlineMD, match);
    rest = afterMatch(rest, match);
  }
  return html;
};

/**
 * Finds formatted and syntax ranges of inline markdown in plain text.
 * Mirrors the rule order of `parseInlineMD`.
 *
 * @param text - The raw (unsanitized) markdown text.
 * @param offset - The offset added to every range.
 * @returns The ranges found in the text.
 */
export const tokenizeInlineMD = (text: string, offset = 0): InlineMDRange[] =>
  tokenizeInline(text, findRule, offset);

export type { InlineMDRange };
