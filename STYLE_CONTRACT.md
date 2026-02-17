# STYLE_CONTRACT.md

Scope

- Repo basis: tracked root files only (`README.md`, `app.js`, `index.html`, `styles.css`, `.gitignore`).
- Excluded as external/local vendor: `NES.css-develop/` (ignored in `.gitignore`).

Scanned config/docs status

- `AGENTS.md`: not found.
- `README.md`: found (run/customize guidance).
- `CONTRIBUTING.md`: not found at root.
- `pyproject.toml`, `ruff.toml`, `setup.cfg`, `mypy.ini`: not found.
- `.editorconfig`, `.pre-commit-config.yaml`: not found at root.
- `Makefile`, `justfile`: not found.
- `.github/workflows/*`: not found.

Dominant architecture

- Pattern: single-page, DOM-driven state machine controller in one file.
- Controller/router example: `app.js` (`renderStep`, step render functions, click handlers).
- Service module example: none found (`uncertain`).
- DB model module example: none found (`uncertain`).
- Schema/DTO module example: none found (`uncertain`).
- Representative `pytest` file: none found (`uncertain`).

Conventions

- JavaScript uses `const` for config/constants and `let` for mutable app state.
- Constant names are `UPPER_SNAKE_CASE`; functions/vars are `camelCase`.
- Two-space indentation, semicolons, double quotes, trailing commas in multiline objects/arrays.
- DOM nodes are queried once near top-level and reused.
- UI state changes are centralized through small helpers (`setVisible`, `setStepImage`, etc.).
- Control flow prefers guard clauses and early returns.
- Event wiring uses inline arrow callbacks with local closure state.
- CSS uses kebab-case class names, ID hooks for layout anchors, and a `.hidden` utility toggle.
- Styling favors explicit pixel/hex design tokens and animation keyframes.
- Accessibility is present via `aria-label`, `aria-live`, and decorative `alt=""`.

Do rules

- Keep quiz content/config in top constants (`QUESTIONS`, timing, text, audio volume).
- Route new behavior through `renderStep()` + dedicated `render*Step()` functions.
- Reuse helper functions instead of duplicating class toggles and audio guards.
- Preserve existing DOM IDs/classes used by JS.

Don’t rules

- Don’t introduce backend/service/model abstractions without need (`uncertain` for future scale).
- Don’t edit `NES.css-develop/` for app behavior.
- Don’t replace `.hidden` toggling with mixed ad-hoc inline visibility logic.
