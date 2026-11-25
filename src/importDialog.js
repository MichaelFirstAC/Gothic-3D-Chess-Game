// The "Import" dialog: look up a player's recent games and pick one to review.
// It reuses the page's one <dialog>.
import { parsePgn } from './engine.js';

const $ = (id) => document.getElementById(id);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function fetchGames(username, signal) {
  let response;
  try {
    response = await fetch(`/api/chesscom?user=${encodeURIComponent(username)}`, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('The import service could not be reached.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || `The import service is not available (${response.status}).`);
  if (!Array.isArray(body?.games)) throw new Error('The import service is not available here.');
  return body;
}

function describe(entry) {
  const date = new Date(entry.endTime * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const details = [entry.result.replace('1/2-1/2', '½-½'), entry.timeClass, date];
  if (entry.accuracies) {
    details.push(`accuracy ${Math.round(entry.accuracies.white)} / ${Math.round(entry.accuracies.black)}`);
  }
  return details.join(' · ');
}

// Turns a chosen entry into a record the review mode can open.
export function toRecord(entry, username) {
  const { headers, game } = parsePgn(entry.pgn);
  if (!game.history.length) throw new Error('That game ended before any move was made.');
  const side = ['white', 'black'].find((color) => entry[color].username.toLowerCase() === username.toLowerCase());
  return {
    history: game.history,
    finalState: game.state,
    result: game.result,
    title: `${entry.white.username} vs ${entry.black.username}`,
    resultText: headers.Termination || headers.Result,
    players: { w: entry.white.username, b: entry.black.username },
    side: side ? side[0] : null,
  };
}

// Resolves with a record, or null if the dialog is dismissed.
export function openImportDialog() {
  const dialog = $('dialog');
  if (dialog.open) return Promise.resolve(null);

  const form = element('form', 'import-form');
  const input = element('input');
  Object.assign(input, {
    type: 'text', name: 'user', placeholder: 'Username', autocomplete: 'off', spellcheck: false,
    maxLength: 30, required: true,
  });
  input.setAttribute('aria-label', 'Chess.com username');
  try {
    input.value = localStorage.getItem('import-user') || '';
  } catch { /* storage can be blocked; the field just starts empty */ }
  const search = element('button', '', 'Seek games');
  search.type = 'submit';
  form.append(input, search);

  const status = element('p', 'import-status');
  status.setAttribute('role', 'status');
  const list = element('ul', 'import-games');

  $('dialog-title').textContent = 'Import a game';
  $('dialog-text').textContent = 'Enter a Chess.com username. Games come from their public data API.';
  $('dialog-body').replaceChildren(form, status, list);

  const cancel = element('button', '', 'Cancel');
  cancel.type = 'button';
  $('dialog-actions').replaceChildren(cancel);

  return new Promise((resolve) => {
    let chosen = null;
    let lookup = null;

    function pick(entry, username) {
      try {
        chosen = toRecord(entry, username);
        dialog.close();
      } catch (error) {
        status.textContent = `That game could not be read. ${error.message}`;
      }
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const username = input.value.trim();
      if (!username) return;
      lookup?.abort();
      const mine = lookup = new AbortController();
      list.replaceChildren();
      status.textContent = 'Searching the archives…';
      try {
        const { games } = await fetchGames(username, mine.signal);
        if (lookup !== mine) return;
        try {
          localStorage.setItem('import-user', username);
        } catch { /* only a convenience */ }
        status.textContent = games.length
          ? 'Choose a game from the most recent month played.'
          : 'No standard chess games were found in the most recent month played.';
        list.replaceChildren(...games.map((entry) => {
          const button = element('button');
          button.type = 'button';
          const seats = ['white', 'black'].map((c) => `${entry[c].username} (${entry[c].rating})`);
          button.append(element('span', '', seats.join(' vs ')), element('small', '', describe(entry)));
          button.addEventListener('click', () => pick(entry, username));
          const item = element('li');
          item.append(button);
          return item;
        }));
      } catch (error) {
        if (lookup === mine && !mine.signal.aborted) status.textContent = error.message;
      }
    });
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      lookup?.abort();
      lookup = null;
      $('dialog-body').replaceChildren();
      resolve(chosen);
    }, { once: true });

    dialog.showModal();
    input.focus();
  });
}
