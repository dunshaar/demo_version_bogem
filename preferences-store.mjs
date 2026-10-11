export const STORAGE_KEY = 'bogema:preferences:v5';
export const LEGACY_STORAGE_KEY = 'bogema:preferences:v3';
export const STATUS_LABELS = Object.freeze({ want: 'Хочу', maybe: 'Можно', skip: 'Не надо' });
export const PROGRAMS = Object.freeze(['group', 'trio']);
const PROGRAM_LABELS = { group: 'Группа', trio: 'Трио' };
const clone = value => JSON.parse(JSON.stringify(value));
const validID = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
const keyFor = (program, id) => `${program}:${id}`;
const emptyCount = () => ({ total: 0, want: 0, skip: 0 });
export const BASELINE_EXPLANATION = 'По остальным песням особых пожеланий нет (“Можно”)';

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

export function createPreferencesStore({ catalog = null, storage = null, search = '' } = {}) {
  let data = catalog ? validateCatalog(clone(catalog)) : null;
  let program = 'group', catalogError = false;
  let records = new Map(), unavailable = new Set(), urlWarning = '', migrating = false;
  const listeners = new Set();
  const storageState = { read: 'unavailable', write: 'untested', message: '' };
  let catalogVersion = data?.version || null;
  let catalogRequest = null;
  const lookup = (programID, id) => PROGRAMS.includes(programID) ? data?.lineups?.[programID]?.songs.find(song => song.id === id) : undefined;

  function storageMessage() {
    const issues = [];
    if (storageState.read === 'blocked' || storageState.read === 'unavailable') issues.push('Сохранение недоступно: пожелания работают только на этой открытой странице и могут потеряться после обновления или перехода, поэтому скопируйте их до ухода');
    if (storageState.read === 'corrupt') issues.push('Сохранённые данные не удалось восстановить, но вы можете заново отметить песни и скопировать пожелания');
    if (storageState.read === 'unsupported') issues.push('Версия сохранённых данных не поддерживается, поэтому пожелания не перенесены автоматически');
    if (storageState.read === 'partial') issues.push('Часть сохранённых данных не удалось восстановить, проверьте пожелания');
    if (storageState.write === 'blocked' && !['blocked', 'unavailable'].includes(storageState.read)) issues.push('Браузер не сохранил последние изменения, скопируйте пожелания до обновления страницы или перехода');
    storageState.message = issues.join('\n');
  }
  function readSaved() {
    if (!storage) { storageState.read = 'unavailable'; storageMessage(); return false; }
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY); migrating = false;
      if (raw === null) { raw = storage.getItem(LEGACY_STORAGE_KEY); migrating = raw !== null; }
      storageState.read = 'ok';
    } catch { storageState.read = 'blocked'; storageMessage(); return false; }
    if (raw === null) { records = new Map(); program = 'group'; storageMessage(); return true; }
    let saved;
    try { saved = JSON.parse(raw); } catch { storageState.read = 'corrupt'; storageMessage(); return false; }
    if (!saved || saved.schema !== (migrating ? 3 : 5)) { storageState.read = 'unsupported'; storageMessage(); return false; }
    let invalid = 0;
    const restored = new Map();
    if (!Array.isArray(saved.marks)) invalid++;
    for (const mark of Array.isArray(saved.marks) ? saved.marks : []) {
      if (!mark || !validID(mark.program) || !validID(mark.id) || !Object.hasOwn(STATUS_LABELS, mark.status)) { invalid++; continue; }
      // All neutral states intentionally converge to the same baseline in schema 5.
      if (mark.status === 'maybe') continue;
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
      else { program = 'group'; urlWarning = 'Программа в ссылке не найдена, открыт репертуар группы без изменения ваших пожеланий'; }
    } else { urlWarning = ''; if (!PROGRAMS.includes(program)) program = 'group'; }
  }
  function persist() {
    if (!storage || storageState.read === 'blocked' || storageState.read === 'unavailable') { storageState.write = 'blocked'; storageMessage(); return; }
    const saved = { schema: 5, program, catalogVersion: data?.version || catalogVersion, marks: [...records.values()] };
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(saved)); storageState.write = 'ok';
      // Only retire the old schema after its replacement has actually been saved.
      if (migrating && typeof storage.removeItem === 'function') { storage.removeItem(LEGACY_STORAGE_KEY); migrating = false; }
    } catch { storageState.write = 'blocked'; }
    storageMessage();
  }
  function getSnapshot() {
    const selected = [], deprecated = [];
    const counts = { ...emptyCount(), deprecated: 0, byProgram: { group: emptyCount(), trio: emptyCount() } };
    if (data) for (const programID of PROGRAMS) for (const song of data.lineups[programID].songs) {
      const mark = records.get(keyFor(programID, song.id));
      if (!mark || unavailable.has(keyFor(programID, song.id))) continue;
      selected.push({ program: programID, id: song.id, status: mark.status, title: song.title, artist: song.artist, programLabel: data.lineups[programID].label });
      counts.total++; counts[mark.status]++; counts.byProgram[programID].total++; counts.byProgram[programID][mark.status]++;
    }
    if (data) for (const [key, mark] of records) {
      if (lookup(mark.program, mark.id) && !unavailable.has(key)) continue;
      const current = lookup(mark.program, mark.id);
      deprecated.push({ key, program: mark.program, id: mark.id, status: mark.status, title: current?.title || mark.snapshot?.title || null, artist: current?.artist ?? mark.snapshot?.artist ?? null, programLabel: (PROGRAMS.includes(mark.program) ? data.lineups[mark.program].label : null) || mark.snapshot?.programLabel || (PROGRAMS.includes(mark.program) ? PROGRAM_LABELS[mark.program] : null) || `Программа ${mark.program}` });
    }
    counts.deprecated = deprecated.length;
    return clone({ ready: !!data, catalogError, catalogVersion: data?.version || catalogVersion, program, selected, deprecated, maxSelections: data ? PROGRAMS.reduce((n, key) => n + data.lineups[key].songs.filter(song => !unavailable.has(keyFor(key, song.id))).length, 0) : 0, counts, storage: storageState, urlWarning });
  }
  function notify() { const snapshot = getSnapshot(); for (const callback of listeners) callback(snapshot); }
  function changed() { persist(); notify(); }
  readSaved(); applySearch(search);
  if (migrating && ['ok', 'partial'].includes(storageState.read) || storageState.read === 'ok' && PROGRAMS.includes(new URLSearchParams(search).get('lineup'))) persist();
  const api = {
    getSnapshot,
    getCatalog: () => { if (!data) return null; const copy = clone(data); for (const key of PROGRAMS) copy.lineups[key].songs = copy.lineups[key].songs.filter(song => !unavailable.has(keyFor(key, song.id))); return copy; },
    getStatus: (programID, id) => records.get(keyFor(programID, id))?.status || 'maybe',
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    setProgram(value) { if (!PROGRAMS.includes(value)) throw new Error('Unknown program'); program = value; urlWarning = ''; changed(); },
    applyUrl(value) { applySearch(value); changed(); },
    setStatus(programID, id, status) {
      const key = keyFor(programID, id);
      if (status === null || status === 'maybe') { records.delete(key); changed(); return; }
      if (!['want', 'skip'].includes(status)) throw new Error('Unknown status');
      const song = lookup(programID, id);
      if (!song || unavailable.has(key)) throw new Error('Song unavailable');
      records.set(key, { program: programID, id, status, snapshot: { title: song.title, artist: song.artist, programLabel: data.lineups[programID].label } });
      changed();
    },
    clearMarks(programID = null) {
      if (programID === null) records.clear();
      else for (const [key, mark] of records) if (mark.program === programID) records.delete(key);
      changed();
    },
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

export function currentProgramSnapshot(snapshot) {
  const selected = (snapshot.selected || []).filter(item => item.program === snapshot.program);
  const deprecated = (snapshot.deprecated || []).filter(item => item.program === snapshot.program);
  return {...snapshot, selected, deprecated};
}
export function formatPreferences(snapshot, { includeDeprecated = true } = {}) {
  snapshot = currentProgramSnapshot(snapshot);
  const lines = ['БОГЕМА: МУЗЫКАЛЬНЫЕ ПОЖЕЛАНИЯ', 'Итоговую программу согласуем отдельно', BASELINE_EXPLANATION];
  const selected = (snapshot.selected || []).filter(item => ['want', 'skip'].includes(item.status));
  if (!selected.length) lines.push('', 'Изменений по актуальным песням нет');
  for (const program of PROGRAMS) {
    const records = selected.filter(item => item.program === program);
    if (!records.length) continue;
    lines.push('', `ПРОГРАММА: ${records[0].programLabel || PROGRAM_LABELS[program]}`);
    for (const status of ['want', 'skip']) {
      const songs = records.filter(item => item.status === status);
      if (!songs.length) continue;
      lines.push(`${STATUS_LABELS[status].toLocaleUpperCase('ru')} (${songs.length})`);
      songs.forEach((song, index) => lines.push(`${index + 1}. ${song.title}, ${song.artist || 'Исполнитель не указан'}`));
    }
  }
  if (includeDeprecated && snapshot.deprecated?.length) {
    lines.push('', 'НЕДОСТУПНЫ В ТЕКУЩЕМ РЕПЕРТУАРЕ: НЕ ПРИКРЕПЛЯЮТСЯ К ЗАЯВКЕ');
    snapshot.deprecated.forEach(song => lines.push(`${song.programLabel} · ${STATUS_LABELS[song.status]}: ${song.title || `Название восстановить не удалось (${song.id})`}, ${song.artist || 'Исполнитель не указан'}`));
  }
  return `${lines.join('\n')}\n`;
}
export function formatFullCatalog(catalog, program, selected = []) {
  const lineup = catalog?.lineups?.[program];
  if (!lineup) return '';
  const marks = new Map(selected.filter(item => item.program === program).map(item => [item.id, item.status]));
  return [`БОГЕМА: ПОЛНЫЙ РЕПЕРТУАР: ${lineup.label}`, `Версия: ${catalog.version}`, `Песен: ${lineup.songs.length}\nИтоговую программу согласуем отдельно`, '', ...lineup.songs.map((song, index) => `${index + 1}. ${song.title}, ${song.artist || 'Исполнитель не указан'} [${STATUS_LABELS[marks.get(song.id) || 'maybe']}]`), ''].join('\n');
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
  window.addEventListener('storage', event => { if ([STORAGE_KEY, LEGACY_STORAGE_KEY, null].includes(event.key)) preferencesStore.refreshFromStorage(window.location.search); });
}
