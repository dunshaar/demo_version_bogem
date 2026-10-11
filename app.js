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
  const inset = document.querySelector('.site-header').getBoundingClientRect().height + 16;
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

// A lineup is a view of the group's offers, never a form selection.
const lineupShowcase = document.querySelector('.lineup-showcase');
const lineupOptions = document.querySelector('.lineup-options');
const lineupPanel = document.querySelector('#lineup-detail');
const lineupViewButtons = [...document.querySelectorAll('[data-view-lineup]')];
const lineupImage = lineupPanel.querySelector('img');
const mobileLineups = matchMedia('(max-width: 767px)');
const lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
let viewedLineup = 'full';
let mobileLineupOpen = false;
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
    if (animate && !lineupPanel.hidden && !lessMotion.matches && lineupImage.animate) {
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
function syncLineupDisclosure() {
  const expanded = !mobileLineups.matches || mobileLineupOpen;
  lineupPanel.hidden = !expanded;
  for (const button of lineupViewButtons) {
    const current = expanded && button.dataset.viewLineup === viewedLineup;
    button.setAttribute('aria-expanded', String(current));
    button.closest('.lineup-option').classList.toggle('is-viewed', current);
  }
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
  syncLineupDisclosure();
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
  const same = button.dataset.viewLineup === viewedLineup;
  if (!mobileLineups.matches && same) return;
  const before = button.getBoundingClientRect().top;
  if (mobileLineups.matches) mobileLineupOpen = !(same && mobileLineupOpen);
  renderViewedLineup(button.dataset.viewLineup, true);
  if (mobileLineups.matches) {
    // Preserve the tapped row when an earlier panel closes, without animating height.
    const shift = button.getBoundingClientRect().top - before;
    if (Math.abs(shift) > 1) window.scrollBy({top:shift, behavior:'instant'});
    if (mobileLineupOpen && !lessMotion.matches && lineupPanel.animate) {
      panelAnimation = lineupPanel.animate([{opacity:.4}, {opacity:1}], {duration:160, easing:'ease-out'});
    }
  }
});
const closeLineup = document.createElement('button');
closeLineup.type = 'button';
closeLineup.className = 'lineup-collapse';
closeLineup.textContent = 'Свернуть состав';
lineupPanel.querySelector('.lineup-detail-copy').append(closeLineup);
closeLineup.addEventListener('click', () => {
  const button = lineupViewButtons.find(item => item.dataset.viewLineup === viewedLineup);
  mobileLineupOpen = false;
  stopLineupMotion();
  syncLineupDisclosure();
  button.focus({preventScroll:true});
  const top = button.getBoundingClientRect().top;
  if (top < document.querySelector('.site-header').getBoundingClientRect().bottom || top > innerHeight - button.offsetHeight) {
    button.scrollIntoView({block:'start', behavior:'instant'});
  }
  dispatchEvent(new CustomEvent('bogema:layout'));
});
mobileLineups.addEventListener('change', () => {
  stopLineupMotion();
  if (lineupPanel.contains(document.activeElement)) {
    lineupViewButtons.find(button => button.dataset.viewLineup === viewedLineup).focus({preventScroll:true});
  }
  syncLineupDisclosure();
  placeLineupPanel();
});
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
