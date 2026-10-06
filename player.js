/* Minimal accessible controls: no overflow, download or playback-rate menu. */
(() => {
  'use strict';
  const player = document.querySelector('.bp-player');
  if (!player) return;
  const dialog = player.closest('dialog');
  const video = player.querySelector('video');
  const controls = player.querySelector('.bp-controls');
  const play = player.querySelector('.bp-play');
  const mute = player.querySelector('.bp-mute');
  const seek = player.querySelector('.bp-seek');
  const volume = player.querySelector('.bp-volume');
  const fullscreen = player.querySelector('.bp-fullscreen');
  const clock = player.querySelector('.bp-time');
  const status = player.querySelector('.bp-status');
  let dragging = false;
  let playRequest = 0;
  let fullscreenPending = false;
  const duration = () => Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const time = seconds => {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  };
  function updateTime() {
    const total = duration();
    seek.disabled = !total;
    seek.max = total || 1;
    if (!dragging) seek.value = Math.min(video.currentTime || 0, total);
    const current = Number(seek.value);
    clock.textContent = `${time(current)} / ${time(total)}`;
    seek.setAttribute('aria-valuetext', `${time(current)} из ${time(total)}`);
    seek.style.setProperty('--progress', `${total ? current / total * 100 : 0}%`);
  }
  function updatePlay() {
    const paused = video.paused || video.ended;
    play.setAttribute('aria-label', paused ? 'Воспроизвести' : 'Пауза');
    play.title = paused ? 'Воспроизвести (пробел)' : 'Пауза (пробел)';
    play.querySelector('.bp-icon-play').toggleAttribute('hidden', !paused);
    play.querySelector('.bp-icon-pause').toggleAttribute('hidden', paused);
  }
  async function togglePlay() {
    if (!video.src) return;
    if (!video.paused) { video.pause(); return; }
    const request = ++playRequest;
    try { await video.play(); if (request === playRequest) status.textContent = ''; }
    catch (error) {
      if (request !== playRequest || error?.name === 'AbortError') return;
      status.textContent = 'Не удалось начать видео. Нажмите воспроизведение ещё раз.';
    }
  }
  function updateVolume() {
    const silent = video.muted || video.volume === 0;
    mute.setAttribute('aria-label', silent ? 'Включить звук' : 'Выключить звук');
    mute.title = silent ? 'Включить звук' : 'Выключить звук';
    mute.setAttribute('aria-pressed', String(silent));
    mute.querySelector('.bp-icon-sound').toggleAttribute('hidden', silent);
    mute.querySelector('.bp-icon-muted').toggleAttribute('hidden', !silent);
    volume.value = silent ? 0 : video.volume;
  }
  play.addEventListener('click', togglePlay);
  video.addEventListener('click', togglePlay);
  mute.addEventListener('click', () => {
    const silent = video.muted || video.volume === 0;
    if (silent && video.volume === 0) video.volume = 1;
    video.muted = !silent;
    updateVolume();
  });
  volume.addEventListener('input', () => {
    video.volume = Number(volume.value);
    video.muted = video.volume === 0;
  });
  seek.addEventListener('pointerdown', () => { dragging = true; });
  seek.addEventListener('input', () => {
    const total = duration();
    if (!total) return;
    const next = Math.max(0, Math.min(total, Number(seek.value)));
    try { video.currentTime = next; }
    catch { status.textContent = 'Этот фрагмент ещё загружается. Попробуйте через секунду.'; }
    clock.textContent = `${time(next)} / ${time(total)}`;
    seek.setAttribute('aria-valuetext', `${time(next)} из ${time(total)}`);
    seek.style.setProperty('--progress', `${next / total * 100}%`);
  });
  for (const event of ['pointerup', 'pointercancel', 'blur', 'change']) {
    seek.addEventListener(event, () => { dragging = false; updateTime(); });
  }
  function seekTo(next) {
    if (!duration()) return;
    seek.value = Math.min(duration(), Math.max(0, next));
    seek.dispatchEvent(new Event('input', { bubbles: true }));
  }
  seek.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || !dialog?.open || !video.src || !duration() || !['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    seekTo(event.key === 'Home' ? 0 : duration());
  });
  // The dialog initially focuses its close button. Shortcuts therefore belong
  // to the open player dialog, not only to the timeline or video element.
  document.addEventListener('keydown', event => {
    if (!dialog?.open || !video.src || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const target = event.target;
    if (target?.isContentEditable || target?.closest?.('input:not([type="range"]), textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
    const space = event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';
    const full = event.code === 'KeyF' || ['f', 'F', 'а', 'А'].includes(event.key);
    const arrow = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    if (!space && !full && !arrow) return;
    event.preventDefault();
    event.stopPropagation();
    if (arrow) seekTo((video.currentTime || 0) + (event.key === 'ArrowLeft' ? -5 : 5));
    else if (!event.repeat) {
      if (space) togglePlay();
      else toggleFullscreen();
    }
  }, true);
  // Releasing the pointer outside the slider must not freeze its progress.
  document.addEventListener('pointerup', () => { if (dragging) { dragging = false; updateTime(); } });
  for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked']) video.addEventListener(event, updateTime);
  for (const event of ['play', 'pause', 'ended']) video.addEventListener(event, updatePlay);
  for (const event of ['playing', 'canplay', 'seeked']) video.addEventListener(event, () => { status.textContent = ''; });
  video.addEventListener('waiting', () => { status.textContent = 'Загрузка видео…'; });
  video.addEventListener('volumechange', updateVolume);
  video.addEventListener('pause', () => { playRequest++; });
  video.addEventListener('emptied', () => { playRequest++; dragging = false; seek.value = 0; status.textContent = ''; updateTime(); updatePlay(); });
  video.addEventListener('error', () => { status.textContent = ''; });
  fullscreen.hidden = !player.requestFullscreen;
  async function toggleFullscreen() {
    if (fullscreenPending) return;
    fullscreenPending = true;
    try {
      if (document.fullscreenElement === player) await document.exitFullscreen();
      else await player.requestFullscreen();
    } catch { status.textContent = 'Полный экран недоступен в этом браузере.'; }
    finally { fullscreenPending = false; }
  }
  fullscreen.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    const active = document.fullscreenElement === player;
    fullscreen.setAttribute('aria-label', active ? 'Выйти из полного экрана' : 'На весь экран');
    fullscreen.title = active ? 'Выйти из полного экрана (F)' : 'На весь экран (F)';
  });
  play.setAttribute('aria-keyshortcuts', 'Space');
  seek.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Home End');
  fullscreen.setAttribute('aria-keyshortcuts', 'f');
  fullscreen.title = 'На весь экран (F)';
  controls.hidden = false;
  video.controls = false;
  updateTime(); updatePlay(); updateVolume();
})();
