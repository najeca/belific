# Design tokens: the Quiet Function look (Ellie Planner shapes)

One set of colours, shapes and fonts for Belific, Landis and Proload. Only the accent changes per app. The full
rules (components, do and don't) are in `docs/DESIGN_SYSTEM.md`.

| File | What it is | Use it for |
|---|---|---|
| `tokens.json` | Every token as data: `color.light`, `color.dark`, `accent.<app>`, `radius`, `space`, `font`, `fontSize` | Anything that is not CSS (a native app, a design tool, a script) |
| `tokens.css` | The tokens as CSS variables (`--ds-*`), light by default, dark by `data-theme`, one accent per app by `data-accent` | A web app: link it and use `var(--ds-surface)` |
| `tailwind-preset.js` | A Tailwind preset that maps the same names to those variables | A Tailwind project |

**Do not edit these files.** They are generated from `mobile/lib/tokens.ts` (the one source in Belific):
edit that file, then run `node scripts/export-tokens.mjs` in `mobile/`. `mobile/lib/designTokens.test.ts` fails if
the committed files are out of date.

## Use in a web project (Landis, Proload)

1. Copy this folder into the project (or point at it) and load the CSS once:

   ```html
   <link rel="stylesheet" href="design-tokens/tokens.css" />
   <html data-theme="light" data-accent="landis">
   ```

   `data-theme` is `light` (the default), `dark`, or `system` (follows the computer). `data-accent` is `belific`
   (the default), `landis` or `proload`. Change either attribute and everything repaints; no rebuild.

2. Read colours only from the variables, never as a hex in a component:

   ```css
   .card { background: var(--ds-surface); border: 1px solid var(--ds-border); border-radius: var(--ds-radius-lg); }
   ```

3. Tailwind: `presets: [require('./design-tokens/tailwind-preset.js')]`, then `bg-surface`, `text-text-secondary`,
   `rounded-lg`, `border-border`, `font-display`. `dark:` follows `data-theme="dark"`.

## Fonts

Inter for the interface, Newsreader (a warm serif) for the app name and big page titles only, Roboto Mono for times
and figures. All three are open fonts (SIL Open Font License or Apache 2.0): ship the files with the app so it works
offline (Belific keeps them in `mobile/assets/fonts/` with their licences) and declare them with `@font-face`; the
`--ds-font-*` variables only name the families.

## Contrast

Every pair is checked in `mobile/lib/tokens.test.ts` and `designTokens.test.ts`: text 4.5:1 or more on every surface
it sits on, the accent as text 4.5:1, the text on an accent fill 4.5:1 (Proload's orange and Landis' dark indigo
take near black text for that reason), charts 3:1.
