import { normalizePhone } from './phone-input.mjs';

// The local site runs in demo mode. This strict contract is for a future adapter.
export const LIMITS = Object.freeze({name:80,rawPhone:50,bodyBytes:131072,responseBytes:32768,timeoutMs:15000});
const CHANNELS = new Set(['','phone','telegram','whatsapp','max']);
const STATUSES = new Set(['want','skip']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^(group|trio)-song-\d{3,6}$/;
const FIELDS = ['schemaVersion','project','requestId','contact','date','consent','catalogVersion','selectionAttached','selections'];
const clone = value => JSON.parse(JSON.stringify(value));
const bytes = value => new TextEncoder().encode(value).byteLength;
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value,keys) => plain(value) && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
export function deepFreeze(value) {
  if(value && typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}
  return value;
}
export function validDate(value) {
  if(!value)return true;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number),parsed=new Date(value+'T12:00:00Z');
  return year>0&&parsed.getUTCFullYear()===year&&parsed.getUTCMonth()+1===month&&parsed.getUTCDate()===day;
}
export function validateContact(values,dateValidity=true) {
  const data={name:String(values.name??'').trim(),phone:normalizePhone(values.phone),date:String(values.date??''),preferredChannel:String(values.preferredChannel??''),consent:values.consent===true},errors=[];
  if(!data.name)errors.push(['name','Введите имя']);
  else if(data.name.length>LIMITS.name)errors.push(['name','Имя: не больше 80 символов']);
  if(String(values.phone??'').length>LIMITS.rawPhone||!data.phone)errors.push(['phone','Введите номер полностью: +7 и 10 цифр']);
  if(!dateValidity||!validDate(data.date))errors.push(['date','Проверьте дату или оставьте поле пустым']);
  if(!CHANNELS.has(data.preferredChannel))errors.push(['preferredChannel','Выберите способ связи из списка']);
  if(!data.consent)errors.push(['consent','Подтвердите согласие на обработку персональных данных']);
  return {data,errors};
}
function uuid(){
  if(!globalThis.crypto?.randomUUID)throw new Error('Обновите страницу, чтобы создать номер заявки');
  return globalThis.crypto.randomUUID();
}
export function createFrozenRequest(values,snapshot,attached,requestId=uuid(),{excludeDeprecated=false}={}){
  const {data,errors}=validateContact(values);
  if(errors.length)throw new Error(errors[0][1]);
  if(!UUID.test(requestId))throw new Error('Некорректный номер заявки');
  if(attached&&!snapshot.ready)throw new Error('Пожелания ещё загружаются, попробуйте отправить чуть позже');
  if(attached&&!['group','trio'].includes(snapshot.program))throw new Error('Выберите состав для пожеланий');
  if(attached&&snapshot.deprecated?.some(song=>song.program===snapshot.program)&&!excludeDeprecated)throw new Error('Подтвердите отправку без недоступных песен');
  const records=attached?clone((snapshot.selected||[]).filter(song=>song.program===snapshot.program)):[],seen=new Set();
  if(records.length&&(!Number.isInteger(snapshot.maxSelections)||records.length>snapshot.maxSelections))throw new Error('Число пожеланий превышает размер актуального каталога');
  for(const song of records){
    const key=song.program+':'+song.id;
    if(!['group','trio'].includes(song.program)||!KEY.test(song.id)||!song.id.startsWith(song.program+'-')||!STATUSES.has(song.status)||seen.has(key))throw new Error('В пожеланиях есть недопустимая или повторная запись');
    seen.add(key);
  }
  if(records.length&&(typeof snapshot.catalogVersion!=='string'||!snapshot.catalogVersion||snapshot.catalogVersion.length>100))throw new Error('Не удалось проверить версию репертуара');
  const payload={schemaVersion:3,project:'bogema',requestId,contact:{name:data.name,phone:data.phone,preferredChannel:data.preferredChannel||null},date:data.date||null,consent:true,
    catalogVersion:records.length?snapshot.catalogVersion:null,selectionAttached:records.length>0,
    selections:records.map(({program,id,status})=>({program,id,status}))};
  const body=JSON.stringify(payload);
  if(bytes(body)>LIMITS.bodyBytes)throw new Error('Заявка превышает допустимый размер, пожелания сохранены');
  return deepFreeze({requestId,program:attached?snapshot.program:null,payload,body,bodyBytes:bytes(body),records});
}
export function validateRequest(payload,{catalog}){
  const errors=[],missing=[];
  if(!plain(payload))return {ok:false,errors:['Некорректное тело запроса'],missing};
  let size=Infinity;try{size=bytes(JSON.stringify(payload));}catch{}
  if(size>LIMITS.bodyBytes)errors.push('Превышен предел тела запроса');
  if(!exactKeys(payload,FIELDS)||payload.schemaVersion!==3||payload.project!=='bogema'||!UUID.test(payload.requestId||''))errors.push('Некорректный контракт запроса');
  const contact=plain(payload.contact)?payload.contact:{},checked=validateContact({...contact,date:payload.date,consent:payload.consent});
  errors.push(...checked.errors.map(([,message])=>message));
  if(!exactKeys(contact,['name','phone','preferredChannel'])||contact.name!==checked.data.name||contact.phone!==checked.data.phone||(contact.preferredChannel!==null&&!['phone','telegram','whatsapp','max'].includes(contact.preferredChannel)))errors.push('Некорректные поля контакта');
  if(payload.date!==null&&(typeof payload.date!=='string'||!payload.date||!validDate(payload.date)))errors.push('Некорректная дата');
  const programs=catalog?.lineups||{},max=Object.values(programs).reduce((sum,program)=>sum+new Set(program.songs.map(song=>song.id)).size,0);
  const selections=Array.isArray(payload.selections)?payload.selections:[];
  if(!Array.isArray(payload.selections)||selections.length>max)errors.push('Превышен предел пожеланий');
  if(typeof payload.selectionAttached!=='boolean'||payload.selectionAttached!==(selections.length>0))errors.push('Некорректное прикрепление');
  if(payload.selectionAttached){if(typeof payload.catalogVersion!=='string'||!payload.catalogVersion||payload.catalogVersion.length>100)errors.push('Некорректная версия репертуара');}
  else if(payload.catalogVersion!==null)errors.push('Версия репертуара передаётся только с пожеланиями');
  const seen=new Set();
  for(const song of selections){
    if(!plain(song)){errors.push('Некорректная запись');continue;}
    const key=song.program+':'+song.id;
    if(!exactKeys(song,['program','id','status'])||!Object.hasOwn(programs,song.program)||!KEY.test(song.id||'')||!String(song.id).startsWith(song.program+'-')||!STATUSES.has(song.status)||seen.has(key)){errors.push('Недопустимая или повторная запись');continue;}
    seen.add(key);if(!programs[song.program].songs.some(current=>current.id===song.id))missing.push({program:song.program,id:song.id});
  }
  return {ok:!errors.length&&!missing.length,errors,missing,maxSelections:max};
}
export function endpointConfig(config,baseURL){
  const base=new URL(baseURL);
  function endpoint(value){
    if(typeof value!=='string'||!value.trim())return null;
    try{const u=new URL(value,base);return u.origin===base.origin&&['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.hash&&!u.search?u.href:null;}catch{return null;}
  }
  if(config?.mode==='demo')return Object.freeze({mode:'demo',enabled:false,endpoint:null,statusEndpoint:null});
  const send=endpoint(config?.endpoint);
  return Object.freeze({mode:'endpoint',enabled:config?.enabled===true&&!!send,endpoint:send,statusEndpoint:endpoint(config?.statusEndpoint)});
}
export function classifyResponse(response,requestId){
  if(!plain(response)||response.schemaVersion!==3||response.requestId!==requestId)return {status:'uncertain',message:'Не удалось подтвердить результат заявки'};
  if(response.status==='delivered'&&response.full===true)return {status:'delivered',requestId};
  if(response.status==='accepted'&&response.full===true&&response.durable===true)return {status:'accepted',requestId};
  if(response.status==='rejected'&&response.accepted===false)return {status:'rejected',requestId,retryable:response.retryable===true,message:String(response.message||'Заявка не принята').slice(0,500)};
  if(response.status==='catalog_changed'&&response.accepted===false&&Array.isArray(response.missing)&&response.missing.every(item=>plain(item)&&['group','trio'].includes(item.program)&&KEY.test(item.id||'')&&item.id.startsWith(item.program+'-'))&&(response.missing.length||typeof response.catalogVersion==='string'))return {status:'catalog_changed',requestId,missing:response.missing.map(({program,id})=>({program,id})),catalogVersion:response.catalogVersion||null};
  if(response.status==='partial'&&plain(response.parts)&&Number.isInteger(response.parts.confirmed)&&Number.isInteger(response.parts.total)&&response.parts.total>response.parts.confirmed&&response.parts.confirmed>0)return {status:'partial',requestId,parts:{confirmed:response.parts.confirmed,total:response.parts.total}};
  return {status:'uncertain',requestId,message:'Проверьте результат перед повторной отправкой'};
}
export class RequestAttempt{
  constructor(request,config,fetcher=globalThis.fetch,timeoutMs=LIMITS.timeoutMs){
    Object.defineProperty(this,'request',{value:deepFreeze(clone(request)),writable:false});this.config=config;this.fetcher=fetcher;this.timeoutMs=timeoutMs;this.result={status:'draft'};this.pending=null;this.hadPartial=false;
  }
  send(){
    if(this.pending)return this.pending;
    if(!this.config.enabled)return Promise.resolve({status:'disabled'});
    if(['accepted','delivered'].includes(this.result.status))return Promise.resolve(this.result);
    if(this.result.status!=='draft'&&!(this.result.status==='rejected'&&this.result.retryable))return Promise.resolve(this.result);
    return this.run(this.config.endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Bogema-Contract':'3'},body:this.request.body});
  }
  check(){
    if(this.pending)return this.pending;
    if(!this.config.enabled||!this.config.statusEndpoint||!['uncertain','partial'].includes(this.result.status))return Promise.resolve(this.result);
    return this.run(this.config.statusEndpoint.replace(/\/$/,'')+'/'+this.request.requestId,{method:'GET',headers:{Accept:'application/json'}});
  }
  run(url,options){
    const previous=this.result;this.result={status:'pending'};
    this.pending=(async()=>{
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),this.timeoutMs);
      try{
        const response=await Promise.resolve().then(()=>this.fetcher.call(globalThis,url,{...options,credentials:'same-origin',cache:'no-store',redirect:'error',signal:abort.signal}));
        const text=await response.text();if(bytes(text)>LIMITS.responseBytes)throw new Error('Response too large');
        const result=classifyResponse(JSON.parse(text),this.request.requestId);
        if((!response.ok&&['accepted','delivered'].includes(result.status))||(this.hadPartial&&['rejected','catalog_changed'].includes(result.status)))throw new Error('Contradictory response');
        this.hadPartial ||= result.status==='partial';this.result=result;
      }catch{this.result=previous.status==='partial'?previous:{status:'uncertain',requestId:this.request.requestId,message:'Связь прервалась, результат заявки неизвестен'};}
      finally{clearTimeout(timer);this.pending=null;}
      return this.result;
    })();return this.pending;
  }
}
