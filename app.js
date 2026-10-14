import { LINEUPS } from './project-data.mjs?v=20261014-ensembles';

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
matchMedia('(min-width: 1200px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

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
const lineupEnsemble = lineupPanel.querySelector('.lineup-ensemble');
const lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
let lineupAnimation;
function renderLineup(id, animate = false) {
  const index = LINEUPS.findIndex(item => item.id === id);
  if (index < 0) return;
  const item = LINEUPS[index];
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
  lineupPanel.querySelector('[data-lineup-difference]').textContent = item.difference;
  lineupEnsemble.dataset.count = item.players.length;
  lineupEnsemble.setAttribute('aria-label', item.label);
  const tiles = item.players.map(player => {
    const tile = document.createElement('figure'); tile.className = 'lineup-member'; tile.dataset.role = player.key;
    if (player.src) {
      const image = document.createElement('img'); image.src = player.src; image.alt = player.label;
      image.loading = 'lazy'; image.decoding = 'async'; image.style.objectPosition = player.position;
      tile.append(image);
    } else {
      tile.innerHTML = '<svg class="keyboard-illustration" viewBox="0 0 240 160" role="img" aria-label="Иллюстрация клавишных"><rect x="8" y="25" width="224" height="112" rx="10" fill="#36382f" stroke="#c6b79b"/><path d="M25 52h50m90 0h48" stroke="#c6b79b" stroke-width="2"/><circle cx="99" cy="52" r="4" fill="#c6b79b"/><circle cx="118" cy="52" r="4" fill="#c6b79b"/><rect x="24" y="72" width="192" height="48" rx="2" fill="#e9e4d8"/><path d="M48 73v47m24-47v47m24-47v47m24-47v47m24-47v47m24-47v47m24-47v47" stroke="#252720"/><path d="M43 72v28m24-28v28m48-28v28m24-28v28m24-28v28m24-28v28" stroke="#101110" stroke-width="12"/><path d="m65 138-13 16m123-16 13 16" stroke="#c6b79b" stroke-width="3"/></svg>';
    }
    const label = document.createElement('figcaption'); label.textContent = player.label; tile.append(label); return tile;
  });
  lineupEnsemble.replaceChildren(...tiles);
  if (animate && !lessMotion.matches && lineupEnsemble.animate) {
    lineupAnimation = lineupEnsemble.animate([{opacity:.5},{opacity:1}], {duration:220,easing:'ease-out'});
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
