/* ==========================================================
   Bookmarks — reads and writes a single localStorage key.
   Every change goes through save() + render(), so the DOM is
   always a straight reflection of the `bookmarks` array.
   ========================================================== */

const STORAGE_KEY = 'bookmarks';

const form = document.querySelector('#bookmark-form');
const urlInput = document.querySelector('#url');
const titleInput = document.querySelector('#title');
const errorEl = document.querySelector('#form-error');
const listEl = document.querySelector('#bookmark-list');
const emptyEl = document.querySelector('#empty-state');
const countEl = document.querySelector('#count');
const searchEl = document.querySelector('#search');
const searchInput = document.querySelector('#search-input');
const searchClear = document.querySelector('#search-clear');
const toastEl = document.querySelector('#toast');
const toastTextEl = document.querySelector('#toast-text');

let bookmarks = load();
// Lives only in memory: a filter is a view of the list, not part of it.
let query = '';

/* ---------- Storage ---------- */

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    // Anything hand-edited or left by an older version is discarded
    // rather than allowed to break the render.
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((item) => item && typeof item.url === 'string')
      // A missing title would break both the search and the card label.
      .map((item) => ({ ...item, title: typeof item.title === 'string' ? item.title : item.url }));
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    showError('לא הצלחתי לשמור — אחסון הדפדפן חסום או מלא.');
  }
}

/* ---------- Input handling ---------- */

// Accepts "example.com" as readily as "https://example.com".
function parseUrl(value) {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;

  return url;
}

// crypto.randomUUID needs a secure context, which a file:// page is not
// guaranteed to be in every browser.
function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = '';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearError();

  const rawUrl = urlInput.value.trim();
  if (!rawUrl) {
    showError('צריך כתובת.');
    urlInput.focus();
    return;
  }

  const url = parseUrl(rawUrl);
  if (!url) {
    showError('הכתובת לא נראית תקינה. נסו משהו כמו example.com.');
    urlInput.focus();
    return;
  }

  if (bookmarks.some((bookmark) => bookmark.url === url.href)) {
    showError('הכתובת הזו כבר שמורה.');
    urlInput.select();
    return;
  }

  bookmarks.unshift({
    id: newId(),
    url: url.href,
    // An empty title falls back to the host, so a card is never blank.
    title: titleInput.value.trim() || url.hostname.replace(/^www\./, ''),
    createdAt: Date.now(),
  });

  save();
  // An active filter could hide the item that was just added.
  resetSearch();

  form.reset();
  urlInput.focus();
  showToast();
});

urlInput.addEventListener('input', clearError);

/* ---------- Success toast ---------- */

const TOAST_MESSAGE = 'נוסף בהצלחה';
const TOAST_VISIBLE_MS = 1800;
// Matches the exit transition in bookmarks.css.
const TOAST_EXIT_MS = 200;

let toastHideTimer;
let toastClearTimer;

// Shown only on a successful add — validation problems have their own
// channel in #form-error.
function showToast() {
  // A second add while the first toast is still up would otherwise be cut
  // short by the timer the first one left running.
  clearTimeout(toastHideTimer);
  clearTimeout(toastClearTimer);

  // aria-live reacts to a content change, not to a visibility change, so the
  // message is written on every add to get it announced again.
  toastTextEl.textContent = TOAST_MESSAGE;
  toastEl.classList.add('is-visible');

  toastHideTimer = setTimeout(() => {
    toastEl.classList.remove('is-visible');
    // Emptied only after it has faded out, or the text would vanish while
    // the panel is still on screen.
    toastClearTimer = setTimeout(() => {
      toastTextEl.textContent = '';
    }, TOAST_EXIT_MS);
  }, TOAST_VISIBLE_MS);
}

/* ---------- Searching ---------- */

// Filters on title only, as typed — no debounce, since the list is
// small enough that a full re-render per keystroke is cheap.
searchInput.addEventListener('input', () => {
  query = searchInput.value.trim().toLowerCase();
  render();
});

searchClear.addEventListener('click', () => {
  resetSearch();
  searchInput.focus();
});

// Escape clears the field the way a native search input suggests it should.
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && query) {
    event.preventDefault();
    resetSearch();
  }
});

function resetSearch() {
  searchInput.value = '';
  query = '';
  render();
}

function visibleBookmarks() {
  if (!query) return bookmarks;
  return bookmarks.filter((bookmark) => bookmark.title.toLowerCase().includes(query));
}

/* ---------- Deleting ---------- */

listEl.addEventListener('click', (event) => {
  const button = event.target.closest('.delete');
  if (!button) return;

  bookmarks = bookmarks.filter((bookmark) => bookmark.id !== button.dataset.id);
  save();
  render();
});

/* ---------- Rendering ---------- */

function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function createBookmarkItem(bookmark) {
  const item = document.createElement('li');
  item.className = 'bookmark';

  const body = document.createElement('div');
  body.className = 'bookmark-body';

  const link = document.createElement('a');
  link.className = 'bookmark-title';
  link.href = bookmark.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = bookmark.title;
  link.title = bookmark.url;

  const meta = document.createElement('span');
  meta.className = 'bookmark-meta';
  const date = formatDate(bookmark.createdAt);
  meta.textContent = date ? `${bookmark.url} · ${date}` : bookmark.url;

  const remove = document.createElement('button');
  remove.className = 'delete';
  remove.type = 'button';
  remove.dataset.id = bookmark.id;
  remove.textContent = '×';
  remove.setAttribute('aria-label', `מחיקת ${bookmark.title}`);

  body.append(link, meta);
  item.append(body, remove);
  return item;
}

function render() {
  const visible = visibleBookmarks();

  listEl.replaceChildren(...visible.map(createBookmarkItem));

  // The search bar only appears once there is something to search.
  searchEl.hidden = bookmarks.length === 0;
  searchClear.hidden = !query;

  emptyEl.hidden = visible.length > 0;
  emptyEl.textContent = bookmarks.length === 0
    ? 'עוד אין סימניות שמורות. הוסיפו את הראשונה בטופס שלמעלה.'
    : `אין סימנייה עם כותרת שמכילה "${searchInput.value.trim()}".`;

  countEl.textContent = query
    ? `${visible.length} מתוך ${bookmarks.length}`
    : bookmarks.length ? `${bookmarks.length}` : '';
}

render();
