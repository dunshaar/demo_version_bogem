import { LINEUPS } from './project-data.mjs';
import { preferencesStore } from './preferences-store.mjs';

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
    else playerStatus.textContent = 'Нажмите кнопку воспроизведения, чтобы начать видео.';
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

// Viewing a lineup is intentionally separate from selecting it for a message.
const lineupShowcase = document.querySelector('.lineup-showcase');
const lineupOptions = document.querySelector('.lineup-options');
const lineupPanel = document.querySelector('#lineup-detail');
const lineupViewButtons = [...document.querySelectorAll('[data-view-lineup]')];
const lineupDiscuss = document.querySelector('[data-lineup-discuss]');
const lineupStatus = document.querySelector('.lineup-selection-status');
const lineupImage = lineupPanel.querySelector('img');
const lineupMediaCaption = lineupPanel.querySelector('figcaption');
const lineupLive = lineupPanel.querySelector('[data-video]');
const mobileLineups = matchMedia('(max-width: 767px)');
let viewedLineup = preferencesStore.getSnapshot().commercialLineup?.id || 'full';
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
function renderViewedLineup(id) {
  const item = LINEUPS.find(lineup => lineup.id === id);
  if (!item) return;
  viewedLineup = id;
  lineupPanel.dataset.viewedLineup = id;
  lineupPanel.setAttribute('aria-labelledby', `lineup-view-${id}`);
  lineupImage.src = item.visual.src;
  lineupImage.width = item.visual.width;
  lineupImage.height = item.visual.height;
  lineupImage.alt = item.visual.alt;
  lineupMediaCaption.textContent = item.visual.caption;
  lineupPanel.querySelector('[data-lineup-title]').textContent = item.label;
  lineupPanel.querySelector('[data-lineup-difference]').textContent = item.difference;
  lineupDiscuss.dataset.lineupDiscuss = id;
  lineupLive.hidden = !item.videoId;
  if (item.videoId) lineupLive.dataset.video = item.videoId;
  for (const button of lineupViewButtons) {
    const current = button.dataset.viewLineup === id;
    button.setAttribute('aria-expanded', String(current));
    button.closest('.lineup-option').classList.toggle('is-viewed', current);
  }
  placeLineupPanel();
}
for (const button of lineupViewButtons) button.addEventListener('click', () => {
  const before = button.getBoundingClientRect().top;
  renderViewedLineup(button.dataset.viewLineup);
  if (mobileLineups.matches) {
    // Keep the touched row in place when an earlier inline panel collapses.
    requestAnimationFrame(() => {
      const shift = button.getBoundingClientRect().top - before;
      if (Math.abs(shift) > 1) window.scrollBy({top: shift, behavior: 'instant'});
    });
  }
});
lineupDiscuss.addEventListener('click', () => {
  preferencesStore.setCommercialLineup(viewedLineup);
});
mobileLineups.addEventListener('change', placeLineupPanel);
renderViewedLineup(viewedLineup);
function showCommercialLineup(snapshot) {
  const chosen = snapshot.commercialLineup;
  lineupStatus.textContent = chosen ? `Для обсуждения выбран ${chosen.label.toLocaleLowerCase('ru-RU')}.` : '';
}
showCommercialLineup(preferencesStore.getSnapshot());
preferencesStore.subscribe(showCommercialLineup);

const progress = document.querySelector('.scroll-progress');
let scheduled = false;
function drawProgress() {
  const height = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${height > 0 ? Math.min(1, Math.max(0, scrollY / height)) : 0})`;
  scheduled = false;
}
function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(drawProgress); } }
addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', schedule);
drawProgress();
