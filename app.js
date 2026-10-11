import { LINEUPS } from './project-data.mjs';

const dialogs = [...document.querySelectorAll('dialog')];
const triggers = new WeakMap();
function openDialog(dialog, trigger) {
  if (!dialog || dialog.open) return;
  triggers.set(dialog, trigger || document.activeElement);
  dialog.showModal();
  document.body.classList.add('modal-open');
}
for (const dialog of dialogs) {
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (!dialogs.some(item => item.open)) document.body.classList.remove('modal-open');
    const trigger = triggers.get(dialog);
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  });
}
const menu = document.querySelector('#menu-dialog');
const menuButton = document.querySelector('.menu-button');
menuButton?.addEventListener('click', event => {
  openDialog(menu, event.currentTarget);
  menuButton.setAttribute('aria-expanded', 'true');
});
menu?.addEventListener('close', () => menuButton?.setAttribute('aria-expanded', 'false'));
menu?.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => menu.close()));

const videoDialog = document.querySelector('#video-dialog');
const video = videoDialog.querySelector('video');
const error = document.querySelector('#video-error');
const videoTitle = document.querySelector('#video-title');
const fallback = error.querySelector('.video-fallback');
const playerStatus = document.querySelector('.bp-status');
const videos = {
  promo: { title: 'Промо 2026', src: 'assets/promo.mp4', poster: 'assets/poster-promo.jpg' },
  'live-2025': { title: 'LIVE 2025 · Группа Богема', src: 'assets/live-2025.mp4', poster: 'assets/poster-live-2025.jpg' },
  'trio-live': { title: 'Live-запись · Богема', src: 'assets/trio-live.mp4', poster: 'assets/poster-trio-live.jpg' },
  'summer-rain': { title: 'Вокалист-гитарист · Летний дождь', src: 'assets/summer-rain.mp4', poster: 'assets/poster-summer-rain.jpg' },
};
let videoRequest = 0;
document.querySelectorAll('[data-video]').forEach(button => button.addEventListener('click', () => {
  const item = videos[button.dataset.video];
  if (!item) return;
  const request = ++videoRequest;
  video.pause();
  error.hidden = true;
  videoTitle.textContent = item.title;
  video.poster = item.poster;
  video.src = item.src;
  fallback.href = item.src;
  openDialog(videoDialog, button);
  video.play().catch(cause => {
    if (request !== videoRequest || !videoDialog.open || cause?.name === 'AbortError') return;
    if (video.error) error.hidden = false;
    else playerStatus.textContent = 'Нажмите кнопку воспроизведения, чтобы начать видео';
  });
}));
video.addEventListener('error', () => { if (videoDialog.open) error.hidden = false; });
video.addEventListener('playing', () => { error.hidden = true; });
fallback.addEventListener('click', () => video.pause());
videoDialog.addEventListener('close', () => {
  videoRequest++;
  if (document.fullscreenElement === video.closest('.bp-player')) document.exitFullscreen().catch(() => {});
  video.pause();
  video.removeAttribute('src');
  video.load();
  error.hidden = true;
});

// A lineup is a view of the group's offers, never a form selection.
const lineupShowcase = document.querySelector('.lineup-showcase');
const lineupOptions = document.querySelector('.lineup-options');
const lineupPanel = document.querySelector('#lineup-detail');
const lineupViewButtons = [...document.querySelectorAll('[data-view-lineup]')];
const lineupImage = lineupPanel.querySelector('img');
const lineupMediaCaption = lineupPanel.querySelector('figcaption');
const mobileLineups = matchMedia('(max-width: 767px)');
const lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
let viewedLineup = 'full';
let visualRequest = 0;
let panelAnimation;
let imageAnimation;
function stopLineupMotion() {
  panelAnimation?.cancel();
  imageAnimation?.cancel();
}
lessMotion.addEventListener('change', () => { if (lessMotion.matches) stopLineupMotion(); });
function placeLineupPanel() {
  const focused = document.activeElement;
  const restoreFocus = lineupPanel.contains(focused);
  if (mobileLineups.matches) {
    lineupOptions.querySelector(`[data-offer="${viewedLineup}"]`).append(lineupPanel);
  } else {
    lineupShowcase.prepend(lineupPanel);
  }
  if (restoreFocus && document.activeElement !== focused) focused.focus({preventScroll:true});
}
function showLineupImage(item, animate) {
  const request = ++visualRequest;
  const apply = () => {
    if (request !== visualRequest) return;
    lineupImage.src = item.visual.src;
    lineupImage.width = item.visual.width;
    lineupImage.height = item.visual.height;
    lineupImage.alt = item.visual.alt;
    lineupMediaCaption.textContent = item.visual.caption;
    if (animate && !lessMotion.matches && lineupImage.animate) {
      imageAnimation?.cancel();
      imageAnimation = lineupImage.animate([{opacity:.4}, {opacity:1}], {duration:240, easing:'ease-out'});
    }
  };
  if (!animate || lineupImage.getAttribute('src') === item.visual.src) { apply(); return; }
  const preload = new Image();
  preload.src = item.visual.src;
  // Keep the previous image visible until the next real photo is ready.
  if (preload.decode) preload.decode().then(apply, apply);
  else { preload.onload = apply; preload.onerror = apply; }
}
function renderViewedLineup(id, animate = false) {
  const item = LINEUPS.find(lineup => lineup.id === id);
  if (!item) return;
  stopLineupMotion();
  viewedLineup = id;
  lineupPanel.dataset.viewedLineup = id;
  lineupPanel.setAttribute('aria-labelledby', `lineup-view-${id}`);
  showLineupImage(item, animate);
  lineupPanel.querySelector('[data-lineup-title]').textContent = item.label;
  lineupPanel.querySelector('[data-lineup-difference]').textContent = item.difference;
  for (const button of lineupViewButtons) {
    const current = button.dataset.viewLineup === id;
    button.setAttribute('aria-expanded', String(current));
    button.closest('.lineup-option').classList.toggle('is-viewed', current);
  }
  placeLineupPanel();
  if (animate && !mobileLineups.matches && !lessMotion.matches && lineupPanel.animate) {
    panelAnimation = lineupPanel.querySelector('.lineup-detail-copy').animate([
      {opacity:.35, transform:'translateY(6px)'},
      {opacity:1, transform:'translateY(0)'}
    ], {duration:230, easing:'ease-out'});
  }
  dispatchEvent(new CustomEvent('bogema:layout'));
}
for (const button of lineupViewButtons) button.addEventListener('click', () => {
  if (button.dataset.viewLineup === viewedLineup) return;
  const before = button.getBoundingClientRect().top;
  renderViewedLineup(button.dataset.viewLineup, true);
  if (mobileLineups.matches) {
    // Removing an earlier open panel must not move the row being activated.
    const shift = button.getBoundingClientRect().top - before;
    if (Math.abs(shift) > 1) window.scrollBy({top:shift, behavior:'instant'});
    if (!lessMotion.matches && lineupPanel.animate) {
      const height = lineupPanel.getBoundingClientRect().height;
      panelAnimation = lineupPanel.animate([
        {height:'0px', opacity:.3, overflow:'hidden'},
        {height:`${height}px`, opacity:1, overflow:'hidden'}
      ], {duration:230, easing:'cubic-bezier(.2,.7,.2,1)'});
    }
  }
});
mobileLineups.addEventListener('change', () => { stopLineupMotion(); placeLineupPanel(); });
renderViewedLineup(viewedLineup);

// Arrow keys move through the five views without adding anything to a request.
for (const [index, button] of lineupViewButtons.entries()) button.addEventListener('keydown', event => {
  let next;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % lineupViewButtons.length;
  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + lineupViewButtons.length) % lineupViewButtons.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = lineupViewButtons.length - 1;
  else return;
  event.preventDefault();
  lineupViewButtons[next].focus({preventScroll:true});
  lineupViewButtons[next].click();
});
