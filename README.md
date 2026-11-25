# Gothic Chess

A two-player 3D chess game with a gothic set in a gothic cathedral, built with Three.js. All models, textures and sounds are generated in code; there are no model, texture or audio files. **The Inquisition** reviews your games: Stockfish rates every move and the panel comments on each one in plain language. With a free Groq key, an AI model explains the key mistakes.

## Run

```powershell
npm install
```

```powershell
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173). `npm test` runs the tests, `npm run build` writes the site to `dist/`, and `npm run preview` serves that build. Node.js 20.19+ or 22.12+ is required.

The game, the engine review and the commentary need no configuration. AI explanations and the Chess.com contact string come from environment variables.

### Environment variables

Copy the example file, then fill it in:

```powershell
Copy-Item .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Optional. A free key from [console.groq.com](https://console.groq.com) enables AI explanations of the key moments. Without it, all commentary is written without AI. |
| `GROQ_MODEL` | Optional. Defaults to `openai/gpt-oss-120b`. |
| `CHESSCOM_CONTACT` | A contact detail (email address or project URL) added to the User-Agent sent to Chess.com. |

A variable already set in your system environment takes priority over `.env`. `.env` is ignored by git. None of these variables has the `VITE_` prefix, so Vite never puts them in browser code. Only the server endpoints read them. Restart `npm run dev` after changing them.

## Controls

- Click a piece, then a highlighted square. Green dots are moves, red rings are captures.
- Drag to rotate, scroll to zoom, right-drag to pan. You can tilt low enough to look over the rim into the drop; panning stops a short way from the board, so the camera never goes under the rock or leaves the building.
- Or use the keyboard: **A/D** rotate around the board, **W/S** tilt (up toward a top view, down toward eye level), **Q/E** zoom out and in. Hold a key to keep moving. The keys follow their physical positions, so they work the same on AZERTY and other layouts. They are ignored while a dialog is open or you are typing.
- **Flip board** swaps sides; **Turn board after each move** does it automatically.

## The setting

- **The cathedral** is a High Gothic interior after Cologne Cathedral, with the board at the crossing: clustered piers, pointed arcades, a triforium, a tall clerestory, ribbed vaults, a rose window and shafts of coloured light. It has no floor: the piers and walls run on down into a chasm and fade into black, with drifting dust and a faint cold haze. Hold S, or drag downward, for a low angle that looks up the nave.
- **The stonework** does not visibly repeat. Two differently laid walls with uneven courses are mapped by position, shifted on every pier and bay, blended together and weathered with soot and damp on a much larger scale than any block.
- **The rock pillar** is all that holds up the board: one craggy spire with a dais carved from its top, a broken rim, four spurs for the candle stands and two ledges for captured pieces. It is a single mesh with a single material.
- **Candles** have shader-drawn flames. Each stand's light flickers with the same noise as its flames.
- **The board** keeps its marble squares, set in a carved stone frame seated on the dais.

## Animations

- **Capture:** the piece is crushed, shatters, sinks into the board, and gathers itself again on the rock ledge on the captor's side.
- **Promotion:** the pawn cracks and sinks, then the new piece is built from fragments rising out of the square.
- **Take back:** the move plays in reverse, including the rook when castling, and captured pieces return from the ledges. In review, stepping back one move does the same; longer jumps are instant. Extra clicks while it runs are ignored.
- **Best-move arrow:** knight moves are drawn as an L, long leg first.

If your system asks for **reduced motion**, shattering, promotion and take-back become short fades and quick slides without hops.

## Sound and music

The controls are at the bottom of the panel. **Mute sound** and the volume slider next to it govern sound effects: selecting, moving (knights sound different), castling, capturing, reforming, promoting, check, checkmate, stalemate and draws, taking back, illegal clicks and panel buttons. **Music** is a separate toggle with its own volume, **off by default**: a slow organ drone that moves among D Dorian and Aeolian chords every 8 to 16 seconds, with an occasional distant choir. It fades in and out over two seconds and dips under sound effects. Both sets of settings are remembered in your browser.

**All audio is synthesised** with the Web Audio API and played through a generated cathedral reverb of about four seconds. Browsers only allow audio after your first click or key press. To replace a sound with a recording you have the rights to use (a CC0 file, for example), put it in `public/sounds/` and list it in `SOUND_FILES` in `src/audio.js`; nothing else needs to change.

## Performance

Repeated parts of the building are instanced. The game measures its frame times and, if they stay slow, steps down in stages: lower resolution and smaller shadows, then no light shafts, then no shadows. Add `?quality=high` or `?quality=low` to the address to fix the level.

## The Inquisition (game review)

Choose **Inquisition** at any point in a game, or in the dialog when it ends. Your game is left as it was, and **Exit review** returns to it. Moving pieces is disabled while reviewing.

- Click a move in the Chronicle, use the step buttons, or press the arrow keys (left and right step; up and down, or Home and End, jump to either end).
- The **green arrow** is the engine's preferred move in place of the one just shown. Before the first move, it is the suggested opening move.
- The **bar** beside the panel shows the evaluation from White's side, in pawns. `M3` means mate in 3.
- **Cancel** stops an analysis in progress.
- The engine searches to depth 14. Add `?depth=18` to the address for a deeper, slower search (6 to 22).

### Ratings

Each move is judged by how much winning chance the mover gave up, using `win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * centipawns)) - 1)`. Mate scores count as ±10000 centipawns.

| Mark | Rating | Win chance lost |
| --- | --- | --- |
| ★ | Best | The engine's own choice |
| none | Good | Under 2 points |
| ?! | Inaccuracy | 2 to under 10 |
| ? | Mistake | 10 to 20 |
| ?? | Blunder | Over 20, or missing or allowing a forced mate |

Accuracy for each side is the average over its moves of `103.1668 * exp(-0.04354 * loss) - 3.1669`, limited to 0–100. It is a simpler average than the one Lichess shows, and it will not match the accuracy figures Chess.com reports.

The lite engine and a fixed depth make this a quick review. A deeper search can rate a close move differently.

### Commentary

Stockfish decides how good each move is. The commentary only puts its findings into words.

**Without AI (always available).** The browser comments on every move and gives three lessons at the final position, with no network request. For each marked move it first checks what the engine's lines show: a mate allowed or missed, a stalemate, a piece left to be taken, a fork, material won or lost, an early queen, a king move that gives up castling, a loosened king shield or a knight on the edge. It then picks wording for that case from a few hundred phrases. A phrase is not reused within a game until the others in its group have been, and the same game always reads the same way. When no reason can be established, it says so instead of inventing one. Marked moves with no clear tactic are the most common case, so that is where you will notice repetition first.

**With Groq (optional).** The reviewed side's mistakes and blunders plus the three largest swings, at most six per game, are sent in one request. Their explanations replace the stock text, and dotted underlines mark them. For an imported game, the reviewed side is the player whose name you looked up. Otherwise both sides are reviewed. If Groq is unavailable, over its limit or not set up, the stock text stays and the panel says why. Groq's free plan has request and token limits; see your [limits page](https://console.groq.com/settings/limits).

**AI explanations can be wrong.** In testing, `openai/gpt-oss-120b` often misread captures and piece positions. The server therefore tells the model, in words worked out by the rules engine, where every piece stands, what each move in the engine's lines does and how the material ends up. It then drops any explanation that names a move outside those lines, puts a piece on a square it never occupies, or reports lost material the lines do not show. These checks catch only some errors. Wrong strategic claims and misdescribed sequences still get through, so trust the ratings and the arrow over the prose.

For each key moment, the server sends Groq the position, the move played, the engine's best move and line, the engine's expected reply to the move played, the evaluations, the move number, the game phase and the facts described above. Usernames are not sent.

## Importing games

Choose **Import**, enter a Chess.com username and pick a game from the most recent month that player was active (up to 50 games, newest first). It opens in review mode, seen from that player's side. Only standard chess is listed.

Game data comes from [Chess.com's Published-Data API](https://www.chess.com/news/view/published-data-api), the official read-only public API. The app does not log in, scrape pages or use any other Chess.com endpoint. The server caches replies in memory for five minutes. The data can lag behind the site. This project is not affiliated with or endorsed by Chess.com.

## Deploying to Vercel

1. Push the repository to GitHub, GitLab or Bitbucket, and import it as a new Vercel project. Vercel detects Vite: the build command is `npm run build` and the output directory is `dist`. No `vercel.json` is needed.
2. In the project's **Settings → Environment Variables**, add `CHESSCOM_CONTACT`, plus `GROQ_API_KEY` if you want AI explanations (and `GROQ_MODEL` to change the model).
3. Deploy. The files in `api/` become the `/api/explain` and `/api/chesscom` functions. Redeploy after changing a variable.

On a static host without these functions, the game, the engine review and the commentary written without AI still work. Import and AI explanations report that they are unavailable.

**Before sharing a public link:** anyone who can reach your deployment can use these endpoints, and AI requests use your Groq allowance (or your bill, on a paid plan). `/api/explain` accepts only well-formed chess data (six moves at most), refuses calls from pages on other sites, and limits each address to 10 requests per 10 minutes. Neither check stops a determined script, and the limit is counted separately by each server instance. Stay on the free plan or set a spend limit, or turn on Vercel's deployment protection or firewall rate limiting.

## Third-party licences

The review engine is [Stockfish.js](https://github.com/nmrugg/stockfish.js) (the `stockfish` npm package, single-threaded lite WASM build), a port of [Stockfish](https://github.com/official-stockfish/Stockfish). It is licensed under **GPL-3.0**. A deployed site distributes the engine's files to visitors, so follow that licence: keep its notice and make the corresponding source available (the links above). The full text is in `node_modules/stockfish/Copying.txt`. If you plan to release this project under other terms, check how the GPL applies to you first.

The single-threaded build runs in a Web Worker and needs no `SharedArrayBuffer`, so no COOP or COEP headers are required.

## Rules

Based on the FIDE Laws of Chess:

- All piece moves, check, checkmate and stalemate.
- Castling (both sides, with every restriction), en passant, and promotion to queen, rook, bishop or knight.
- Threefold repetition and the fifty-move rule can be claimed, including by declaring the move that earns the claim.
- Fivefold repetition and the seventy-five move rule end the game automatically.
- Draw for insufficient material, draw by agreement, and resignation (a draw if the opponent has no possible way to checkmate).
- Moves are recorded in standard algebraic notation.

Not covered:

- Dead positions are detected from material only. Rare locked pawn walls where neither side can ever mate are not detected.
- Tournament procedure: clocks, touch-move, illegal-move penalties and arbiter rules. **Take back** is a casual-play convenience.
- Games and reviews are not saved when the page is reloaded.
- PGN import covers standard chess, including games that start from a set position. Only the main line is read.

## Layout

| File | Contents |
| --- | --- |
| `src/engine.js` | Rules and notation (SAN, FEN, UCI, PGN), with no graphics or network code |
| `src/pieces.js` | Gothic piece models |
| `src/scene.js` | Lighting, camera, board squares, candle stands, highlights, best-move arrow |
| `src/cathedral.js`, `src/frame.js`, `src/textures.js` | The building, the stone board surround, procedural textures |
| `src/stoneMaterial.js`, `src/stoneLayout.js` | The stone shader and how its walls are coursed |
| `src/pillar.js`, `src/pillarShape.js` | The rock pillar, its outline and where captured pieces stand |
| `src/abyssFog.js`, `src/abyssAir.js` | The darkness below the board, dust and haze |
| `src/candelabrum.js`, `src/candles.js` | The wrought-iron stands and their used candles |
| `src/boardView.js` | The pieces on screen: moves, take-backs, the graveyard |
| `src/effects/` | Flames, fracture, dissolve and shatter effects, animation timeline, knight arrow outline |
| `src/audio.js`, `src/music.js` | Synthesised sound effects and reverb; background music |
| `src/quality.js` | Frame-time check that lowers detail on slow machines |
| `src/main.js` | Input, animation, side panel |
| `src/reviewMode.js` | Review mode: stepping, ratings, eval bar, commentary |
| `src/importDialog.js` | Import by username |
| `src/analysis/` | Stockfish wrapper, review pass, scoring math, key moments, commentary |
| `src/analysis/narrator.js`, `phrasebook.js` | Commentary written without AI: the checks, then the wording |
| `src/analysis/grounding.js` | Facts given to the AI model, and checks on its replies |
| `api/` | Server endpoints (Vercel functions, also mounted by the Vite dev and preview servers) |
| `server/http.js` | Helpers shared by the endpoints |
| `test/` | Rules, notation, analysis, endpoint, effect and audio tests; `fixtures/` holds a real public game from the Published-Data API |
