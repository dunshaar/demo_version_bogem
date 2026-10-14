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
// Section links use one bounded animation; native focus must never start another.
document.documentElement.style.scrollBehavior = 'auto';
let navigationFrame = 0;
function cancelSectionNavigation() {
  cancelAnimationFrame(navigationFrame);
  navigationFrame = 0;
}
function closeMenu(restoreFocus = false) {
  menu.hidden = true;
  menuButton.setAttribute('aria-expanded', 'false');
  if (restoreFocus) menuButton.focus({preventScroll:true});
}
menuButton.addEventListener('click', () => {
  if (!menu.hidden) { closeMenu(true); return; }
  cancelSectionNavigation();
  menu.style.setProperty('--menu-top', `${Math.ceil(document.querySelector('.site-header').getBoundingClientRect().bottom)}px`);
  menu.hidden = false;
  menuButton.setAttribute('aria-expanded', 'true');
  menu.querySelector('nav a').focus({preventScroll:true});
});
menu.querySelector('[data-close]').addEventListener('click', () => closeMenu(true));
document.addEventListener('pointerdown', event => {
  if (!menu.hidden && !menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); closeMenu(true); }
});
menu.addEventListener('focusout', () => {
  requestAnimationFrame(() => {
    if (!menu.hidden && !menu.contains(document.activeElement) && document.activeElement !== menuButton) closeMenu();
  });
});
function navigateToSection(target, hash) {
  cancelSectionNavigation();
  closeMenu();
  dispatchEvent(new Event('bogema:navigate'));
  const start = window.scrollY;
  const header = document.querySelector('.site-header');
  const inset = getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height + 16 : 24;
  const end = Math.max(0, Math.min(start + target.getBoundingClientRect().top - inset, document.documentElement.scrollHeight - innerHeight));
  const finish = () => {
    navigationFrame = 0;
    if (location.hash !== hash) history.pushState(null, '', hash);
    target.setAttribute('tabindex', '-1');
    target.focus({preventScroll:true});
  };
  if (Math.abs(end - start) < 2) { finish(); return; }
  // Start the clock on the first painted frame, not before closing the menu.
  // A delayed mobile frame must not skip the whole journey to its destination.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 220 : Math.min(1000, 600 + Math.abs(end - start) / 12);
  let previousFrame, elapsed = 0;
  const step = now => {
    if (previousFrame !== undefined) elapsed += Math.min(50, Math.max(0, now - previousFrame));
    previousFrame = now;
    const progress = Math.min(1, elapsed / duration);
    const eased = reduced ? progress : (1 - Math.cos(Math.PI * progress)) / 2;
    window.scrollTo(0, start + (end - start) * eased);
    if (progress < 1) navigationFrame = requestAnimationFrame(step);
    else finish();
  };
  navigationFrame = requestAnimationFrame(step);
}
document.querySelectorAll('#menu-dialog nav a, .site-nav a, .desktop-hero-nav a, .header-request, .footer-up').forEach(link => link.addEventListener('click', event => {
  if (!link.hash) return;
  const target = document.querySelector(link.hash);
  if (!target) return;
  event.preventDefault();
  navigateToSection(target, link.hash);
}));
for (const type of ['wheel', 'touchstart', 'pointerdown']) addEventListener(type, cancelSectionNavigation, {passive:true});
document.addEventListener('keydown', event => {
  if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) cancelSectionNavigation();
});
matchMedia('(min-width: 1200px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

const videoDialog = document.querySelector('#video-dialog');
const video = videoDialog.querySelector('video');
const error = document.querySelector('#video-error');
const videoTitle = document.querySelector('#video-title');
const fallback = error.querySelector('.video-fallback');
const playerStatus = document.querySelector('.bp-status');
const videos = {
  promo: { title: 'Промо 2026', src: 'assets/promo.mp4', poster: 'assets/poster-promo-20261014.jpg' },
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
