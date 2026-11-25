# Gothic Chess

A two-player 3D chess game with a gothic set, built with Three.js. All models and textures are generated in code.

## Run

```powershell
npm install
```

```powershell
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173). `npm test` runs the rules tests, and `npm run build` writes a static site to `dist/`.

## Controls

- Click a piece, then a highlighted square. Green dots are moves, red rings are captures.
- Drag to rotate, scroll to zoom, right-drag to pan.
- **Flip board** swaps sides; **Turn board after each move** does it automatically.

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
- The game is not saved when the page is reloaded.

## Layout

| File | Contents |
| --- | --- |
| `src/engine.js` | Rules and notation, with no graphics code |
| `src/pieces.js` | Gothic piece models |
| `src/scene.js` | Board, lighting, cathedral setting, highlights |
| `src/main.js` | Input, animation, side panel |
| `test/engine.test.js` | Move-generation counts and rule tests |
