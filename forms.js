/* Shared demo form. Loaded with defer, not type=module.
 * Future live adapter belongs at the prepare boundary below. Until a verified
 * backend contract exists, this module never POSTs data or reports delivery.
 * Live work needs its own CSRF/config contract, immutable pending snapshot,
 * stable request UUID on retry, and a server-confirmed delivered state.
 */
(() => {
  'use strict';
  if (window.bogemaForms) return;
  const scriptURL = document.currentScript?.src || new URL('forms.js', document.baseURI).href;
  const channelLabels = { '': 'Не выбран', phone: 'По телефону', whatsapp: 'WhatsApp', telegram: 'Telegram', max: 'MAX' };
  const controllers = [];
  let sequence = 0;
  let normalizePhone = fallbackPhone;
  let attachPhoneMask = null;

  function fallbackPhone(value) {
    const text = String(value ?? '').trim();
    if (!text || !/^[+\d\s()-]+$/.test(text) || /\+/.test(text.slice(1))) return '';
    const digits = text.replace(/\D/g, '');
    if (digits.length === 10 && !text.startsWith('+')) return `+7${digits}`;
    if (digits.length === 11 && (/^7/.test(digits) || (!text.startsWith('+') && /^8/.test(digits)))) return `+7${digits.slice(1)}`;
    return '';
  }

  async function loadConfig() {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 4000);
    try {
      const response = await fetch(new URL('forms-config.json', scriptURL), { signal: abort.signal, credentials: 'same-origin', cache: 'no-cache' });
      if (!response.ok) throw new Error('Config unavailable');
      const config = await response.json();
      return { enabled: config.enabled === true, apiConfigPath: typeof config.apiConfigPath === 'string' ? config.apiConfigPath : null };
    } catch {
      return { enabled: false, apiConfigPath: null };
    } finally { clearTimeout(timer); }
  }

  function repertoireSnapshot() {
    try {
      const api = window.bogemaRepertoire;
      if (!api || typeof api.getSummary !== 'function' || typeof api.getRequestText !== 'function') return { ready: false };
      const summary = api.getSummary();
      if (!summary || summary.ready !== true) return { ready: false };
      return { ready: true, api, summary };
    } catch { return { ready: false }; }
  }

  function summaryText(summary) {
    const lineup = summary.lineupLabel || ({ group: 'Группа', trio: 'Трио' })[summary.lineup] || 'Репертуар';
    const count = value => Number.isInteger(value) && value >= 0 ? value : 0;
    return `${lineup}, всего песен ${count(summary.total)}, хочу ${count(summary.want)}, можно ${count(summary.maybe)}, не надо ${count(summary.skip)}`;
  }

  function validDate(value) {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
  }

  function formatDate(value) {
    return value ? value.split('-').reverse().join('.') : 'Пока не определена';
  }

  function validateContact(values, dateValidity = true, source = 'home') {
    const data = {
      name: String(values.name ?? '').trim(),
      phone: normalizePhone(values.phone),
    };
    if (source !== 'repertoire') {
      data.date = String(values.date ?? '');
      data.preferredChannel = String(values.preferredChannel ?? '');
    }
    const errors = [];
    if (!data.name) errors.push(['name', 'Введите имя.']);
    else if (data.name.length > 80) errors.push(['name', 'Имя должно быть не длиннее 80 символов.']);
    if (!data.phone) errors.push(['phone', 'Введите номер полностью: +7 и 10 цифр.']);
    if (source !== 'repertoire') {
      if (!dateValidity || !validDate(data.date)) errors.push(['date', 'Проверьте дату.']);
      if (!Object.hasOwn(channelLabels, data.preferredChannel)) errors.push(['preferredChannel', 'Выберите способ связи из списка.']);
    }
    return { data, errors };
  }

  function buildRequest(data, source, selectedLineup = '', snapshot = null) {
    const lines = ['ЗАЯВКА\nКАВЕР-ГРУППА БОГЕМА', '', `Имя: ${data.name}`, `Телефон: ${data.phone}`];
    if (source !== 'repertoire') lines.push(`Дата: ${formatDate(data.date)}`, `Удобнее связаться: ${channelLabels[data.preferredChannel]}`);
    if (selectedLineup) lines.push(`Состав: ${selectedLineup}`);
    if (source === 'repertoire') {
      if (!snapshot?.ready) throw new Error('Репертуар ещё не готов. Дождитесь загрузки.');
      const allRecords = snapshot.api.getRequestText();
      if (typeof allRecords !== 'string' || !allRecords.trim()) throw new Error('Не удалось собрать репертуар. Попробуйте ещё раз.');
      // Keep the entire catalogue text, including defaults and source annotations.
      lines.push('', summaryText(snapshot.summary), '', 'РЕПЕРТУАР И ПРЕДПОЧТЕНИЯ', allRecords);
    }
    return lines.join('\n') + '\n';
  }

  function mount(host) {
    if (host.dataset.bfMounted) return;
    host.dataset.bfMounted = 'true';
    const source = host.dataset.source === 'repertoire' ? 'repertoire' : 'home';
    let id;
    do { id = `bf-${source}-${++sequence}`; } while (document.getElementById(`${id}-name`));
    const markup = `
      <div class="bf-root">
        <div class="bf-lineup" hidden><span class="bf-lineup-label"></span><button class="bf-lineup-remove" type="button" aria-label="Убрать выбранный состав">Убрать</button></div>
        ${source === 'repertoire' ? '<p class="bf-selection" role="status" aria-live="polite">Репертуар загружается…</p>' : ''}
        <div class="bf-fields">
          <div class="bf-field"><label for="${id}-name">Имя <span aria-hidden="true">*</span></label>
            <input id="${id}-name" name="name" type="text" autocomplete="name" required maxlength="80" aria-describedby="${id}-name-error">
            <p id="${id}-name-error" class="bf-field-error" hidden></p></div>
          <div class="bf-field"><label for="${id}-phone">Телефон <span aria-hidden="true">*</span></label>
            <input id="${id}-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="50" placeholder="+7 (___) ___-__-__" aria-describedby="${id}-phone-error">
            <p id="${id}-phone-error" class="bf-field-error" hidden></p></div>
          ${source === 'home' ? `<div class="bf-field"><label for="${id}-date">Дата <span class="bf-optional">(необязательно)</span></label>
            <input id="${id}-date" name="date" type="date" aria-describedby="${id}-date-hint ${id}-date-error">
            <p id="${id}-date-hint" class="bf-hint">Если дата ещё не определена, оставьте поле пустым</p>
            <p id="${id}-date-error" class="bf-field-error" hidden></p></div>
          <div class="bf-field"><label for="${id}-channel">Способ связи <span class="bf-optional">(необязательно)</span></label>
            <select id="${id}-channel" name="preferredChannel" aria-describedby="${id}-channel-hint ${id}-preferredChannel-error">
              <option value="">Не выбран</option><option value="phone">По телефону</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option><option value="max">MAX</option>
            </select><p id="${id}-channel-hint" class="bf-hint">Выберите, где вам удобнее получить ответ</p>
            <p id="${id}-preferredChannel-error" class="bf-field-error" hidden></p></div>` : ''}
        </div>
        <p class="bf-status" role="status" aria-live="polite" aria-atomic="true"></p>
        <button class="bf-primary" type="submit" disabled>Отправить заявку</button>
        <section class="bf-confirmation" tabindex="-1" aria-labelledby="${id}-confirmation-title" hidden>
          <svg class="bf-confirmation-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="15" stroke="currentColor"/><path d="m9 16 5 5 9-10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <h3 id="${id}-confirmation-title">Спасибо за заявку</h3>
          <p>Пусть ваш праздник звучит ярко</p>
        </section>
      </div>`;
    const form = host.tagName === 'FORM' ? host : document.createElement('form');
    form.classList.add('bf-form');
    form.noValidate = true;
    form.innerHTML = markup;
    if (form !== host) host.replaceChildren(form);
    const fieldNames = source === 'repertoire' ? ['name', 'phone'] : ['name', 'phone', 'date', 'preferredChannel'];
    const fields = Object.fromEntries(fieldNames.map(name => [name, form.elements.namedItem(name)]));
    const q = selector => form.querySelector(selector);
    const primary = q('.bf-primary');
    const status = q('.bf-status');
    const confirmation = q('.bf-confirmation');
    const lineupChip = q('.bf-lineup');
    let initialized = false;
    let preparing = false;
    let selectedLineup = '';
    let preparedText = '';
    let lastSelection = '';

    function syncButton() {
      const ready = source !== 'repertoire' || repertoireSnapshot().ready;
      primary.disabled = !initialized || preparing || !ready;
    }
    function clearError(name) {
      fields[name].removeAttribute('aria-invalid');
      const error = document.getElementById(`${id}-${name}-error`);
      error.textContent = '';
      error.hidden = true;
    }
    function setError(name, message) {
      fields[name].setAttribute('aria-invalid', 'true');
      const error = document.getElementById(`${id}-${name}-error`);
      error.textContent = message;
      error.hidden = false;
    }
    function invalidate() {
      preparedText = '';
      confirmation.hidden = true;
      status.textContent = '';
      primary.textContent = 'Отправить заявку';
      syncButton();
    }
    function setLineup(name) {
      if (source !== 'home') return;
      const value = typeof name === 'string' ? name.trim().slice(0, 120) : '';
      if (value === selectedLineup) return;
      selectedLineup = value;
      lineupChip.hidden = !value;
      q('.bf-lineup-label').textContent = value ? `Выбран состав: ${value}` : '';
      invalidate();
    }
    function refreshSelection() {
      if (source !== 'repertoire') return;
      const snapshot = repertoireSnapshot();
      const label = snapshot.ready ? summaryText(snapshot.summary) : 'Загружаем выбранный репертуар…';
      let fingerprint = 'not-ready';
      if (snapshot.ready) {
        try { fingerprint = JSON.stringify(snapshot.summary) + '\n' + snapshot.api.getRequestText(); }
        catch { fingerprint = 'not-ready'; }
      }
      if (lastSelection && fingerprint !== lastSelection) invalidate();
      lastSelection = fingerprint;
      q('.bf-selection').textContent = label;
      syncButton();
    }
    function validate() {
      for (const name of Object.keys(fields)) clearError(name);
      const { data, errors } = validateContact(Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.value])), fields.date?.validity.valid ?? true, source);
      for (const [key, message] of errors) setError(key, message);
      if (errors.length) {
        status.textContent = 'Проверьте выделенные поля.';
        fields[errors[0][0]].focus();
        return null;
      }
      return data;
    }

    // Prevent default before any validation or readiness branch. No implicit GET
    // submission can put contact data in an URL during async initialization.
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!initialized || preparing) return;
      refreshSelection();
      if (source === 'repertoire' && !repertoireSnapshot().ready) {
        status.textContent = 'Репертуар ещё не готов. Дождитесь загрузки.';
        return;
      }
      if (preparedText) { confirmation.focus(); return; }
      preparing = true;
      syncButton();
      try {
        const data = validate();
        if (!data) return;
        // Preview-only boundary: a future backend adapter must not infer success
        // from this local preparation. It needs an explicit delivered response.
        preparedText = buildRequest(data, source, selectedLineup, source === 'repertoire' ? repertoireSnapshot() : null);
        // This confirmation demonstrates the agreed UI only; no transport runs.
        confirmation.hidden = false;
        status.textContent = '';
        confirmation.focus();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Проверьте данные и попробуйте ещё раз.';
      } finally {
        setTimeout(() => { preparing = false; syncButton(); }, 0);
      }
    });
    for (const [name, field] of Object.entries(fields)) {
      field.addEventListener('input', event => {
        // The mask inserts its prefix on focus via a synthetic input event.
        // That prefix alone must not hide the required-phone error.
        const prefixOnlyFocus = name === 'phone' && field.value.trim() === '+7' && !event.isTrusted;
        if (!prefixOnlyFocus) clearError(name);
        invalidate();
      });
      field.addEventListener('change', () => { clearError(name); invalidate(); });
    }
    q('.bf-lineup-remove').addEventListener('click', () => { setLineup(''); fields.name.focus(); });

    const controller = { setLineup, refreshSelection, initialize() {
      if (attachPhoneMask) { attachPhoneMask(fields.phone); form.dataset.phoneMask = 'ready'; }
      else {
        form.dataset.phoneMask = 'fallback';
        status.textContent = 'Автоформатирование телефона недоступно. Введите номер полностью.';
      }
      initialized = true;
      refreshSelection();
      syncButton();
    } };
    controllers.push(controller);
    return controller;
  }

  function refresh() { for (const controller of controllers) controller.refreshSelection(); }
  window.bogemaForms = Object.freeze({ mode: 'preview', refresh });
  window.addEventListener('bogema:lineup', event => { for (const controller of controllers) controller.setLineup(event.detail?.name); });
  for (const event of ['bogema:repertoire-change', 'bogema:repertoire-ready']) window.addEventListener(event, refresh);
  document.addEventListener('click', event => {
    const card = event.target.closest?.('[data-lineup]');
    if (card) for (const controller of controllers) controller.setLineup(card.dataset.lineup);
    queueMicrotask(refresh);
  });
  document.addEventListener('change', () => queueMicrotask(refresh));

  async function start() {
    for (const host of document.querySelectorAll('[data-request-form]')) mount(host);
    const results = await Promise.allSettled([loadConfig(), import(new URL('phone-input.mjs', scriptURL).href)]);
    if (results[1].status === 'fulfilled') {
      normalizePhone = results[1].value.normalizePhone;
      attachPhoneMask = results[1].value.attachPhoneMask;
    }
    // enabled/apiConfigPath are deliberately not used to POST. A configured
    // flag alone does not implement a real API or authorize claiming delivery.
    for (const controller of controllers) controller.initialize();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
