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

## Menus

The game opens on a starting page with **Play**, **Review** and **Settings**. A game left half way adds **Resume game**. **Review** judges the last game played here or one you import.

The menu runs down one side. Beside it, thirty famous moments from chess history go by in a random order, thirty seconds each, with the camera drifting round the board. Each is set up just before its celebrated move, which is then played, in silence, and a caption names the game. All thirty are shown before any repeats. With reduced motion the camera stands still.

The moments are stored as the moves of each game (`src/famousMoments.js`), and the tests play every one through the rules engine. All thirty are games between two players. Seventeen are backed by a published record: the six championship games from 2013 to 2024 were copied from Wikipedia’s match pages, the four online duels from Chess.com’s public data API, and seven older ones (the Immortal, Evergreen and Century games, Kasparov–Topalov 1999, both Deep Blue games and Fischer–Spassky game six) were compared with Wikipedia and matched. The other thirteen older games have not been checked against a published source. Wikipedia notes that the usual endings of the Immortal and Evergreen games may not all have been played on the board.

During a game the board has the whole window, with a few small buttons at its edges:

- **Top left:** whose turn it is and the pieces taken. When the game is over, **Inquisition** and **New game** appear here.
- **Top right:** **Draw**, **Resign** and a gear for settings. Draw and Resign ask before doing anything, with **Cancel** already chosen. **Claim draw** appears only when a claim is possible.
- **Bottom left:** **Flip**, **Take back** and **Moves**, which shows or hides the list of moves.

**Settings** holds sound and music, **Turn board after each move**, a reminder of the camera controls and the way back to the **Main menu**. A side panel appears only during a review.

## Controls

- Click a piece, then a highlighted square. Green dots are moves, red rings are captures.
- Drag to rotate, scroll to zoom, right-drag to pan. You can tilt low enough to look over the rim into the drop; panning stops a short way from the board, so the camera never goes under the rock or leaves the building.
- Or use the keyboard: **A/D** rotate around the board, **W/S** tilt (up toward a top view, down toward eye level), **Q/E** zoom out and in. Hold a key to keep moving; the camera eases up to speed and glides to a stop when you let go. The keys follow their physical positions, so they work the same on AZERTY and other layouts. They are ignored on the starting page, while a dialog is open or while you are typing.
- **Flip** swaps sides; **Turn board after each move**, in Settings, does it automatically.

## Loading

A loading screen covers the first few seconds. Behind it the game builds its textures, compiles every shader, draws the whole scene once (including what the camera cannot see yet), prepares the capture effects, and settles the graphics quality. It lifts when frames arrive steadily, after at least 2.5 seconds.

## The setting

- **The cathedral** is a High Gothic cathedral after Cologne, in ruins. Whole stretches of wall have gone, pillars are snapped to stumps, most vaults have fallen but for the ribs springing from the walls, and the outer walls end in ragged tops. All round it is a sky of stars and drifting dark cloud. It has the board at the crossing: clustered piers, pointed arcades, a triforium, a tall clerestory, ribbed vaults, and at the east end what is left of the great rose window: a ragged hole right through the wall, with snapped tracery and a few teeth of glass. The other stained windows are broken too, and every gap shows the same night. It has no floor: the piers and walls run on down into a chasm and fade into black, with drifting dust and a faint cold haze. Hold S, or drag downward, for a low angle that looks up the nave.
- **The moon** is part of the sky, as distant as the stars: a clean storybook disc with a few pale seas, which no cloud crosses. It shows through the broken east window, where the wall cuts a little off it from low beside the board. Moonlight comes from its direction: the light that casts the board's shadows is on that side, and through the east window it lights only the stone that can see it.
- **The fires:** torches in iron brackets, caged lanterns hanging in the arches and fire bowls slung on chains, only on stone that still stands. All the ironwork is one mesh, and all the flames and halos are one draw each. Their light, with the window glows, is worked out once during loading into a grid through the building, so the walls read any number of lamps at the same small cost, and it flickers.
- **The stonework** is one plain colour with a soft polish and no texture, so nothing can repeat. Coloured light from the stained glass and warm candlelight near the board give every shaft and moulding a lit side and a shaded one. The building is coming apart: jagged cracks run all over it and flakes have broken from its face.
- **The rock pillar** is all that holds up the board. Its flat top is one slab of polished black marble with smoky, white and gold veins, inlaid with brass and pale stone, with a cut block that seats the board. It is painted as a single piece, so nothing on it repeats. Below are matte black boulders stacked down into the dark.
- **Candles** have shader-drawn flames. Each stand's light flickers with the same noise as its flames.
- **The board** keeps its marble squares, set in a carved stone frame seated on the dais.
- **The pieces** are honed marble: ivory with brass trim and black with oxblood trim, both crowded with hair-thin veins, specks and small flaws, and duller where they are flawed. Shade gathers low on each piece, and a faint edge light lifts it off the dark. Fragments keep their veins when a piece shatters.

## Animations

- **Capture:** the piece is crushed, shatters, sinks into the board, and gathers itself again on the rock beside the board, on the captor's side.
- **Promotion:** the pawn cracks and sinks, then the new piece is built from fragments rising out of the square.
- **Take back:** the move plays in reverse, including the rook when castling, and captured pieces return from beside the board. In review, stepping back one move does the same; longer jumps are instant. Extra clicks while it runs are ignored.
- **Best-move arrow:** knight moves are drawn as an L, long leg first.

If your system asks for **reduced motion**, shattering, promotion and take-back become short fades and quick slides without hops.

## Sound and music

The controls are in **Settings**. **Mute sound** and the volume slider next to it govern sound effects: selecting, moving (knights sound different), castling, capturing, reforming, promoting, check, checkmate, stalemate and draws, taking back, illegal clicks and buttons. **Music** is a separate toggle with its own volume, **off by default**: a slow organ drone that moves among D Dorian and Aeolian chords every 8 to 16 seconds, with an occasional distant choir. It fades in and out over two seconds and dips under sound effects. Both sets of settings are remembered in your browser.

**All audio is synthesised** with the Web Audio API and played through a generated cathedral reverb of about four seconds. Browsers only allow audio after your first click or key press. To replace a sound with a recording you have the rights to use (a CC0 file, for example), put it in `public/sounds/` and list it in `SOUND_FILES` in `src/audio.js`; nothing else needs to change.

## Performance

Repeated parts of the building are instanced, and the board squares and coordinates are merged into a few meshes. The number of pixels drawn is capped by the size of the window, so a large window on a high-density screen does not swamp a modest graphics chip. Shadows are redrawn only while something that casts one is moving. The cathedral is shaded last, and its shader skips lamps that cannot reach it.

The game also measures its frame times and, if they stay slow, steps down in stages: lower resolution and smaller shadows, then no drifting dust, then a lower resolution still. Add `?quality=high` or `?quality=low` to the address to fix the level.

## The Inquisition (game review)

Choose **Review** on the starting page, or **Inquisition** when a game ends. Your game is left as it was, and **Exit review** returns to where you were. Moving pieces is disabled while reviewing.

- Click a move in the Chronicle, use the step buttons, or press the arrow keys (left and right step; up and down, or Home and End, jump to either end).
- The panel is laid out to fit the window: the comment on the move shown sits above the move list, and the step buttons stay at the foot. The Verdict tab has each side's accuracy, how many moves of each kind it made, and the three lessons.
- The **yellow-tinted squares** are where the move that was played began and ended.
- The **green arrow** is the engine's preferred move in place of it, shown unless the move was rated Brilliant or Best. Before the first move, it is the suggested opening move. A key under the comment names both.
- The **bar** beside the panel shows the evaluation from White's side, in pawns. `M3` means mate in 3.
- **Cancel** stops an analysis in progress.
- The engine searches to depth 14. Add `?depth=18` to the address for a deeper, slower search (6 to 22).

### Ratings

Each move is judged by how much winning chance the mover gave up, using `win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * centipawns)) - 1)`. Mate scores count as ±10000 centipawns.

| Mark | Rating | Win chance lost |
| --- | --- | --- |
| !! | Brilliant | A sound sacrifice (see below) |
| ★ | Best | The engine's own choice |
| none | Good | Under 2 points |
| ?! | Inaccuracy | 2 to under 10 |
| ? | Mistake | 10 to 20 |
| ?? | Blunder | Over 20, or missing or allowing a forced mate |

**Brilliant** is a move that would be rated Best or Good and that also:

- puts a knight, bishop, rook or queen where the opponent can win it, leaving its side at least 2 points of material down once every recapture is counted (pawn 1, knight and bishop 3, rook 5, queen 9);
- gives something that was not lost already, and that cannot be won straight back elsewhere;
- leaves its side at least about level (45% or better), when it was not already 5 or more points of material ahead and had more than one legal move.

Only the piece moved is considered, so leaving a different piece to be taken does not count. This is the project's own rule; it is rare by design and will not always agree with other sites.

Accuracy for each side is the average over its moves of `103.1668 * exp(-0.04354 * loss) - 3.1669`, limited to 0–100. It is a simpler average than the one Lichess shows, and it will not match the accuracy figures Chess.com reports.

The lite engine and a fixed depth make this a quick review. A deeper search can rate a close move differently.

### Commentary

Stockfish decides how good each move is. The commentary only puts its findings into words.

**Without AI (always available).** The browser comments on every move and gives three lessons on the Verdict tab, with no network request. For each marked move it first checks what the engine's lines show: a mate allowed or missed, a stalemate, a piece left to be taken, a fork, material won or lost, an early queen, a king move that gives up castling, a loosened king shield or a knight on the edge. It then picks wording for that case from a few hundred phrases. A phrase is not reused within a game until the others in its group have been, and the same game always reads the same way. When no reason can be established, it says so instead of inventing one. Marked moves with no clear tactic are the most common case, so that is where you will notice repetition first.

**With Groq (optional).** The reviewed side's mistakes and blunders plus the three largest swings, at most six per game, are sent in one request. Their explanations replace the stock text, and dotted underlines mark them. For an imported game, the reviewed side is the player whose name you looked up. Otherwise both sides are reviewed. If Groq is unavailable, over its limit or not set up, the stock text stays and the Verdict tab says why. Groq's free plan has request and token limits; see your [limits page](https://console.groq.com/settings/limits).

**AI explanations can be wrong.** In testing, `openai/gpt-oss-120b` often misread captures and piece positions. The server therefore tells the model, in words worked out by the rules engine, where every piece stands, what each move in the engine's lines does and how the material ends up. It then drops any explanation that names a move outside those lines, puts a piece on a square it never occupies, or reports lost material the lines do not show. These checks catch only some errors. Wrong strategic claims and misdescribed sequences still get through, so trust the ratings and the arrow over the prose.

For each key moment, the server sends Groq the position, the move played, the engine's best move and line, the engine's expected reply to the move played, the evaluations, the move number, the game phase and the facts described above. Usernames are not sent.

## Importing games

Choose **Review**, then **Import a game** (with no game played yet, Review goes straight there). Enter a Chess.com username and pick a game from the most recent month that player was active (up to 50 games, newest first). It opens in review mode, seen from that player's side. Only standard chess is listed.

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
| `src/stoneMaterial.js` | The cathedral's plain cracked stone and its light |
| `src/ruin.js`, `src/ruinPlan.js`, `src/skyDome.js` | How stonework breaks, what has fallen, and the sky behind it |
| `src/lamps.js`, `src/lampPlan.js`, `src/lightBake.js` | The torches, lanterns and fire bowls, where they hang, and the stored light |
| `src/pillar.js`, `src/pillarShape.js` | The rock pillar, its outline and where captured pieces stand |
| `src/abyssFog.js`, `src/abyssAir.js` | The darkness below the board and the specks of dust in it |
| `src/candelabrum.js`, `src/candles.js` | The wrought-iron stands and their used candles |
| `src/boardView.js` | The pieces on screen: moves, take-backs, the graveyard |
| `src/effects/` | Flames, fracture, dissolve and shatter effects, animation timeline, knight arrow outline |
| `src/audio.js`, `src/music.js` | Synthesised sound effects and reverb; background music |
| `src/quality.js` | Frame-time check that lowers detail on slow machines |
| `src/renderBudget.js` | The pixel cap and when shadows are redrawn |
| `src/pick.js` | Which piece the pointer is over, found cheaply |
| `src/brokenRose.js`, `src/roseShape.js` | The broken east window, its glass and the moonlight through it |
| `src/brokenGlass.js`, `src/nightSky.js` | The other broken windows, and the sky and moon |
| `src/pieceMarble.js` | The marble finish of the pieces |
| `src/main.js` | Input, animation, the menus and in-game buttons |
| `src/reviewMode.js` | Review mode: stepping, ratings, eval bar, commentary |
| `src/importDialog.js` | Import by username |
| `src/showcase.js`, `src/famousMoments.js` | The famous moments behind the starting page |
| `src/analysis/` | Stockfish wrapper, review pass, scoring math, key moments, commentary |
| `src/analysis/narrator.js`, `phrasebook.js` | Commentary written without AI: the checks, then the wording |
| `src/analysis/grounding.js` | Facts given to the AI model, and checks on its replies |
| `api/` | Server endpoints (Vercel functions, also mounted by the Vite dev and preview servers) |
| `server/http.js` | Helpers shared by the endpoints |
| `test/` | Rules, notation, analysis, endpoint, effect and audio tests; `fixtures/` holds a real public game from the Published-Data API |
