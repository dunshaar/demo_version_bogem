import { preferencesStore as store, STATUS_LABELS, PROGRAMS, filterSongs, formatPreferences, formatFullCatalog } from '../preferences-store.mjs';

const $ = selector => document.querySelector(selector);
const rows = new Map();
let catalog = null, snapshot = store.getSnapshot(), visibleLimit = 30, activeProgram = snapshot.program;
let initialized = false;
const PAGE_SIZE = 30;
const query = { query: '', category: '', status: 'all' };
const dialogOpeners = new Map();
const keyFor = (program, id) => `${program}:${id}`;
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };

function openDialog(dialog, opener) {
  dialog.returnValue = '';
  dialogOpeners.set(dialog, opener || document.activeElement);
  dialog.showModal();
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => { const opener = dialogOpeners.get(dialog); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
}

function createChoices(song, program) {
  const choices = element('fieldset', undefined, 'rep-song-choices');
  const legend = element('legend', `Отметка: ${song.title} — ${song.artist || 'Исполнитель не указан'}, ${catalog.lineups[program].label}`, 'rep-sr-only');
  choices.append(legend);
  for (const [status, title] of Object.entries(STATUS_LABELS)) {
    const label = element('label'), input = element('input'), caption = element('span', title);
    input.type = 'radio'; input.name = `mark-${program}-${song.id}`; input.value = status;
    input.dataset.program = program; input.dataset.song = song.id;
    label.append(input, caption); choices.append(label);
  }
  const clear = element('button', '×', 'rep-clear-one');
  clear.type = 'button'; clear.dataset.removeProgram = program; clear.dataset.removeSong = song.id;
  clear.setAttribute('aria-label', `Снять отметку: ${song.title}, ${catalog.lineups[program].label}`);
  clear.title = 'Снять отметку'; clear.disabled = true;
  return [choices, clear];
}
function initialize() {
  catalog = store.getCatalog(); rows.clear();
  for (const program of PROGRAMS) {
    const section = $(`#songs-${program}`);
    section.setAttribute('role', 'tabpanel'); section.setAttribute('aria-labelledby', `tab-${program}`);
    const source = catalog.lineups[program].songs;
    const list = $(`#song-list-${program}`);
    // Static HTML is the build-time copy of data.json; reconcile safely if a newer catalog is served.
    const existing = new Map([...list.querySelectorAll('[data-song-id]')].map(row => [row.dataset.songId, row]));
    const fragment = document.createDocumentFragment();
    source.forEach((song, index) => {
      let row = existing.get(song.id);
      if (!row) {
        row = element('li', undefined, 'rep-song-row'); row.dataset.songId = song.id; row.dataset.program = program;
        const info = element('div', undefined, 'rep-song-info');
        const number = element('span', String(index + 1).padStart(2, '0'), 'rep-song-number'); number.setAttribute('aria-hidden', 'true');
        info.append(number, element('h3', song.title), element('span', song.artist || 'Исполнитель не указан', 'rep-song-artist'));
        row.append(info, element('div', undefined, 'rep-choice-host'));
      } else { row.querySelector('h3').textContent = song.title; row.querySelector('.rep-song-artist').textContent = song.artist || 'Исполнитель не указан'; }
      row.querySelector('.rep-choice-host').replaceChildren(...createChoices(song, program));
      rows.set(keyFor(program, song.id), row); fragment.append(row);
    });
    list.replaceChildren(fragment);
    $(`#tab-${program} span`).textContent = source.length;
    $(`#tab-${program}`).disabled = false;
  }
  for (const control of document.querySelectorAll('.rep-filters input,.rep-filters select')) control.disabled = false;
  for (const id of ['preview-open', 'download-list', 'download-selection', 'copy-selection']) $(`#${id}`).disabled = false;
  $('#catalog-loading').hidden = true; $('#catalog-error').hidden = true;
  document.documentElement.classList.add('repertoire-ready');
  document.documentElement.dataset.repertoireReady = 'true';
  initialized = true;
  refreshCategories();
}
function refreshCategories() {
  const select = $('#song-category');
  const categories = [...new Set(catalog.lineups[snapshot.program].songs.flatMap(song => song.aliases.map(alias => alias.category).filter(Boolean)))];
  select.replaceChildren(new Option('Все разделы', ''), ...categories.map(category => new Option(category, category)));
  if (!categories.includes(query.category)) query.category = '';
  select.value = query.category;
}
function currentResults() { return filterSongs(catalog, { ...query, program: snapshot.program, selected: snapshot.selected }); }
function renderResults() {
  if (!initialized) return;
  const matches = currentResults(), visible = matches.slice(0, visibleLimit), visibleIDs = new Set(visible.map(song => song.id));
  const selectedMap = new Map(snapshot.selected.map(song => [keyFor(song.program, song.id), song.status]));
  for (const program of PROGRAMS) {
    const selected = program === snapshot.program;
    const tab = $(`#tab-${program}`); tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    $(`#songs-${program}`).hidden = !selected;
    for (const song of catalog.lineups[program].songs) {
      const row = rows.get(keyFor(program, song.id));
      row.hidden = !selected || !visibleIDs.has(song.id);
      const mark = selectedMap.get(keyFor(program, song.id));
      row.dataset.status = mark || 'unmarked';
      for (const input of row.querySelectorAll('input[type=radio]')) input.checked = input.value === mark;
      row.querySelector('.rep-clear-one').disabled = !mark;
    }
  }
  const total = catalog.lineups[snapshot.program].songs.length;
  const label = catalog.lineups[snapshot.program].label;
  const filtered = !!query.query || !!query.category || query.status !== 'all';
  $('#results-status').textContent = `${label}: ${total} песен · найдено ${matches.length} · показано ${visible.length}`;
  $('#reset-filters').hidden = !filtered;
  $('#catalog-empty').hidden = matches.length > 0;
  $('#empty-copy').textContent = query.query ? `По запросу «${query.query}» с выбранными фильтрами нет совпадений.` : 'В выбранной программе нет песен с такими фильтрами. Отметки других программ сохранены.';
  const remaining = Math.max(0, matches.length - visible.length);
  $('.rep-pagination').hidden = remaining === 0;
  $('#show-more').textContent = `Показать ещё ${Math.min(PAGE_SIZE, remaining)}`;
  $('#show-all').textContent = filtered ? `Показать все результаты (${matches.length})` : `Показать весь список (${matches.length})`;
  $('#remaining-status').textContent = `Осталось ${remaining}`;
  $('#download-list').textContent = `Полный репертуар: ${label.toLocaleLowerCase('ru')} — TXT ↓`;
}
function recordDescription(record) {
  return `${record.title || `Название восстановить не удалось (${record.id})`} — ${record.artist || 'Исполнитель не указан'}`;
}
function renderDeprecated() {
  const section = $('#deprecated-section'); section.hidden = !snapshot.deprecated.length;
  const fragment = document.createDocumentFragment();
  for (const record of snapshot.deprecated) {
    const item = element('li');
    item.append(element('div', `${record.programLabel} · ${STATUS_LABELS[record.status]}: ${recordDescription(record)}`));
    const actions = element('div');
    const transfer = element('button', 'Перенести в комментарий', 'rep-text-button'); transfer.type = 'button'; transfer.dataset.transfer = record.key;
    const remove = element('button', 'Удалить отметку', 'rep-text-button'); remove.type = 'button'; remove.dataset.removeProgram = record.program; remove.dataset.removeSong = record.id;
    actions.append(transfer, remove); item.append(actions); fragment.append(item);
  }
  $('#deprecated-list').replaceChildren(fragment);
}
function renderPreview() {
  if (!$('#preview-dialog').open) return;
  const focused = document.activeElement;
  const focusKey = focused?.dataset?.previewKey;
  const focusKind = focused?.tagName;
  const content = $('#preview-content'), fragment = document.createDocumentFragment();
  if (!snapshot.selected.length && !snapshot.deprecated.length) fragment.append(element('p', 'Вы ещё не отметили песни. Можно обсудить выступление и без подборки.'));
  for (const program of PROGRAMS) {
    const songs = snapshot.selected.filter(song => song.program === program);
    if (!songs.length) continue;
    fragment.append(element('h3', songs[0].programLabel));
    for (const [status, label] of Object.entries(STATUS_LABELS)) {
      const selected = songs.filter(song => song.status === status); if (!selected.length) continue;
      fragment.append(element('h4', `${label} · ${selected.length}`));
      const list = element('ul');
      for (const song of selected) {
        const item = element('li'); const name = element('span', song.title); name.append(element('small', song.artist || 'Исполнитель не указан'));
        const controls = element('div', undefined, 'rep-preview-controls');
        const select = element('select'); select.dataset.program = song.program; select.dataset.song = song.id; select.dataset.previewKey = keyFor(song.program, song.id);
        select.setAttribute('aria-label', `Отметка: ${song.title}, ${song.programLabel}`);
        select.replaceChildren(...Object.entries(STATUS_LABELS).map(([value, text]) => new Option(text, value)));
        select.value = song.status;
        const clear = element('button', '×', 'rep-clear-one'); clear.type = 'button'; clear.dataset.removeProgram = song.program; clear.dataset.removeSong = song.id; clear.dataset.previewKey = keyFor(song.program, song.id); clear.setAttribute('aria-label', `Снять отметку: ${song.title}`);
        controls.append(select, clear); item.append(name, controls); list.append(item);
      }
      fragment.append(list);
    }
  }
  if (snapshot.deprecated.length) {
    fragment.append(element('h3', `Требуют уточнения · ${snapshot.deprecated.length}`));
    const list = element('ul');
    for (const song of snapshot.deprecated) {
      const item = element('li'); const name = element('span', recordDescription(song)); name.append(element('small', `${song.programLabel} · ${STATUS_LABELS[song.status]} · Не входит в список для обращения`));
      const remove = element('button', 'Удалить', 'rep-text-button'); remove.type = 'button'; remove.dataset.removeProgram = song.program; remove.dataset.removeSong = song.id;
      item.append(name, remove); list.append(item);
    }
    fragment.append(list);
  }
  content.replaceChildren(fragment);
  if (focusKey) {
    const replacement = [...content.querySelectorAll('[data-preview-key]')].find(node => node.dataset.previewKey === focusKey && node.tagName === focusKind);
    if (replacement) replacement.focus({ preventScroll: true });
    else $('#preview-dialog [data-close-dialog]').focus({ preventScroll: true });
  }
}
function refresh(value) {
  snapshot = value;
  if (snapshot.ready && (!initialized || snapshot.catalogVersion !== catalog?.version || snapshot.maxSelections !== PROGRAMS.reduce((n, key) => n + (catalog?.lineups?.[key]?.songs.length || 0), 0))) initialize();
  if (snapshot.catalogError && !snapshot.ready) { $('#catalog-loading').hidden = true; $('#catalog-error').hidden = false; document.documentElement.dataset.repertoireReady = 'false'; }
  const storageMessage = snapshot.storage.message;
  $('#storage-status').textContent = storageMessage || 'Пожелания и выбранный состав сохраняются на этом устройстве. Контакты, комментарий и разрешение прикреплять подборку не сохраняются. К новому обращению набор нужно прикрепить заново.';
  $('#storage-status').classList.toggle('rep-notice', !!storageMessage);
  $('#program-notice').hidden = !snapshot.urlWarning; $('#program-notice').textContent = snapshot.urlWarning;
  if (initialized && activeProgram !== snapshot.program) { activeProgram = snapshot.program; visibleLimit = PAGE_SIZE; refreshCategories(); }
  renderResults();
  const count = snapshot.counts;
  $('#selection-total').textContent = count.total;
  $('#selection-counts').textContent = count.total ? `Хочу — ${count.want} · Можно — ${count.maybe} · Не надо — ${count.skip}${count.deprecated ? ` · Требуют уточнения — ${count.deprecated}` : ''}` : `Актуальных отметок пока нет.${count.deprecated ? ` Требуют уточнения — ${count.deprecated}.` : ' Просмотр списка ни к чему не обязывает.'}`;
  $('#selection-program-counts').textContent = count.total ? `Группа — ${count.byProgram.group.total} · Трио — ${count.byProgram.trio.total}. Учтены и песни, которые сейчас скрыты фильтрами.` : '';
  $('#reset-open').disabled = count.total + count.deprecated === 0;
  $('#discuss-selection').disabled = count.total === 0;
  renderDeprecated(); renderPreview();
}
function resetFilters() { query.query = ''; query.category = ''; query.status = 'all'; $('#song-search').value = ''; $('#song-category').value = ''; $('#song-status').value = 'all'; visibleLimit = PAGE_SIZE; renderResults(); }
$('#song-search').addEventListener('input', event => { query.query = event.target.value; visibleLimit = PAGE_SIZE; renderResults(); });
$('#song-category').addEventListener('change', event => { query.category = event.target.value; visibleLimit = PAGE_SIZE; renderResults(); });
$('#song-status').addEventListener('change', event => { query.status = event.target.value; visibleLimit = PAGE_SIZE; renderResults(); });
for (const id of ['reset-filters', 'empty-reset']) $(`#${id}`).addEventListener('click', () => { resetFilters(); $('#song-search').focus({ preventScroll: true }); });
function selectProgram(program, focus = false) {
  const url = new URL(location.href); url.searchParams.set('lineup', program);
  if (url.href !== location.href) history.pushState(null, '', url);
  store.setProgram(program);
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
  if (control.dataset.program && control.dataset.song) store.setStatus(control.dataset.program, control.dataset.song, control.value);
});
document.addEventListener('click', event => {
  const remove = event.target.closest('[data-remove-song]');
  if (remove) { const row = remove.closest('.rep-song-row'); store.setStatus(remove.dataset.removeProgram, remove.dataset.removeSong, null); if (row && !row.hidden) row.querySelector('input[type=radio]')?.focus({ preventScroll: true }); return; }
  const transfer = event.target.closest('[data-transfer]');
  if (transfer) {
    const record = snapshot.deprecated.find(song => song.key === transfer.dataset.transfer); if (!record) return;
    const text = `Неподтверждённое пожелание — ${record.programLabel} — ${STATUS_LABELS[record.status]}: ${recordDescription(record)}.`;
    window.dispatchEvent(new CustomEvent('bogema:comment-request', { detail: { key: record.key, text } }));
  }
});
window.addEventListener('bogema:comment-result', event => { $('#comment-result').textContent = event.detail?.message || ''; });
function expand(all) {
  const oldScroll = scrollY, oldLimit = visibleLimit, matches = currentResults();
  const firstNew = matches[oldLimit];
  visibleLimit = all ? matches.length : visibleLimit + PAGE_SIZE;
  renderResults();
  if ($('.rep-pagination').hidden && firstNew) { const row = rows.get(keyFor(snapshot.program, firstNew.id)); row.tabIndex = -1; row.focus({ preventScroll: true }); }
  window.scrollTo({ top: oldScroll, behavior: 'instant' });
}
$('#show-more').addEventListener('click', () => expand(false));
$('#show-all').addEventListener('click', () => expand(true));
$('#preview-open').addEventListener('click', event => { openDialog($('#preview-dialog'), event.currentTarget); renderPreview(); });
$('#discuss-selection').addEventListener('click', () => { window.dispatchEvent(new CustomEvent('bogema:attach-request')); $('#request').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); });
$('#reset-open').addEventListener('click', event => openDialog($('#reset-dialog'), event.currentTarget));
$('#reset-dialog').addEventListener('close', event => { if (event.currentTarget.returnValue === 'reset') { store.clearMarks(); $('#selection-title').tabIndex = -1; $('#selection-title').focus({ preventScroll: true }); $('#export-status').textContent = 'Все отметки удалены. Прикрепление подборки выключено.'; } });
async function copySelection() {
  const text = formatPreferences(snapshot);
  try { await navigator.clipboard.writeText(text); $('#export-status').textContent = 'Подборка скопирована. Группе ничего не отправлено.'; }
  catch { $('#copy-text').value = text; openDialog($('#copy-dialog'), $('#copy-selection')); $('#copy-text').focus(); $('#copy-text').select(); $('#export-status').textContent = 'Автоматическое копирование недоступно. Открыт текст для ручного копирования.'; }
}
$('#copy-selection').addEventListener('click', copySelection);
function download(text, filename) {
  try {
    const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }));
    const link = element('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    $('#export-status').textContent = 'Скачивание TXT началось. Группе ничего не отправлено.';
  } catch { $('#export-status').textContent = 'Не удалось подготовить файл. Попробуйте скопировать подборку.'; }
}
$('#download-list').addEventListener('click', () => download(formatFullCatalog(catalog, snapshot.program, snapshot.selected), `Богема — ${catalog.lineups[snapshot.program].label} — полный репертуар.txt`));
$('#download-selection').addEventListener('click', () => download(formatPreferences(snapshot), 'Богема — мои музыкальные пожелания.txt'));
$('#retry-catalog').addEventListener('click', () => { $('#catalog-loading').hidden = false; $('#catalog-error').hidden = true; store.reloadCatalog(); });
store.subscribe(refresh);
refresh(snapshot);
store.ready.then(() => refresh(store.getSnapshot()));
