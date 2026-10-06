"use strict";
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const dialogs = $$('dialog');
  const triggers = new WeakMap();
  const menu = $('#menu-dialog');
  const menuButton = $('.menu-button');
  const videoDialog = $('#video-dialog');
  const video = videoDialog && $('video', videoDialog);
  const error = $('#video-error');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function open(dialog, trigger) {
    if (!dialog || dialog.open) return;
    triggers.set(dialog, trigger || document.activeElement);
    dialog.showModal();
    document.body.classList.add('modal-open');
    if (dialog === menu) menuButton?.setAttribute('aria-expanded', 'true');
  }
  dialogs.forEach(dialog => {
    $$('[data-close]', dialog).forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      if (!dialogs.some(item => item.open)) document.body.classList.remove('modal-open');
      if (dialog === menu) menuButton?.setAttribute('aria-expanded', 'false');
      const trigger = triggers.get(dialog);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  });
  menuButton?.addEventListener('click', event => open(menu, event.currentTarget));
  if (menu) $$('nav a', menu).forEach(link => link.addEventListener('click', () => menu.close()));

  const recordings = {
    promo: { title: 'Богема, промо', src: 'assets/promo.mp4', poster: 'assets/poster-promo.jpg' },
    'live-2025': { title: 'Богема на сцене, живое выступление', src: 'assets/live-2025.mp4', poster: 'assets/poster-live-2025.jpg' },
    'trio-live': { title: 'Богема в трио, живое выступление', src: 'assets/trio-live.mp4', poster: 'assets/poster-trio-live.jpg' },
    'summer-rain': { title: 'Голос и гитара, Летний дождь', src: 'assets/summer-rain.mp4', poster: 'assets/poster-summer-rain.jpg' }
  };
  if (video && videoDialog) {
    $$('[data-video]').forEach(button => button.addEventListener('click', () => {
      const item = recordings[button.dataset.video];
      if (!item || videoDialog.open) return;
      if (error) error.hidden = true;
      $('#video-title').textContent = item.title;
      video.poster = item.poster;
      video.src = item.src;
      open(videoDialog, button);
      video.play().catch(() => {});
    }));
    video.addEventListener('error', () => { if (videoDialog.open && error) error.hidden = false; });
    videoDialog.addEventListener('close', () => {
      if (document.fullscreenElement === video.closest('.bp-player')) document.exitFullscreen().catch(() => {});
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (error) error.hidden = true;
    });
  }
  $$('[data-lineup]').forEach(link => link.addEventListener('click', () => {
    const name = link.dataset.lineup;
    window.bogemaSelectedLineup = name;
    window.dispatchEvent(new CustomEvent('bogema:lineup', { detail: { name } }));
  }));

  if ('IntersectionObserver' in window && !reduced.matches) {
    const reveal = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); reveal.unobserve(entry.target); } });
    }, { threshold: .04, rootMargin: '0px 0px 30px 0px' });
    document.documentElement.classList.add('reveal-ready');
    $$('[data-reveal]').forEach(item => reveal.observe(item));
    reduced.addEventListener('change', () => { if (reduced.matches) { document.documentElement.classList.remove('reveal-ready'); reveal.disconnect(); } });
  }
  const header = $('.site-header');
  const progress = $('.scroll-progress');
  const navLinks = $$('.site-nav a[href^="#"]');
  const sections = navLinks.map(link => [link, $(link.getAttribute('href'))]).filter(([, section]) => section);
  let scheduled = false;
  function updateScroll() {
    const height = document.documentElement.scrollHeight - innerHeight;
    if (progress) progress.style.transform = `scaleX(${height > 0 ? Math.min(1, Math.max(0, scrollY / height)) : 0})`;
    header?.classList.toggle('is-scrolled', scrollY > 20);
    let current = null;
    sections.forEach(([link, section]) => { if (section.getBoundingClientRect().top <= 160) current = link; });
    navLinks.forEach(link => { if (link === current) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
    scheduled = false;
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(updateScroll); } }
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  updateScroll();
})();
