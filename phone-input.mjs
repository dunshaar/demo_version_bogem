/** Russian-format contact input. Its number is kept only in the field, never in storage. */
const PREFIX = '+7';
const MAX_DIGITS = 10;

function nationalDigits(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  // A country/trunk prefix is distinguishable from a national digit only in a
  // complete pasted number, or in the explicitly international +7 form.
  if (/^\s*\+7/.test(String(value)) || (digits.length === 11 && /^[78]/.test(digits))) digits = digits.slice(1);
  return digits.slice(0, MAX_DIGITS);
}

export function normalizePhone(value) {
  const text = String(value ?? '').trim();
  if (!text || !/^[+\d\s()-]+$/.test(text) || /\+/.test(text.slice(1))) return '';
  const digits = text.replace(/\D/g, '');
  if (digits.length === 10 && !text.startsWith('+')) return `+7${digits}`;
  if (digits.length === 11 && (/^7/.test(digits) || (!text.startsWith('+') && /^8/.test(digits)))) return `+7${digits.slice(1)}`;
  return '';
}

function format(digits) {
  if (!digits) return PREFIX;
  return `${PREFIX} (${digits.slice(0, 3)}${digits.length >= 3 ? ')' : ''}${digits.length > 3 ? ` ${digits.slice(3, 6)}` : ''}${digits.length > 6 ? `-${digits.slice(6, 8)}` : ''}${digits.length > 8 ? `-${digits.slice(8, 10)}` : ''}`;
}

function digitPositions(value) {
  const positions = [];
  // The prefix is immutable. Only national digits participate in editing.
  for (let i = value.startsWith(PREFIX) ? 2 : 0; i < value.length; i++) if (/\d/.test(value[i])) positions.push(i);
  return positions;
}

function indexAt(value, position) {
  return digitPositions(value).filter(index => index < position).length;
}

function caretAt(value, digitIndex) {
  const positions = digitPositions(value);
  if (!digitIndex) return positions.length ? positions[0] : PREFIX.length;
  if (digitIndex >= positions.length) return value.length;
  return positions[digitIndex];
}

/**
 * Preserve the browser's editing/undo transactions with insertText, including
 * native Undo/Redo. beforeinput handles digits, selections and deletion; IME is
 * left alone until composition finishes. No keydown handler steals navigation.
 */
export function attachPhoneMask(input) {
  let applying = false;
  let composing = false;
  let destroyed = false;
  const listeners = [];
  const on = (type, handler) => {
    input.addEventListener(type, handler);
    listeners.push([type, handler]);
  };

  function commit(value, digitIndex, { native = true } = {}) {
    const changed = input.value !== value;
    applying = true;
    try {
      if (changed) {
        let edited = false;
        if (native && input.ownerDocument.activeElement === input && typeof input.ownerDocument.execCommand === 'function') {
          input.setSelectionRange(0, input.value.length);
          // execCommand is deliberately used here: assigning .value for every
          // keystroke destroys the browser's native undo history.
          try { edited = input.ownerDocument.execCommand('insertText', false, value); } catch {}
        }
        if (!edited || input.value !== value) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      const caret = caretAt(value, digitIndex);
      input.setSelectionRange(caret, caret);
    } finally { applying = false; }
  }

  function edit(inserted, inputType = 'insertText') {
    const current = input.value;
    const digits = nationalDigits(current);
    const from = input.selectionStart ?? current.length;
    const to = input.selectionEnd ?? from;
    let start = indexAt(current, from);
    let end = indexAt(current, to);
    let incoming = '';
    if (inputType.startsWith('delete')) {
      if (from === to) {
        if (/Backward$/.test(inputType)) start = /Word|Line/.test(inputType) ? 0 : Math.max(0, start - 1);
        else if (/Forward$/.test(inputType)) end = /Word|Line/.test(inputType) ? digits.length : Math.min(digits.length, end + 1);
      }
    } else {
      incoming = nationalDigits(inserted);
      if (!incoming) return;
      incoming = incoming.slice(0, MAX_DIGITS - (digits.length - (end - start)));
    }
    const next = digits.slice(0, start) + incoming + digits.slice(end);
    commit(format(next), start + incoming.length);
  }

  function displayValue(value) {
    const digits = nationalDigits(value);
    return digits || input.ownerDocument.activeElement === input ? format(digits) : '';
  }

  function sync() {
    if (destroyed) return;
    const current = input.value;
    const cursor = input.selectionStart ?? current.length;
    const count = indexAt(current, cursor);
    const value = displayValue(current);
    // Explicit external synchronization (initial value/form reset) is not a
    // user edit and should not create another undo transaction.
    commit(value, count, { native: false });
  }

  // An untouched field shows its placeholder; the country prefix appears only
  // while editing. Leaving a partial or complete number preserves its value.
  on('focus', sync);
  on('blur', sync);

  on('beforeinput', event => {
    if (applying || composing || event.isComposing || !event.cancelable) return;
    const type = event.inputType ?? '';
    if (type === 'historyUndo' || type === 'historyRedo') return;
    if (type.startsWith('delete')) {
      event.preventDefault();
      edit('', type);
    } else if (type.startsWith('insert') && type !== 'insertCompositionText') {
      const text = event.data ?? event.dataTransfer?.getData('text/plain');
      if (text == null) return; // Native autofill/input fallback below.
      event.preventDefault();
      edit(text, type);
    }
  });
  on('paste', event => {
    if (applying || composing || !event.clipboardData) return;
    event.preventDefault();
    edit(event.clipboardData.getData('text/plain'), 'insertFromPaste');
  });
  on('compositionstart', () => { composing = true; });
  on('compositionend', () => {
    composing = false;
    const current = input.value;
    const cursor = input.selectionStart ?? current.length;
    commit(format(nationalDigits(current)), indexAt(current, cursor));
  });
  on('input', event => {
    if (applying || composing || event.isComposing) return;
    const current = input.value;
    const cursor = input.selectionStart ?? current.length;
    const value = displayValue(current);
    if (current !== value) commit(value, indexAt(current, cursor), { native: false });
  });

  sync();
  return {
    getValue: () => normalizePhone(input.value),
    sync,
    destroy() {
      destroyed = true;
      for (const [type, handler] of listeners) input.removeEventListener(type, handler);
    },
  };
}
