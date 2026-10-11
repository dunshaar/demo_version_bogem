import { normalizePhone } from './phone-input.mjs';
// Client adapter/shared validation only. There is no delivery service here.
export const LIMITS = Object.freeze({name:80,rawPhone:50,telegram:32,comment:2000,bodyBytes:131072,responseBytes:32768,timeoutMs:15000});
export const CHANNELS = Object.freeze({phone:'По телефону',whatsapp:'WhatsApp',telegram:'Telegram',max:'MAX'});
const STATUSES = new Set(['want','maybe','skip']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^(group|trio)-song-\d{3,6}$/;
const clone = value => JSON.parse(JSON.stringify(value));
const bytes = value => new TextEncoder().encode(value).byteLength;
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
export function deepFreeze(value) {
  if(value && typeof value==='object'){Object.freeze(value); for(const child of Object.values(value)) deepFreeze(child);}
  return value;
}
export function validDate(value) {
  if(!value) return true;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day]=value.split('-').map(Number), parsed=new Date(value+'T12:00:00Z');
  return year>0 && parsed.getUTCFullYear()===year && parsed.getUTCMonth()+1===month && parsed.getUTCDate()===day;
}
export function normalizeTelegram(value) {
  const text=String(value??'').trim().replace(/^@/,'');
  return /^[a-zA-Z0-9_]{5,32}$/.test(text)?'@'+text:'';
}
export function validateContact(values,dateValidity=true) {
  const channel=String(values.preferredChannel||'phone');
  const data={name:String(values.name??'').trim(),phone:null,telegram:null,preferredChannel:channel,date:String(values.date??''),comment:String(values.comment??'').trim()};
  const errors=[];
  if(!data.name) errors.push(['name','Введите имя.']);
  else if(data.name.length>LIMITS.name) errors.push(['name','Имя — не больше 80 символов.']);
  if(!own(CHANNELS,channel)) errors.push(['preferredChannel','Выберите способ связи из списка.']);
  else if(channel==='telegram'){
    data.telegram=normalizeTelegram(values.telegram);
    if(!data.telegram) errors.push(['telegram','Укажите имя пользователя Telegram: @ и 5–32 латинские буквы, цифры или знак подчёркивания.']);
  } else {
    data.phone=normalizePhone(values.phone);
    if(String(values.phone??'').length>LIMITS.rawPhone||!data.phone) errors.push(['phone','Введите номер полностью: +7 и 10 цифр.']);
  }
  if(!dateValidity||!validDate(data.date)) errors.push(['date','Проверьте дату. Можно оставить её пустой.']);
  if(data.comment.length>LIMITS.comment) errors.push(['comment','Комментарий — не больше 2000 символов.']);
  return {data,errors};
}
function uuid(){
  if(!globalThis.crypto?.randomUUID) throw new Error('Не удалось создать номер обращения. Обновите страницу или свяжитесь с нами напрямую.');
  return globalThis.crypto.randomUUID();
}
export function createFrozenRequest(values,source,snapshot,attached,requestId=uuid()){
  const {data,errors}=validateContact(values);
  if(errors.length) throw new Error(errors[0][1]);
  if(!UUID.test(requestId)||!['home','repertoire'].includes(source)) throw new Error('Некорректный номер или источник обращения.');
  if(snapshot.unavailableLineup) throw new Error('Сохранённый состав недоступен. Выберите другой или уберите его.');
  if(attached&&!snapshot.ready) throw new Error('Подборка ещё не загружена. Подождите или отключите прикрепление.');
  const records=attached?clone(snapshot.selected||[]):[];
  if(records.length&&(!Number.isInteger(snapshot.maxSelections)||records.length>snapshot.maxSelections)) throw new Error('Подборка превышает предел актуального каталога. Проверьте отметки.');
  const seen=new Set();
  for(const song of records){
    const key=song.program+':'+song.id;
    if(!['group','trio'].includes(song.program)||!KEY.test(song.id)||!song.id.startsWith(song.program+'-')||!STATUSES.has(song.status)||seen.has(key)) throw new Error('В подборке есть недопустимая или повторная запись.');
    seen.add(key);
  }
  const payload={schemaVersion:1,project:'bogema',requestId,source,
    contact:{name:data.name,phone:data.phone,telegram:data.telegram,preferredChannel:data.preferredChannel},
    date:data.date||null,comment:data.comment,commercialLineupId:snapshot.commercialLineup?.id||null,
    catalogVersion:snapshot.catalogVersion||null,selectionAttached:!!attached&&records.length>0,
    selections:records.map(({program,id,status})=>({program,id,status}))};
  const body=JSON.stringify(payload);
  if(bytes(body)>LIMITS.bodyBytes) throw new Error('Обращение слишком большое. Сократите комментарий; музыкальные отметки сохранены.');
  return deepFreeze({requestId,payload,body,bodyBytes:bytes(body),records,lineupLabel:snapshot.commercialLineup?.label||'',catalogVersion:snapshot.catalogVersion||null});
}
export function requestText(request){
  const p=request.payload, lines=['ОБРАЩЕНИЕ — БОГЕМА','','Имя: '+p.contact.name,'Способ связи: '+CHANNELS[p.contact.preferredChannel]];
  if(p.contact.phone) lines.push('Телефон: '+p.contact.phone);
  if(p.contact.telegram) lines.push('Telegram: '+p.contact.telegram);
  lines.push('Дата: '+(p.date?p.date.split('-').reverse().join('.'):'Пока не определена'),'Состав: '+(request.lineupLabel||'Не выбран'));
  if(p.comment) lines.push('','Город, площадка или пожелания:',p.comment);
  lines.push('',p.selectionAttached?'МУЗЫКАЛЬНЫЕ ПОЖЕЛАНИЯ — '+request.records.length:'Музыкальная подборка не прикреплена.');
  if(p.selectionAttached){
    const labels={want:'Хочу',maybe:'Можно',skip:'Не надо'};
    for(const program of ['group','trio']){
      const songs=request.records.filter(song=>song.program===program);
      if(!songs.length) continue;
      lines.push('',songs[0].programLabel||(program==='group'?'Группа':'Трио'));
      for(const status of ['want','maybe','skip']){
        const matches=songs.filter(song=>song.status===status);
        if(matches.length){lines.push(labels[status]+':'); for(const song of matches) lines.push('• '+song.title+' — '+(song.artist||'Исполнитель не указан'));}
      }
    }
    lines.push('','Музыкальная подборка — пожелания для обсуждения, не согласованная программа.');
  }
  return lines.join('\n');
}
// A future endpoint may reuse validation; this is not durable acceptance,
// deduplication, an Origin/CSRF check, rate limiting or a delivery guarantee.
export function validateRequest(payload,{catalog,lineups}){
  const errors=[],missing=[];
  if(!plain(payload)) return {ok:false,errors:['Некорректное тело запроса.'],missing};
  let size=Infinity; try{size=bytes(JSON.stringify(payload));}catch{}
  if(size>LIMITS.bodyBytes) errors.push('Превышен предел тела запроса.');
  if(payload.schemaVersion!==1||payload.project!=='bogema'||!UUID.test(payload.requestId||'')||!['home','repertoire'].includes(payload.source)) errors.push('Некорректный контракт запроса.');
  const allowed=['schemaVersion','project','requestId','source','contact','date','comment','commercialLineupId','catalogVersion','selectionAttached','selections'];
  if(Object.keys(payload).some(key=>!allowed.includes(key))) errors.push('Неизвестное поле запроса.');
  const contact=plain(payload.contact)?payload.contact:{}, checked=validateContact({...contact,date:payload.date,comment:payload.comment});
  errors.push(...checked.errors.map(([,message])=>message));
  if(Object.keys(contact).some(key=>!['name','phone','telegram','preferredChannel'].includes(key))) errors.push('Неизвестное поле контакта.');
  if(contact.name!==checked.data.name||contact.phone!==checked.data.phone||contact.telegram!==checked.data.telegram||contact.preferredChannel!==checked.data.preferredChannel||payload.comment!==checked.data.comment) errors.push('Контакт должен быть нормализован.');
  if(payload.date!==null&&typeof payload.date!=='string') errors.push('Некорректная дата.');
  if(payload.commercialLineupId!==null&&!lineups.some(item=>item.id===payload.commercialLineupId)) errors.push('Недоступный коммерческий состав.');
  if(payload.catalogVersion!==null&&(typeof payload.catalogVersion!=='string'||payload.catalogVersion.length>100)) errors.push('Некорректная версия каталога.');
  const programs=catalog?.lineups||{}, max=Object.values(programs).reduce((sum,program)=>sum+new Set(program.songs.map(song=>song.id)).size,0);
  const selections=Array.isArray(payload.selections)?payload.selections:[];
  if(!Array.isArray(payload.selections)||selections.length>max) errors.push('Превышен предел подборки.');
  if(typeof payload.selectionAttached!=='boolean'||(!payload.selectionAttached&&selections.length)) errors.push('Подборка не была явно прикреплена.');
  const seen=new Set();
  for(const song of selections){
    if(!plain(song)){errors.push('Некорректная запись.');continue;}
    const key=song.program+':'+song.id;
    if(!own(programs,song.program)||!KEY.test(song.id||'')||!String(song.id).startsWith(song.program+'-')||!STATUSES.has(song.status)||seen.has(key)||Object.keys(song).some(field=>!['program','id','status'].includes(field))){errors.push('Недопустимая или повторная запись.');continue;}
    seen.add(key);
    if(!programs[song.program].songs.some(current=>current.id===song.id)) missing.push({program:song.program,id:song.id});
  }
  return {ok:!errors.length&&!missing.length,errors,missing,maxSelections:max};
}
export function endpointConfig(config,baseURL){
  const base=new URL(baseURL);
  function endpoint(value){
    if(typeof value!=='string'||!value.trim()) return null;
    try{const u=new URL(value,base);return u.origin===base.origin&&['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.hash&&!u.search?u.href:null;}catch{return null;}
  }
  const send=endpoint(config?.endpoint);
  return Object.freeze({enabled:config?.enabled===true&&!!send,endpoint:send,statusEndpoint:endpoint(config?.statusEndpoint)});
}
export function classifyResponse(response,requestId){
  if(!plain(response)||response.schemaVersion!==1||response.requestId!==requestId) return {status:'uncertain',message:'Не удалось подтвердить результат обращения.'};
  if(response.status==='delivered'&&response.full===true) return {status:'delivered',requestId};
  if(response.status==='accepted'&&response.full===true&&response.durable===true) return {status:'accepted',requestId};
  if(response.status==='rejected'&&response.accepted===false) return {status:'rejected',requestId,retryable:response.retryable===true,message:String(response.message||'Обращение не принято.').slice(0,500)};
  if(response.status==='catalog_changed'&&response.accepted===false&&Array.isArray(response.missing)&&response.missing.length&&response.missing.every(item=>plain(item)&&['group','trio'].includes(item.program)&&KEY.test(item.id||'')&&item.id.startsWith(item.program+'-'))) return {status:'catalog_changed',requestId,missing:response.missing.map(({program,id})=>({program,id}))};
  if(response.status==='partial'&&plain(response.parts)&&Number.isInteger(response.parts.confirmed)&&Number.isInteger(response.parts.total)&&response.parts.total>response.parts.confirmed&&response.parts.confirmed>0) return {status:'partial',requestId,parts:{confirmed:response.parts.confirmed,total:response.parts.total}};
  return {status:'uncertain',requestId,message:'Результат пока не подтверждён. Не отправляйте обращение повторно до проверки.'};
}
export class RequestAttempt{
  constructor(request,config,fetcher=globalThis.fetch,timeoutMs=LIMITS.timeoutMs){
    Object.defineProperty(this,'request',{value:deepFreeze(clone(request)),writable:false});this.config=config;this.fetcher=fetcher;this.timeoutMs=timeoutMs;this.result={status:'draft'};this.pending=null;this.hadPartial=false;
  }
  send(){
    if(this.pending) return this.pending;
    if(!this.config.enabled) return Promise.resolve({status:'disabled'});
    if(['accepted','delivered'].includes(this.result.status)) return Promise.resolve(this.result);
    if(this.result.status!=='draft'&&!(this.result.status==='rejected'&&this.result.retryable)) return Promise.resolve(this.result);
    return this.run(this.config.endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Bogema-Contract':'1'},body:this.request.body});
  }
  check(){
    if(this.pending) return this.pending;
    if(!this.config.enabled||!this.config.statusEndpoint||!['uncertain','partial'].includes(this.result.status)) return Promise.resolve(this.result);
    const url=new URL(this.config.statusEndpoint);url.searchParams.set('requestId',this.request.requestId);
    return this.run(url.href,{method:'GET',headers:{Accept:'application/json'}});
  }
  run(url,options){
    const previous=this.result; this.result={status:'pending'};
    this.pending=(async()=>{
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),this.timeoutMs);
      try{
        const response=await Promise.resolve().then(()=>this.fetcher.call(globalThis,url,{...options,credentials:'same-origin',cache:'no-store',redirect:'error',signal:abort.signal}));
        const text=await response.text();
        if(bytes(text)>LIMITS.responseBytes) throw new Error('Response too large');
        const result=classifyResponse(JSON.parse(text),this.request.requestId);
        if((!response.ok&&['accepted','delivered'].includes(result.status))||(this.hadPartial&&['rejected','catalog_changed'].includes(result.status))) throw new Error('Contradictory response');
        this.hadPartial ||= result.status==='partial';this.result=result;
      }catch{this.result=previous.status==='partial'?previous:{status:'uncertain',requestId:this.request.requestId,message:'Связь прервалась или ответ не удалось проверить. Результат неизвестен.'};}
      finally{clearTimeout(timer);this.pending=null;}
      return this.result;
    })();
    return this.pending;
  }
}
