(() => {
  'use strict';
  const dialog=document.querySelector('#video-dialog');
  if(!dialog) return;
  const video=dialog.querySelector('video');
  const error=dialog.querySelector('.video-error');
  const title=dialog.querySelector('#video-title');
  const base=document.body.dataset.base || '';
  const videos={promo:{title:'Промо Богемы',poster:'poster-promo.jpg'},'live-2025':{title:'Богема — Live 2025',poster:'poster-live-2025.jpg'},'trio-live':{title:'Богема — Трио live',poster:'poster-trio-live.jpg'},'summer-rain':{title:'Вокалист-гитарист — Летний дождь',poster:'poster-summer-rain.jpg'}};
  let opener=null;
  document.querySelectorAll('[data-video]').forEach(button=>button.addEventListener('click',()=>{
    const key=button.dataset.video, item=videos[key];
    if(!item) return;
    opener=button; title.textContent=item.title; error.hidden=true;
    video.poster=`${base}assets/${item.poster}`;
    dialog.showModal();
    video.src=`${base}assets/${key}.mp4`;
    video.load();
    video.play().catch(e=>{if(e.name!=='AbortError'&&dialog.open) dialog.querySelector('.bp-status').textContent='Нажмите воспроизведение, чтобы начать видео.';});
  }));
  const close=()=>dialog.close();
  dialog.querySelector('[data-close]').addEventListener('click',close);
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  dialog.addEventListener('close',()=>{video.pause();video.removeAttribute('src');video.load();error.hidden=true;opener?.focus({preventScroll:true});});
  video.addEventListener('error',()=>{if(dialog.open&&video.getAttribute('src'))error.hidden=false;});
})();
