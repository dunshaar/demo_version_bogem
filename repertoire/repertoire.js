import { preferencesStore as store, STATUS_LABELS, PROGRAMS, formatPreferences, formatFullCatalog } from '../preferences-store.mjs';

const $ = selector => document.querySelector(selector);
const rows = new Map();
let catalog = null, snapshot = store.getSnapshot(), initialized = false, activeProgram = snapshot.program;
let previewOpener = null;
const keyFor = (program, id) => `${program}:${id}`;
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const dialog = $('#preview-dialog');
const removedParameters = ['q', 'query', 'search', 'category', 'status', 'filter', 'sort', 'page', 'limit'];
const cleanURL = new URL(location.href);
for (const key of removedParameters) cleanURL.searchParams.delete(key);
if (cleanURL.href !== location.href) history.replaceState(null, '', cleanURL);

function createChoices(song, program) {
  const choices = element('fieldset', undefined, 'rep-song-choices');
  choices.append(element('legend', `Пожелание: ${song.title} — ${song.artist || 'Исполнитель не указан'}, ${catalog.lineups[program].label}`, 'rep-sr-only'));
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
      const row = rows.get(keyFor(program, song.id));
      const mark = store.getStatus(program, song.id);
      row.dataset.status = mark;
      for (const input of row.querySelectorAll('input[type=radio]')) input.checked = input.value === mark;
    }
  }
  $('#results-status').textContent = `${catalog.lineups[snapshot.program].songs.length} песен`;
  $('#download-list').textContent = `Скачать репертуар ${snapshot.program === 'group' ? 'группы' : 'трио'} · TXT ↓`;
  if (activeProgram !== snapshot.program) {
    activeProgram = snapshot.program;
    $('#catalog-export-status').textContent = '';
    window.dispatchEvent(new Event('bogema:layout'));
  }
}
function renderPreview() {
  if (!dialog.open) return;
  const focused = document.activeElement, focusKey = focused?.dataset?.previewKey;
  const content = $('#preview-content'), fragment = document.createDocumentFragment();
  for (const program of PROGRAMS) {
    const songs = snapshot.selected.filter(song => song.program === program);
    if (!songs.length) continue;
    fragment.append(element('h3', songs[0].programLabel));
    for (const status of ['want', 'skip']) {
      const selected = songs.filter(song => song.status === status); if (!selected.length) continue;
      fragment.append(element('h4', `${STATUS_LABELS[status]} · ${selected.length}`));
      const list = element('ul');
      for (const song of selected) {
        const item = element('li'), name = element('span', song.title);
        name.append(element('small', song.artist || 'Исполнитель не указан'));
        const neutral = element('button', 'Вернуть «Можно»', 'rep-text-button'); neutral.type = 'button';
        neutral.dataset.removeProgram = song.program; neutral.dataset.removeSong = song.id; neutral.dataset.previewKey = keyFor(song.program, song.id);
        neutral.setAttribute('aria-label', `Вернуть «Можно»: ${song.title}, ${song.programLabel}`);
        item.append(name, neutral); list.append(item);
      }
      fragment.append(list);
    }
  }
  if (snapshot.deprecated.length) {
    fragment.append(element('h3', `Недоступны в репертуаре · ${snapshot.deprecated.length}`));
    fragment.append(element('p', 'Эти пожелания останутся только в скачанном тексте, в отдельной части. Они не прикрепляются к заявке как актуальные песни.', 'rep-small'));
    const list = element('ul');
    for (const song of snapshot.deprecated) {
      const item = element('li'), name = element('span', song.title || `Название не восстановлено (${song.id})`);
      name.append(element('small', `${song.artist || 'Исполнитель не указан'} · ${song.programLabel} · ${STATUS_LABELS[song.status]}`));
      const remove = element('button', 'Удалить', 'rep-text-button'); remove.type = 'button';
      remove.dataset.removeProgram = song.program; remove.dataset.removeSong = song.id; remove.dataset.previewKey = keyFor(song.program, song.id);
      remove.setAttribute('aria-label', `Удалить недоступную песню: ${song.title || song.id}`);
      item.append(name, remove); list.append(item);
    }
    fragment.append(list);
  }
  const contentScroll = $('.rep-preview-scroll').scrollTop;
  content.replaceChildren(fragment); $('.rep-preview-scroll').scrollTop = contentScroll;
  if (!$('#copy-fallback').hidden) $('#copy-text').value = formatPreferences(snapshot);
  if (focusKey) {
    const replacement = [...content.querySelectorAll('[data-preview-key]')].find(node => node.dataset.previewKey === focusKey);
    (replacement || dialog.querySelector('[data-close-dialog]')).focus({ preventScroll: true });
  }
}
function refresh(value) {
  snapshot = value;
  if (snapshot.ready && (!initialized || snapshot.catalogVersion !== catalog?.version || snapshot.maxSelections !== PROGRAMS.reduce((n, key) => n + (catalog?.lineups?.[key]?.songs.length || 0), 0))) initialize();
  if (snapshot.catalogError && !snapshot.ready) { $('#catalog-loading').hidden = true; $('#catalog-error').hidden = false; document.documentElement.dataset.repertoireReady = 'false'; }
  $('#storage-status').textContent = snapshot.storage.message || ''; $('#storage-status').hidden = !snapshot.storage.message;
  $('#program-notice').hidden = !snapshot.urlWarning; $('#program-notice').textContent = snapshot.urlWarning;
  renderCatalog();
  const count = snapshot.counts, nonempty = count.total + count.deprecated > 0;
  $('#selection-summary').hidden = count.total === 0;
  $('#selection-counts').textContent = `Хочу: ${count.want} · Не надо: ${count.skip}`;
  $('#deprecated-section').hidden = !count.deprecated;
  $('#deprecated-summary').textContent = `Сохранённых пожеланий, которых больше нет в текущем репертуаре: ${count.deprecated}. Они не прикрепляются как актуальные песни.`;
  if (!nonempty && dialog.open) { dialog.close(); $('#wishes-status').textContent = 'У всех песен снова «Можно».'; }
  renderPreview();
  window.dispatchEvent(new Event('bogema:layout'));
}
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
  if (control.matches('.rep-song-choices input')) { $('#wishes-status').textContent = ''; store.setStatus(control.dataset.program, control.dataset.song, control.value); }
});
document.addEventListener('click', event => {
  const remove = event.target.closest('[data-remove-song]');
  if (remove) store.setStatus(remove.dataset.removeProgram, remove.dataset.removeSong, 'maybe');
});
function toggleReset(show) {
  $('#reset-confirmation').hidden = !show; $('#preview-actions').hidden = show;
  if (show) $('#reset-cancel').focus({ preventScroll: true });
}
function showPreview(trigger) {
  if (!snapshot.selected.length && !snapshot.deprecated.length) return;
  toggleReset(false); $('#copy-fallback').hidden = true; $('#export-status').textContent = '';
  previewOpener = trigger || document.activeElement;
  if (!dialog.open) dialog.showModal();
  renderPreview();
}
$('#preview-open').addEventListener('click', event => showPreview(event.currentTarget));
document.querySelectorAll('[data-preview-open]').forEach(button => button.addEventListener('click', () => showPreview(button)));
dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  toggleReset(false);
  const target = previewOpener?.isConnected && previewOpener.getClientRects().length ? previewOpener : $(`#tab-${snapshot.program}`);
  target.focus({ preventScroll: true }); previewOpener = null;
});
$('#reset-open').addEventListener('click', () => toggleReset(true));
$('#reset-cancel').addEventListener('click', () => { toggleReset(false); $('#reset-open').focus({ preventScroll: true }); });
$('#reset-confirm').addEventListener('click', () => store.clearMarks());
dialog.addEventListener('cancel', event => { if (!$('#reset-confirmation').hidden) { event.preventDefault(); toggleReset(false); $('#reset-open').focus({ preventScroll: true }); } });
$('#copy-selection').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(formatPreferences(snapshot)); $('#export-status').textContent = 'Пожелания скопированы.'; $('#copy-fallback').hidden = true; }
  catch { $('#copy-text').value = formatPreferences(snapshot); $('#copy-fallback').hidden = false; $('#copy-text').focus(); $('#copy-text').select(); $('#export-status').textContent = 'Выделите текст ниже и скопируйте вручную.'; }
});
function download(text, filename, target = '#export-status') {
  try {
    const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }));
    const link = element('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000); $(target).textContent = 'Файл TXT подготовлен для скачивания.';
  } catch { $(target).textContent = 'Не удалось подготовить файл. Попробуйте ещё раз.'; }
}
$('#download-list').addEventListener('click', () => download(formatFullCatalog(catalog, snapshot.program, snapshot.selected), `Богема — ${catalog.lineups[snapshot.program].label} — полный репертуар.txt`, '#catalog-export-status'));
$('#download-selection').addEventListener('click', () => download(formatPreferences(snapshot), 'Богема — мои музыкальные пожелания.txt'));
$('#retry-catalog').addEventListener('click', () => { $('#catalog-loading').hidden = false; $('#catalog-error').hidden = true; store.reloadCatalog(); });
store.subscribe(refresh); refresh(snapshot); store.ready.then(() => refresh(store.getSnapshot()));
