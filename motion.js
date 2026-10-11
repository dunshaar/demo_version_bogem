// Optional enhancements. No base rule hides page content or waits for motion.
(() => {
  const progress = document.querySelector('.scroll-progress');
  let frame = 0;
  function drawProgress() {
    frame = 0;
    if (!progress) return;
    const doc = document.documentElement;
    const distance = doc.scrollHeight - doc.clientHeight;
    const value = distance > 0 ? Math.min(1, Math.max(0, doc.scrollTop / distance)) : 0;
    progress.style.transform = `scaleX(${value})`;
  }
  function scheduleProgress() {
    if (!frame) frame = requestAnimationFrame(drawProgress);
  }
  addEventListener('scroll', scheduleProgress, {passive:true});
  addEventListener('resize', scheduleProgress);
  addEventListener('pageshow', scheduleProgress);
  addEventListener('bogema:layout', scheduleProgress);
  if ('ResizeObserver' in window) {
    const resize = new ResizeObserver(scheduleProgress);
    resize.observe(document.documentElement);
    resize.observe(document.body);
  }
  drawProgress();

  if (!('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Set();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      if (reduced.matches) continue;
      try {
        const animation = entry.target.animate([
          {opacity:.25, transform:'translateY(16px)'},
          {opacity:1, transform:'translateY(0)'}
        ], {duration:420, easing:'cubic-bezier(.2,.7,.2,1)'});
        running.add(animation);
        animation.finished.then(() => running.delete(animation), () => running.delete(animation));
      } catch { /* All content remains fully visible without the enhancement. */ }
    }
  }, {threshold:.01, rootMargin:'0px 0px -32px 0px'});
  document.querySelectorAll('.home-page main > section:not(.hero)').forEach(section => {
    // Do not fade the hero or anything already visible on initial/hash load.
    if (section.getBoundingClientRect().top >= innerHeight) observer.observe(section);
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches) for (const animation of running) animation.cancel();
  });
})();
