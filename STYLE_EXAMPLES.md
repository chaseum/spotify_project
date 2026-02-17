# STYLE_EXAMPLES.md

Pattern 1: Config-first constants

- Path: `app.js:30`

```js
const FEEDBACK_DELAY_MS = 3000;
const NO_MOVE_COOLDOWN_MS = 700;
const TYPEWRITER_CHAR_DELAY_MS = 42;
const FEEDBACK_TYPEWRITER_CHAR_DELAY_MS = 26;
const PROMPT_HIGHLIGHTS = ["city", "day", "hackathons", "food"];
const SOUND_VOLUME = {
  background: 0.12,
  select: 0.16,
  tap: 0.5,
};
```
