import { preferencesStore as store, STATUS_LABELS, PROGRAMS, currentProgramSnapshot, formatPreferences, formatFullCatalog } from '../preferences-store.mjs';

const $ = selector => document.querySelector(selector);
const rows = new Map();
let catalog = null, snapshot = store.getSnapshot(), initialized = false, activeProgram = snapshot.program;
const keyFor = (program, id) => `${program}:${id}`;
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const removedParameters = ['q', 'query', 'search', 'category', 'status', 'filter', 'sort', 'page', 'limit'];
const cleanURL = new URL(location.href);
// Record the initially restored program so browser Back restores it too.
if (!cleanURL.searchParams.has('lineup')) cleanURL.searchParams.set('lineup', snapshot.program);
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
    section.setAttribute('role', 'tabpanel'); section.setAttribute('aria-labelledby', `tab-${program}`);
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
    $(`#tab-${program} span`).textContent = source.length;
    $(`#tab-${program}`).disabled = false;
  }
  $('#download-list').disabled = false;
  $('#catalog-loading').hidden = true; $('#catalog-error').hidden = true;
  document.documentElement.classList.add('repertoire-ready');
  document.documentElement.dataset.repertoireReady = 'true';
  initialized = true;
}
function renderCatalog() {
  if (!initialized) return;
  for (const program of PROGRAMS) {
    const selected = program === snapshot.program;
    const tab = $(`#tab-${program}`); tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    $(`#songs-${program}`).hidden = !selected;
    for (const song of catalog.lineups[program].songs) {
      const row = rows.get(keyFor(program, song.id)), mark = store.getStatus(program, song.id);
      row.dataset.status = mark;
      for (const input of row.querySelectorAll('input[type=radio]')) input.checked = input.value === mark;
    }
  }
  const program = snapshot.program, total = catalog.lineups[program].songs.length;
  const counts = snapshot.counts.byProgram[program];
  $('#companion-program').textContent = catalog.lineups[program].label;
  $('#companion-total').textContent = total;
  $('#count-want').textContent = counts.want;
  $('#count-maybe').textContent = Math.max(0, total - counts.want - counts.skip);
  $('#count-skip').textContent = counts.skip;
  $('#list-title').textContent = program === 'group' ? 'Песни группы' : 'Песни трио';
  $('#results-status').textContent = `${catalog.lineups[program].label}, ${total} песен`;
  const other = program === 'group' ? 'trio' : 'group', otherCount = snapshot.counts.byProgram[other].total;
  $('#companion-other').hidden = !otherCount;
  $('#companion-other').textContent = `${other === 'group' ? 'Группа' : 'Трио'}: сохранено отметок ${otherCount}`;
  if (activeProgram !== program) { activeProgram = program; $('#catalog-export-status').textContent = ''; }
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
    const next = [...content.querySelectorAll('button')].find(node => node.dataset.removeKey === focusedKey) || content.querySelector('button') || $(`#tab-${snapshot.program}`);
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
function selectProgram(program, focus = false) {
  const url = new URL(location.href); url.searchParams.set('lineup', program);
  if (url.href !== location.href) history.pushState(null, '', url);
  const workspace = $('.rep-workspace');
  const belowStart = workspace.getBoundingClientRect().top < header.getBoundingClientRect().height;
  const changed = program !== snapshot.program;
  store.setProgram(program);
  if (changed && belowStart) {
    const top = window.scrollY + workspace.getBoundingClientRect().top - header.getBoundingClientRect().height - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }
  if (focus) $(`#tab-${program}`).focus({ preventScroll: true });
}
PROGRAMS.forEach((program, index) => {
  const tab = $(`#tab-${program}`);
  tab.addEventListener('click', () => selectProgram(program));
  tab.addEventListener('keydown', event => {
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : ['ArrowRight', 'ArrowLeft'].includes(event.key) ? 1 - index : null;
    if (target !== null) { event.preventDefault(); selectProgram(PROGRAMS[target], true); }
  });
});
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
    (trigger && !trigger.disabled ? trigger : $(`#tab-${snapshot.program}`)).focus({preventScroll:true});
  });
}
let resetProgram;
$('#reset-open').addEventListener('click', () => {
  resetProgram = snapshot.program;
  $('#reset-description').textContent = `Все песни ${resetProgram === 'group' ? 'группы' : 'трио'} снова получат отметку «Можно»`;
  openActionDialog($('#reset-confirmation'), $('#reset-open'));
  $('#reset-cancel').focus();
});
$('#reset-cancel').addEventListener('click', () => $('#reset-confirmation').close());
$('#reset-confirm').addEventListener('click', () => {
  store.clearMarks(resetProgram); $('#copy-fallback').hidden = true;
  $('#reset-status').textContent = 'Отметки выбранного состава сброшены, у каждой песни снова «Можно»';
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
$('#download-list').addEventListener('click', () => openActionDialog($('#catalog-download-dialog'), $('#download-list')));
for (const button of document.querySelectorAll('[data-download-program]')) button.addEventListener('click', () => {
  const program = button.dataset.downloadProgram;
  download(formatFullCatalog(catalog, program), `Богема - ${catalog.lineups[program].label} - полный репертуар.txt`, '#catalog-export-status');
  $('#catalog-download-dialog').close();
});
$('#download-selection').addEventListener('click', () => download(formatPreferences(snapshot), `Богема - ${catalog.lineups[snapshot.program].label} - мои пожелания.txt`));
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
