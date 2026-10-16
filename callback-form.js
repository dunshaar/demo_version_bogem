import {attachPhoneMask, normalizePhone} from './phone-input.mjs';

// A callback has no name, date or song preferences. There is currently no
// verified delivery endpoint or approved consent document for this request.
// Fail closed: no simulated success, network submission or persistent storage.
const form = document.querySelector('.callback-form');
if (form) {
  const phone = form.elements.namedItem('phone');
  const consent = form.elements.namedItem('consent');
  const button = form.querySelector('[data-callback-submit]');
  const status = form.querySelector('.callback-status');
  const setError = (field, message = '') => {
    const error = document.getElementById(`${field.id}-error`);
    error.textContent = message;
    error.hidden = !message;
    field.setAttribute('aria-invalid', String(Boolean(message)));
  };
  attachPhoneMask(phone);
  form.dataset.phoneMask = 'ready';
  for (const field of [phone, consent]) {
    field.addEventListener('input', () => {
      setError(field);
      status.textContent = '';
      status.hidden = true;
    });
  }
  const submit = event => {
    event.preventDefault();
    const invalidPhone = !normalizePhone(phone.value);
    if (invalidPhone || !consent.checked) (invalidPhone ? phone : consent).focus();
    setError(phone, invalidPhone ? 'Номер телефона введён неправильно' : '');
    setError(consent, !consent.checked ? 'Подтвердите согласие на обработку персональных данных' : '');
    status.hidden = true;
    if (invalidPhone || !consent.checked) return;
    status.textContent = 'Заявка не отправлена: обратный звонок пока недоступен. Позвоните нам или напишите в Telegram.';
    status.hidden = false;
    status.focus({preventScroll: true});
  };
  button.addEventListener('click', submit);
  form.addEventListener('submit', submit);
  phone.addEventListener('keydown', event => { if (event.key === 'Enter') submit(event); });
  // Restore a fresh, unchecked form after back/forward-cache navigation.
  addEventListener('pageshow', event => { if (event.persisted) {
    form.reset();
    setError(phone); setError(consent);
    status.textContent = ''; status.hidden = true;
  } });
}
