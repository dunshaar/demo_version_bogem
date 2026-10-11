import { LINEUPS } from './project-data.mjs';

export const STORAGE_KEY = 'bogema:preferences:v3';
export const STATUS_LABELS = Object.freeze({ want: 'Хочу', maybe: 'Можно', skip: 'Не надо' });
export const PROGRAMS = Object.freeze(['group', 'trio']);
const PROGRAM_LABELS = { group: 'Группа', trio: 'Трио' };
const clone = value => JSON.parse(JSON.stringify(value));
const validID = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
const keyFor = (program, id) => `${program}:${id}`;
const emptyCount = () => ({ total: 0, want: 0, maybe: 0, skip: 0 });
export const normalizeSearch = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е').trim().replace(/\s+/g, ' ');

export function validateCatalog(value) {
  if (typeof value?.version !== 'string') throw new Error('catalog-version');
  for (const program of PROGRAMS) {
    const lineup = value.lineups?.[program];
    if (!lineup || typeof lineup.label !== 'string' || !Array.isArray(lineup.songs) || !lineup.songs.length) throw new Error('catalog-program');
    const ids = new Set();
    for (const song of lineup.songs) {
      if (!validID(song.id) || ids.has(song.id) || typeof song.title !== 'string' || !song.title.trim() || !(song.artist === null || typeof song.artist === 'string') || !Array.isArray(song.aliases)) throw new Error('catalog-song');
      ids.add(song.id);
    }
  }
  return value;
}

export function createPreferencesStore({ catalog = null, storage = null, search = '', lineups = LINEUPS } = {}) {
  let data = catalog ? validateCatalog(clone(catalog)) : null;
  let program = 'group', commercialID = null, catalogError = false;
  let records = new Map(), unavailable = new Set(), urlWarning = '';
  const listeners = new Set();
  const storageState = { read: 'unavailable', write: 'untested', message: '' };
  let catalogVersion = data?.version || null;
  let catalogRequest = null;
  const lookup = (programID, id) => data?.lineups?.[programID]?.songs.find(song => song.id === id);
  const lookupLineup = id => lineups.find(item => item.id === id);

  function storageMessage() {
    const issues = [];
    if (storageState.read === 'blocked' || storageState.read === 'unavailable') issues.push('Сохранение недоступно: пожелания и состав работают только в памяти этой открытой страницы. После обновления или перехода на другую страницу они могут потеряться. Скопируйте подборку до ухода.');
    if (storageState.read === 'corrupt') issues.push('Сохранённые данные повреждены и не восстановлены. Новые отметки можно выбрать и скопировать.');
    if (storageState.read === 'unsupported') issues.push('Версия сохранённых данных не поддерживается; их значения не перенесены автоматически.');
    if (storageState.read === 'partial') issues.push('Часть сохранённых данных не удалось восстановить. Восстановлены только распознанные отметки; проверьте подборку.');
    if (storageState.write === 'blocked') issues.push('Браузер не сохранил последние изменения. Они доступны в этой открытой странице, но после обновления или перехода могут потеряться. Скопируйте подборку до ухода.');
    storageState.message = issues.join(' ');
  }
  function readSaved() {
    if (!storage) { storageState.read = 'unavailable'; storageMessage(); return false; }
    let raw;
    try { raw = storage.getItem(STORAGE_KEY); storageState.read = 'ok'; } catch { storageState.read = 'blocked'; storageMessage(); return false; }
    if (raw === null) { records = new Map(); commercialID = null; program = 'group'; storageMessage(); return true; }
    let saved;
    try { saved = JSON.parse(raw); } catch { storageState.read = 'corrupt'; storageMessage(); return false; }
    if (!saved || saved.schema !== 3) { storageState.read = 'unsupported'; storageMessage(); return false; }
    let invalid = 0;
    const restored = new Map();
    if (!Array.isArray(saved.marks)) invalid++;
    for (const mark of Array.isArray(saved.marks) ? saved.marks : []) {
      if (!mark || !validID(mark.program) || !validID(mark.id) || !Object.hasOwn(STATUS_LABELS, mark.status)) { invalid++; continue; }
      const key = keyFor(mark.program, mark.id);
      if (restored.has(key)) { invalid++; continue; }
      const snapshot = {};
      for (const field of ['title', 'artist', 'programLabel']) {
        const value = mark.snapshot?.[field];
        if (typeof value === 'string' && value.length <= 2000) snapshot[field] = value;
        else if (field === 'artist' && value === null) snapshot.artist = null;
        else if (value !== undefined) invalid++;
      }
      restored.set(key, { program: mark.program, id: mark.id, status: mark.status, snapshot });
    }
    records = restored;
    if (PROGRAMS.includes(saved.program)) program = saved.program;
    else if (saved.program !== undefined) invalid++;
    if (saved.commercialLineup === null || saved.commercialLineup === undefined) commercialID = null;
    else if (validID(saved.commercialLineup)) commercialID = saved.commercialLineup;
    else { commercialID = null; invalid++; }
    if (typeof saved.catalogVersion === 'string') catalogVersion = saved.catalogVersion;
    storageState.read = invalid ? 'partial' : 'ok';
    storageMessage();
    return true;
  }
  function applySearch(value) {
    const params = new URLSearchParams(value);
    if (params.has('lineup')) {
      const requested = params.get('lineup');
      if (PROGRAMS.includes(requested)) { program = requested; urlWarning = ''; }
      else { program = 'group'; urlWarning = 'Программа в ссылке не найдена. Открыт репертуар группы; ваши сохранённые отметки и состав не изменены.'; }
    } else { urlWarning = ''; if (!PROGRAMS.includes(program)) program = 'group'; }
  }
  function persist() {
    if (!storage || storageState.read === 'blocked' || storageState.read === 'unavailable') { storageState.write = 'blocked'; storageMessage(); return; }
    const saved = { schema: 3, program, commercialLineup: commercialID, catalogVersion: data?.version || catalogVersion, marks: [...records.values()] };
    try { storage.setItem(STORAGE_KEY, JSON.stringify(saved)); storageState.write = 'ok'; }
    catch { storageState.write = 'blocked'; }
    storageMessage();
  }
  function getSnapshot() {
    const selected = [], deprecated = [];
    const counts = { ...emptyCount(), deprecated: 0, byProgram: { group: emptyCount(), trio: emptyCount() } };
    // Current records follow the source catalog order, independent of filters and DOM.
    if (data) for (const programID of PROGRAMS) for (const song of data.lineups[programID].songs) {
      const mark = records.get(keyFor(programID, song.id));
      if (!mark || unavailable.has(keyFor(programID, song.id))) continue;
      const record = { program: programID, id: song.id, status: mark.status, title: song.title, artist: song.artist, programLabel: data.lineups[programID].label };
      selected.push(record);
      counts.total++; counts[mark.status]++; counts.byProgram[programID].total++; counts.byProgram[programID][mark.status]++;
    }
    if (data) for (const [key, mark] of records) {
      if (lookup(mark.program, mark.id) && !unavailable.has(key)) continue;
      const current = lookup(mark.program, mark.id);
      deprecated.push({ key, program: mark.program, id: mark.id, status: mark.status, title: current?.title || mark.snapshot?.title || null, artist: current?.artist ?? mark.snapshot?.artist ?? null, programLabel: data.lineups[mark.program]?.label || mark.snapshot?.programLabel || PROGRAM_LABELS[mark.program] || `Программа ${mark.program}` });
    }
    counts.deprecated = deprecated.length;
    const commercial = lookupLineup(commercialID);
    return clone({ ready: !!data, catalogError, catalogVersion: data?.version || catalogVersion, program, commercialLineup: commercial ? { id: commercial.id, label: commercial.label } : null, unavailableLineup: commercialID && !commercial ? commercialID : null, availableLineups: lineups.map(({ id, label }) => ({ id, label })), selected, deprecated, maxSelections: data ? PROGRAMS.reduce((n, key) => n + data.lineups[key].songs.filter(song => !unavailable.has(keyFor(key, song.id))).length, 0) : 0, counts, storage: storageState, urlWarning });
  }
  function notify() { const snapshot = getSnapshot(); for (const callback of listeners) callback(snapshot); }
  function changed() { persist(); notify(); }
  readSaved();
  applySearch(search);
  if (storageState.read === 'ok' && PROGRAMS.includes(new URLSearchParams(search).get('lineup'))) persist();
  const api = {
    getSnapshot,
    getCatalog: () => { if (!data) return null; const copy = clone(data); for (const key of PROGRAMS) copy.lineups[key].songs = copy.lineups[key].songs.filter(song => !unavailable.has(keyFor(key, song.id))); return copy; },
    getStatus: (programID, id) => records.get(keyFor(programID, id))?.status || null,
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    setProgram(value) { if (!PROGRAMS.includes(value)) throw new Error('Unknown program'); program = value; urlWarning = ''; changed(); },
    applyUrl(value) { applySearch(value); changed(); },
    setCommercialLineup(id) { if (id !== null && !lookupLineup(id)) throw new Error('Unknown commercial lineup'); commercialID = id; changed(); },
    clearCommercialLineup() { commercialID = null; changed(); },
    setStatus(programID, id, status) {
      const key = keyFor(programID, id);
      if (status === null) { records.delete(key); changed(); return; }
      if (!Object.hasOwn(STATUS_LABELS, status)) throw new Error('Unknown status');
      const song = lookup(programID, id);
      if (!song || unavailable.has(key)) throw new Error('Song unavailable');
      records.set(key, { program: programID, id, status, snapshot: { title: song.title, artist: song.artist, programLabel: data.lineups[programID].label } });
      changed();
    },
    clearMarks() { records.clear(); changed(); },
    markUnavailable(items) { for (const item of items) if (validID(item?.program) && validID(item?.id)) unavailable.add(keyFor(item.program, item.id)); notify(); },
    refreshFromStorage(value = search) { readSaved(); applySearch(value); notify(); },
    setCatalog(value) { data = validateCatalog(clone(value)); catalogVersion = data.version; catalogError = false; unavailable.clear(); notify(); },
    loadCatalog(loader) {
      if (catalogRequest) return catalogRequest;
      catalogError = false;
      catalogRequest = Promise.resolve().then(loader).then(value => { api.setCatalog(value); return getSnapshot(); }).catch(() => { catalogError = true; notify(); return getSnapshot(); }).finally(() => { catalogRequest = null; });
      return catalogRequest;
    },
    ready: Promise.resolve(),
  };
  api.ready = Promise.resolve(getSnapshot());
  return api;
}

export function filterSongs(catalog, { program = 'group', query = '', category = '', status = 'all', selected = [] } = {}) {
  const marks = new Map(selected.filter(item => item.program === program).map(item => [item.id, item.status]));
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  return (catalog?.lineups?.[program]?.songs || []).filter(song => {
    const index = normalizeSearch(`${song.title} ${song.artist || ''}`);
    if (!words.every(word => index.includes(word))) return false;
    if (category && !song.aliases.some(alias => alias.category === category)) return false;
    const mark = marks.get(song.id);
    return status === 'all' || (status === 'marked' && !!mark) || (status === 'unmarked' && !mark) || mark === status;
  });
}

export function formatPreferences(snapshot, { includeDeprecated = true } = {}) {
  const lines = ['БОГЕМА — МУЗЫКАЛЬНЫЕ ПОЖЕЛАНИЯ', 'Это пожелания для обсуждения, а не утверждённый сет-лист.'];
  const selected = snapshot.selected || [];
  if (!selected.length) lines.push('', 'Актуальные песни не отмечены.');
  for (const program of PROGRAMS) {
    const records = selected.filter(item => item.program === program);
    if (!records.length) continue;
    lines.push('', `ПРОГРАММА: ${records[0].programLabel || PROGRAM_LABELS[program]}`);
    for (const [status, label] of Object.entries(STATUS_LABELS)) {
      const songs = records.filter(item => item.status === status);
      if (!songs.length) continue;
      lines.push(`${label.toLocaleUpperCase('ru')} (${songs.length})`);
      songs.forEach((song, index) => lines.push(`${index + 1}. ${song.title} — ${song.artist || 'Исполнитель не указан'}`));
    }
  }
  if (includeDeprecated && snapshot.deprecated?.length) {
    lines.push('', 'ТРЕБУЮТ УТОЧНЕНИЯ — НЕ ВХОДЯТ В СПИСОК ПЕСЕН ДЛЯ ОБРАЩЕНИЯ');
    snapshot.deprecated.forEach(song => lines.push(`${song.programLabel} · ${STATUS_LABELS[song.status]}: ${song.title || `Название восстановить не удалось (${song.id})`} — ${song.artist || 'Исполнитель не указан'}`));
  }
  return `${lines.join('\n')}\n`;
}
export function formatFullCatalog(catalog, program, selected = []) {
  const lineup = catalog?.lineups?.[program];
  if (!lineup) return '';
  const marks = new Map(selected.filter(item => item.program === program).map(item => [item.id, item.status]));
  return [`БОГЕМА — ПОЛНЫЙ РЕПЕРТУАР: ${lineup.label}`, `Версия: ${catalog.version}`, `Песен: ${lineup.songs.length}. Отметки — пожелания для обсуждения.`, '', ...lineup.songs.map((song, index) => `${index + 1}. ${song.title} — ${song.artist || 'Исполнитель не указан'} [${STATUS_LABELS[marks.get(song.id)] || 'Без отметки'}]`), ''].join('\n');
}
let browserStorage = null;
try { if (typeof window !== 'undefined') browserStorage = globalThis.localStorage || null; } catch { browserStorage = { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Storage blocked'); } }; }
export const preferencesStore = createPreferencesStore({ storage: browserStorage, search: globalThis.location?.search || '' });
if (typeof window !== 'undefined') {
  const load = async () => {
    const response = await fetch(new URL('./repertoire/data.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error('Catalog unavailable');
    return response.json();
  };
  preferencesStore.ready = preferencesStore.loadCatalog(load);
  preferencesStore.reloadCatalog = () => preferencesStore.loadCatalog(load);
  window.addEventListener('popstate', () => preferencesStore.applyUrl(window.location.search));
  window.addEventListener('pageshow', event => { if (event.persisted) preferencesStore.refreshFromStorage(window.location.search); });
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === null) preferencesStore.refreshFromStorage(window.location.search); });
}
