// Inline promo only; the separate live-recording dialog keeps its own player.
(() => {
  'use strict';
  const player = document.querySelector('[data-promo-player]');
  if (!player) return;
  const video = player.querySelector('video');
  const poster = player.querySelector('.promo-poster');
  const controls = player.querySelector('.promo-controls');
  const playButton = player.querySelector('.promo-play');
  const soundButton = player.querySelector('.promo-sound');
  const fullscreenButton = player.querySelector('.promo-fullscreen');
  const seek = player.querySelector('.promo-seek');
  const clock = player.querySelector('.promo-time');
  const status = player.querySelector('.promo-status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const dialog = document.querySelector('#video-dialog');
  let visibleEnough = false;
  let userPaused = false;
  let autoBlocked = false;
  let finished = false;
  let failed = false;
  let wantPlayback = false;
  let pending = false;
  let requestId = 0;
  let fullscreenPending = false;

  // Set silence once. Scrolling never resets a listener's explicit sound choice.
  video.defaultMuted = true;
  video.muted = true;
  video.playsInline = true;
  video.loop = false;
  poster.src = video.poster;
  poster.hidden = false;
  video.controls = false;
  controls.hidden = false;

  const inView = () => visibleEnough || document.fullscreenElement === player;
  const canBeActive = () => inView() && !document.hidden && !dialog?.open;
  const time = value => {
    const seconds = Math.max(0, Math.floor(value || 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };
  function updateControls() {
    const playing = pending || !video.paused;
    const label = playing ? 'Пауза' : failed ? 'Повторить' : finished ? 'Ещё раз' : 'Смотреть';
    playButton.querySelector('span').textContent = label;
    playButton.setAttribute('aria-label', playing ? 'Пауза' : failed ? 'Повторить загрузку видео' : finished ? 'Воспроизвести ещё раз' : 'Воспроизвести промо');
    player.classList.toggle('is-playing', playing);
    soundButton.querySelector('span').textContent = video.muted ? 'Звук выкл.' : 'Звук вкл.';
    soundButton.setAttribute('aria-label', video.muted ? 'Включить звук' : 'Выключить звук');
    soundButton.setAttribute('aria-pressed', String(!video.muted));
    player.classList.toggle('has-sound', !video.muted);
  }
  function updateTime() {
    const total = Number.isFinite(video.duration) ? video.duration : 0;
    seek.disabled = !total || failed;
    seek.max = total || 1;
    seek.value = video.currentTime || 0;
    seek.setAttribute('aria-valuetext', `${time(video.currentTime)} из ${time(total)}`);
    seek.style.setProperty('--played', `${total ? video.currentTime / total * 100 : 0}%`);
    clock.textContent = total ? `${time(video.currentTime)} / ${time(total)}` : '';
  }
  function ensureSource(preload) {
    if (!video.hasAttribute('src')) {
      video.preload = preload;
      video.src = video.dataset.src;
    } else if (preload === 'auto') video.preload = 'auto';
  }
  function pauseForEnvironment() {
    wantPlayback = false;
    pending = false;
    requestId++;
    video.pause();
    updateControls();
  }
  async function start(manual = false) {
    if (pending || (!video.paused && !video.ended)) return;
    if (!manual && (!canBeActive() || userPaused || autoBlocked || reduced.matches || finished || failed)) return;
    if (document.hidden || dialog?.open) return;
    if (manual) {
      userPaused = false;
      autoBlocked = false;
      if (failed) {
        failed = false;
        player.classList.remove('is-error');
        video.load();
      }
      if (finished || video.ended) {
        video.currentTime = 0;
        finished = false;
      }
    }
    ensureSource('auto');
    wantPlayback = true;
    pending = true;
    const request = ++requestId;
    status.textContent = '';
    updateControls();
    try {
      await video.play();
      if (request !== requestId) return;
      pending = false;
      if (!wantPlayback || document.hidden || dialog?.open) video.pause();
    } catch (error) {
      if (request !== requestId) return;
      pending = false;
      wantPlayback = false;
      if (error?.name !== 'AbortError' && !failed) {
        autoBlocked = true;
        status.textContent = 'Нажмите «Смотреть», чтобы запустить видео';
      }
    }
    updateControls();
  }
  function syncPlayback() {
    if (!canBeActive()) pauseForEnvironment();
    else start();
  }
  function togglePlay() {
    if (pending || !video.paused) {
      userPaused = true;
      pauseForEnvironment();
    } else start(true);
  }
  playButton.addEventListener('click', togglePlay);
  video.addEventListener('click', togglePlay);
  soundButton.addEventListener('click', () => {
    video.muted = !video.muted;
    updateControls();
  });
  video.addEventListener('volumechange', updateControls);
  video.addEventListener('playing', () => {
    if (!wantPlayback || document.hidden || dialog?.open) { pauseForEnvironment(); return; }
    pending = false;
    player.classList.add('has-frame');
    status.textContent = '';
    updateControls();
  });
  video.addEventListener('pause', updateControls);
  video.addEventListener('ended', () => {
    finished = true;
    wantPlayback = false;
    pending = false;
    updateControls();
  });
  video.addEventListener('error', () => {
    failed = true;
    pauseForEnvironment();
    player.classList.add('is-error');
    status.textContent = 'Не удалось загрузить видео — попробуйте ещё раз';
    updateTime();
  });
  for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked']) video.addEventListener(event, updateTime);
  seek.addEventListener('input', () => {
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, Number(seek.value)));
    if (video.currentTime < video.duration) finished = false;
    updateTime();
  });
  async function toggleFullscreen() {
    if (fullscreenPending || !player.requestFullscreen) return;
    fullscreenPending = true;
    try {
      if (document.fullscreenElement === player) await document.exitFullscreen();
      else await player.requestFullscreen();
    } catch { /* Playback and inline controls remain available. */ }
    finally { fullscreenPending = false; }
  }
  fullscreenButton.hidden = !player.requestFullscreen;
  fullscreenButton.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    fullscreenButton.setAttribute('aria-label', document.fullscreenElement === player ? 'Выйти из полного экрана' : 'На весь экран');
    syncPlayback();
  });
  player.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    // Buttons retain their native Space/Enter action (in particular, Sound).
    if ((event.key === ' ' || event.code === 'Space') && !event.target.closest('button,input')) {
      event.preventDefault();
      if (!event.repeat) togglePlay();
    } else if (['ArrowLeft', 'ArrowRight'].includes(event.key) && !event.target.closest('input') && Number.isFinite(video.duration)) {
      event.preventDefault();
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + (event.key === 'ArrowLeft' ? -5 : 5)));
    } else if (event.code === 'KeyF' || ['f', 'F', 'а', 'А'].includes(event.key)) {
      event.preventDefault();
      if (!event.repeat) toggleFullscreen();
    }
  });
  if ('IntersectionObserver' in window) {
    // Metadata only near the section; no video request competes with the hero.
    const warmup = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      if (!reduced.matches) ensureSource('metadata');
      warmup.disconnect();
    }, {rootMargin:'240px 0px', threshold:0});
    warmup.observe(player);
    const visibility = new IntersectionObserver(entries => {
      const entry = entries[entries.length - 1];
      visibleEnough = entry.isIntersecting && entry.intersectionRatio >= .5;
      syncPlayback();
    }, {threshold:[0,.5,1]});
    visibility.observe(player);
  }
  // Without an observer, the initial poster and manual controls still work.
  document.addEventListener('visibilitychange', syncPlayback);
  addEventListener('pagehide', pauseForEnvironment);
  addEventListener('pageshow', syncPlayback);
  reduced.addEventListener('change', () => {
    if (reduced.matches) pauseForEnvironment();
    else syncPlayback();
  });
  if (dialog) new MutationObserver(syncPlayback).observe(dialog, {attributes:true, attributeFilter:['open']});
  updateControls();
  updateTime();
})();
