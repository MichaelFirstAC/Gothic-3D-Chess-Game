# Gothic Chess

A two-player 3D chess game with a gothic set, built with Three.js. All models and textures are generated in code. **The Inquisition** reviews your games: Stockfish rates every move, and Claude explains the key mistakes in plain language.

## Run

```powershell
npm install
```

```powershell
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173). `npm test` runs the tests, `npm run build` writes the site to `dist/`, and `npm run preview` serves that build. Node.js 20.19+ or 22.12+ is required.

The game and the engine review need no configuration. Written commentary and the Chess.com contact string come from environment variables.

### Environment variables

Copy the example file, then fill it in:

```powershell
Copy-Item .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables written commentary. Without it, the review still works and the panel says why there is no commentary. API calls are billed to this key. |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-sonnet-5-5`. |
| `CHESSCOM_CONTACT` | A contact detail (email address or project URL) added to the User-Agent sent to Chess.com. |

`.env` is ignored by git. None of these variables has the `VITE_` prefix, so Vite never puts them in browser code. Only the server endpoints read them. Restart `npm run dev` after changing `.env`.

## Controls

- Click a piece, then a highlighted square. Green dots are moves, red rings are captures.
- Drag to rotate, scroll to zoom, right-drag to pan.
- **Flip board** swaps sides; **Turn board after each move** does it automatically.

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

Stockfish decides how good each move is. Claude only explains moves the engine has already flagged: the reviewed side's mistakes and blunders plus the three largest swings, at most six per game, in one request. For an imported game, the reviewed side is the player whose name you looked up. Otherwise both sides are reviewed. Dotted underlines mark the explained moves, and a three-point summary appears at the final position.

For each of these moves, the server sends Anthropic the position, the move played, the engine's best move and line, the engine's expected reply to the move played, the evaluations, the move number and the game phase. Usernames are not sent. The explanations are generated text and can be wrong, so check them against the engine's lines.

## Importing games

Choose **Import**, enter a Chess.com username and pick a game from the most recent month that player was active (up to 50 games, newest first). It opens in review mode, seen from that player's side. Only standard chess is listed.

Game data comes from [Chess.com's Published-Data API](https://www.chess.com/news/view/published-data-api), the official read-only public API. The app does not log in, scrape pages or use any other Chess.com endpoint. The server caches replies in memory for five minutes. The data can lag behind the site. This project is not affiliated with or endorsed by Chess.com.

## Deploying to Vercel

1. Push the repository to GitHub, GitLab or Bitbucket, and import it as a new Vercel project. Vercel detects Vite: the build command is `npm run build` and the output directory is `dist`. No `vercel.json` is needed.
2. In the project's **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` and `CHESSCOM_CONTACT` (and `ANTHROPIC_MODEL` if you want one).
3. Deploy. The files in `api/` become the `/api/explain` and `/api/chesscom` functions. Redeploy after changing a variable.

On a static host without these functions, the game and the engine review still work. Import and commentary report that they are unavailable.

**Before sharing a public link:** anyone who can reach your deployment can use these endpoints, and commentary is billed to your API key. `/api/explain` accepts only well-formed chess data (six moves at most), refuses calls from pages on other sites, and limits each address to 10 requests per 10 minutes. Neither check stops a determined script, and the limit is counted separately by each server instance. Set a spend limit on the key, or turn on Vercel's deployment protection or firewall rate limiting.

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
| `src/scene.js` | Board, lighting, cathedral setting, highlights, best-move arrow |
| `src/main.js` | Input, animation, side panel |
| `src/reviewMode.js` | Review mode: stepping, ratings, eval bar, commentary |
| `src/importDialog.js` | Import by username |
| `src/analysis/` | Stockfish wrapper, review pass, scoring math, key moments, commentary client |
| `api/` | Server endpoints (Vercel functions, also mounted by the Vite dev and preview servers) |
| `server/http.js` | Helpers shared by the endpoints |
| `test/` | Rules, notation, analysis and endpoint tests; `fixtures/` holds a real public game from the Published-Data API |
