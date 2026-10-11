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
  'trio-live': { title: 'Трио LIVE · Архивная запись', src: 'assets/trio-live.mp4', poster: 'assets/poster-trio-live.jpg' },
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

const lineupLinks = [...document.querySelectorAll('[data-lineup]')];
const lineupStatus = document.querySelector('.lineup-selection-status');
function showLineup(snapshot) {
  const chosen = snapshot.commercialLineup?.id;
  for (const link of lineupLinks) {
    const selected = link.dataset.lineup === chosen;
    link.closest('[data-offer]')?.classList.toggle('is-selected', selected);
    link.querySelector('span').textContent = selected ? 'Выбран для обсуждения' : 'Обсудить состав';
  }
  if (lineupStatus) lineupStatus.textContent = snapshot.commercialLineup ? `Выбран состав «${snapshot.commercialLineup.label}». Изменить или убрать его можно в форме.` : '';
}
for (const link of lineupLinks) link.addEventListener('click', () => {
  const id = link.dataset.lineup;
  if (LINEUPS.some(item => item.id === id)) preferencesStore.setCommercialLineup(id);
});
showLineup(preferencesStore.getSnapshot());
preferencesStore.subscribe(showLineup);

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
