"use strict";
(() => {
  const dialogs=[...document.querySelectorAll('dialog')];
  const triggers=new WeakMap();
  function open(dialog,trigger){if(dialog.open)return;triggers.set(dialog,trigger||document.activeElement);dialog.showModal();document.body.classList.add('modal-open');}
  dialogs.forEach(dialog=>{
    dialog.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();});
    dialog.addEventListener('close',()=>{if(!dialogs.some(d=>d.open))document.body.classList.remove('modal-open');const trigger=triggers.get(dialog);if(trigger?.isConnected)trigger.focus({preventScroll:true});});
  });
  const menu=document.querySelector('#menu-dialog');
  document.querySelector('.menu-button').addEventListener('click',event=>open(menu,event.currentTarget));
  menu.querySelectorAll('nav a').forEach(link=>link.addEventListener('click',()=>menu.close()));
  const videoDialog=document.querySelector('#video-dialog'),video=videoDialog.querySelector('video'),error=document.querySelector('#video-error');
  const videos={
    promo:{title:'Промо',src:'assets/promo.mp4',poster:'assets/poster-promo.jpg'},
    'live-2025':{title:'Группа, живое выступление',src:'assets/live-2025.mp4',poster:'assets/poster-live-2025.jpg'},
    'trio-live':{title:'Трио, живое выступление',src:'assets/trio-live.mp4',poster:'assets/poster-trio-live.jpg'},
    'summer-rain':{title:'Вокалист-гитарист, Летний дождь',src:'assets/summer-rain.mp4',poster:'assets/poster-summer-rain.jpg'}
  };
  document.querySelectorAll('[data-video]').forEach(button=>button.addEventListener('click',()=>{
    const item=videos[button.dataset.video];if(!item||videoDialog.open)return;error.hidden=true;
    document.querySelector('#video-title').textContent=item.title;video.poster=item.poster;video.src=item.src;
    open(videoDialog,button);video.play().catch(()=>{});
  }));
  video.addEventListener('error',()=>{if(videoDialog.open)error.hidden=false;});
  videoDialog.addEventListener('close',()=>{if(document.fullscreenElement===video.closest('.bp-player'))document.exitFullscreen().catch(()=>{});video.pause();video.removeAttribute('src');video.load();error.hidden=true;});
  document.querySelectorAll('[data-lineup]').forEach(link=>link.addEventListener('click',()=>{
    const name=link.dataset.lineup;window.bogemaSelectedLineup=name;
    window.dispatchEvent(new CustomEvent('bogema:lineup',{detail:{name}}));
  }));
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if('IntersectionObserver' in window&&!reduced){
    const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}});},{threshold:.06,rootMargin:'0px 0px 30px 0px'});
    document.documentElement.classList.add('reveal-ready');document.querySelectorAll('[data-reveal]').forEach(el=>observer.observe(el));
  }
  const progress=document.querySelector('.scroll-progress');let scheduled=false;
  function drawProgress(){const height=document.documentElement.scrollHeight-innerHeight;progress.style.transform=`scaleX(${height>0?Math.min(1,Math.max(0,scrollY/height)):0})`;scheduled=false;}
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(drawProgress);}}
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);drawProgress();
})();
