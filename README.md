# Walinga Trivia Arcade — file structure

Split from one 142 KB `index.html` into four files:

| File | What's in it | Size |
|---|---|---|
| `index.html` | CSS, home-screen markup, and a small loader script | 22 KB |
| `game-engines.js` | All game-engine classes (`FreeRecallGame`, `PromptQuiz`, `MinefieldQuiz`, `TriviaQuiz`, `StateMapQuiz`, `FindStateQuiz`, `PresidentsRecallGame`) and shared helpers | 52 KB |
| `quiz-data.json` | Every dataset — countries, states, capitals, rankings, president/PM/monarch terms, all state trivia questions | 70 KB |
| `app-init.js` | Wiring: builds lookup tables from the data and instantiates every game | 15 KB |

**What this means for your workflow:** most edits only touch one file.
- Tweaking a game's rules or scoring logic → upload `game-engines.js` alone (52 KB instead of 142 KB).
- Fixing a trivia question or adding a country → upload `quiz-data.json` alone (70 KB, and you don't need to explain any code at all — it's plain JSON).
- Adding a new quiz, changing a duration, or editing a home-page card → `app-init.js` (15 KB) and/or `index.html` (22 KB).
- Restyling → just `index.html`.

**Adding a new state trivia quiz** now takes two small edits instead of touching the whole file: add a `"NEWSTATE_TRIVIA": [...]` array to `quiz-data.json`, then add one entry (and `NEWSTATE_TRIVIA` to the destructured list at the top) in `app-init.js`. The full step-by-step is still preserved as a comment right above `STATE_SHOWCASE_QUIZZES` in `app-init.js`.

**Markup deduplication:** the 19 near-identical game-screen `<div>` shells that used to be hand-written in the HTML body are now generated from one `SCREEN_IDS` array in `index.html` (same pattern the state-showcase screens already used). Adding a new non-showcase game screen means adding its id to that array instead of pasting a new markup block.

## Running it

Because `index.html` now `fetch()`es `quiz-data.json`, opening the file directly (`file://...`) won't work in most browsers (CORS blocks local file fetches). Serve the folder instead:

```
python3 -m http.server
```

then open `http://localhost:8000/`.

## Verified

Loaded the real `index.html` (with the actual `game-engines.js`, `app-init.js`, and `quiz-data.json`) in a headless DOM and confirmed: all 19 screens + 8 state-showcase screens generate correctly, all game instances wire up to the right data (durations, item counts, alias lookups all matched the original), and navigation between screens works with no errors introduced by the split.
