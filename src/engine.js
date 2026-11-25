// Chess rules following the FIDE Laws of Chess. No rendering code lives here.
// Squares are 0..63 with a1 = 0, h1 = 7, a8 = 56. White pieces are upper case.

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const fileOf = (sq) => sq & 7;
export const rankOf = (sq) => sq >> 3;
export const squareName = (sq) => 'abcdefgh'[fileOf(sq)] + (rankOf(sq) + 1);
export const squareIndex = (name) => (Number(name[1]) - 1) * 8 + 'abcdefgh'.indexOf(name[0]);
export const colorOf = (piece) => (piece === piece.toUpperCase() ? 'w' : 'b');
export const other = (color) => (color === 'w' ? 'b' : 'w');

const KNIGHT_STEPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_STEPS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAGONALS = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
const STRAIGHTS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function offset(sq, df, dr) {
  const f = fileOf(sq) + df;
  const r = rankOf(sq) + dr;
  return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f;
}

export function parseFen(fen) {
  const [placement, turn, castling, ep, halfmove = '0', fullmove = '1'] = fen.split(' ');
  const board = new Array(64).fill(null);
  placement.split('/').forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) file += Number(ch);
      else board[(7 - i) * 8 + file++] = ch;
    }
  });
  return {
    board,
    turn,
    castling: {
      K: castling.includes('K'), Q: castling.includes('Q'),
      k: castling.includes('k'), q: castling.includes('q'),
    },
    ep: ep === '-' ? -1 : squareIndex(ep),
    halfmove: Number(halfmove),
    fullmove: Number(fullmove),
  };
}

export function isAttacked(board, sq, by) {
  const piece = (type) => (by === 'w' ? type.toUpperCase() : type);
  // A pawn attacks diagonally forward, so look one rank "behind" the target.
  const pawnDr = by === 'w' ? -1 : 1;
  for (const df of [-1, 1]) {
    const from = offset(sq, df, pawnDr);
    if (from >= 0 && board[from] === piece('p')) return true;
  }
  for (const [df, dr] of KNIGHT_STEPS) {
    const from = offset(sq, df, dr);
    if (from >= 0 && board[from] === piece('n')) return true;
  }
  for (const [df, dr] of KING_STEPS) {
    const from = offset(sq, df, dr);
    if (from >= 0 && board[from] === piece('k')) return true;
  }
  for (const [dirs, slider] of [[DIAGONALS, 'b'], [STRAIGHTS, 'r']]) {
    for (const [df, dr] of dirs) {
      let from = offset(sq, df, dr);
      while (from >= 0) {
        const p = board[from];
        if (p) {
          if (p === piece(slider) || p === piece('q')) return true;
          break;
        }
        from = offset(from, df, dr);
      }
    }
  }
  return false;
}

export function inCheck(state, color = state.turn) {
  const king = state.board.indexOf(color === 'w' ? 'K' : 'k');
  return isAttacked(state.board, king, other(color));
}

function pseudoMoves(state) {
  const { board, turn } = state;
  const moves = [];
  const add = (from, to, extra = {}) => {
    moves.push({
      from, to, piece: board[from], captured: board[to], promotion: null, flag: null, ...extra,
    });
  };

  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || colorOf(p) !== turn) continue;
    const type = p.toLowerCase();

    if (type === 'p') {
      const dir = turn === 'w' ? 1 : -1;
      const startRank = turn === 'w' ? 1 : 6;
      const lastRank = turn === 'w' ? 7 : 0;
      const addPawn = (to, extra) => {
        if (rankOf(to) === lastRank) {
          for (const promo of ['q', 'r', 'b', 'n']) add(from, to, { ...extra, promotion: promo });
        } else add(from, to, extra);
      };
      const one = offset(from, 0, dir);
      if (one >= 0 && !board[one]) {
        addPawn(one);
        const two = offset(from, 0, 2 * dir);
        if (rankOf(from) === startRank && !board[two]) add(from, two, { flag: 'double' });
      }
      for (const df of [-1, 1]) {
        const to = offset(from, df, dir);
        if (to < 0) continue;
        if (board[to] && colorOf(board[to]) !== turn) addPawn(to);
        else if (to === state.ep) add(from, to, { flag: 'ep', captured: turn === 'w' ? 'p' : 'P' });
      }
      continue;
    }

    if (type === 'n' || type === 'k') {
      for (const [df, dr] of type === 'n' ? KNIGHT_STEPS : KING_STEPS) {
        const to = offset(from, df, dr);
        if (to >= 0 && (!board[to] || colorOf(board[to]) !== turn)) add(from, to);
      }
    } else {
      const dirs = type === 'b' ? DIAGONALS : type === 'r' ? STRAIGHTS : [...DIAGONALS, ...STRAIGHTS];
      for (const [df, dr] of dirs) {
        let to = offset(from, df, dr);
        while (to >= 0) {
          if (!board[to]) add(from, to);
          else {
            if (colorOf(board[to]) !== turn) add(from, to);
            break;
          }
          to = offset(to, df, dr);
        }
      }
    }

    if (type === 'k') {
      // Castling: king and rook unmoved, path empty, king not in check,
      // and the king neither crosses nor lands on an attacked square.
      const home = turn === 'w' ? 4 : 60;
      if (from !== home) continue;
      const enemy = other(turn);
      const rook = turn === 'w' ? 'R' : 'r';
      const [shortRight, longRight] = turn === 'w' ? ['K', 'Q'] : ['k', 'q'];
      if (isAttacked(board, home, enemy)) continue;
      if (state.castling[shortRight] && board[home + 3] === rook
          && !board[home + 1] && !board[home + 2]
          && !isAttacked(board, home + 1, enemy) && !isAttacked(board, home + 2, enemy)) {
        add(home, home + 2, { flag: 'castle-short' });
      }
      if (state.castling[longRight] && board[home - 4] === rook
          && !board[home - 1] && !board[home - 2] && !board[home - 3]
          && !isAttacked(board, home - 1, enemy) && !isAttacked(board, home - 2, enemy)) {
        add(home, home - 2, { flag: 'castle-long' });
      }
    }
  }
  return moves;
}

// Returns the position after `move`. The input state is not modified.
export function applyMove(state, move) {
  const board = state.board.slice();
  const { from, to, piece, flag, promotion } = move;
  const white = state.turn === 'w';

  board[from] = null;
  board[to] = promotion ? (white ? promotion.toUpperCase() : promotion) : piece;
  if (flag === 'ep') board[to + (white ? -8 : 8)] = null;
  if (flag === 'castle-short') { board[to - 1] = board[to + 1]; board[to + 1] = null; }
  if (flag === 'castle-long') { board[to + 1] = board[to - 2]; board[to - 2] = null; }

  const castling = { ...state.castling };
  if (piece === 'K') castling.K = castling.Q = false;
  if (piece === 'k') castling.k = castling.q = false;
  for (const [corner, right] of [[0, 'Q'], [7, 'K'], [56, 'q'], [63, 'k']]) {
    if (from === corner || to === corner) castling[right] = false;
  }

  return {
    board,
    turn: other(state.turn),
    castling,
    ep: flag === 'double' ? (from + to) / 2 : -1,
    halfmove: piece.toLowerCase() === 'p' || move.captured ? 0 : state.halfmove + 1,
    fullmove: state.fullmove + (white ? 0 : 1),
  };
}

export function legalMoves(state) {
  return pseudoMoves(state).filter((m) => !inCheck(applyMove(state, m), state.turn));
}

// Identity of a position for the repetition rules (FIDE 9.2): same player to move,
// same placement, same castling rights, same en passant possibilities.
export function positionKey(state) {
  const placement = state.board.map((p) => p || '.').join('');
  const rights = ['K', 'Q', 'k', 'q'].filter((r) => state.castling[r]).join('');
  // The en passant square only counts if the capture is actually legal.
  const ep = state.ep >= 0 && legalMoves(state).some((m) => m.flag === 'ep') ? state.ep : -1;
  return `${placement} ${state.turn} ${rights} ${ep}`;
}

function material(board, color) {
  const result = { p: 0, n: 0, r: 0, q: 0, light: 0, dark: 0 };
  board.forEach((p, sq) => {
    if (!p || colorOf(p) !== color) return;
    const type = p.toLowerCase();
    if (type === 'b') result[(fileOf(sq) + rankOf(sq)) % 2 ? 'light' : 'dark']++;
    else if (type !== 'k') result[type]++;
  });
  return result;
}

// Dead position by material: bare kings, a single knight, or only bishops
// that all stand on the same square color.
export function insufficientMaterial(board) {
  const w = material(board, 'w');
  const b = material(board, 'b');
  if (w.p + b.p + w.r + b.r + w.q + b.q) return false;
  const knights = w.n + b.n;
  const light = w.light + b.light;
  const dark = w.dark + b.dark;
  if (knights) return knights === 1 && light + dark === 0;
  return light === 0 || dark === 0;
}

// Whether `color` could checkmate by some series of legal moves. Used when the
// opponent resigns: if mate is impossible the game is drawn (FIDE 5.1.2).
export function canPossiblyMate(board, color) {
  const own = material(board, color);
  const opp = material(board, other(color));
  if (own.p || own.r || own.q) return true;
  const bishops = own.light + own.dark;
  if (own.n >= 2 || (own.n && bishops) || (own.light && own.dark)) return true;
  // A lone knight or same-colored bishops need an enemy piece to block its own king.
  if (own.n) return opp.p + opp.n + opp.r + opp.light + opp.dark > 0;
  if (own.light) return opp.p + opp.n + opp.dark > 0;
  if (own.dark) return opp.p + opp.n + opp.light > 0;
  return false;
}

// Standard Algebraic Notation for a legal move in `state`.
export function toSan(state, move, moves = legalMoves(state)) {
  let san;
  if (move.flag === 'castle-short') san = 'O-O';
  else if (move.flag === 'castle-long') san = 'O-O-O';
  else {
    const type = move.piece.toUpperCase();
    const capture = move.captured ? 'x' : '';
    if (type === 'P') {
      san = (capture ? squareName(move.from)[0] + 'x' : '') + squareName(move.to);
      if (move.promotion) san += '=' + move.promotion.toUpperCase();
    } else {
      const rivals = moves.filter((m) => m.to === move.to && m.piece === move.piece && m.from !== move.from);
      let hint = '';
      if (rivals.length) {
        if (rivals.every((m) => fileOf(m.from) !== fileOf(move.from))) hint = squareName(move.from)[0];
        else if (rivals.every((m) => rankOf(m.from) !== rankOf(move.from))) hint = squareName(move.from)[1];
        else hint = squareName(move.from);
      }
      san = type + hint + capture + squareName(move.to);
    }
  }
  const next = applyMove(state, move);
  if (inCheck(next)) san += legalMoves(next).length ? '+' : '#';
  return san;
}

export class Game {
  constructor(fen = START_FEN) {
    this.state = parseFen(fen);
    this.history = []; // { state, move, san }
    this.keys = [positionKey(this.state)];
    this.result = null; // { winner: 'w' | 'b' | null, reason }
    this.refresh();
  }

  refresh() {
    this.moves = legalMoves(this.state);
    this.result = this.automaticResult();
  }

  automaticResult() {
    // Checkmate takes precedence over the move-count draws (FIDE 9.6.2).
    if (!this.moves.length) {
      return inCheck(this.state)
        ? { winner: other(this.state.turn), reason: 'checkmate' }
        : { winner: null, reason: 'stalemate' };
    }
    if (insufficientMaterial(this.state.board)) return { winner: null, reason: 'dead position (insufficient material)' };
    if (this.repetitions() >= 5) return { winner: null, reason: 'fivefold repetition' };
    if (this.state.halfmove >= 150) return { winner: null, reason: 'the seventy-five move rule' };
    return null;
  }

  repetitions(key = this.keys[this.keys.length - 1]) {
    return this.keys.filter((k) => k === key).length;
  }

  movesFrom(sq) {
    return this.result ? [] : this.moves.filter((m) => m.from === sq);
  }

  // Plays a legal move. Returns the history entry, or null if the move is illegal.
  play(from, to, promotion = null) {
    if (this.result) return null;
    const move = this.moves.find((m) => m.from === from && m.to === to && m.promotion === promotion);
    if (!move) return null;
    const entry = { state: this.state, move, san: toSan(this.state, move, this.moves) };
    this.history.push(entry);
    this.state = applyMove(this.state, move);
    this.keys.push(positionKey(this.state));
    this.refresh();
    return entry;
  }

  undo() {
    const entry = this.history.pop();
    if (entry) {
      this.state = entry.state;
      this.keys.pop();
      this.refresh();
    } else this.result = this.automaticResult();
    return entry || null;
  }

  // Draws the player to move may claim now (FIDE 9.2.2 and 9.3.2).
  drawClaims() {
    if (this.result) return [];
    const claims = [];
    if (this.repetitions() >= 3) claims.push('threefold repetition');
    if (this.state.halfmove >= 100) claims.push('the fifty-move rule');
    return claims;
  }

  // Draws claimable by declaring an intended move (FIDE 9.2.1 and 9.3.1).
  intendedDrawClaims() {
    if (this.result) return [];
    const claims = [];
    for (const move of this.moves) {
      const next = applyMove(this.state, move);
      let reason = null;
      if (this.repetitions(positionKey(next)) >= 2) reason = 'threefold repetition';
      else if (next.halfmove >= 100 && !(inCheck(next) && !legalMoves(next).length)) reason = 'the fifty-move rule';
      if (reason) claims.push({ move, reason, san: toSan(this.state, move, this.moves) });
    }
    return claims;
  }

  claimDraw(reason) {
    this.result = { winner: null, reason };
  }

  agreeDraw() {
    if (!this.result) this.result = { winner: null, reason: 'mutual agreement' };
  }

  resign(color = this.state.turn) {
    if (this.result) return;
    const opponent = other(color);
    this.result = canPossiblyMate(this.state.board, opponent)
      ? { winner: opponent, reason: 'resignation' }
      : { winner: null, reason: 'resignation, as the opponent has no way to checkmate' };
  }
}
