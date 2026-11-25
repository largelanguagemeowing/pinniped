export type ReplaceCallback<R> = (
  match: RegExpExecArray | RegExpMatchArray,
  pushIndex: number
) => R;
export type ConvertPartCallback<R> = (text: string, pushIndex: number) => R;

export const findAndReplace = <ReplaceReturnType, ConvertReturnType>(
  text: string,
  regex: RegExp,
  replace: ReplaceCallback<ReplaceReturnType>,
  convertPart: ConvertPartCallback<ConvertReturnType>
): Array<ReplaceReturnType | ConvertReturnType> => {
  const result: Array<ReplaceReturnType | ConvertReturnType> = [];
  let lastEnd = 0;

  let match: RegExpExecArray | RegExpMatchArray | null = regex.exec(text);
  while (match !== null && typeof match.index === 'number') {
    if (match[0].length === 0) {
      // an empty match never advances lastIndex; skip it instead of looping forever
      if (!regex.global) break;
      regex.lastIndex += 1;
      match = regex.exec(text);
      // eslint-disable-next-line no-continue
      continue;
    }
    result.push(convertPart(text.slice(lastEnd, match.index), result.length));
    result.push(replace(match, result.length));

    lastEnd = match.index + match[0].length;
    if (regex.global) match = regex.exec(text);
  }

  result.push(convertPart(text.slice(lastEnd), result.length));

  return result;
};
