/* One memory-only contact draft per document. Preferences live in their own store. */
(() => {
  'use strict';
  if (window.bogemaForms) return;
  const scriptURL=document.currentScript?.src||document.querySelector('script[src$="forms.js"]')?.src||new URL('forms.js',document.baseURI).href;
  const controllers=[];
  const blank=()=>({name:'',phone:'',telegram:'',preferredChannel:'phone',date:'',comment:''});
  let draft=blank(),attachment=false,phase='loading',notice='',prepared=null,attempt=null,lastRequestId='',sequence=0;
  let contract,store,formatPreferences,phoneMask,config={enabled:false,statusEndpoint:null};
  const transferred=new Set();
  const frozen=()=>['pending','rejected','catalog_changed','uncertain','partial'].includes(phase);
  const editable=()=>['draft','prepared'].includes(phase);
  const snapshot=()=>store?.getSnapshot()||{ready:false,selected:[],deprecated:[],availableLineups:[]};
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const q=(form,selector)=>form.querySelector(selector);
  function announce(message){notice=message;renderAll();}
  function invalidate(){if(!editable())return;const wasPrepared=!!prepared;prepared=null;phase='draft';notice=wasPrepared?'Данные изменились. Подготовьте сообщение заново, чтобы передать актуальный текст.':'';renderAll();}
  function renderAll(){for(const controller of controllers)controller.render();}
  function clearError(controller,name){
    const field=controller.fields[name];if(!field)return;
    field.removeAttribute('aria-invalid');
    const error=q(controller.form,'[data-error="'+name+'"]');
    if(error){error.textContent='';error.hidden=true;}
  }
  function setError(controller,name,message){
    const field=controller.fields[name];if(!field)return;
    field.setAttribute('aria-invalid','true');
    const error=q(controller.form,'[data-error="'+name+'"]');
    if(error){error.textContent=message;error.hidden=false;}
    if(name==='comment')q(controller.form,'.bf-details').open=true;
  }
  function currentSelectionText(){
    const snap=snapshot();
    if(frozen()&&prepared)return contract.requestText(prepared);
    return formatPreferences?formatPreferences({...snap,deprecated:[]},{includeDeprecated:false}):'Подборка загружается…';
  }
  function focusContact(controller){
    const name=!draft.name?'name':draft.preferredChannel==='telegram'?'telegram':'phone';
    controller.fields[name].focus({preventScroll:true});
  }
  function hasDraft(){return Object.entries(draft).some(([name,value])=>name!=='preferredChannel'&&value)||attachment||!!snapshot().commercialLineup||!!snapshot().unavailableLineup;}
  async function loadConfig(){
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),4000);
    try{
      const response=await fetch(new URL('forms-config.json',scriptURL),{credentials:'same-origin',cache:'no-cache',signal:abort.signal});
      if(!response.ok)throw new Error();
      return contract.endpointConfig(await response.json(),scriptURL);
    }catch{return {enabled:false,endpoint:null,statusEndpoint:null};}
    finally{clearTimeout(timer);}
  }
  function field(id,name,label,control,hint=''){
    return '<div class="bf-field bf-field-'+name+'"><label for="'+id+'-'+name+'">'+label+'</label>'+control+
      (hint?'<p class="bf-hint">'+hint+'</p>':'')+'<p class="bf-field-error" id="'+id+'-'+name+'-error" data-error="'+name+'" hidden></p></div>';
  }
  function mount(host){
    const source=host.dataset.source==='repertoire'?'repertoire':'home',id='bf-'+source+'-'+(++sequence);
    const input=(name,type,attrs='')=>'<input id="'+id+'-'+name+'" name="'+name+'" type="'+type+'" aria-describedby="'+id+'-'+name+'-error" '+attrs+'>';
    const select=(name,options)=>'<select id="'+id+'-'+name+'" name="'+name+'" aria-describedby="'+id+'-'+name+'-error">'+options+'</select>';
    const form=host.tagName==='FORM'?host:document.createElement('form');
    form.className='bf-form';form.noValidate=true;
    // Installed before asynchronous imports: contacts never enter a GET URL.
    form.addEventListener('submit',event=>{event.preventDefault();submit(controller);});
    form.innerHTML='<div class="bf-root">'+
      '<h3 class="bf-heading">Составить сообщение</h3><p class="bf-mode-note">Загружаем форму…</p>'+
      '<div class="bf-editable-fields">'+
      '<div class="bf-fields">'+
      field(id,'name','Имя <span aria-hidden="true">*</span>',input('name','text','autocomplete="name" required maxlength="80"'))+
      field(id,'preferredChannel','Способ связи',select('preferredChannel','<option value="phone">По телефону</option><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="max">MAX</option>'))+
      field(id,'phone','Телефон <span aria-hidden="true">*</span>',input('phone','tel','inputmode="tel" autocomplete="tel" required maxlength="50" placeholder="+7 (___) ___-__-__"'))+
      field(id,'telegram','Telegram <span aria-hidden="true">*</span>',input('telegram','text','autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="33" placeholder="@username"'))+
      field(id,'date','Дата <span class="bf-optional">(необязательно)</span>',input('date','date'))+
      '</div><div class="bf-lineup"><span class="bf-lineup-label"></span><div class="bf-lineup-actions"><button type="button" class="bf-text-button bf-lineup-change" aria-expanded="false" aria-controls="'+id+'-lineup-options">Выбрать</button><button type="button" class="bf-text-button bf-lineup-remove" hidden>Убрать</button></div></div>'+
      '<div class="bf-lineup-options" id="'+id+'-lineup-options" hidden>'+
      field(id,'commercialLineup','Выберите состав',select('commercialLineup','<option value="">Без выбранного состава</option>'))+'</div>'+
      '<p class="bf-lineup-warning" role="status" hidden></p>'+
      '<details class="bf-details"><summary>Добавить детали события</summary>'+
      field(id,'comment','Город, площадка и пожелания','<textarea id="'+id+'-comment" name="comment" maxlength="2000" rows="3" aria-describedby="'+id+'-comment-error" placeholder="Например, свадьба в Москве, площадка пока не выбрана"></textarea>','<span class="bf-comment-count">0</span> / 2000')+'</details>'+
      '<section class="bf-attachment"><div class="bf-attachment-controls"><label class="bf-check"><input name="attachment" type="checkbox"><span class="bf-check-label">Прикрепить подборку</span></label><button type="button" class="bf-text-button bf-preview-selection">Посмотреть</button><button type="button" class="bf-text-button bf-detach" hidden>Убрать из сообщения</button></div>'+
      '<p class="bf-selection"></p><div class="bf-selection-preview" hidden><pre class="bf-selection-text"></pre><button type="button" class="bf-text-button bf-close-selection">Свернуть подборку</button></div></section>'+
      '<p class="bf-no-selection"><a href="'+(source==='repertoire'?'#songs':'repertoire/')+'">Выбрать песни</a></p>'+
      '<p class="bf-deprecated-note" hidden></p></div>'+
      '<p class="bf-status" role="status" aria-live="polite" aria-atomic="true"></p>'+
      '<p class="bf-request-id" hidden></p>'+
      '<button class="bf-primary" type="submit" disabled>Подготовить сообщение</button>'+
      '<div class="bf-recovery"><button class="bf-secondary bf-retry" type="button" hidden>Повторить тот же запрос</button><button class="bf-secondary bf-check-status" type="button" hidden>Проверить результат</button><button class="bf-secondary bf-edit" type="button" hidden>Изменить данные</button></div>'+
      '<section class="bf-prepared" tabindex="-1" hidden><div class="bf-preview-heading"><h3>Ваше сообщение</h3><button class="bf-text-button bf-manual-edit" type="button">Редактировать</button></div><p class="bf-prepared-note"></p>'+
      '<textarea class="bf-request-text" aria-label="Текст обращения для ручного копирования" readonly rows="10"></textarea>'+
      '<div class="bf-message-actions"><button class="bf-secondary bf-copy" type="button">Скопировать текст</button><a class="bf-secondary bf-open-chat" href="https://t.me/DonSe6astian" target="_blank" rel="noopener noreferrer">Открыть чат в Telegram ↗</a></div></section>'+
      '<button type="button" class="bf-text-button bf-new-draft" hidden>Новое сообщение</button>'+
      '<div class="bf-reset-confirm" role="group" aria-label="Начать новое сообщение" hidden><p>Очистить это сообщение? Контакты, детали и выбранный состав будут убраны. Отметки песен останутся в репертуаре.</p><div class="bf-message-actions"><button class="bf-secondary bf-reset-cancel" type="button">Продолжить редактирование</button><button class="bf-secondary bf-reset-approve" type="button">Начать новое</button></div></div>'+
      '<section class="bf-confirmation" tabindex="-1" hidden><h3 class="bf-confirmation-title"></h3><p>Дата и музыкальная программа ещё требуют согласования. Музыкальные отметки сохранены, но к следующему обращению не прикреплены.</p><button class="bf-secondary bf-new" type="button">Новое сообщение</button></section>'+
      '<p class="bf-direct">Можно связаться напрямую: <a href="tel:+79006363727">+7 (900) 636-37-27</a> или <a href="https://t.me/DonSe6astian" target="_blank" rel="noopener noreferrer">написать в Telegram ↗</a>. Открытие мессенджера само по себе ничего не отправляет.</p>'+
      '</div>';
    if(form!==host)host.replaceChildren(form);
    const names=['name','preferredChannel','phone','telegram','date','comment','commercialLineup','attachment'];
    const fields=Object.fromEntries(names.map(name=>[name,form.elements.namedItem(name)]));
    const controller={form,fields,source,lastLineups:'',render(){
      const snap=snapshot(),locked=!editable(),fullSuccess=['accepted','delivered'].includes(phase);
      form.dataset.state=phase;
      const lineupOptions=JSON.stringify([snap.availableLineups||[],snap.unavailableLineup]);
      if(this.lastLineups!==lineupOptions){
        fields.commercialLineup.innerHTML=(snap.unavailableLineup?'<option value="__unavailable__" disabled>Сохранённый состав недоступен</option>':'')+'<option value="">Без выбранного состава</option>'+
          (snap.availableLineups||[]).map(item=>'<option value="'+escape(item.id)+'">'+escape(item.label)+'</option>').join('');
        this.lastLineups=lineupOptions;
      }
      for(const name of Object.keys(draft)) if(fields[name].value!==draft[name])fields[name].value=draft[name];
      fields.commercialLineup.value=frozen()&&prepared?prepared.payload.commercialLineupId||'':snap.unavailableLineup?'__unavailable__':snap.commercialLineup?.id||'';
      fields.attachment.checked=attachment;
      for(const name of names)fields[name].disabled=locked;
      fields.attachment.disabled=locked||!snap.ready||(!attachment&&!snap.selected.length);
      const telegram=draft.preferredChannel==='telegram';
      q(form,'.bf-field-phone').hidden=telegram;fields.phone.required=!telegram;
      q(form,'.bf-field-telegram').hidden=!telegram;fields.telegram.required=telegram;
      q(form,'.bf-heading').textContent=config.enabled?'Обсудить выступление':'Составить сообщение';
      q(form,'.bf-mode-note').textContent=phase==='loading'?'Загружаем форму…':config.enabled?'Оставьте контакт, чтобы обсудить дату и детали выступления.':'Подготовьте текст и передайте его группе удобным способом';
      const lineup=frozen()&&prepared?(prepared.payload.commercialLineupId?{id:prepared.payload.commercialLineupId,label:prepared.lineupLabel}:null):snap.commercialLineup;
      q(form,'.bf-lineup-label').textContent=lineup?'Состав: '+lineup.label:snap.unavailableLineup?'Сохранённый состав недоступен':'Состав пока не выбран';
      q(form,'.bf-lineup-change').textContent=lineup||snap.unavailableLineup?'Изменить':'Выбрать';
      q(form,'.bf-lineup-change').disabled=locked;q(form,'.bf-lineup-remove').disabled=locked;
      q(form,'.bf-lineup-remove').hidden=!lineup&&!snap.unavailableLineup;
      q(form,'.bf-detach').disabled=locked;q(form,'.bf-detach').hidden=!attachment;
      q(form,'.bf-check-label').textContent=attachment?'Подборка в сообщении — '+(prepared&&frozen()?prepared.records.length:snap.selected.length):'Прикрепить подборку — '+snap.selected.length;
      const warning=q(form,'.bf-lineup-warning');warning.hidden=!snap.unavailableLineup;
      warning.textContent=snap.unavailableLineup?'Сохранённый состав недоступен. Выберите состав заново или выберите «Без выбранного состава».':'';
      const count=frozen()&&prepared?prepared.records.length:snap.selected.length;
      const selected=prepared&&frozen()?prepared.records:snap.selected;
      const programs=[...new Set(selected.map(song=>song.program))];
      q(form,'.bf-attachment').hidden=!count;
      q(form,'.bf-no-selection').hidden=!!count;
      q(form,'.bf-selection').textContent=programs.length>1?'Пожелания из программ «Группа» и «Трио»':'';
      if(snap.deprecated?.length)q(form,'.bf-selection').textContent+=' Требуют уточнения: '+snap.deprecated.length+' — не входят в сообщение.';
      q(form,'.bf-deprecated-note').hidden=!!count||!snap.deprecated?.length;
      q(form,'.bf-deprecated-note').textContent=snap.deprecated?.length?'Сохранённые пожелания требуют уточнения: '+snap.deprecated.length+'. Они не прикрепляются как актуальные песни. Посмотрите их в подборке репертуара.':'';
      if(!count)q(form,'.bf-selection-preview').hidden=true;
      q(form,'.bf-selection-text').textContent=currentSelectionText();
      q(form,'.bf-comment-count').textContent=String(draft.comment.length);
      q(form,'.bf-status').textContent=notice;
      const primary=q(form,'.bf-primary');
      primary.disabled=!editable();
      primary.textContent=config.enabled?'Отправить обращение':'Подготовить сообщение';
      primary.hidden=frozen()||fullSuccess||(!config.enabled&&phase==='prepared');
      q(form,'.bf-new-draft').hidden=config.enabled||!editable()||!hasDraft();
      q(form,'.bf-reset-confirm').hidden=q(form,'.bf-reset-confirm').hidden||!editable();
      q(form,'.bf-direct').hidden=!config.enabled&&phase!=='unavailable';
      q(form,'.bf-retry').hidden=phase!=='rejected'||!attempt?.result.retryable;
      q(form,'.bf-check-status').hidden=!['uncertain','partial'].includes(phase)||!config.statusEndpoint;
      q(form,'.bf-edit').hidden=!['rejected','catalog_changed'].includes(phase);
      q(form,'.bf-edit').textContent=phase==='catalog_changed'?'Пересмотреть обращение':'Изменить данные';
      const requestId=prepared?.requestId||lastRequestId;
      q(form,'.bf-request-id').hidden=!requestId||!config.enabled;
      q(form,'.bf-request-id').textContent=requestId?'Номер обращения: '+requestId:'';
      q(form,'.bf-prepared').hidden=!prepared||fullSuccess||phase==='pending';
      q(form,'.bf-request-text').value=prepared?contract.requestText(prepared):'';
      q(form,'.bf-prepared-note').textContent=config.enabled?'Это неизменный снимок текущего обращения. До проверки результата не отправляйте его повторно.':'Скопируйте текст и отправьте его группе самостоятельно. Открытие чата не передаёт сообщение.';
      q(form,'.bf-manual-edit').hidden=config.enabled;
      q(form,'.bf-open-chat').hidden=config.enabled;
      q(form,'.bf-confirmation').hidden=!fullSuccess;
      q(form,'.bf-confirmation-title').textContent=phase==='delivered'?'Обращение доставлено':'Обращение принято в обработку';
    }};
    for(const name of Object.keys(draft)){
      const field=fields[name];
      field.addEventListener('input',()=>{if(!editable())return;draft[name]=field.value;clearError(controller,name);invalidate();});
      field.addEventListener('change',()=>{if(!editable())return;draft[name]=field.value;clearError(controller,name);invalidate();});
    }
    fields.commercialLineup.addEventListener('change',()=>{if(editable()){store.setCommercialLineup(fields.commercialLineup.value||null);invalidate();q(form,'.bf-lineup-options').hidden=true;q(form,'.bf-lineup-change').setAttribute('aria-expanded','false');q(form,'.bf-lineup-change').focus({preventScroll:true});}});
    fields.attachment.addEventListener('change',()=>{if(editable()){attachment=fields.attachment.checked&&snapshot().selected.length>0;invalidate();}});
    q(form,'.bf-lineup-change').addEventListener('click',()=>{
      if(!editable())return;const panel=q(form,'.bf-lineup-options');panel.hidden=!panel.hidden;
      q(form,'.bf-lineup-change').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)fields.commercialLineup.focus({preventScroll:true});
    });
    q(form,'.bf-lineup-remove').addEventListener('click',()=>{if(editable()){store.clearCommercialLineup();invalidate();q(form,'.bf-lineup-options').hidden=true;q(form,'.bf-lineup-change').setAttribute('aria-expanded','false');q(form,'.bf-lineup-change').focus({preventScroll:true});}});
    q(form,'.bf-detach').addEventListener('click',()=>{if(editable()){attachment=false;invalidate();fields.attachment.focus({preventScroll:true});}});
    q(form,'.bf-preview-selection').addEventListener('click',()=>{
      const event=new CustomEvent('bogema:preview-request',{cancelable:true,detail:{trigger:q(form,'.bf-preview-selection')}});
      window.dispatchEvent(event);if(!event.defaultPrevented){q(form,'.bf-selection-preview').hidden=false;q(form,'.bf-close-selection').focus({preventScroll:true});}
    });
    q(form,'.bf-close-selection').addEventListener('click',()=>{q(form,'.bf-selection-preview').hidden=true;q(form,'.bf-preview-selection').focus({preventScroll:true});});
    q(form,'.bf-manual-edit').addEventListener('click',()=>{if(!config.enabled&&editable()){invalidate();focusContact(controller);controller.form.scrollIntoView?.({behavior:'auto',block:'start'});}});
    q(form,'.bf-new-draft').addEventListener('click',()=>{if(!config.enabled&&editable()){q(form,'.bf-reset-confirm').hidden=false;q(form,'.bf-reset-cancel').focus({preventScroll:true});}});
    q(form,'.bf-reset-cancel').addEventListener('click',()=>{q(form,'.bf-reset-confirm').hidden=true;q(form,'.bf-new-draft').focus({preventScroll:true});});
    q(form,'.bf-reset-approve').addEventListener('click',()=>{
      if(config.enabled||!editable())return;
      draft=blank();attachment=false;prepared=null;attempt=null;lastRequestId='';transferred.clear();phase='draft';store.clearCommercialLineup();
      for(const c of controllers){for(const name of Object.keys(draft))clearError(c,name);q(c.form,'.bf-details').open=false;q(c.form,'.bf-lineup-options').hidden=true;q(c.form,'.bf-lineup-change').setAttribute('aria-expanded','false');q(c.form,'.bf-reset-confirm').hidden=true;}
      notice='Можно начать новое сообщение. Отметки песен сохранены и не прикреплены.';renderAll();focusContact(controller);
    });
    q(form,'.bf-retry').addEventListener('click',()=>deliver(controller,false));
    q(form,'.bf-check-status').addEventListener('click',()=>deliver(controller,true));
    q(form,'.bf-edit').addEventListener('click',()=>{
      if(!['rejected','catalog_changed'].includes(phase))return;
      attempt=null;prepared=null;phase='draft';notice='Проверьте данные. Следующая отправка будет новой редакцией обращения.';
      if(!snapshot().selected.length)attachment=false;
      renderAll();fields.name.focus();
    });
    q(form,'.bf-new').addEventListener('click',()=>{
      if(!['accepted','delivered'].includes(phase))return;
      phase='draft';lastRequestId='';notice='';renderAll();fields.name.focus();
    });
    q(form,'.bf-copy').addEventListener('click',async()=>{
      if(!prepared)return;
      const textarea=q(form,'.bf-request-text');
      const copying=prepared;
      try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(contract.requestText(copying));announce(copying===prepared?'Текст скопирован. Отправьте его группе самостоятельно.':'После копирования данные изменились. Подготовьте и скопируйте сообщение заново.');}
      catch{textarea.focus();textarea.select();announce('Автоматическое копирование недоступно. Текст выделен — скопируйте его вручную.');}
    });
    controllers.push(controller);
  }
  function submit(controller){
    if(!editable())return;
    for(const name of Object.keys(draft))clearError(controller,name);
    const checked=contract.validateContact(draft,controller.fields.date.validity.valid);
    if(checked.errors.length){
      for(const [name,message]of checked.errors)setError(controller,name,message);
      announce('Проверьте выделенные поля.');controller.fields[checked.errors[0][0]].focus();return;
    }
    try{
      prepared=contract.createFrozenRequest(draft,controller.source,snapshot(),attachment);
      if(!config.enabled){phase='prepared';notice='Сообщение подготовлено, но ещё не отправлено.';renderAll();q(controller.form,'.bf-prepared').focus();return;}
      attempt=new contract.RequestAttempt(prepared,config);deliver(controller,false);
    }catch(error){announce(error.message||'Не удалось подготовить обращение. Проверьте данные.');}
  }
  async function deliver(controller,checking){
    if(!attempt||phase==='pending')return;
    if(checking&&!['uncertain','partial'].includes(phase))return;
    if(!checking&&!['draft','prepared','rejected'].includes(phase))return;
    phase='pending';notice=checking?'Проверяем результат по номеру обращения…':'Отправляем обращение…';renderAll();
    const result=await (checking?attempt.check():attempt.send());
    phase=result.status;
    if(['accepted','delivered'].includes(phase)){
      lastRequestId=prepared.requestId;
      draft=blank();attachment=false;prepared=null;attempt=null;transferred.clear();store.clearCommercialLineup();
      notice=phase==='accepted'?'Полный запрос принят для дальнейшей обработки. Это ещё не подтверждение даты.':'Доставка полного обращения подтверждена. Дату и программу нужно согласовать.';
      renderAll();q(controller.form,'.bf-confirmation').focus();return;
    }
    if(phase==='catalog_changed'){
      store.markUnavailable(result.missing);
      notice='Каталог обновился. Некоторые записи требуют уточнения. Обращение не принято: пересмотрите подборку или явно перенесите пожелания в комментарий.';
    }else if(phase==='partial'){
      notice='Подтверждена только часть обращения: '+result.parts.confirmed+' из '+result.parts.total+'. Полного подтверждения нет. Не отправляйте обращение заново; проверьте результат или свяжитесь с группой по номеру обращения.';
    }else if(phase==='rejected'){
      notice=result.message+' Данные и прикрепление сохранены.';
    }else{
      phase='uncertain';notice=(result.message||'Результат обращения неизвестен.')+' Данные сохранены на этой странице. '+(config.statusEndpoint?'Проверьте результат по номеру обращения.':'Свяжитесь с группой и назовите номер обращения. Повторная отправка отключена до проверки.');
    }
    renderAll();
  }
  window.bogemaForms=Object.freeze({get mode(){return config.enabled?'endpoint':'manual';},refresh:renderAll});
  window.addEventListener('bogema:attach-request',()=>{
    if(!editable()){announce('Сейчас зафиксировано обращение. Сначала проверьте его результат.');window.dispatchEvent(new CustomEvent('bogema:attach-result',{detail:{ok:false,message:notice}}));return;}
    if(!snapshot().selected.length){announce('Сначала отметьте песни в репертуаре.');window.dispatchEvent(new CustomEvent('bogema:attach-result',{detail:{ok:false,message:notice}}));return;}
    attachment=true;invalidate();announce('Подборка прикреплена к этому сообщению.');
    if(controllers[0])focusContact(controllers[0]);
    window.dispatchEvent(new CustomEvent('bogema:attach-result',{detail:{ok:true,message:notice}}));
  });
  window.addEventListener('bogema:comment-request',event=>{
    const {key,text}=event.detail||{};
    let ok=false,message='';
    if(typeof key!=='string'||typeof text!=='string')return;
    if(!editable())message='Сначала завершите проверку текущего обращения или выберите «Изменить данные».';
    else if(transferred.has(key)||draft.comment.includes(text)){ok=true;message='Это пожелание уже переносили в комментарий.';}
    else{
      const next=draft.comment?(draft.comment+'\n'+text):text;
      if(next.length>2000)message='Недостаточно места в комментарии. Сократите его; предел — 2000 символов.';
      else{draft.comment=next;transferred.add(key);ok=true;for(const controller of controllers)q(controller.form,'.bf-details').open=true;invalidate();message='Неподтверждённое пожелание добавлено в видимый комментарий.';}
    }
    announce(message);window.dispatchEvent(new CustomEvent('bogema:comment-result',{detail:{key,ok,message}}));
  });
  window.addEventListener('pageshow',event=>{
    if(event.persisted&&editable()){attachment=false;prepared=null;phase='draft';notice='Прикрепление выключено после возврата. Включите его снова, если оно нужно для этого обращения.';renderAll();}
  });
  window.addEventListener('beforeunload',event=>{
    if(['pending','uncertain','partial'].includes(phase)){event.preventDefault();event.returnValue='';}
  });
  async function start(){
    for(const host of document.querySelectorAll('[data-request-form]'))mount(host);
    try{
      const modules=await Promise.all([import(new URL('request-contract.mjs',scriptURL).href),import(new URL('preferences-store.mjs',scriptURL).href),import(new URL('phone-input.mjs',scriptURL).href)]);
      contract=modules[0];store=modules[1].preferencesStore;formatPreferences=modules[1].formatPreferences;phoneMask=modules[2].attachPhoneMask;
      config=await loadConfig();
      for(const controller of controllers){phoneMask(controller.fields.phone);controller.form.dataset.phoneMask='ready';}
      store.subscribe(()=>{
        if(editable()){
          if(!snapshot().selected.length)attachment=false;
          if(prepared)notice='Подборка или состав изменились. Подготовьте сообщение заново, чтобы передать актуальный текст.';
          prepared=null;phase='draft';
        }
        renderAll();
      });
      await store.ready;
      phase='draft';renderAll();
    }catch{
      phase='unavailable';notice='Форма не загрузилась. Свяжитесь с группой по телефону или в Telegram.';renderAll();
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
