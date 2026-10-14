import { preferencesStore as store, STATUS_LABELS, PROGRAMS, currentProgramSnapshot, formatPreferences, formatFullCatalog } from '../preferences-store.mjs?v=20261014-unified1';

const $ = selector => document.querySelector(selector);
const rows = new Map();
let catalog = null, snapshot = store.getSnapshot(), initialized = false;
const keyFor = (program, id) => `${program}:${id}`;
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const removedParameters = ['lineup', 'q', 'query', 'search', 'category', 'status', 'filter', 'sort', 'page', 'limit'];
const cleanURL = new URL(location.href);
for (const key of removedParameters) cleanURL.searchParams.delete(key);
if (cleanURL.href !== location.href) history.replaceState(null, '', cleanURL);

function createChoices(song, program) {
  const choices = element('fieldset', undefined, 'rep-song-choices');
  choices.append(element('legend', `Пожелание: ${song.title}, ${song.artist || 'Исполнитель не указан'}, ${catalog.lineups[program].label}`, 'rep-sr-only'));
  for (const [status, title] of Object.entries(STATUS_LABELS)) {
    const label = element('label'), input = element('input'), caption = element('span', title);
    input.type = 'radio'; input.name = `mark-${program}-${song.id}`; input.value = status;
    input.dataset.program = program; input.dataset.song = song.id;
    input.checked = status === 'maybe';
    label.append(input, caption); choices.append(label);
  }
  return choices;
}
function initialize() {
  catalog = store.getCatalog(); rows.clear();
  for (const program of PROGRAMS) {
    const section = $(`#songs-${program}`);
    section.setAttribute('aria-labelledby', 'list-title');
    const source = catalog.lineups[program].songs, list = $(`#song-list-${program}`);
    const existing = new Map([...list.querySelectorAll('[data-song-id]')].map(row => [row.dataset.songId, row]));
    const fragment = document.createDocumentFragment();
    source.forEach((song, index) => {
      let row = existing.get(song.id);
      if (!row) {
        row = element('li', undefined, 'rep-song-row'); row.dataset.songId = song.id; row.dataset.program = program;
        const info = element('div', undefined, 'rep-song-info');
        const number = element('span', '', 'rep-song-number'); number.setAttribute('aria-hidden', 'true');
        info.append(number, element('h3'), element('span', '', 'rep-song-artist'));
        row.append(info, element('div', undefined, 'rep-choice-host'));
      }
      row.hidden = false;
      row.querySelector('.rep-song-number').textContent = String(index + 1).padStart(2, '0');
      row.querySelector('h3').textContent = song.title;
      row.querySelector('.rep-song-artist').textContent = song.artist || 'Исполнитель не указан';
      row.querySelector('.rep-choice-host').replaceChildren(createChoices(song, program));
      rows.set(keyFor(program, song.id), row); fragment.append(row);
    });
    list.replaceChildren(fragment);
  }
  $('#download-list').disabled = false; $('#song-search').disabled = false;
  $('#catalog-loading').hidden = true; $('#catalog-error').hidden = true;
  document.documentElement.classList.add('repertoire-ready');
  document.documentElement.dataset.repertoireReady = 'true';
  initialized = true;
}
// Promote matching songs without hiding rows or changing stored selections.
const searchInput = $('#song-search'), searchClear = $('#search-clear');
const searchText = value => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').normalize('NFKC');
function applySearch() {
  if (!initialized) return;
  const terms = searchText(searchInput.value).trim().split(/\s+/).filter(Boolean);
  const program = snapshot.program, songs = catalog.lineups[program].songs;
  const matches = [], remaining = [];
  for (const song of songs) {
    const row = rows.get(keyFor(program, song.id));
    const matched = terms.length > 0 && terms.every(term => searchText(`${song.title} ${song.artist || ''}`).includes(term));
    row.classList.toggle('rep-search-match', matched);
    (matched ? matches : remaining).push(row);
  }
  const list = $(`#song-list-${program}`), ordered = [...matches, ...remaining];
  if (ordered.some((row, index) => list.children[index] !== row)) list.append(...ordered);
  searchClear.hidden = !searchInput.value;
  $('#search-status').textContent = terms.length ? (matches.length ? `Найдено: ${matches.length} · Остальные песни ниже` : 'Совпадений нет · Весь репертуар ниже') : '';
}
searchInput.addEventListener('input', applySearch);
function clearSearch() { searchInput.value = ''; applySearch(); searchInput.focus({preventScroll:true}); }
searchClear.addEventListener('click', clearSearch);
searchInput.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); clearSearch(); } });

function renderCatalog() {
  if (!initialized) return;
  for (const program of PROGRAMS) {
    $(`#songs-${program}`).hidden = false;
    for (const song of catalog.lineups[program].songs) {
      const row = rows.get(keyFor(program, song.id)), mark = store.getStatus(program, song.id);
      row.dataset.status = mark;
      for (const input of row.querySelectorAll('input[type=radio]')) input.checked = input.value === mark;
    }
  }
  applySearch();
  const program = snapshot.program, total = catalog.lineups[program].songs.length;
  const counts = snapshot.counts.byProgram[program];
  $('#companion-program').textContent = 'Ваш выбор';
  $('#companion-total').textContent = total;
  $('#count-want').textContent = counts.want;
  $('#count-maybe').textContent = Math.max(0, total - counts.want - counts.skip);
  $('#count-skip').textContent = counts.skip;
  $('#list-title').textContent = 'Все песни';
  $('#results-status').textContent = `${catalog.lineups[program].label}, ${total} песен`;

}
function renderDeprecated() {
  const section = $('#deprecated-section'), content = $('#deprecated-songs');
  section.hidden = !snapshot.deprecated.length;
  const focusedKey = document.activeElement?.dataset?.removeKey;
  const fragment = document.createDocumentFragment();
  for (const song of snapshot.deprecated) {
    const item = element('li'), name = element('span', song.title || 'Название не восстановлено');
    name.append(element('small', `${song.artist || 'Исполнитель не указан'} · ${song.programLabel}`));
    const remove = element('button', 'Удалить отметку', 'rep-text-button'); remove.type = 'button';
    remove.dataset.removeProgram = song.program; remove.dataset.removeSong = song.id; remove.dataset.removeKey = keyFor(song.program, song.id);
    remove.setAttribute('aria-label', `Удалить отметку: ${song.title || song.id}`);
    item.append(name, remove); fragment.append(item);
  }
  content.replaceChildren(fragment);
  if (focusedKey) {
    const next = [...content.querySelectorAll('button')].find(node => node.dataset.removeKey === focusedKey) || content.querySelector('button') || $('#song-search');
    next.focus({ preventScroll: true });
  }
}
function refresh(value) {
  snapshot = value;
  if (snapshot.ready && (!initialized || snapshot.catalogVersion !== catalog?.version || snapshot.maxSelections !== PROGRAMS.reduce((n, key) => n + (catalog?.lineups?.[key]?.songs.length || 0), 0))) initialize();
  if (snapshot.catalogError && !snapshot.ready) { $('#catalog-loading').hidden = true; $('#catalog-error').hidden = false; document.documentElement.dataset.repertoireReady = 'false'; }
  $('#storage-status').textContent = snapshot.storage.message || ''; $('#storage-status').hidden = !snapshot.storage.message;
  $('#program-notice').hidden = !snapshot.urlWarning; $('#program-notice').textContent = snapshot.urlWarning;
  renderCatalog(); renderDeprecated();
  const current = currentProgramSnapshot(snapshot);
  for (const id of ['copy-selection', 'download-selection', 'reset-open']) $(`#${id}`).disabled = !(current.selected.length + current.deprecated.length);
  if (!$('#copy-fallback').hidden) $('#copy-text').value = formatPreferences(snapshot);
  window.dispatchEvent(new Event('bogema:layout'));
}
document.addEventListener('change', event => {
  const control = event.target;
  if (control.matches('.rep-song-choices input')) {
    store.setStatus(control.dataset.program, control.dataset.song, control.value);
    const counts = snapshot.counts.byProgram[snapshot.program], total = catalog.lineups[snapshot.program].songs.length;
    $('#wishes-status').textContent = `Хочу ${counts.want}, можно ${total - counts.want - counts.skip}, не надо ${counts.skip}`;
  }
});
document.addEventListener('click', event => {
  const remove = event.target.closest('[data-remove-song]');
  if (remove) store.setStatus(remove.dataset.removeProgram, remove.dataset.removeSong, 'maybe');
});
const actionDialogs = [...document.querySelectorAll('.rep-action-dialog')];
const dialogTriggers = new WeakMap();
function openActionDialog(dialog, trigger) {
  if (dialog.open) return;
  dialogTriggers.set(dialog, trigger); dialog.showModal(); document.body.classList.add('modal-open');
}
for (const dialog of actionDialogs) {
  dialog.querySelector('[data-dismiss]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    const trigger = dialogTriggers.get(dialog);
    (trigger && !trigger.disabled ? trigger : $('#song-search')).focus({preventScroll:true});
  });
}
let resetProgram;
$('#reset-open').addEventListener('click', () => {
  resetProgram = snapshot.program;
  $('#reset-description').textContent = 'Все песни снова получат отметку «Можно»';
  openActionDialog($('#reset-confirmation'), $('#reset-open'));
  $('#reset-cancel').focus();
});
$('#reset-cancel').addEventListener('click', () => $('#reset-confirmation').close());
$('#reset-confirm').addEventListener('click', () => {
  store.clearMarks(resetProgram); $('#copy-fallback').hidden = true;
  $('#reset-status').textContent = 'Отметки сброшены, у каждой песни снова «Можно»';
  $('#reset-confirmation').close();
});
$('#copy-selection').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(formatPreferences(snapshot)); $('#copy-status').textContent = 'Пожелания скопированы'; $('#copy-fallback').hidden = true; }
  catch { $('#copy-text').value = formatPreferences(snapshot); $('#copy-fallback').hidden = false; $('#copy-text').focus(); $('#copy-text').select(); $('#copy-status').textContent = 'Выделите текст ниже и скопируйте вручную'; }
});
function download(text, filename, target = '#export-status') {
  try {
    const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }));
    const link = element('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000); $(target).textContent = 'Файл TXT подготовлен для скачивания';
  } catch { $(target).textContent = 'Не удалось подготовить файл, попробуйте ещё раз'; }
}
$('#download-list').addEventListener('click', () => download(formatFullCatalog(catalog, 'all'), 'Богема - полный репертуар.txt', '#catalog-export-status'));
$('#download-selection').addEventListener('click', () => download(formatPreferences(snapshot), 'Богема - мои пожелания.txt'));
$('#retry-catalog').addEventListener('click', () => { $('#catalog-loading').hidden = false; $('#catalog-error').hidden = true; store.reloadCatalog(); });

const root = document.documentElement, header = $('.rep-header'), companion = $('#repertoire-companion');
function syncStickyOffsets() {
  const headerHeight = Math.ceil(header.getBoundingClientRect().height);
  root.style.setProperty('--rep-header-height', `${headerHeight}px`);
  root.style.setProperty('--rep-companion-height', `${Math.ceil(companion.getBoundingClientRect().height)}px`);
  const cramped = companion.getBoundingClientRect().height + headerHeight > window.innerHeight * .62;
  document.body.classList.toggle('rep-compact-viewport', cramped);
}
if ('ResizeObserver' in window) { const observer = new ResizeObserver(syncStickyOffsets); observer.observe(header); observer.observe(companion); }
window.addEventListener('resize', syncStickyOffsets, { passive: true });
syncStickyOffsets();
store.subscribe(refresh); refresh(snapshot); store.ready.then(() => refresh(store.getSnapshot()));

// Keep the new header/footer links smooth over a long catalog, with bounded duration.
let anchorFrame = 0;
const stopAnchor = () => { cancelAnimationFrame(anchorFrame); anchorFrame = 0; };
for (const link of document.querySelectorAll('.rep-header-cta, .rep-top')) link.addEventListener('click', event => {
  const target = document.querySelector(link.hash);
  if (!target) return;
  event.preventDefault(); stopAnchor();
  const headerInset = getComputedStyle(header).position === 'sticky' ? header.offsetHeight : 0;
  const compact = matchMedia('(max-width:1040px)').matches;
  const inset = headerInset + (compact && target.id === 'wishes-form' ? companion.offsetHeight : 0) + 24;
  const start = scrollY;
  const end = Math.max(0, Math.min(start + target.getBoundingClientRect().top - inset, document.documentElement.scrollHeight - innerHeight));
  if (location.hash !== link.hash) history.pushState(null, '', link.hash);
  const finish = () => { anchorFrame = 0; target.setAttribute('tabindex','-1'); target.focus({preventScroll:true}); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { scrollTo({top:end,behavior:'instant'}); finish(); return; }
  const began = performance.now(), duration = Math.min(850, 450 + Math.abs(end-start)/10);
  const step = now => {
    const progress = Math.min(1,(now-began)/duration);
    scrollTo({top:start+(end-start)*(1-Math.cos(Math.PI*progress))/2,behavior:'instant'});
    if (progress < 1) anchorFrame = requestAnimationFrame(step); else finish();
  };
  anchorFrame = requestAnimationFrame(step);
});
for (const name of ['wheel','touchstart','pointerdown']) addEventListener(name,stopAnchor,{passive:true});
addEventListener('keydown',event=>{ if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) stopAnchor(); });
