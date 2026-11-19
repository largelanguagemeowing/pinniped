import { removeAdapter, setAdapter } from '@vanilla-extract/css/adapter';
import { endFileScope, setFileScope } from '@vanilla-extract/css/fileScope';
import { transformCss } from '@vanilla-extract/css/transformCss';

type Adapter = Parameters<typeof setAdapter>[0];
type CssObj = Parameters<typeof transformCss>[0]['cssObjs'][number];
type Composition = Parameters<typeof transformCss>[0]['composedClassLists'][number];

/**
 * Evaluates a vanilla-extract stylesheet the way the build does and returns the CSS it
 * produces with its exports (class names). Tests use it to put the real stylesheet in a browser.
 * `load` must import the stylesheet for the first time, so that it registers its styles now.
 */
export async function compileStyles<T>(
  filePath: string,
  load: () => Promise<T>
): Promise<{ css: string; styles: T }> {
  const cssObjs: CssObj[] = [];
  const localClassNames = new Set<string>();
  const composedClassLists: Composition[] = [];
  const adapter: Adapter = {
    appendCss: (css) => cssObjs.push(css),
    registerClassName: (className) => localClassNames.add(className),
    registerComposition: (composition) => composedClassLists.push(composition),
    markCompositionUsed: () => undefined,
    onEndFileScope: () => undefined,
    getIdentOption: () => 'debug',
  };

  setAdapter(adapter);
  setFileScope(filePath);
  try {
    const styles = await load();
    const css = transformCss({
      localClassNames: [...localClassNames],
      composedClassLists,
      cssObjs,
    }).join('\n');
    return { css, styles };
  } finally {
    endFileScope();
    removeAdapter();
  }
}
