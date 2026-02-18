# STYLE_CONTRACT.md

## Scope

This file defines frontend visual and interaction style only.

It does **not** define project architecture, backend structure, or required files.

Frontend assets may exist under:

- `app/web/`
- `app/static/`
- `app/frontend/`

These assets are optional during early backend development.

## Design Philosophy

Visual inspiration comes from a retro NES.css aesthetic:

- Pixel-art UI
- Soft pastel palettes
- Animated UI micro-interactions
- Accessibility-first markup

NES.css components (for example `nes-btn`, `nes-container`) may be used but must not be modified internally.

## CSS Conventions

### Naming

- Classes use kebab-case.
- IDs are layout anchors only (for example `#app`, `#card`).

Utility classes allowed:

- `.hidden`
- `.success`
- `.typewriter`

### Tokens

Prefer explicit pixel values and hex colors.

Examples:

- `#f9d9e2`
- `#e25572`
- `#c83f5f`

Avoid CSS frameworks beyond NES.css.

## Animation Patterns

Allowed animation categories:

- subtle float
- pulse
- wiggle
- typewriter caret
- falling decorative elements

Keyframes should be defined at file bottom.

Animations must:

- not block interaction
- remain performant
- avoid layout thrashing

## Layout Rules

- Centered card layout
- Max width around `420px`

Layering uses z-index in this order:

- background FX
- app shell
- UI overlay

Use flexbox, not grid, unless necessary.

## Accessibility Rules

Always preserve:

- `aria-label`
- `aria-live`
- `alt=""`

Decorative images must use empty alt text.

## Do Rules

- Keep design tokens consistent with existing palette.
- Prefer reusable animation classes.
- Keep DOM IDs stable for JS hooks.
- Use `.hidden` for visibility toggles.

## Don't Rules

- Do not introduce frontend frameworks (React/Vue/etc.).
- Do not refactor backend architecture from style updates.
- Do not embed OAuth or API logic into styling code.
- Do not edit vendor NES.css files.

## Frontend Role in This Project

Frontend is:

- a thin test shell
- a visual layer for backend API testing

Backend owns:

- OAuth
- API wrappers
- token logic
- data flow
