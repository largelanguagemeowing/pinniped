import { MatchResult } from '../internal';
import { InlineMDMark, InlineMDRule } from './type';

/**
 * Finds the rule that matches earliest in the text.
 * When several rules match at the same index, the first one in `rules` wins.
 *
 * @param text - The text to match against.
 * @param rules - The markdown rules to try.
 * @returns The winning rule with its match or `undefined` if no rule matches.
 */
export const findInlineRule = (
  text: string,
  rules: InlineMDRule[]
): [InlineMDRule, MatchResult] | undefined => {
  let targetRule: InlineMDRule | undefined;
  let targetResult: MatchResult | undefined;

  rules.forEach((rule) => {
    const currentResult = rule.match(text);
    if (currentResult && typeof currentResult.index === 'number') {
      if (
        !targetResult ||
        (typeof targetResult?.index === 'number' && currentResult.index < targetResult.index)
      ) {
        targetResult = currentResult;
        targetRule = rule;
      }
    }
  });

  if (targetRule && targetResult) return [targetRule, targetResult];
  return undefined;
};

/**
 * A formatted or syntax range inside a text, relative to the start of the text.
 */
export type InlineMDRange = {
  mark: InlineMDMark | 'syntax';
  start: number;
  end: number;
};

/**
 * Type for a function that finds the rule to apply to the text.
 */
export type InlineRuleFinder = (text: string) => [InlineMDRule, MatchResult] | undefined;

/**
 * Tokenizes text into markdown ranges using the same rule order as the HTML parser.
 *
 * @param text - The text to tokenize.
 * @param find - A function that picks the rule to apply to the text.
 * @param offset - The offset added to every range.
 * @returns The formatted and syntax ranges.
 */
export const tokenizeInline = (
  text: string,
  find: InlineRuleFinder,
  offset = 0
): InlineMDRange[] => {
  const ranges: InlineMDRange[] = [];
  // the text after a match is the next turn of the loop, not a nested call
  let rest = text;
  let restOffset = offset;
  while (rest !== '') {
    const found = find(rest);
    if (!found) break;

    const [rule, match] = found;
    const { token } = rule;
    const index = match.index ?? 0;
    const end = index + match[0].length;
    const open = typeof token.open === 'number' ? token.open : token.open(match);
    const close = typeof token.close === 'number' ? token.close : token.close(match);

    ranges.push(...tokenizeInline(rest.slice(0, index), find, restOffset), {
      mark: token.mark,
      start: restOffset + index,
      end: restOffset + end,
    });
    if (open > 0) {
      ranges.push({ mark: 'syntax', start: restOffset + index, end: restOffset + index + open });
    }
    if (close > 0) {
      ranges.push({ mark: 'syntax', start: restOffset + end - close, end: restOffset + end });
    }
    if (!token.raw) {
      tokenizeInline(
        rest.slice(index + open, end - close),
        find,
        restOffset + index + open
      ).forEach((range) => ranges.push(range));
    }
    rest = rest.slice(end);
    restOffset += end;
  }
  return ranges;
};
