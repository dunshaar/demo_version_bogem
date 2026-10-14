// The approved two sets live in the HTML; the full repertoire stays independent.
// Random circular order with at most two Latin-script titles between Cyrillic ones.
// Each Cyrillic title anchors a gap with two slots; rotating the result keeps the
// cycle boundary valid without enforcing a Russian/English alternation pattern.
export function shuffleRibbon(songs, random = Math.random) {
  const shuffle = items => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const mixed = shuffle(songs);
  const cyrillic = mixed.filter(song => /[\u0400-\u04ff]/u.test(song.textContent));
  const latin = mixed.filter(song => !/[\u0400-\u04ff]/u.test(song.textContent));
  if (!songs.length) return [];
  if (!cyrillic.length || latin.length > cyrillic.length * 2) {
    throw new RangeError('The ribbon needs enough Cyrillic titles for a two-Latin-title limit');
  }
  const slots = shuffle(cyrillic.flatMap((_, index) => [index, index]));
  const counts = Array(cyrillic.length).fill(0);
  slots.slice(0, latin.length).forEach(index => { counts[index]++; });
  let cursor = 0;
  const ordered = cyrillic.flatMap((song, index) => {
    const group = [song, ...latin.slice(cursor, cursor + counts[index])];
    cursor += counts[index];
    return group;
  });
  const start = Math.floor(random() * ordered.length);
  return [...ordered.slice(start), ...ordered.slice(0, start)];
}

const section = globalThis.document?.querySelector('.repertoire-ribbons');
if (section) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  const toggle = section.querySelector('[data-ribbons-pause]');
  let visible = false, paused = false;
  const rows = [...section.querySelectorAll('.repertoire-ribbon')].map(viewport => {
    const track = viewport.querySelector('.repertoire-ribbon-track');
    const sequence = track.firstElementChild;
    // One constrained shuffle per row on load, never on scroll or resize.
    sequence.replaceChildren(...shuffleRibbon([...sequence.children]));
    const duplicate = sequence.cloneNode(true);
    duplicate.setAttribute('aria-hidden', 'true');
    duplicate.classList.add('repertoire-ribbon-duplicate');
    track.append(duplicate);
    return {viewport, track, sequence, animation: null, width: 0, duration: 0, phase: 0, hovered: false};
  });

  function sync() {
    const active = visible && !document.hidden && !reduced.matches && !paused;
    for (const row of rows) {
      if (!row.animation) continue;
      if (active && !row.hovered && !row.viewport.contains(document.activeElement)) row.animation.play();
      else row.animation.pause();
    }
  }

  function measure() {
    section.classList.toggle('is-animated', !reduced.matches);
    toggle.hidden = reduced.matches;
    for (const row of rows) {
      const width = row.sequence.getBoundingClientRect().width;
      if (width === row.width && Boolean(row.animation) === !reduced.matches) continue;
      if (row.animation) {
        row.phase = ((row.animation.currentTime || 0) % row.duration) / row.duration;
        row.animation.cancel();
        row.animation = null;
      }
      row.width = width;
      if (reduced.matches || !width) continue;
      const left = row.viewport.dataset.direction === 'left';
      row.duration = width / (innerWidth <= 809 ? 34 : 44) * 1000;
      const start = left ? 0 : -width;
      const end = left ? -width : 0;
      row.animation = row.track.animate([
        {transform: `translate3d(${start}px,0,0)`},
        {transform: `translate3d(${end}px,0,0)`}
      ], {duration: row.duration, iterations: Infinity, easing: 'linear'});
      row.animation.currentTime = row.phase * row.duration;
      row.animation.pause();
    }
    sync();
  }

  for (const row of rows) {
    row.viewport.addEventListener('pointerenter', () => { row.hovered = hover.matches; sync(); });
    row.viewport.addEventListener('pointerleave', () => { row.hovered = false; sync(); });
    row.viewport.addEventListener('focusin', sync);
    row.viewport.addEventListener('focusout', () => queueMicrotask(sync));
  }
  toggle.addEventListener('click', () => {
    paused = !paused;
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Продолжить движение строк' : 'Приостановить движение строк');
    toggle.querySelector('span').textContent = paused ? 'Продолжить' : 'Пауза';
    sync();
  });
  hover.addEventListener('change', () => { rows.forEach(row => { row.hovered = false; }); sync(); });
  reduced.addEventListener('change', measure);
  document.addEventListener('visibilitychange', sync);
  addEventListener('pagehide', () => { visible = false; sync(); });
  addEventListener('pageshow', () => {
    const box = section.getBoundingClientRect();
    visible = box.bottom > 0 && box.top < innerHeight;
    sync();
  });
  await document.fonts.ready;
  measure();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }).observe(section);
  } else { visible = true; sync(); }
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(measure);
    rows.forEach(row => observer.observe(row.sequence));
  } else addEventListener('resize', measure, {passive: true});
  section.dataset.ribbonsReady = 'true';
}
