// The approved two sets live in the HTML; the full repertoire stays independent.
const section = document.querySelector('.repertoire-ribbons');
if (section) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  const toggle = section.querySelector('[data-ribbons-pause]');
  let visible = false, paused = false;
  const rows = [...section.querySelectorAll('.repertoire-ribbon')].map(viewport => {
    const track = viewport.querySelector('.repertoire-ribbon-track');
    const sequence = track.firstElementChild;
    const songs = [...sequence.children];
    // Shuffle exactly once per page load, independently within each approved set.
    for (let i = songs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [songs[i], songs[j]] = [songs[j], songs[i]];
    }
    sequence.replaceChildren(...songs);
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
