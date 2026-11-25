// Browser only: starts the single-threaded lite build of Stockfish in a Web Worker.
// That build needs no SharedArrayBuffer, so no cross-origin isolation headers.
import engineUrl from '../../node_modules/stockfish/bin/stockfish-19-lite-single.js?url';
import wasmUrl from '../../node_modules/stockfish/bin/stockfish-19-lite-single.wasm?url';

// The engine script reads the location of its WASM file from the URL fragment.
export const createStockfishWorker = () => new Worker(`${engineUrl}#${encodeURIComponent(wasmUrl)}`);
