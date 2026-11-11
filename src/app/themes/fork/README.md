# Fork dark themes

Self-contained module providing the 26 fork-only dark themes. Registry totals after integration:
30 themes (2 light, 28 dark). Built-ins (Light, Silver, Dark, Butter) are untouched and stay in
`src/colors.css.ts` / `src/app/hooks/useTheme.ts`.

## Layout

| File | Role |
| --- | --- |
| `palettes/*.ts` | Verified palette source data per family, with per-role provenance comments |
| `derive.ts` | Pure `ForkPalette` → full Folds color-token derivation and contrast helpers |
| `registry.ts` | Ordered `{ id, name, palette }` metadata; IDs are stable once released |
| `themes.css.ts` | One `createTheme(color, deriveColorData(palette))` per registry entry |
| `darkVariables.ts` | `on-dark-variables` body class constant |
| `index.ts` | Module exports consumed by `useTheme.ts` |

`registry.ts` and everything it imports are pure data (no Vanilla Extract), so tests can evaluate
the full registry and derivation in Node. `useTheme.ts` maps `forkThemes` into `Theme` entries with
`ThemeKind.Dark` and exposes `allThemes` / `themeDisplayNames` module constants next to the
existing hooks.

Every fork theme's `classNames` are `[<id>, <token class>, onDarkFontWeight, 'prism-dark',
'on-dark-variables']`. Dark and Butter carry `on-dark-variables` as well; the variables themselves
live once in `src/index.css` under `.dark-theme, .butter-theme, .on-dark-variables`.

## Palette provenance

All values were verified against the upstream sources below (fetched October 2026; the less-vs
ports November 2026). All licenses permit redistribution of the color values with attribution; none require payment or
non-commercial terms. Palettes are embedded locally; nothing is downloaded at runtime.

| Family | Source | License | Notes on role mapping |
| --- | --- | --- | --- |
| Ayu | <https://github.com/ayu-theme/ayu-colors> (`themes/dark.yaml`, `themes/mirage.yaml`) | MIT | `surface.base/lift`, `ui.panel.bg`, `editor.fg`, base palette accents (ayu computes ramp steps at runtime, so stored base hexes are used) |
| Catppuccin | <https://github.com/catppuccin/palette> (`palette.json`) | MIT | `base/surface0/surface1` surfaces, `text` foreground, `blue` primary, `peach` warning |
| Color Fatigue | <https://github.com/exdysa/less-vs> (`themes/color-fatigue-dark.json`), a port of <https://github.com/noidilin/vscode-theme-color-fatigue> | MIT / MIT | Grey ramp `#191919/#1E1E1E/#242424`; the warm grey of links and progress bars is primary |
| Cool Cowboy | <https://github.com/exdysa/less-vs> (`themes/cool-cowboy-theme.json`), a port of <https://github.com/LRijpkema/cool-cowboy-theme> | MIT / MIT | Two surfaces (SurfaceVariant derived); `button.background` teal is primary; the theme has no green, so its passed/added blue is success |
| Dracula | <https://github.com/dracula/dracula-theme> (README palette table) | MIT | Only Background/Current Line are surfaces (SurfaceVariant derived); `purple` is primary (no blue in the palette) |
| Everforest | <https://github.com/sainnhe/everforest> (`palette.md`) | MIT | `bg0/bg1/bg2` per hard/medium/soft; accents shared across variants |
| Gruvbox | <https://github.com/morhetz/gruvbox> (`colors/gruvbox.vim`) | MIT/X11 | `dark0_hard/soft` per variant; bright accent tier, matching the colorscheme's dark-mode mapping |
| Kanagawa | <https://github.com/rebelot/kanagawa.nvim> (`lua/kanagawa/colors.lua`, `themes.lua`) | MIT | Wave: sumiInk3/4/5 + diagnostics accents. Dragon: dragonBlack3/2/4 + dragon syntax accents |
| Kanso | <https://github.com/exdysa/less-vs> (`themes/kanso-ink.json`), a port of <https://github.com/webhooked/kanso.nvim> | MIT / MIT | Ink: the port's `inkBg0/2/3` surfaces, `blue3` primary; `gitGreen`, `yellow` and `red` follow kanso.nvim's `vcs.added`, `diag.warning` and `diag.error` |
| Nord | <https://www.nordtheme.com/docs/colors-and-palettes> | Nord (MIT-based) | Polar Night surfaces, `nord9` frost primary, Aurora status colors |
| Rosé Pine | <https://github.com/rose-pine/neovim> (`lua/rose-pine/palette.lua`) | MIT | `base/surface/overlay`, `text`; `iris` primary, `foam` success (the dimmer `pine` fails visibility on the dark base) |
| Sequoia | <https://github.com/exdysa/less-vs> (`themes/sequoia-monochrome.json`), a port of <https://github.com/Sequoia-Theme/vs-code> | MIT / MIT | Monochrome: every accent is a step of one blue-grey ramp, so status colors differ by lightness only; its dim `editor.foreground` is lightened for AA (see Token derivation) |
| Tokyo Night | <https://github.com/folke/tokyonight.nvim> (`lua/tokyonight/colors/{night,storm,moon}.lua`) | Apache-2.0 | `bg` + `bg_highlight` surfaces (no third level defined, derived); `night` inherits storm accents upstream |

## Token derivation

`deriveColorData()` maps each `ForkPalette` to the complete Folds contract:

- **Background / Surface / SurfaceVariant** retain `bg0`/`bg1`/`bg2` (`bg2` defaults to
  `bg1` mixed 5% toward white). Hover/active/line backgrounds mix 5/10/15% toward white.
- **Accent groups** retain `accent`/`green`/`orange ?? yellow`/`red` as `Main`. `OnMain`
  prefers a dark or light tint of the accent, with measured black/white fallbacks.
  Hover/active/line backgrounds mix 5/10/15% toward white for dark text, or toward black
  for light text. This increases contrast instead of moving the background toward the text.
- **Accent containers** mix the accent 72/66/60/54% toward `bg0` for normal/hover/active/line.
  Text prefers accent tints mixed 55/70/85% toward white.
- **Secondary** is the neutral ramp from the text color of the base background (the palette
  foreground, or its lightened fallback when a dim foreground misses AA there) toward `bg0`;
  containers mix 16/20/24/28% toward that text color.
- **Container text** prefers the palette foreground (or accent tint), then lighter candidates.
  Every text selection checks normal, hover, and active backgrounds together at >= 4.5:1.
  Black and white are final candidates; a palette without a shared readable foreground fails
  at build time instead of silently emitting low-contrast text.
- **Other**: FocusRing/Shadow/Overlay match the built-in dark theme.

## Contrast checks

`tests/unit/themePalettes.test.ts` enforces >= 4.5:1 for `OnMain` and `OnContainer` against
normal, hovered, and pressed backgrounds across every fork theme. It also covers grayscale
boundary accents, saturated accents, and rejection of incompatible container ramps. Source
background/accent colors and distinct interaction states are checked separately.

These token checks cover full-opacity text; they are not a whole-application accessibility
audit. Check rendered components, reduced-opacity text, links, and focus indicators visually too.

`--tc-link` and the `--mx-uc-*` user colors keep the shared dark values (75-80% lightness), which
read on every fork background (all base backgrounds are at or below L* 25). Per-theme overrides
can be added later via a theme-specific CSS block if a future palette needs them.

Prism code blocks use the shared `prism-dark` palette for all new themes; per-theme syntax
palettes are explicitly out of scope.

## Adding another dark theme

1. Add the verified palette to the family file in `palettes/` with source and role comments.
2. Add the `{ id, name, palette }` entry to `forkThemeRegistry` (append; never reorder or reuse
   IDs — stored user settings reference them).
3. Extend the expected ID/name lists in `tests/unit/themeRegistry.test.ts` and check
   `tests/unit/themePalettes.test.ts` passes (contrast + completeness are automatic).
4. Run `npm run test:unit` and `npm run build`; verify the theme in the Appearance settings.

Keep `ForkPalette` imports/exports type-only (`import type`, `export type`). The dev server
serves modules as raw ESM, so a type re-exported as a value compiles but crashes the browser at
boot with "does not provide an export named 'ForkPalette'" — production builds and Vitest do not
catch it.

## Tests

- `tests/unit/themeRegistry.test.ts` — registry shape, IDs, names, classes, selection resolver.
- `tests/unit/themePalettes.test.ts` — token completeness, validity, contrast minimums, variant
  distinctness.
- `tests/unit/ThemeManager.test.tsx` — body class application/cleanup, system-mode selection,
  persistence, unrelated-setting isolation.

Both hook-side test files stub `@vanilla-extract/css` and `localStorage` because the app's
`.css.ts` modules and settings store are not Node-safe; the palette/registry tests run without
stubs.
