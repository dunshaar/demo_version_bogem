// No audio and no external services. Only the visible cabinet runs its timer.
const cabinet = document.querySelector('.jukebox');
if (cabinet) {
  const reel = cabinet.querySelector('.jukebox-reel');
  const windowElement = cabinet.querySelector('.jukebox-window');
  const pause = cabinet.querySelector('[data-jukebox-pause]');
  const announcement = cabinet.querySelector('.jukebox-announcement');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let tracks = [], current = 0, timer, animation, moving = false;
  let visible = false, hovered = false, paused = false, resumeAfter = 0;
  const interval = 4800, manualDelay = 12000;
  const wrap = value => (value + tracks.length) % tracks.length;
  function render() {
    const fragment = document.createDocumentFragment();
    for (let offset = -2; offset <= 2; offset++) {
      const track = tracks[wrap(current + offset)];
      const row = document.createElement('div'); row.className = 'jukebox-song' + (offset === 0 ? ' is-current' : '');
      row.setAttribute('aria-hidden', String(offset !== 0));
      const title = document.createElement('strong'), artist = document.createElement('span');
      title.textContent = track.title; artist.textContent = track.artist; row.append(title, artist); fragment.append(row);
    }
    reel.replaceChildren(fragment);
    const position = cabinet.querySelector('.jukebox-position');
    position.textContent = String(current + 1).padStart(2, '0') + ' ';
    const total = document.createElement('span'); total.textContent = '/ ' + tracks.length; position.append(total);
    cabinet.dataset.track = tracks[current].id;
  }
  function schedule() {
    clearTimeout(timer);
    if (!tracks.length || paused || reduced.matches || !visible || hovered || document.hidden || moving) return;
    timer = setTimeout(() => move(1), Math.max(interval, resumeAfter - performance.now()));
  }
  function interact() { resumeAfter = performance.now() + manualDelay; clearTimeout(timer); }
  async function move(direction, manual = false) {
    if (!tracks.length || moving) return;
    if (manual) interact();
    clearTimeout(timer); moving = true; cabinet.dataset.moving = 'true';
    const next = wrap(current + direction);
    try {
      if (!reduced.matches && reel.animate) {
        const height = reel.firstElementChild.getBoundingClientRect().height;
        [...reel.children].forEach((row, index) => row.classList.toggle('is-current', index === 2 + direction));
        animation = reel.animate([
          { transform: `translateY(${-1.15 * height}px)` },
          { transform: `translateY(${(-1.15 - direction) * height}px)` }
        ], { duration: 720, easing: 'cubic-bezier(.22,.76,.2,1)', fill: 'forwards' });
        await animation.finished;
      }
    } catch { /* A resize, hidden tab or reduced-motion switch settles on the next song. */ }
    current = next; render(); animation?.cancel(); animation = null;
    moving = false; cabinet.dataset.moving = 'false';
    if (manual) announcement.textContent = tracks[current].title + ', ' + tracks[current].artist;
    schedule();
  }
  cabinet.querySelector('[data-jukebox-prev]').addEventListener('click', () => move(-1, true));
  cabinet.querySelector('[data-jukebox-next]').addEventListener('click', () => move(1, true));
  pause.addEventListener('click', () => {
    paused = !paused; pause.setAttribute('aria-pressed', String(paused));
    const label = paused ? 'Продолжить смену песен' : 'Приостановить смену песен';
    pause.setAttribute('aria-label', label); pause.title = label;
    cabinet.querySelector('.jukebox-pause-icon').toggleAttribute('hidden', paused);
    cabinet.querySelector('.jukebox-play-icon').toggleAttribute('hidden', !paused);
    if (!paused) resumeAfter = 0;
    schedule();
  });
  windowElement.addEventListener('keydown', event => {
    const direction = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 0;
    if (direction) { event.preventDefault(); move(direction, true); }
  });
  let pointer;
  windowElement.addEventListener('pointerdown', event => { pointer = { x:event.clientX, y:event.clientY, id:event.pointerId }; });
  windowElement.addEventListener('pointercancel', () => { pointer = null; });
  windowElement.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y; pointer = null;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.3) move(dx < 0 ? 1 : -1, true);
  });
  cabinet.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovered = true; schedule(); } });
  cabinet.addEventListener('pointerleave', () => { hovered = false; schedule(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) animation?.cancel(); schedule(); });
  reduced.addEventListener('change', () => { animation?.cancel(); schedule(); });
  addEventListener('resize', () => { animation?.cancel(); });
  addEventListener('pagehide', () => { clearTimeout(timer); animation?.cancel(); });
  addEventListener('pageshow', schedule);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting; if (!visible) animation?.cancel(); schedule();
  }, {threshold:.15}).observe(cabinet);
  else visible = true;
  fetch(new URL('jukebox-tracks.json', import.meta.url)).then(response => {
    if (!response.ok) throw Error('Unavailable repertoire'); return response.json();
  }).then(data => {
    if (!Array.isArray(data) || data.length < 5 || !data.every(track => track.id && typeof track.title === 'string' && typeof track.artist === 'string')) throw Error('Invalid repertoire');
    tracks = data; render(); cabinet.dataset.ready = 'true'; schedule();
  }).catch(() => {
    cabinet.querySelector('.jukebox-controls').hidden = true;
    windowElement.removeAttribute('tabindex');
    windowElement.setAttribute('aria-label', 'Песни из репертуара Богемы');
  });
}
