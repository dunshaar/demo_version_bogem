(() => {
 'use strict';
 const tabs=[...document.querySelectorAll('[role="tab"]')],list=document.querySelector('#song-list'),status=document.querySelector('#catalog-status');
 let active=new URLSearchParams(location.search).get('lineup')==='trio'?'trio':'group',catalog=null;
 const ru=new Intl.Collator('ru',{sensitivity:'base',numeric:true}),en=new Intl.Collator('en',{sensitivity:'base',numeric:true});
 const family=text=>{const first=String(text||'').match(/\p{L}/u)?.[0]||'';return /\p{Script=Latin}/u.test(first)?0:/\p{Script=Cyrillic}/u.test(first)?1:2;};
 const compare=(a,b)=>family(a)-family(b)||(family(a)===1?ru:en).compare(a||'',b||'');
 function render(key,focus=false){
  if(!catalog)return;active=key;
  tabs.forEach(tab=>{const selected=tab.id===`tab-${key}`;tab.setAttribute('aria-selected',selected);tab.tabIndex=selected?0:-1;});
  document.querySelector('#songs-panel').setAttribute('aria-labelledby',`tab-${key}`);
  const songs=[...catalog.lineups[key].songs].sort((a,b)=>compare(a.artist||a.title,b.artist||b.title)||compare(a.title,b.title)||a.id.localeCompare(b.id));
  const fragment=document.createDocumentFragment();
  songs.forEach((song,i)=>{const row=document.createElement('li'),number=document.createElement('span'),info=document.createElement('div'),artist=document.createElement('h3'),title=document.createElement('p');number.className='song-number';number.textContent=String(i+1).padStart(2,'0');number.setAttribute('aria-hidden','true');info.className='song-info';artist.textContent=song.artist||'Исполнитель не указан';title.textContent=song.title;info.append(artist,title);row.append(number,info);fragment.append(row);});
  list.replaceChildren(fragment);document.querySelector('#rep-count').textContent=`${songs.length} ${key==='trio'?'песня':'песен'}`;status.hidden=true;
  const url=new URL(location.href);url.searchParams.set('lineup',key);history.replaceState(null,'',url);
  if(focus)document.querySelector(`#tab-${key}`).focus();
 }
 tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>render(i?'trio':'group'));tab.addEventListener('keydown',e=>{let next;if(['ArrowLeft','ArrowRight'].includes(e.key))next=1-i;if(e.key==='Home')next=0;if(e.key==='End')next=1;if(next!==undefined){e.preventDefault();render(next?'trio':'group',true);}});});
 fetch('data.json').then(r=>{if(!r.ok)throw Error('catalog');return r.json();}).then(data=>{for(const key of ['group','trio'])if(!Array.isArray(data?.lineups?.[key]?.songs)||!data.lineups[key].songs.length)throw Error('catalog');catalog=data;tabs.forEach(tab=>tab.disabled=false);render(active);document.documentElement.dataset.repertoireReady='true';}).catch(()=>{status.textContent='Не удалось загрузить репертуар. Обновите страницу или напишите Алексею.';document.documentElement.dataset.repertoireReady='false';});
})();
