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
  // Anchor navigation should not compete with native dialog focus or reveal effects.
  dispatchEvent(new Event('bogema:navigate'));
  if (location.hash !== hash) history.pushState(null, '', hash);
  const start = scrollY;
  const header = document.querySelector('.site-header');
  const inset = getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height + 16 : 24;
  const end = Math.max(0, Math.min(start + target.getBoundingClientRect().top - inset, document.documentElement.scrollHeight - innerHeight));
  const finish = () => {
    navigationFrame = 0;
    target.setAttribute('tabindex', '-1');
    target.focus({preventScroll:true});
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(end - start) < 2) {
    scrollTo({top:end, behavior:'instant'}); finish(); return;
  }
  // Give long journeys enough frames to remain visible, with a gentle start and stop.
  const duration = Math.min(850, 450 + Math.abs(end - start) / 10);
  const began = performance.now();
  const step = now => {
    const progress = Math.min(1, (now - began) / duration);
    const eased = (1 - Math.cos(Math.PI * progress)) / 2;
    scrollTo({top:start + (end - start) * eased, behavior:'instant'});
    if (progress < 1) navigationFrame = requestAnimationFrame(step);
    else finish();
  };
  navigationFrame = requestAnimationFrame(step);
}
document.querySelectorAll('#menu-dialog nav a, .site-nav a, .header-request, .footer-up').forEach(link => link.addEventListener('click', event => {
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
matchMedia('(min-width: 861px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

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

// Five views follow the same Framer tabs on every screen size.
const lineupPanel = document.querySelector('#lineup-detail');
const lineupButtons = [...document.querySelectorAll('[data-view-lineup]')];
const lineupImage = lineupPanel.querySelector('img');
const lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
let visualRequest = 0;
let lineupAnimation;
function renderLineup(id, animate = false) {
  const index = LINEUPS.findIndex(item => item.id === id);
  if (index < 0) return;
  const item = LINEUPS[index];
  const request = ++visualRequest;
  lineupAnimation?.cancel();
  lineupPanel.dataset.viewedLineup = id;
  lineupPanel.setAttribute('aria-labelledby', `lineup-view-${id}`);
  lineupPanel.querySelector('[data-lineup-title]').textContent = item.label;
  lineupPanel.querySelector('[data-lineup-roles]').textContent = item.roles;
  lineupPanel.querySelector('[data-lineup-number]').textContent = `${String(index+1).padStart(2,'0')} / Состав`;
  lineupButtons.forEach(button => {
    const current = button.dataset.viewLineup === id;
    button.setAttribute('aria-selected', String(current));
    button.tabIndex = current ? 0 : -1;
  });
  const applyImage = () => {
    if (request !== visualRequest) return;
    lineupImage.src = item.visual.src;
    lineupImage.width = item.visual.width;
    lineupImage.height = item.visual.height;
    lineupImage.alt = item.visual.alt;
    if (animate && !lessMotion.matches && lineupImage.animate) {
      lineupAnimation = lineupImage.animate([{opacity:.45},{opacity:1}], {duration:220,easing:'ease-out'});
    }
  };
  if (!animate || lineupImage.getAttribute('src') === item.visual.src) applyImage();
  else {
    const preload = new Image(); preload.src = item.visual.src;
    if (preload.decode) preload.decode().then(applyImage, applyImage);
    else { preload.onload = applyImage; preload.onerror = applyImage; }
  }
  dispatchEvent(new CustomEvent('bogema:layout'));
}
lineupButtons.forEach((button, index) => {
  button.addEventListener('click', () => renderLineup(button.dataset.viewLineup, true));
  button.addEventListener('keydown', event => {
    let next;
    if (['ArrowRight','ArrowDown'].includes(event.key)) next = (index + 1) % lineupButtons.length;
    else if (['ArrowLeft','ArrowUp'].includes(event.key)) next = (index + lineupButtons.length - 1) % lineupButtons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = lineupButtons.length - 1;
    else return;
    event.preventDefault();
    lineupButtons[next].focus({preventScroll:true});
    renderLineup(lineupButtons[next].dataset.viewLineup, true);
  });
});
lessMotion.addEventListener('change', () => { if (lessMotion.matches) lineupAnimation?.cancel(); });
renderLineup('solo');
