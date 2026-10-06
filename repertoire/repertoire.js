"use strict";
(() => {
  const $ = selector => document.querySelector(selector);
  const LABELS = {want:"Хочу", maybe:"Можно", skip:"Не надо"};
  const states = {group:new Map(), trio:new Map()};
  let active = new URLSearchParams(window.location.search).get("lineup") === "trio" ? "trio" : "group", data = null;
  let rows = new Map();
  const collators = {latin:new Intl.Collator("en", {sensitivity:"base",numeric:true}), cyrillic:new Intl.Collator("ru", {sensitivity:"base",numeric:true})};
  const clean = value => String(value || "").normalize("NFKC").toLocaleLowerCase("ru").replaceAll("ё","е");
  function alphabet(value) {const first=String(value || "").match(/\p{L}/u)?.[0] || ""; return /\p{Script=Latin}/u.test(first)?0:/\p{Script=Cyrillic}/u.test(first)?1:2;}
  function compare(a,b) {const family=alphabet(a)-alphabet(b);if(family)return family;return (alphabet(a)===1?collators.cyrillic:collators.latin).compare(clean(a),clean(b));}
  function sorted(lineup) {const family=song=>song.artist?alphabet(song.artist)*2:1;return [...lineup.songs].sort((a,b)=>family(a)-family(b)||compare(a.artist||a.title,b.artist||b.title)||compare(a.title,b.title)||a.id.localeCompare(b.id));}
  function counts() {const result={want:0,maybe:0,skip:0};if(data)for(const song of data.lineups[active].songs)result[states[active].get(song.id) || "maybe"]++;return result;}
  function summary() {const count=counts();return {ready:!!data,lineup:active,lineupLabel:active==="group"?"Группа":"Трио",total:data?.lineups[active].songs.length || 0,positions:data?.lineups[active].positions || 0,...count,selectionCount:count.want+count.skip};}
  function requestText() {
    if(!data)return "Репертуар не загрузился. Музыкальные пожелания пока не подготовлены.";
    const lineup=data.lineups[active],count=counts();
    const lines=["БОГЕМА",`Состав: ${lineup.label}`,"Пожелания к музыкальной программе для согласования",`Версия списка: ${data.version}`,`Песен: ${lineup.songs.length}. Исходных позиций: ${lineup.positions}.`,"Повтор одной песни в нескольких разделах имеет общую отметку.","Это пожелания, а не утверждённый сет-лист."];
    for(const choice of ["want","maybe","skip"]){
      const songs=sorted(lineup).filter(song=>(states[active].get(song.id)||"maybe")===choice);
      lines.push("",`${LABELS[choice].toLocaleUpperCase("ru")} (${count[choice]})`);
      if(!songs.length)lines.push("Нет отмеченных песен.");
      songs.forEach((song,index)=>{const label=[song.artist || "Исполнитель не указан",song.title].join(" — ");const categories=[...new Set(song.aliases.map(alias=>alias.category))];lines.push(`${index+1}. ${label}${song.aliases.length>1?` [разделы: ${categories.join("; ")}]`:""}`);});
    }
    return lines.join("\n")+"\n";
  }
  window.bogemaRepertoire={getRequestText:requestText,getSummary:summary};
  function notify(){window.dispatchEvent(new CustomEvent("bogema:repertoire-change",{detail:summary()}));}
  function updateCounts(){
    const count=counts();for(const choice of ["want","maybe","skip"])$(`#count-${choice}`).textContent=count[choice];
    $("#reset-open").disabled=count.want+count.skip===0;
    notify();
  }
  function render(){
    const list=$("#song-list"),fragment=document.createDocumentFragment();rows=new Map();
    sorted(data.lineups[active]).forEach((song,index)=>{
      const row=document.createElement("li");row.className="rep-song-row";row.dataset.songId=song.id;
      const info=document.createElement("div");info.className="rep-song-info";
      const number=document.createElement("span");number.className="rep-song-number";number.textContent=String(index+1).padStart(2,"0");number.setAttribute("aria-hidden","true");
      const artist=document.createElement("h3");artist.textContent=song.artist || "Исполнитель не указан";
      const title=document.createElement("span");title.className="rep-song-title";title.textContent=song.title;
      info.append(number,artist,title);
      if(song.aliases.length>1){const alias=document.createElement("span");alias.className="rep-song-alias";alias.textContent=[...new Set(song.aliases.map(item=>item.category))].join(", ")+", общий выбор";info.append(alias);}
      const choices=document.createElement("fieldset");choices.className="rep-song-choices";
      const legend=document.createElement("legend");legend.className="rep-sr-only";legend.textContent=`Выбор для ${song.artist || "песни"}: ${song.title}`;choices.append(legend);
      for(const choice of ["want","maybe","skip"]){const label=document.createElement("label"),input=document.createElement("input"),text=document.createElement("span");input.type="radio";input.name=song.id;input.value=choice;input.checked=(states[active].get(song.id)||"maybe")===choice;text.textContent=LABELS[choice];label.append(input,text);choices.append(label);}
      row.append(info,choices);fragment.append(row);rows.set(song.id,row);
    });
    list.replaceChildren(fragment);updateCounts();
  }
  function selectTab(key,focus=false){if(!data)return;active=key;for(const tab of document.querySelectorAll('[role="tab"]')){const selected=tab.id===`tab-${key}`;tab.setAttribute("aria-selected",String(selected));tab.tabIndex=selected?0:-1;}$("#songs-panel").setAttribute("aria-labelledby",`tab-${key}`);$("#export-status").textContent="";render();if(focus)$(`#tab-${key}`).focus();}
  const tabs=[...document.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab,index)=>{tab.addEventListener("click",()=>selectTab(index?"trio":"group"));tab.addEventListener("keydown",event=>{let next;if(event.key==="ArrowRight"||event.key==="ArrowLeft")next=1-index;if(event.key==="Home")next=0;if(event.key==="End")next=1;if(next!==undefined){event.preventDefault();selectTab(next?"trio":"group",true);}});});
  $("#song-list").addEventListener("change",event=>{const input=event.target;if(!(input instanceof HTMLInputElement)||input.type!=="radio"||!rows.has(input.name)||!Object.hasOwn(LABELS,input.value))return;states[active].set(input.name,input.value);updateCounts();$("#export-status").textContent="";});
  function reset(){states[active].clear();render();$("#export-status").textContent=`Отметки ${active==="group"?"группы":"трио"} сброшены. Все песни снова «Можно».`;$(`#tab-${active}`).focus({preventScroll:true});}
  const dialog=$("#reset-dialog");
  $("#reset-open").addEventListener("click",()=>{if(typeof dialog.showModal==="function"){dialog.returnValue="";dialog.showModal();}else if(window.confirm("Сбросить отметки выбранного состава? Все песни снова станут «Можно»."))reset();});
  dialog.addEventListener("close",()=>{if(dialog.returnValue==="reset")reset();});
  $("#download-list").addEventListener("click",()=>{if(!data)return;try{const url=URL.createObjectURL(new Blob(["\uFEFF",requestText()],{type:"text/plain;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`Богема — ${active==="group"?"группа":"трио"} — пожелания.txt`;document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),10000);$("#export-status").textContent="Скачивание списка началось.";}catch{$("#export-status").textContent="Не удалось подготовить файл. Попробуйте ещё раз.";}});
  fetch("data.json",{cache:"no-cache"}).then(response=>{if(!response.ok)throw new Error("catalog");return response.json();}).then(value=>{
    for(const key of ["group","trio"]){const lineup=value?.lineups?.[key];if(!lineup||!Array.isArray(lineup.songs)||!lineup.songs.length||!Number.isInteger(lineup.positions))throw new Error("catalog");const ids=new Set();for(const song of lineup.songs){if(typeof song.id!=="string"||ids.has(song.id)||typeof song.title!=="string"||!song.title.trim()||!(song.artist===null||typeof song.artist==="string")||!Array.isArray(song.aliases)||!song.aliases.length)throw new Error("song");ids.add(song.id);}}
    data=value;selectTab(active);for(const tab of tabs)tab.disabled=false;$("#download-list").disabled=false;document.documentElement.dataset.repertoireReady="true";
  }).catch(()=>{$("#catalog-error").hidden=false;$("#count-maybe").textContent="—";document.documentElement.dataset.repertoireReady="false";});
})();
