'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STAGES=['KESİM','PRES','KORDON','BÜKÜM','DOĞRULTMA','GÖVDE KAYNAK','MONTAJ','ÇEVRE KAYNAK','FİTTİNGS KAYNAK','KULAK KULP KAYNAK','TANK TEMİZLİK','HİDROSTATİK TEST','BOYA','PAKETLEME','SEVKİYAT'];
const LITRES=[5,9,26,45,83,149,180,267];
let sb=null,session=null,profile=null,page='dashboard';
const cbsRecoveryOnArrival = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery' || new URLSearchParams(location.search).get('type') === 'recovery';
const cbsInviteOnArrival = new URLSearchParams(location.hash.slice(1)).get('type') === 'invite' || new URLSearchParams(location.search).get('type') === 'invite';
let state={orders:[],batches:[],serials:[],profiles:[],audit:[],processes:[],history:[]};
const writable=()=>['admin','editor'].includes(profile?.role),admin=()=>profile?.role==='admin';
function toast(s){const t=$('#toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),5500)}
function err(e){toast(e?.message||String(e))}
function check({error,data}){if(error)throw error;return data}
function initClient(){const cfg=window.CBS_CONFIG||{};const url=cfg.supabaseUrl||localStorage.getItem('cbs_url');const key=cfg.supabaseAnonKey||localStorage.getItem('cbs_key');if(!url||!key){$('#setup').classList.remove('hidden');return false}if(!window.supabase?.createClient){$('#setup').classList.remove('hidden');toast('Supabase kütüphanesi yüklenemedi; internet bağlantısını kontrol edin.');return false}sb=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true}});return true}
function loginScreen(){session=null;profile=null;$('#app').classList.add('hidden');$('#setPassword').classList.add('hidden');$('#passwordHelp').classList.add('hidden');$('#login').classList.remove('hidden')}

function showSetPassword(firstLogin=false){
  $('#login').classList.add('hidden'); $('#passwordHelp').classList.add('hidden');
  $('#app').classList.add('hidden'); $('#setPassword').classList.remove('hidden');
  const h=$('#setPassword h1'); if(h) h.textContent=firstLogin?'İlk Giriş: Kendi Şifrenizi Belirleyin':'Yeni Şifrenizi Oluşturun';
}
async function boot() {
  if (!initClient()) return;
  try {
    const { data: { session: s }, error } = await sb.auth.getSession();
    if (error) throw error;
    // Normal site ziyaretinde her zaman e-posta ve sifre giris ekrani acilir.
    // Yalnizca gercek sifre kurtarma/davet baglantilarinda sifre ekrani gosterilir.
    if (await handleInvitation()) return;
    loginScreen();
  } catch (e) {
    loginScreen();
    err(e);
  }
}

async function enter(s){const {data:authData,error:authError}=await sb.auth.getUser();if(authError)throw authError;if(authData?.user?.app_metadata?.cbs_must_change_password){session=s;showSetPassword(true);return;}session=s;const p=check(await sb.from('profiles').select('id,email,role,active').eq('id',s.user.id).maybeSingle());if(!p||!p.active) {await sb.auth.signOut();loginScreen();throw Error('Hesabınız aktif değil. Yöneticinize başvurun.')}profile=p;$('#login').classList.add('hidden');$('#setup').classList.add('hidden');$('#app').classList.remove('hidden');$('#who').textContent=p.email;$('#userEmail').textContent=p.email;$('#roleLabel').textContent=({admin:'Yönetici',editor:'Yetkili Personel',viewer:'Görüntüleyici'})[p.role];$('#usersNav').hidden=!admin();$('#auditNav').hidden=!admin();$('#newOrder').hidden=!writable();const processNav=document.querySelector('#menu [data-page="serials"]');if(processNav)processNav.textContent='⚙ Proses Takibi';await refresh();showPage('dashboard')}
async function refresh(){if(!session)return;const [o,b,s,p]=await Promise.all([sb.from('orders').select('*').order('id',{ascending:false}),sb.from('batches').select('*').order('id',{ascending:false}),sb.from('serials').select('*').order('id',{ascending:false}),sb.from('process_tracking').select('*')]);state.orders=check(o);state.batches=check(b);state.serials=check(s);state.processes=check(p);if(admin()){state.profiles=check(await sb.from('profiles').select('id,email,role,active,created_at').order('created_at'));state.history=check(await sb.from('production_history').select('*').order('created_at',{ascending:false}).limit(1000))}render()}
const isActiveOrder=id=>!order(id)?.archived_at;
const activeBatches=()=>state.batches.filter(b=>isActiveOrder(b.order_id));
const activeSerials=()=>state.serials.filter(s=>{const b=batch(s.batch_id);return b&&isActiveOrder(b.order_id)});
function order(id){return state.orders.find(o=>o.id===id)}function batch(id){return state.batches.find(b=>b.id===id)}function serialsFor(id){return state.serials.filter(s=>s.batch_id===id)}
function bar(b){return Number(b.pressure_bar||42)}
function batchLabel(b){return `${order(b.order_id)?.code||'?'} / ${b.litre} LT / ${bar(b)} BAR`}
function fmt(d){return d?new Date(d).toLocaleDateString('tr-TR'):'—'}
function reached(b,stage){return Number(state.processes.find(p=>p.batch_id===b.id&&p.process_name===stage)?.quantity||0)}
function quantities(b){return STAGES.map(st=>reached(b,st))}
function progress(b){const n=Number(b.target)||0;return n?Math.min(100,Math.round(100*quantities(b).reduce((sum,q)=>sum+Math.min(q,n),0)/(n*STAGES.length))):0}
function shipped(b){return reached(b,'SEVKİYAT')}
function waiting(b,i){const q=quantities(b);return Math.max(0,q[i]-(q[i+1]||0))}
function processTable(b){const q=quantities(b);return `<div class="tablewrap"><table><thead><tr><th>Proses</th><th>Ulaşan Adet</th><th>Bu Aşamada</th></tr></thead><tbody>${STAGES.map((st,i)=>`<tr><td>${i+1}. ${esc(st)}</td><td><b>${q[i]}</b></td><td>${i===STAGES.length-1?'—':waiting(b,i)}</td></tr>`).join('')}</tbody></table></div>`}
function options(a,selected){return a.map(x=>`<option value="${esc(x[0])}" ${String(x[0])===String(selected)?'selected':''}>${esc(x[1])}</option>`).join('')}
function ordersOptions(){return options(state.orders.filter(o=>!o.archived_at).map(o=>[o.id,o.code]))}
function batchesOptions(){return options(activeBatches().map(b=>[b.id,batchLabel(b)]))}
function summaryTable(){return `<div class="tablewrap"><table><thead><tr><th>Sipariş</th><th>Litre</th><th>Basınç</th><th>Plan</th><th>Sevk Edilen</th><th>İlerleme</th><th>Teslim</th></tr></thead><tbody>${activeBatches().map(b=>{const pct=progress(b);return `<tr><td><b>${esc(order(b.order_id)?.code)}</b></td><td>${b.litre} LT</td><td>${bar(b)} BAR</td><td>${b.target}</td><td>${shipped(b)}</td><td><div class="progress"><i style="width:${pct}%"></i></div><small>${pct}%</small></td><td>${esc(b.end_date||'—')}</td></tr>`}).join('')||'<tr><td colspan="7">Henüz üretim planı bulunmuyor.</td></tr>'}</tbody></table></div>`}
const localISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
let historyDate=localISO(new Date());
function historyTable(){const rows=state.history.filter(h=>!historyDate||localISO(new Date(h.created_at))===historyDate);return `<div class="tablewrap"><table><thead><tr><th>Tarih / Saat</th><th>Sipariş</th><th>Proses / İşlem</th><th>Adet</th></tr></thead><tbody>${rows.map(h=>`<tr><td>${esc(new Date(h.created_at).toLocaleString('tr-TR'))}</td><td>${esc(h.order_code)}${h.litre?' / '+h.litre+' LT':''}${h.pressure_bar?' / '+h.pressure_bar+' BAR':''}</td><td>${esc(h.process_name||h.action_type)}</td><td><b>${h.quantity_change==null?(h.new_quantity??'—'):(h.quantity_change>0?'+':'')+h.quantity_change}</b></td></tr>`).join('')||'<tr><td colspan="4">Bu tarihte kayıt bulunmuyor.</td></tr>'}</tbody></table></div>`}
async function logHistory({b=null,code=null,action,process=null,oldQty=null,newQty=null,change=null}){check(await sb.from('production_history').insert({batch_id:b?.id||null,order_code:code||order(b?.order_id)?.code||'—',litre:b?.litre||null,pressure_bar:b?bar(b):null,process_name:process,action_type:action,old_quantity:oldQty,new_quantity:newQty,quantity_change:change}))}
function render(){const planned=activeBatches().reduce((sum,b)=>sum+(Number(b.target)||0),0),delivered=activeBatches().reduce((sum,b)=>sum+shipped(b),0);$('#dashboard').innerHTML=`<div class="stats"><div class="stat"><div class="label">TOPLAM SİPARİŞ</div><div class="number">${state.orders.filter(o=>!o.archived_at).length}</div><div class="meta">Aktif sipariş</div></div><div class="stat"><div class="label">ÜRETİM GRUBU</div><div class="number">${activeBatches().length}</div><div class="meta">Litre bazlı plan</div></div><div class="stat"><div class="label">PLANLANAN TÜP</div><div class="number">${planned}</div><div class="meta">Toplam sipariş adedi</div></div><div class="stat"><div class="label">SEVK EDİLEN</div><div class="number">${delivered}</div><div class="meta">${planned?Math.round(delivered/planned*100):0}% sevkiyat</div></div></div><div class="panel"><h2>Üretim Durumu</h2>${summaryTable()}</div>`;
$('#orders').innerHTML=`${writable()?`<div class="panel"><h2>Sipariş Oluştur</h2><form id="orderForm" class="form"><label>Sipariş kodu<input name="code" placeholder="CBS317" maxlength="40" required></label><button class="btn">+ Sipariş Ekle</button></form></div><div class="panel"><h2>Sipariş Kodu Düzenle</h2><form id="renameForm" class="form"><label>Sipariş<select name="id" required>${ordersOptions()}</select></label><label>Yeni kod<input name="code" maxlength="40" required></label><button class="btn">Kaydet</button></form></div><div class="panel"><h2>Litre Grubu / Üretim Planı</h2><form id="batchForm" class="form"><label>Sipariş<select name="order_id" required>${ordersOptions()}</select></label><label>Litre<select name="litre">${options(LITRES.map(n=>[n,n+' LT']))}</select></label><label>Basınç türü<select name="pressure_bar" required><option value="42">42 BAR</option><option value="25">25 BAR</option></select></label><label>Planlanan adet<input type="number" name="target" min="0" required></label><label>Başlangıç<input type="date" name="start_date"></label><label>Bitiş<input type="date" name="end_date"></label><button class="btn">Planı Kaydet</button></form><p class="muted small">Aynı sipariş, litre ve basınç yeniden kaydedilirse mevcut plan güncellenir.</p></div>`:''}<div class="panel"><h2>Kayıtlı Üretim Planları</h2>${summaryTable()}</div>${admin()?`<div class="panel"><h2>Sipariş ve Üretim Grubu İşlemleri</h2><p class="muted small">Silme işlemi bağlı üretim gruplarını, proses adetlerini ve seri numaralarını da kalıcı olarak kaldırabilir. Tamamlanan siparişleri saklamak için arşivleyin.</p><div class="tablewrap"><table><thead><tr><th>Sipariş</th><th>İşlem</th></tr></thead><tbody>${state.orders.filter(o=>!o.archived_at).map(o=>`<tr><td>${esc(o.code)}</td><td><button type="button" class="btn secondary" data-archive-order="${o.id}">Arşivle</button> <button type="button" class="btn secondary" data-del-order="${o.id}">Sil</button></td></tr>`).join('')||'<tr><td colspan="2">Aktif sipariş yok.</td></tr>'}</tbody></table></div><h2>Üretim Grubu Silme</h2><div class="tablewrap"><table><thead><tr><th>Sipariş / Litre</th><th>İşlem</th></tr></thead><tbody>${activeBatches().map(b=>`<tr><td>${esc(order(b.order_id)?.code)} / ${b.litre} LT / ${bar(b)} BAR</td><td><button type="button" class="btn secondary" data-del-batch="${b.id}">Sil</button></td></tr>`).join('')||'<tr><td colspan="2">Üretim grubu yok.</td></tr>'}</tbody></table></div></div><div class="panel"><h2>Arşivlenen Siparişler</h2><div class="tablewrap"><table><thead><tr><th>Sipariş</th><th>Arşiv Tarihi</th><th>İşlem</th></tr></thead><tbody>${state.orders.filter(o=>o.archived_at).map(o=>`<tr><td>${esc(o.code)}</td><td>${fmt(o.archived_at)}</td><td><button type="button" class="btn secondary" data-restore-order="${o.id}">Geri Yükle</button></td></tr>`).join('')||'<tr><td colspan="3">Arşivlenmiş sipariş yok.</td></tr>'}</tbody></table></div></div>`:''}`;
$('#serials').innerHTML=`${writable()?`<div class="panel"><h2>Proses Adet Girişi</h2><p class="muted small">Her prosese ulaşan toplam tüp adedini girin. Önceki aşamalara eksik giriş varsa sistem onları da bu adede tamamlar.</p><form id="processForm" class="form"><label>Sipariş / Litre<select name="batch_id" required>${batchesOptions()}</select></label><label>Proses<select name="process_name" required>${options(STAGES.map(x=>[x,x]))}</select></label><label>Bu prosese ulaşan toplam adet<input type="number" name="quantity" min="0" step="1" required placeholder="25"></label><button class="btn">Proses Adedini Kaydet</button></form></div>`:''}<div class="panel"><h2>Üretimdeki Tüplerin Durumu</h2><p class="muted small">Ulaşan adet: bu prosese kadar gelen toplam tüp. Bu aşamada: bir sonraki prosese henüz geçmeyen tüp.</p>${activeBatches().map(b=>`<div class="panel"><h2>${esc(order(b.order_id)?.code)} / ${b.litre} LT / ${bar(b)} BAR · ${b.target} adet</h2><div class="progress"><i style="width:${progress(b)}%"></i></div><p class="muted">Genel proses ilerlemesi: <b>${progress(b)}%</b> · Sevk edilen: <b>${shipped(b)}</b></p>${processTable(b)}</div>`).join('')||'<p>Henüz üretim grubu bulunmuyor.</p>'}</div>`;
$('#board').innerHTML=`<div class="boardgrid">${activeBatches().map(b=>{const q=quantities(b),pct=progress(b);return `<div class="boardcard"><div class="boardcode">${esc(order(b.order_id)?.code)}</div><div class="boardlitre">${b.litre} LT · ${bar(b)} BAR</div><div class="muted">PLAN ${b.target} · SEVK ${shipped(b)}</div><div class="progress"><i style="width:${pct}%"></i></div><p class="muted"><b>${pct}% proses ilerlemesi</b> · ${esc(b.start_date||'—')} → ${esc(b.end_date||'—')}</p>${STAGES.map((st,i)=>q[i]||waiting(b,i)?`<div class="stage"><span>${esc(st)}</span><strong>${q[i]} ULAŞAN${i<STAGES.length-1?' · '+waiting(b,i)+' BEKLEYEN':''}</strong></div>`:'').join('')||'<p class="muted">Henüz proses adedi girilmedi.</p>'}</div>`}).join('')||'<div class="panel">Henüz üretim planı bulunmuyor.</div>'}</div>`;
$('#board').insertAdjacentHTML('afterbegin',`<div class="panel" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><h2 style="margin:0">Üretim Panosu</h2><p class="muted small" style="margin:5px 0 0">Ekranda görünen üretim durumunu PDF olarak kaydedin.</p></div><button type="button" id="boardPdf" class="btn">PDF Rapor Al</button></div>`);
 $('#users').innerHTML=admin()?`<div class="panel"><h2>+ Yeni Kullanıcı Davet Et</h2><p class="muted small">Geçerli bir e posta adresi girin.</p><form id="inviteForm" class="form"><label>E-posta adresi<input type="email" name="email" placeholder="ornek@gmail.com" required></label><label>Yetki<select name="role"><option value="viewer">Görüntüleyici</option><option value="editor">Yetkili Personel</option><option value="admin">Yönetici</option></select></label><button class="btn">+ Davet Gönder</button></form></div><div class="panel"><h2>Kullanıcı Yetkileri</h2><div class="tablewrap"><table><thead><tr><th>E-posta</th><th>Rol</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>${state.profiles.map(p=>`<tr><td>${esc(p.email)}${p.id===profile.id?' (Sen)':''}</td><td><select class="stage-select" data-role="${p.id}" ${p.id===profile.id?'disabled':''}>${options([['admin','Yönetici'],['editor','Yetkili Personel'],['viewer','Görüntüleyici']],p.role)}</select></td><td><label><input type="checkbox" data-active="${p.id}" ${p.active?'checked':''} ${p.id===profile.id?'disabled':''}> Aktif</label></td><td><button class="btn secondary" data-saveuser="${p.id}" ${p.id===profile.id?'disabled':''}>Kaydet</button> <button type="button" class="btn secondary" data-reset-user="${p.id}" ${p.id===profile.id?'disabled':''}>Geçici Şifre</button> <button type="button" class="btn secondary" data-delete-user="${p.id}" ${p.id===profile.id?'disabled':''}>Hesabı Sil</button></td></tr>`).join('')}</tbody></table></div></div>`:'';
 $('#audit').innerHTML=admin()?`<div class="panel"><h2>Günlük İşlem Geçmişi</h2><p class="muted small">Yalnızca sipariş yönetimi ve proses girişleri. Tarih seçerek geçmişi inceleyebilirsiniz. Adet, proses için yapılan net değişimdir.</p><label>Tarih seçin <input id="historyDate" type="date" value="${esc(historyDate)}"></label><button type="button" class="btn secondary" id="historyAll">Tüm Tarihler</button><div id="historyRows">${historyTable()}</div></div>`:
$$('section#dashboard,section#orders,section#serials,section#board,section#users,section#audit').forEach(x=>x.classList.toggle('hidden',x.id!==page));}
function showPage(p){if((p==='users'||p==='audit')&&!admin())return;page=p;$$('#menu [data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===p));const names={dashboard:'Genel Bakış',orders:'Sipariş Yönetimi',serials:'Proses Takibi',board:'Üretim Panosu',users:'Kullanıcı Yönetimi',audit:'İşlem Geçmişi'};$('#title').textContent=names[p];$$('section#dashboard,section#orders,section#serials,section#board,section#users,section#audit').forEach(x=>x.classList.toggle('hidden',x.id!==p))}
async function mutation(fn){if(!writable())throw Error('Bu işlem için yetkiniz yok.');await fn();await refresh();toast('Kayıt başarıyla güncellendi.')}
async function submitForm(form){const fd=new FormData(form),obj=Object.fromEntries(fd.entries());switch(form.id){case 'orderForm':case 'quickOrder':await mutation(async()=>{check(await sb.from('orders').insert({code:obj.code.trim().toUpperCase()}));await logHistory({code:obj.code.trim().toUpperCase(),action:'Sipariş oluşturuldu'})});$('#modal').close();break;
case 'renameForm':await mutation(async()=>{const previous=order(Number(obj.id));check(await sb.from('orders').update({code:obj.code.trim().toUpperCase()}).eq('id',Number(obj.id)));await logHistory({code:obj.code.trim().toUpperCase(),action:`Sipariş kodu değiştirildi (${previous?.code||'—'})`})});break;
case 'batchForm':{const rec={order_id:Number(obj.order_id),litre:Number(obj.litre),pressure_bar:Number(obj.pressure_bar),target:Number(obj.target),start_date:obj.start_date||null,end_date:obj.end_date||null};if(rec.start_date&&rec.end_date&&rec.end_date<rec.start_date)throw Error('Bitiş tarihi başlangıçtan önce olamaz.');await mutation(async()=>{const previous=state.batches.find(b=>b.order_id===rec.order_id&&b.litre===rec.litre&&bar(b)===rec.pressure_bar);const saved=check(await sb.from('batches').upsert(rec,{onConflict:'order_id,litre,pressure_bar'}).select('*').single());await logHistory({b:saved,action:previous?'Üretim planı güncellendi':'Üretim planı oluşturuldu',oldQty:previous?.target??null,newQty:rec.target,change:previous?rec.target-Number(previous.target):rec.target})});break}
case 'processForm':{const b=batch(Number(obj.batch_id));if(!b)throw Error('Üretim grubu bulunamadı.');const index=STAGES.indexOf(obj.process_name),quantity=Number(obj.quantity),target=Number(b.target)||0;if(index<0||!Number.isInteger(quantity)||quantity<0)throw Error('Geçerli bir proses ve adet seçin.');if(quantity>target)throw Error(`Girilen adet (${quantity}), sipariş adedini (${target}) geçemez.`);const q=quantities(b);if(index<STAGES.length-1&&quantity<q[index+1])throw Error('Sonraki prosese ulaşan adetten daha düşük değer giremezsiniz.');const records=[];for(let i=0;i<=index;i++){const next=i===index?quantity:Math.max(q[i],quantity);if(next!==q[i])records.push({batch_id:b.id,process_name:STAGES[i],quantity:next,updated_at:new Date().toISOString()})}if(index===0&&q[0]===quantity)records.push({batch_id:b.id,process_name:STAGES[0],quantity,updated_at:new Date().toISOString()});if(index>0&&q[index]===quantity)records.push({batch_id:b.id,process_name:STAGES[index],quantity,updated_at:new Date().toISOString()});await mutation(async()=>{if(records.length)check(await sb.from('process_tracking').upsert(records,{onConflict:'batch_id,process_name'}));if(quantity!==q[index])await logHistory({b,action:'Proses adedi güncellendi',process:obj.process_name,oldQty:q[index],newQty:quantity,change:quantity-q[index]})});break}
case 'serialForm':await mutation(async()=>check(await sb.from('serials').insert({batch_id:Number(obj.batch_id),serial:obj.serial.trim().toUpperCase(),stage:obj.stage})));break;}}
function cbsConfirm(message){
  return new Promise(resolve=>{
    const overlay=document.createElement('div');
    overlay.setAttribute('role','presentation');
    overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(3,12,28,.78);display:flex;align-items:center;justify-content:center;padding:20px';
    const panel=document.createElement('div');
    panel.setAttribute('role','alertdialog');
    panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-label','İşlem onayı');
    panel.style.cssText='background:#14263b;color:#fff;border:1px solid #46748a;border-radius:14px;padding:24px;width:min(440px,100%);box-shadow:0 20px 70px #0009;font:inherit';
    const title=document.createElement('h2');title.textContent='İşlemi onayla';title.style.margin='0 0 14px';
    const msg=document.createElement('p');msg.textContent=message;msg.style.cssText='line-height:1.55;white-space:pre-wrap;margin:0 0 22px';
    const actions=document.createElement('div');actions.style.cssText='display:flex;justify-content:flex-end;gap:12px;flex-wrap:wrap';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='İptal';cancel.style.cssText='padding:11px 18px;border-radius:8px;border:1px solid #698296;background:#263b50;color:white;cursor:pointer';
    const ok=document.createElement('button');ok.type='button';ok.textContent='Evet, onaylıyorum';ok.style.cssText='padding:11px 18px;border-radius:8px;border:0;background:#b93241;color:white;font-weight:700;cursor:pointer';
    const finish=value=>{document.removeEventListener('keydown',onKey);overlay.remove();resolve(value)};
    const onKey=e=>{if(e.key==='Escape'){e.preventDefault();finish(false)}};
    cancel.addEventListener('click',()=>finish(false));ok.addEventListener('click',()=>finish(true));
    overlay.addEventListener('click',e=>{if(e.target===overlay)finish(false)});
    actions.append(cancel,ok);panel.append(title,msg,actions);overlay.append(panel);document.body.append(overlay);
    document.addEventListener('keydown',onKey);cancel.focus();
  });
}
function exportBoardPDF(){
  const board=$('#board');
  if(!board){toast('Üretim panosu bulunamadı.');return}
  const cards=board.querySelector('.boardgrid');
  if(!cards){toast('Üretim panosu henüz hazır değil.');return}
  const win=window.open('','_blank');
  if(!win){toast('PDF penceresi engellendi. Tarayıcıda açılır pencerelere izin verin.');return}
  const now=new Date().toLocaleString('tr-TR');
  const content=cards.cloneNode(true);
  content.querySelectorAll('button,script,input,select').forEach(el=>el.remove());
  const html=`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>CBS Üretim Panosu - ${esc(now)}</title><style>
  *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#152334;background:white;margin:0;padding:22px;font-size:12px}
  header{border-bottom:3px solid #163d58;padding-bottom:12px;margin-bottom:18px}h1{font-size:23px;margin:0 0 6px}header p{margin:0;color:#596a7c}
  .boardgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}
  .boardcard{border:1px solid #cdd8e1;border-radius:10px;padding:15px;break-inside:avoid;page-break-inside:avoid;min-width:0}
  .boardcode{font-size:21px;font-weight:800;color:#153d58}.boardlitre{font-size:17px;font-weight:bold;margin:5px 0 9px}
  .muted{color:#546579;font-size:11px}.progress{height:12px;background:#e4ebf1;border-radius:20px;overflow:hidden;margin:10px 0}
  .progress i{display:block;height:100%;background:#1586a8;border-radius:20px}
  .stage{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e1e8ed;padding:7px 0;font-size:11px}
  .stage span{flex:1}.stage strong{text-align:right;white-space:normal}p{line-height:1.4}
  footer{font-size:10px;color:#617083;border-top:1px solid #dae1e7;margin-top:18px;padding-top:9px}
  @page{size:A4 landscape;margin:12mm}
  @media print{body{padding:0}.boardgrid{gap:12px}.boardcard{print-color-adjust:exact;-webkit-print-color-adjust:exact}.progress,.progress i{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  @media(max-width:620px){.boardgrid{grid-template-columns:1fr}}
  </style></head><body><header><h1>ÇUKUROVA BOMBE SANAYİ</h1><p>Üretim Panosu Raporu · ${esc(now)}</p></header>${content.outerHTML}<footer>Üretim Panosu · Görüntülenen aktif üretim grupları</footer><script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),250)});<\/script></body></html>`;
  win.document.open();win.document.write(html);win.document.close();
}
function showTemporaryPassword(email,password){
  const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;z-index:100000;background:#000b;display:flex;align-items:center;justify-content:center;padding:20px';
  const panel=document.createElement('div');panel.style.cssText='background:#14263b;color:white;border-radius:16px;padding:26px;width:min(460px,100%);box-shadow:0 20px 60px #0009';
  const title=document.createElement('h2');title.textContent='Personel hesabı oluşturuldu';
  const description=document.createElement('p');description.textContent='Bu geçici şifre yalnızca şimdi gösterilir. Güvenli şekilde personele iletin.';
  const details=document.createElement('p');details.style.cssText='overflow-wrap:anywhere;line-height:1.8';
  const emailLabel=document.createElement('strong');emailLabel.textContent=email;
  const pass=document.createElement('code');pass.textContent=password;pass.style.cssText='display:block;background:#263e54;padding:12px;border-radius:8px;font-size:18px;user-select:all;margin-top:8px';
  details.append(emailLabel,pass);
  const copy=document.createElement('button');copy.type='button';copy.className='btn';copy.textContent='Şifreyi Kopyala';copy.onclick=async()=>{try{await navigator.clipboard.writeText(password);copy.textContent='Kopyalandı ✓'}catch(_){toast('Şifreyi seçip kopyalayın.')}};
  const close=document.createElement('button');close.type='button';close.className='btn secondary';close.textContent='Kapattım';close.style.marginLeft='10px';close.onclick=()=>overlay.remove();
  panel.append(title,description,details,copy,close);overlay.append(panel);document.body.append(overlay);
}
function exportCSV(){const rows=[['Sipariş','Litre','Basınç (BAR)','Plan','Başlangıç','Bitiş','Proses','Ulaşan Adet','Bu Aşamada Bekleyen','İlerleme %']];for(const b of activeBatches()){const q=quantities(b);STAGES.forEach((st,i)=>rows.push([order(b.order_id)?.code||'',b.litre,bar(b),b.target,b.start_date||'',b.end_date||'',st,q[i],i===STAGES.length-1?'':waiting(b,i),progress(b)]))}const csv='\ufeff'+rows.map(r=>r.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='CBS_Proses_Takip_Raporu.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
document.addEventListener('submit',async e=>{const form=e.target;if(form.id==='setupForm'){e.preventDefault();const url=$('#supabaseUrl').value.trim(),key=$('#supabaseKey').value.trim();if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)){err(Error('Supabase proje URL adresini kontrol edin.'));return}localStorage.setItem('cbs_url',url.replace(/\/$/,''));localStorage.setItem('cbs_key',key);location.reload();return}if(form.id==='loginForm'){e.preventDefault();$('#loginError').textContent='';try{const result=await sb.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});const d=check(result);await enter(d.session)}catch(ex){$('#loginError').textContent=ex.message}return}if(form.id==='inviteForm'){e.preventDefault();if(!admin()){err(Error('Yalnızca yöneticiler kullanıcı davet edebilir.'));return}const fd=new FormData(form);const email=String(fd.get('email')||'').trim().toLowerCase(),role=String(fd.get('role')||'viewer');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email)){err(Error('Geçerli bir e-posta adresi girin.'));return}const btn=form.querySelector('button[type=submit]');
  if(btn){btn.disabled=true;btn.textContent='Davet gönderiliyor...'}
  try{
    const {data,error}=await sb.functions.invoke('cbs-invite-user',{body:{email,role}});
    if(error){
      let message=error.message||'Davet gönderilemedi.';
      if(error.context&&typeof error.context.json==='function'){
        try{const detail=await error.context.json();message=detail.error||detail.message||message}catch(_e){}
      }
      throw Error(message);
    }
    if(!data?.ok)throw Error(data?.error||'Davet gönderilemedi.');
    form.reset();
    const temp=data.temporaryPassword;
    if(!temp) throw Error('Kullanıcı oluşturuldu fakat geçici şifre alınamadı.');
    showTemporaryPassword(email,temp);
    try{await refresh()}catch(refreshError){console.warn('Davet gönderildi fakat liste yenilenemedi:',refreshError)}
  }catch(ex){
    err(ex);
    let box=form.querySelector('[data-invite-error]');
    if(!box){box=document.createElement('p');box.dataset.inviteError='';box.setAttribute('role','alert');box.style.cssText='color:#b91c1c;font-weight:600;width:100%;margin:8px 0';form.append(box)}
    box.textContent=ex.message||'Davet gönderilemedi.';
  }finally{if(btn){btn.disabled=false;btn.textContent='+ Davet Gönder'}}
  return}if(['orderForm','quickOrder','renameForm','batchForm','serialForm','processForm'].includes(form.id)){e.preventDefault();try{await submitForm(form)}catch(ex){err(ex)}}});
// Hesap silme ve geçici şifre yenileme yalnızca sunucu tarafında yetki kontrolünden geçer.
document.addEventListener('click', async e => {
  const button = e.target.closest('[data-delete-user],[data-reset-user]');
  if (!button) return;
  e.preventDefault();
  if (!admin()) { err(Error('Bu işlem yalnızca yöneticilere açıktır.')); return; }
  const userId = button.dataset.deleteUser || button.dataset.resetUser;
  if (userId === profile.id) { err(Error('Kendi hesabınız üzerinde bu işlemi yapamazsınız.')); return; }
  const target = state.profiles.find(p => p.id === userId);
  if (!target) { err(Error('Kullanıcı bulunamadı.')); return; }
  const deleting = !!button.dataset.deleteUser;
  const message = deleting
    ? `${target.email} hesabı kalıcı olarak silinecek. Bu kullanıcı artık giriş yapamayacak. Emin misiniz?`
    : `${target.email} için eski şifre geçersiz olacak ve yeni geçici şifre üretilecek. Devam edilsin mi?`;
  if (!await cbsConfirm(message)) return;
  button.disabled = true;
  try {
    const { data, error } = await sb.functions.invoke('cbs-invite-user', {
      body: { action: deleting ? 'delete_user' : 'reset_user_password', userId }
    });
    if (error) {
      let msg = error.message || 'İşlem başarısız.';
      if (error.context?.json) { try { const detail = await error.context.json(); msg = detail.error || msg; } catch (_) {} }
      throw Error(msg);
    }
    if (!data?.ok) throw Error(data?.error || 'İşlem başarısız.');
    if (deleting) { await refresh(); toast('Kullanıcı hesabı silindi.'); }
    else if (data.temporaryPassword) showTemporaryPassword(target.email, data.temporaryPassword);
    else throw Error('Şifre güncellendi fakat geçici şifre görüntülenemedi.');
  } catch (ex) { err(ex); }
  finally { button.disabled = false; }
});
document.addEventListener('click',async e=>{const nav=e.target.closest('[data-page]');if(nav){showPage(nav.dataset.page);return}if(e.target.closest('#newOrder')){$('#modal').showModal();return}if(e.target.closest('#close')){$('#modal').close();return}if(e.target.closest('#reload')){try{await refresh();toast('Veriler yenilendi.')}catch(ex){err(ex)}return}if(e.target.closest('#historyAll')){historyDate='';const input=$('#historyDate');if(input)input.value='';const rows=$('#historyRows');if(rows)rows.innerHTML=historyTable();return}if(e.target.closest('#boardPdf')){exportBoardPDF();return}if(e.target.closest('#export')){exportCSV();return}if(e.target.closest('#logout')){await sb.auth.signOut();loginScreen();return}const action=e.target.closest('[data-archive-order],[data-restore-order],[data-del-order],[data-del-batch],[data-del-serial]');if(action){if(!admin()){err(Error('Yalnızca yöneticiler bu işlemi yapabilir.'));return}try{const ds=action.dataset;let table,id,verb,label,body=null;if(ds.archiveOrder){table='orders';id=Number(ds.archiveOrder);verb='arşivle';label=order(id)?.code;body={archived_at:new Date().toISOString()}}else if(ds.restoreOrder){table='orders';id=Number(ds.restoreOrder);verb='geri yükle';label=order(id)?.code;body={archived_at:null}}else if(ds.delOrder){table='orders';id=Number(ds.delOrder);verb='sil';label=order(id)?.code;}else if(ds.delBatch){table='batches';id=Number(ds.delBatch);verb='sil';const b=batch(id);label=`${order(b?.order_id)?.code} / ${b?.litre} LT / ${bar(b)} BAR`;}else{table='serials';id=Number(ds.delSerial);verb='sil';label=state.serials.find(s=>s.id===id)?.serial}if(!Number.isFinite(id)||!label)throw Error('Kayıt bulunamadı.');if(!await cbsConfirm(verb==='sil'?`${label} kaydını silmek istediğinize emin misiniz? Bağlı üretim grupları, proses adetleri ve seri numaraları da silinebilir. Bu işlem geri alınamaz.`:`${label} kaydını ${verb==='arşivle'?'arşivlemek':'geri yüklemek'} istediğinize emin misiniz?`))return;let q=body?sb.from(table).update(body).eq('id',id):sb.from(table).delete().eq('id',id);check(await q.select('id').single());if(table!=='serials')await logHistory({code:table==='orders'?label:order(batch(id)?.order_id)?.code||label,action:table==='orders'?(verb==='sil'?'Sipariş silindi':verb==='arşivle'?'Sipariş arşivlendi':'Sipariş geri yüklendi'):'Üretim grubu silindi'});await refresh();toast(`İşlem başarılı: ${label}`)}catch(ex){err(ex)}return}const save=e.target.closest('[data-saveuser]');if(save&&admin()){const id=save.dataset.saveuser;if(id===profile.id)return;const role=document.querySelector(`[data-role="${id}"]`).value;const active=document.querySelector(`[data-active="${id}"]`).checked;try{check(await sb.from('profiles').update({role,active}).eq('id',id));await refresh();toast('Kullanıcı yetkisi güncellendi.')}catch(ex){err(ex)}}});
document.addEventListener('change',async e=>{if(e.target.id==='historyDate'){historyDate=e.target.value;$('#historyRows').innerHTML=historyTable();return}const sel=e.target.closest('[data-stage]');if(!sel)return;const s=state.serials.find(x=>x.id===Number(sel.dataset.stage));if(!s)return;try{await mutation(async()=>check(await sb.from('serials').update({stage:sel.value,updated_at:new Date().toISOString()}).eq('id',s.id)))}catch(ex){sel.value=s.stage;err(ex)}});

async function handleInvitation() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);

  const isInvite = hash.get('type') === 'recovery' || query.get('type') === 'recovery' || hash.get('type') === 'invite' ||
                   query.get('type') === 'invite' ||
                   hash.has('access_token') ||
                   query.has('token_hash');

  if (!isInvite && !cbsInviteOnArrival && !cbsRecoveryOnArrival) return false;

  const { data: { session: inviteSession } } =
    await sb.auth.getSession();

  if (!inviteSession) return false;

  showSetPassword(!!inviteSession.user?.app_metadata?.cbs_must_change_password);
  return true;
}

document.addEventListener('submit', async e => {
  if (e.target.id !== 'setPasswordForm') return;
  e.preventDefault();

  const password = document.querySelector('#newPassword').value;
  const confirm = document.querySelector('#confirmPassword').value;
  const errorBox = document.querySelector('#setPasswordError');
  errorBox.textContent = '';

  if (password !== confirm) {
    errorBox.textContent = 'Şifreler eşleşmiyor.';
    return;
  }

  try {
    const firstLogin = !!(await sb.auth.getUser()).data.user?.app_metadata?.cbs_must_change_password;
    if (firstLogin) {
      const { data, error } = await sb.functions.invoke('cbs-invite-user', { body: { action: 'complete_first_login', newPassword: password } });
      if (error || !data?.ok) throw Error(data?.error || error?.message || 'Şifre güncellenemedi.');
      await sb.auth.refreshSession();
    } else {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
    }

    history.replaceState(null, '', location.pathname);
    document.querySelector('#setPassword').classList.add('hidden');
    toast('Şifreniz oluşturuldu. Hoş geldiniz!');
    await enter((await sb.auth.getSession()).data.session);
  } catch (error) {
    errorBox.textContent = error.message;
  }
});

boot();

// CBS: Giriş ekranından yalnızca davetli kullanıcılar için şifre oluşturma/yenileme.
document.addEventListener('click', function(e) {
  if (e.target.closest('#showPasswordHelp')) {
    document.querySelector('#login').classList.add('hidden');
    document.querySelector('#passwordHelp').classList.remove('hidden');
    document.querySelector('#passwordHelpEmail').value = document.querySelector('#email')?.value || '';
  }
  if (e.target.closest('#backToLogin')) {
    document.querySelector('#passwordHelp').classList.add('hidden');
    document.querySelector('#login').classList.remove('hidden');
  }
});
document.addEventListener('submit', async function(e) {
  if (e.target.id !== 'passwordHelpForm') return;
  e.preventDefault();
  const message = document.querySelector('#passwordHelpMessage');
  const email = document.querySelector('#passwordHelpEmail').value.trim();
  const button = e.target.querySelector('button[type="submit"]');
  message.textContent = '';
  button.disabled = true;
  button.textContent = 'Gönderiliyor...';
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname
    });
    if (error) throw error;
    message.textContent = 'Bu adres için hesap varsa şifre oluşturma bağlantısı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.';
  } catch (ex) {
    message.textContent = ex.message || 'Bağlantı gönderilemedi.';
  } finally {
    button.disabled = false;
    button.textContent = 'Şifre Bağlantısı Gönder';
  }
});

// Oturum açmış personelin şifresini değiştirme ekranı
function showAccountPassword(){
  const panel=$('#accountPasswordPanel'); if(!panel)return;
  panel.classList.remove('hidden'); $('#accountPasswordError').textContent='';
  panel.scrollIntoView({behavior:'smooth',block:'center'});
}
document.addEventListener('click',e=>{
  if(e.target.closest('#changeMyPassword')){showAccountPassword();return}
  if(e.target.closest('#cancelAccountPassword')){$('#accountPasswordPanel').classList.add('hidden');return}
});
document.addEventListener('submit',async e=>{
  if(e.target.id!=='accountPasswordForm')return;
  e.preventDefault();
  const box=$('#accountPasswordError');box.textContent='';
  const old=$('#accountOldPassword').value, next=$('#accountNewPassword').value, repeat=$('#accountRepeatPassword').value;
  if(next.length<8||next!==repeat){box.textContent='Yeni şifre en az 8 karakter olmalı ve tekrar ile eşleşmeli.';return}
  const button=e.target.querySelector('button[type=submit]');button.disabled=true;
  try{
    const user=check(await sb.auth.getUser()).user;
    check(await sb.auth.signInWithPassword({email:user.email,password:old}));
    check(await sb.auth.updateUser({password:next}));
    e.target.reset();$('#accountPasswordPanel').classList.add('hidden');toast('Şifreniz değiştirildi.');
  }catch(ex){box.textContent=ex.message||'Şifre değiştirilemedi.'}
  finally{button.disabled=false}
});
