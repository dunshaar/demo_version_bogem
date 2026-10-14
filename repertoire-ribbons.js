// Two bounded, continuous song ribbons. Only visible neighbours are rendered;
// the queue traverses the entire shared repertoire without a second song list.
const section = document.querySelector('.repertoire-ribbons');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let songs = [], rows = [], frame = 0, last = null, visible = false, hovered = false;
const at = index => songs[(index % songs.length + songs.length) % songs.length];
function songNode(index) {
  const song = at(index), node = document.createElement('span');
  node.className = 'repertoire-ribbon-song'; node.dataset.index = index;
  const title = document.createElement('strong'), artist = document.createElement('span');
  title.textContent = song.title; artist.textContent = song.artist || '';
  node.append(title, artist); return node;
}
function build() {
  if (!songs.length) return;
  const previous = rows;
  rows = [...section.querySelectorAll('.repertoire-ribbon')].map((viewport, i) => {
    const track = viewport.firstElementChild, direction = viewport.dataset.direction;
    const first = Number(previous[i]?.track.firstElementChild?.dataset.index ?? (i ? Math.floor(songs.length / 2) : 0));
    track.replaceChildren();
    // Min-width 220 / 280 px means this small queue always overfills the viewport.
    const count = Math.max(5, Math.ceil(viewport.clientWidth / 220) + 3);
    for (let n = 0; n < count; n++) track.append(songNode(first + n));
    const firstWidth = track.firstElementChild.getBoundingClientRect().width;
    const row = {track, direction, firstWidth, offset:direction === 'right' ? -firstWidth : 0};
    track.style.transform = `translate3d(${row.offset}px,0,0)`;
    return row;
  });
  last = null;
}
function active() { return visible && !hovered && !document.hidden && !reduced.matches && rows.length; }
function tick(now) {
  frame = 0;
  if (!active()) { last = null; return; }
  const delta = last === null ? 0 : Math.min(50, now-last); last = now;
  const distance = delta * .038;
  for (const row of rows) {
    const {track, direction} = row;
    if (direction === 'left') {
      row.offset -= distance;
      while (-row.offset >= row.firstWidth && row.firstWidth > 0) {
        row.offset += row.firstWidth;
        const next = Number(track.lastElementChild.dataset.index) + 1;
        track.firstElementChild.remove(); track.append(songNode(next));
        row.firstWidth = track.firstElementChild.getBoundingClientRect().width;
      }
    } else {
      row.offset += distance;
      if (row.offset >= 0) {
        const previous = Number(track.firstElementChild.dataset.index) - 1;
        track.prepend(songNode(previous)); track.lastElementChild.remove();
        row.firstWidth = track.firstElementChild.getBoundingClientRect().width;
        row.offset -= row.firstWidth;
      }
    }
    track.style.transform = `translate3d(${row.offset}px,0,0)`;
  }
  frame = requestAnimationFrame(tick);
}
function sync() {
  if (active()) { if (!frame) { last = null; frame = requestAnimationFrame(tick); } }
  else { cancelAnimationFrame(frame); frame = 0; last = null; }
}
if (section) {
  try {
    const response = await fetch(new URL('./repertoire/data.json', import.meta.url), {cache:'no-cache'});
    if (!response.ok) throw new Error('catalog');
    const catalog = await response.json();
    songs = catalog.lineups.all.songs;
    if (!songs.length) throw new Error('empty');
    await document.fonts.ready;
    build();
    for (const ribbon of section.querySelectorAll('.repertoire-ribbon')) {
      ribbon.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovered = true; sync(); } });
      ribbon.addEventListener('pointerleave', () => { hovered = false; sync(); });
    }
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); });
      observer.observe(section);
    } else { visible = true; sync(); }
    let width = section.clientWidth;
    const resize = () => { if (width !== section.clientWidth) { width = section.clientWidth; build(); sync(); } };
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(section);
    else addEventListener('resize', resize, {passive:true});
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    addEventListener('pagehide', () => { visible = false; sync(); });
    addEventListener('pageshow', () => {
      const rect = section.getBoundingClientRect(); visible = rect.bottom > 0 && rect.top < innerHeight; sync();
    });
  } catch { /* Keep the static ribbon and the link to the full repertoire usable. */ }
}
