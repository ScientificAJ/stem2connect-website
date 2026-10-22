import { api } from '../api.js';
import { createTemplate } from '../template.js';
import { downloadResponsesXlsx } from '../xlsx.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const attr = esc;
const uid = () => `field_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
const state = { token:null, expiresAt:0, user:null, forms:[], quota:null, envelope:null, config:null, title:'', slug:'', tab:'page', emailKind:'confirmation', dirty:false, preview:false, mobilePreview:false, previewScreen:'page', responsePage:0, responseData:null, emailLogs:null, versions:null, pending:false, timer:null };
const nav = [ ['page','◇','The invitation','CREATE'], ['design','◐','Design & layout',''], ['fields','☷','Registration fields',''], ['emails','✉','Emails & reminders',''], ['responses','▤','Responses','MANAGE'], ['publishing','↗','Publish & versions',''], ['advanced','⌘','Advanced & backup',''] ];
const tokens = ['name','eventTitle','speakerName','speakerRole','speakerOrganization','eventDate','eventTime','timeZone','meetingUrl','meetingId','location','contactEmail'];
const sectionNames = { meta:'Page identity',brand:'Brand & navigation',hero:'Your invitation',event:'Date, time & meeting',speaker:'Meet the speaker',reading:'Recommended reading',game:'Interactive game',takeaways:'What attendees take away',extras:'Additional sections',closing:'Closing invitation',form:'Registration & confirmation',emails:'Emails & reminders' };
const friendly = {
  startUtc:'Event start · UTC',timeZone:'Event time zone',displayDate:'Date shown on the page',displayTime:'Time shown on the page',meetingUrl:'Meeting link',meetingId:'Meeting ID',calendarTitle:'Calendar event title',calendarDescription:'Calendar description',imageUrl:'Photo URL',imageAlt:'Photo alternative text',emailImageData:'Email photo',profileUrl:'Speaker profile link',homeUrl:'Home page link',logoUrl:'Logo URL',headerCta:'Header button text',contactEmail:'Contact email',contactLabel:'Contact link text',titleAccent:'Handwritten part of title',titlePaper:'Full paper title',emailHeading:'Email reading heading',emailDescription:'Reading text · confirmation and day before',emailShortDescription:'Reading text · shortly before the event',registrationOpen:'Accept registrations',maxResponses:'Maximum registrations',showClosingCountdown:'Show the small red closing countdown',consentText:'Required consent statement',consentVersion:'Consent version',privacyText:'Privacy note',requiredNote:'Required fields note',successKicker:'Success · small heading',successTitle:'Success · main heading',successAccent:'Success · handwritten heading',successDescription:'Success · message',meetingKicker:'Meeting · small heading',meetingLinkLabel:'Meeting button text',meetingCopyLabel:'Meeting link label',meetingCopyButton:'Copy link button text',calendarLabel:'Calendar button text',bottomBrand:'Form footer · brand',bottomTagline:'Form footer · tagline',closedMessage:'Message when registration is closed',noindex:'Ask search engines not to index this page',minutesBefore:'Send this many minutes before the event',windowMinutes:'Sending window in minutes',replyTo:'Reply-to email',senderName:'Sender display name',showSpeaker:'Include speaker photo and details',showReading:'Include recommended reading',attachCalendar:'Attach calendar invitation to confirmation',footerTagline:'Footer tagline',sessionFormat:'Session format',optionalHeading:'Optional fields · heading',optionalLabel:'Optional fields · label',submitLabel:'Registration button text',jumpLabel:'Reading shortcut text',jumpHint:'Reading shortcut hint',paperLabel:'Paper section label',guideTitle:'Reading guide title',guideText:'Reading guide text',linkLabel:'Link label',sourceLabel:'Source credit text',sourceUrl:'Source credit link',maxLength:'Maximum answer length',semantic:'Answer purpose',schemaVersion:'Template version'
};
const help = {
  'event.startUtc':'The actual start instant in UTC, ending in Z. Example: 2026-10-23T00:00:00Z. Reminders and calendar invitations use this value.',
  'event.timeZone':'Use a time zone name such as America/Los_Angeles or Asia/Kolkata. The display labels below remain yours to edit.',
  'event.displayDate':'Check this matches the actual start date in the event’s time zone.',
  'event.displayTime':'Include the correct daylight-saving label, for example 5:00 PM PDT.',
  'event.meetingUrl':'Shown after successful registration and included in enabled emails.',
  'speaker.emailImageData':'Upload a portrait below for an email-safe, compact copy. A normal photo URL can also be used.',
  'emails.enabled':'When on, publishing activates the email types you enable below. Draft edits do not alter the live form.',
  'emails.replyTo':'Replies from participants go to this address. Delivery still uses the team’s configured Google account.',
  'form.registrationOpen':'Turn off and publish to close registration without deleting the page or its responses.',
  'form.consentVersion':'Change this when the meaning of your consent statement changes. Each response preserves the version accepted.',
  'meta.noindex':'Recommended for a registration page shared directly with attendees.',
  'game.type':'The tested Race to 10 game is preserved. You can edit its surrounding copy or switch it off.',
  'reading.emailHeading':'Recommended wording: “Optional, recommended pre-webinar reading”.',
  'reading.emailShortDescription':'Keep this brief. Encourage reading before the event without making anyone late.',
};
const textLike = /description|introduction|privacy|consentText|successDescription|guideText|context|subtitle|body|question|message|text$|rules|explanation/i;
let notificationTimer;
const openSections=new Set(['hero','event','form','fields']);

function notify(message, error = false) {
  const el = $('#notification'); el.textContent = message; el.classList.toggle('error', error); el.hidden = false;
  clearTimeout(notificationTimer); notificationTimer = setTimeout(() => { el.hidden = true; }, error ? 11000 : 6500);
}
function errorMessage(error) { return error?.message || 'Something went wrong. Please try again.'; }
async function call(action, args = {}) {
  const requestToken = state.token;
  try {
    const data = await api(action, { ...args, ...(requestToken ? { token:requestToken } : {}) });
    // A completed request from a signed-out session must not rebuild private UI.
    if (state.token !== requestToken) throw Object.assign(new Error('This session has ended. Sign in again to continue.'), { code:'session_changed' });
    return data;
  }
  catch (error) {
    if (state.token !== requestToken) throw Object.assign(new Error('This session has ended. Sign in again to continue.'), { code:'session_changed' });
    if (error.code === 'unauthorized' && action !== 'login' && state.token === requestToken) {
      const hadUnsaved = state.dirty;
      if (hadUnsaved) downloadJSON(state.config, `unsaved-${state.slug || 'form'}.json`);
      clearSession(); notify(hadUnsaved ? 'Your session expired. Sign in again. A recovery download of your unsaved draft was started.' : 'Your session expired. Please sign in again.', true);
    }
    throw error;
  }
}
async function busy(button, task) {
  if (button?.disabled) return;
  const original = button?.textContent;
  if (button) { button.disabled = true; button.setAttribute('aria-busy','true'); }
  try { return await task(); }
  catch(error) { if (error.code !== 'session_changed') notify(errorMessage(error), true); }
  finally { if (button?.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); if (button.textContent === 'Working…') button.textContent = original; } }
}
function clearSession() {
  clearTimeout(state.timer); clearTimeout(previewTimer); clearTimeout(notificationTimer);
  Object.assign(state, { token:null, expiresAt:0, user:null, forms:[], quota:null, envelope:null, config:null, title:'', slug:'', tab:'page', emailKind:'confirmation', dirty:false, preview:false, mobilePreview:false, previewScreen:'page', responsePage:0, responseData:null, emailLogs:null, versions:null, pending:false, timer:null });
  // Hidden editor HTML can still contain participant answers and meeting details.
  $('#studio-dialog').close();
  for (const selector of ['#editor-content','#editor-nav','#dialog-content','#form-list','#dashboard-stats','#form-count','#active-title','#save-state','#notification','#login-status']) $(selector).textContent='';
  $('#notification').hidden=true; $('#notification').classList.remove('error'); $('#login-status').classList.remove('error'); $('#save-state').style.color='';
  $('#form-search').value=''; $('#logout').hidden=true;
  $('#password').value=''; $('#password').type='password'; $('#toggle-password').textContent='Show'; $('#toggle-password').setAttribute('aria-label','Show password');
  // Replacing the iframe discards its document and copied draft, including the confirmation screen.
  const oldPreview=$('#page-preview'), freshPreview=oldPreview.cloneNode(false);
  freshPreview.addEventListener('load',sendPreview); oldPreview.replaceWith(freshPreview);
  $('#preview-screen').value='page'; updatePreviewPanel();
  // Remove pending transport documents containing request payloads from this page.
  $$('form[target^="studio-"], iframe[name^="studio-"]').forEach(element=>element.remove());
  showView('login');
}
function showView(name) {
  for (const view of ['login','dashboard','editor']) $(`#${view}-view`).hidden = name !== view;
  if (name === 'editor') state.preview = window.matchMedia('(min-width: 941px)').matches;
  else state.preview = false;
  window.scrollTo({ top:0, behavior:'instant' });
}
function dateLabel(iso) { if (!iso) return 'Not yet published'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString(undefined, { dateStyle:'medium',timeStyle:'short' }); }
function markDirty() {
  state.dirty = true; updateSaveState(); sendPreviewSoon();
}
function updateSaveState() {
  $('#active-title').textContent = state.title || 'Untitled invitation';
  const isLive=state.envelope?.status==='published';
  const savedChanges=isLive&&Number(state.envelope.revision)>Number(state.envelope.publishedRevision);
  $('#save-state').textContent=state.dirty?'● Unsaved edits'+(isLive?' · live page unchanged':''):savedChanges?'Published · newer draft changes saved':isLive?'Published · draft matches the live edition':`Saved ${state.envelope?.status||'draft'} · revision ${state.envelope?.revision??'—'}`;
  $('#save-state').style.color = state.dirty ? '#a36b23' : '';
}
function safeURL(value) {
  try { const url = new URL(value, location.href); return ['https:','http:'].includes(url.protocol) && (url.protocol === 'https:' || ['localhost','127.0.0.1'].includes(url.hostname)) ? url.href : '#'; }
  catch { return '#'; }
}
function publicURL() { return state.envelope?.publicUrl || new URL(`../?form=${encodeURIComponent(state.envelope?.slug || state.slug)}`, location.href).href; }
function downloadBlob(blob, filename) { const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
function downloadJSON(value,filename) { downloadBlob(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),filename); }

$('#toggle-password').addEventListener('click', () => { const input=$('#password'); const show=input.type==='password';input.type=show?'text':'password';$('#toggle-password').textContent=show?'Hide':'Show';$('#toggle-password').setAttribute('aria-label',show?'Hide password':'Show password'); });
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form=event.currentTarget; const status=$('#login-status');const button=$('button[type=submit]',form);
  status.textContent='Checking team access…';status.classList.remove('error');button.disabled=true;
  try {
    const data=await api('login',{username:form.elements.username.value.trim(),password:form.elements.password.value});
    form.elements.password.value='';
    if (!data?.token) throw new Error('The server did not return a secure session. Please try again.');
    state.token=data.token;state.expiresAt=Date.parse(data.expiresAt)||Number(data.expiresAt)||0;state.user=data.user;state.quota=data.quota;
    $('#logout').hidden=false;status.textContent='';await loadDashboard();
  } catch(error) { status.textContent=errorMessage(error);status.classList.add('error'); }
  finally{button.disabled=false;}
});
$('#logout').addEventListener('click', () => busy($('#logout'), async()=> {
  if (!(await allowDiscard())) return;
  try { await call('logout'); } finally { clearSession(); }
}));
window.addEventListener('beforeunload',(event)=>{if(state.dirty){event.preventDefault();event.returnValue='';}});

async function loadDashboard() {
  const data=await call('list');state.forms=data.forms||[];state.quota=data.quota??state.quota;
  showView('dashboard');renderDashboard();
}
function renderDashboard() {
  const forms=state.forms;const filter=$('#form-search').value.trim().toLowerCase();
  $('#dashboard-stats').innerHTML=`<div class="stat"><strong>${forms.length}</strong><span>Invitations in your studio</span></div><div class="stat"><strong>${forms.filter(f=>f.status==='published').length}</strong><span>Published pages</span></div><div class="stat"><strong>${forms.filter(f=>f.status==='draft').length}</strong><span>Ideas in progress</span></div>`;
  $('#form-count').textContent=`(${forms.length})`;
  const visible=forms.filter(f=>`${f.title} ${f.slug}`.toLowerCase().includes(filter));
  $('#form-list').innerHTML=visible.length ? visible.map((form,index)=>`<article class="form-card"><div class="card-top"><span class="card-number">F–${String(index+1).padStart(2,'0')}</span><span class="badge ${['draft','published','archived'].includes(form.status)?form.status:'draft'}">${esc(form.status)}</span></div>${form.status==='published'&&Number(form.revision)>Number(form.publishedRevision)?'<span class="badge draft-changes">Saved draft changes</span>':''}<h3>${esc(form.title||'Untitled invitation')}</h3><div class="card-slug">/forms/?form=${esc(form.slug)}</div><div class="card-date">Updated ${esc(dateLabel(form.updatedAt))}</div><div class="card-actions"><button type="button" class="button secondary" data-open="${attr(form.id)}">Edit RSVP ↗</button><button type="button" class="button quiet" data-duplicate="${attr(form.id)}">Duplicate</button>${form.status==='published'?`<a class="button quiet small" href="${attr(safeURL(form.publicUrl||new URL(`../?form=${encodeURIComponent(form.slug)}`,location.href).href))}" target="_blank" rel="noopener noreferrer">View live ↗</a>`:''}</div></article>`).join('') : `<div class="empty-state"><span class="handwritten">A fresh page, full of possibilities.</span><h3>${filter?'No matching invitations':'Your next event begins here'}</h3><p class="muted">${filter?'Try another title or address.':'Start from the complete webinar template, then make every detail your own.'}</p>${filter?'':'<button type="button" class="button primary" data-new>Create your first form ＋</button>'}</div>`;
  $$('[data-open]',$('#form-list')).forEach(button=>button.addEventListener('click',()=>busy(button,()=>openForm(button.dataset.open))));
  $$('[data-duplicate]',$('#form-list')).forEach(button=>button.addEventListener('click',()=>busy(button,async()=> {const data=await call('duplicate',{id:button.dataset.duplicate});setEnvelope(data);showView('editor');renderEditor();notify('Independent draft created. Email delivery is off until you configure and publish it.');})));
  $('[data-new]',$('#form-list'))?.addEventListener('click',newFormDialog);
}
$('#form-search').addEventListener('input',renderDashboard);
$('#refresh-list').addEventListener('click',()=>busy($('#refresh-list'),loadDashboard));
$('#new-form').addEventListener('click',newFormDialog);
function slugify(value){return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64);}
function showDialog(html, setup) {
  const dialog=$('#studio-dialog');$('#dialog-content').innerHTML=html;
  $$('[data-close]',dialog).forEach(button=>button.addEventListener('click',()=>dialog.close()));
  dialog.showModal();setup?.(dialog);return dialog;
}
function dialogHead(title,description=''){return `<div class="dialog-head"><h2>${esc(title)}</h2><button type="button" class="icon-button" data-close aria-label="Close dialog">×</button></div>${description?`<p class="dialog-description">${esc(description)}</p>`:''}`;}
function newFormDialog() {
  showDialog(`${dialogHead('Make something worth joining.','The complete webinar layout, speaker photo, recommended reading, game, form fields, confirmation screen, and all three email templates come with you.')}<form id="create-form-dialog"><label class="dialog-field">Studio title<input name="title" required maxlength="180" placeholder="For example, Exploring the stars"></label><label class="dialog-field">Page address<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxlength="64" placeholder="exploring-the-stars"><span class="help small muted">Lowercase letters, numbers, and hyphens. Your page will use /forms/?form=this-address.</span></label><div class="notice">Your new page starts as a private draft with automatic emails switched off. Review the inherited event details before publishing.</div><div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancel</button><button type="submit" class="button primary">Create invitation ＋</button></div><p class="inline-status" role="status"></p></form>`, dialog=>{
    const form=$('form',dialog);let customSlug=false;form.elements.slug.addEventListener('input',()=>customSlug=true);form.elements.title.addEventListener('input',()=>{if(!customSlug)form.elements.slug.value=slugify(form.elements.title.value);});
    form.addEventListener('submit',event=>{event.preventDefault();busy($('button[type=submit]',form),async()=>{const config=createTemplate();config.emails.enabled=false;const title=form.elements.title.value.trim();const data=await call('create',{config,title,slug:form.elements.slug.value.trim()});dialog.close();setEnvelope(data);showView('editor');renderEditor();notify('Your complete template is ready. Start with the date, meeting link, and speaker.');});});
    $$('[data-close]',form).forEach(button=>button.addEventListener('click',()=>dialog.close()));
  });
}
async function allowDiscard() {
  if(!state.dirty)return true;
  return new Promise(resolve=>{
    const dialog=showDialog(`${dialogHead('Keep your changes?','Your current changes have not been saved. The published page is unchanged.')}<div class="dialog-actions"><button class="button secondary" type="button" data-stay>Keep editing</button><button class="button quiet" type="button" data-discard>Discard changes</button><button class="button primary" type="button" data-save-leave>Save & continue</button></div>`);
    let resolved=false;const finish=value=>{resolved=true;dialog.close();resolve(value);};
    $('[data-stay]',dialog).onclick=()=>finish(false);$('[data-discard]',dialog).onclick=()=>{state.dirty=false;finish(true);};
    $('[data-save-leave]',dialog).onclick=event=>busy(event.currentTarget,async()=>{await save();if(state.dirty)throw new Error('Your latest edit is still unsaved. Save again before leaving.');finish(true);});
    dialog.addEventListener('close',()=>{if(!resolved)resolve(false);},{once:true});
  });
}
async function openForm(id){setEnvelope(await call('get',{id}));showView('editor');renderEditor();}
function setEnvelope(data) {
  if(!data?.draft||!data.id)throw new Error('The form record is incomplete. Please reload the form.');
  state.envelope=data;state.config=clone(data.draft);state.title=data.title||data.draft.meta?.title||'';state.slug=data.slug||'';state.dirty=false;state.responseData=null;state.emailLogs=null;state.versions=null;state.responsePage=0;
  updateSaveState();sendPreviewSoon();
}
async function save() {
  if(!state.envelope)throw new Error('Open a form first.');
  if(!state.dirty)return state.envelope;
  validateDraftForEditor();
  const snapshot={id:state.envelope.id,revision:state.envelope.revision,config:clone(state.config),slug:state.slug,title:state.title};
  const response=await call('save',snapshot);
  const changedWhileSaving=JSON.stringify(state.config)!==JSON.stringify(snapshot.config)||state.title!==snapshot.title||state.slug!==snapshot.slug;
  if(changedWhileSaving){state.envelope=response;state.dirty=true;updateSaveState();}
  else setEnvelope(response);
  updateSaveState();return response;
}
$('#save-form').addEventListener('click',()=>busy($('#save-form'),async()=>{await save();notify(state.dirty?'Earlier changes saved. Your latest edits are still unsaved.':'Draft saved. Publish when you’re ready to update the public page.');if(['publishing','advanced'].includes(state.tab))renderContent();}));
$('#back-dashboard').addEventListener('click',()=>busy($('#back-dashboard'),async()=>{if(await allowDiscard())await loadDashboard();}));

function renderEditor() {
  updateSaveState();
  $('#editor-nav').innerHTML=nav.map(([id,icon,label,group])=>`${group?`<div class="nav-group-label">${group}</div>`:''}<button type="button" class="nav-item" data-tab="${id}"${state.tab===id?' aria-current="page"':''}><span aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('')+'<div class="nav-footer">Made for curious minds.</div>';
  $$('[data-tab]',$('#editor-nav')).forEach(button=>button.addEventListener('click',()=>{state.tab=button.dataset.tab;renderEditor();window.scrollTo({top:0,behavior:'instant'});}));
  renderContent();updatePreviewPanel();
}
function heading(kicker,title,description) {return `<div class="section-heading"><p class="eyebrow">${esc(kicker)}</p><h2>${esc(title)}</h2><p>${esc(description)}</p></div>`;}
function renderContent() {
  const content=$('#editor-content');content.dataset.mode=state.tab;
  if(state.tab==='page')content.innerHTML=renderPage();
  else if(state.tab==='design')content.innerHTML=renderDesign();
  else if(state.tab==='fields')content.innerHTML=renderFields();
  else if(state.tab==='emails')content.innerHTML=renderEmails();
  else if(state.tab==='responses')content.innerHTML=renderResponses();
  else if(state.tab==='publishing')content.innerHTML=renderPublishing();
  else content.innerHTML=renderAdvanced();
  bindConfigControls(content);bindRepeaters(content);bindSpecific(content);bindDesign(content);bindEventHelper(content);bindDeadlineHelper(content);
  $$('.page-disclosure',content).forEach(details=>details.addEventListener('toggle',()=>{if(details.open)openSections.add(details.dataset.editSection);else openSections.delete(details.dataset.editSection);}));
}
function getPath(path){return path.split('.').reduce((o,key)=>o?.[key],state.config);}
function setPath(path,value){const parts=path.split('.');let target=state.config;for(const key of parts.slice(0,-1)){if(!target[key]||typeof target[key]!=='object')target[key]={};target=target[key];}target[parts.at(-1)]=value;markDirty();}
function humanLabel(key){return friendly[key]||key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());}
function control(path,value,key=path.split('.').at(-1)) {
  const id=`c-${path.replaceAll('.','-')}`, label=humanLabel(key); const hint=help[path]||'';
  if(key==='emailImageData')return '';
  if(typeof value==='boolean')return `<div class="control check-control"><input id="${id}" type="checkbox" data-path="${attr(path)}"${value?' checked':''}><label for="${id}">${esc(label)}${hint?`<span class="help">${esc(hint)}</span>`:''}</label></div>`;
  if(Array.isArray(value)||value&&typeof value==='object')return '';
  const wide=textLike.test(key)||String(value).length>95||String(value).includes('\n')||['hero.title','speaker.name'].includes(path);let input;
  if(path==='game.type')input=`<input id="${id}" value="${attr(value)}" readonly>`;
  else if(typeof value==='number')input=`<input id="${id}" type="number" data-path="${attr(path)}" data-number value="${attr(value)}" step="1" min="0">`;
  else if(wide)input=`<textarea id="${id}" data-path="${attr(path)}" rows="${String(value).length>220?5:3}">${esc(value)}</textarea>`;
  else input=`<input id="${id}" type="${/^(replyTo|contactEmail)$/.test(key)?'email':/(Url|^url$)/.test(key)?'text':'text'}" data-path="${attr(path)}" value="${attr(value)}"${/(Url|^url$)/.test(key)?' inputmode="url"':''}>`;
  return `<div class="control${wide?' wide':''}"><label class="control-label" for="${id}">${esc(label)}<span class="control-path">${esc(path)}</span></label>${input}${hint?`<span class="help">${esc(hint)}</span>`:''}</div>`;
}
function objectControls(path,obj,keys=Object.keys(obj||{})) {
  return `<div class="fields-grid">${keys.filter(key=>obj[key]!==undefined&&!(obj[key]&&typeof obj[key]==='object')).map(key=>control(`${path}.${key}`,obj[key],key)).join('')}</div>`+keys.filter(key=>obj[key]&&typeof obj[key]==='object').map(key=>Array.isArray(obj[key])?genericArray(`${path}.${key}`,obj[key],humanLabel(key)):`<details class="disclosure"><summary>${esc(humanLabel(key))}</summary><div>${objectControls(`${path}.${key}`,obj[key])}</div></details>`).join('');
}
function section(path,title,description='') {
  const obj=getPath(path);if(!obj||typeof obj!=='object'||Array.isArray(obj))return '';
  const body=path==='event'?eventHelper()+objectControls(path,obj,Object.keys(obj).filter(key=>!['startUtc','timeZone'].includes(key)))+`<details class="disclosure"><summary>Advanced time reference</summary><div>${objectControls(path,obj,['startUtc','timeZone'])}</div></details>`:objectControls(path,obj);
  return `<details class="section-card page-disclosure" data-edit-section="${attr(path)}"${openSections.has(path)?' open':''}><summary class="section-summary"><span>${esc(title)}</span><span aria-hidden="true">＋</span></summary><div class="section-interior">${description?`<p class="small muted">${esc(description)}</p>`:''}${body}</div></details>`;
}
function genericArray(path,values,title) {
  if(path==='fields')return '';
  return `<details class="section-card page-disclosure" data-edit-section="${attr(path)}"${openSections.has(path)?' open':''}><summary class="section-summary"><span>${esc(title)}</span><span aria-hidden="true">＋</span></summary><div class="section-interior">${values.map((item,index)=>`<div class="repeat-item"><div class="repeat-heading"><span class="item-number">${String(index+1).padStart(2,'0')}</span><h4>${esc(item?.title||item?.name||`${title} ${index+1}`)}</h4>${repeatActions(path,index,values.length)}</div>${item&&typeof item==='object'&&!Array.isArray(item)?objectControls(`${path}.${index}`,item):control(`${path}.${index}`,item,'Value')}</div>`).join('')}<button class="button add-repeat" type="button" data-array-add="${attr(path)}">Add ${esc(title.toLowerCase().replace(/s$/,''))} ＋</button></div></details>`;
}
function repeatActions(path,index,length){return `<div class="repeat-actions"><button class="icon-button" type="button" data-move="${attr(path)}" data-index="${index}" data-direction="-1" aria-label="Move item ${index+1} up"${index===0?' disabled':''}>↑</button><button class="icon-button" type="button" data-move="${attr(path)}" data-index="${index}" data-direction="1" aria-label="Move item ${index+1} down"${index===length-1?' disabled':''}>↓</button><button class="icon-button" type="button" data-remove="${attr(path)}" data-index="${index}" aria-label="Remove item ${index+1}">×</button></div>`;}
const designDefaults = {
  fontFamily:'general',headingFont:'cabinet',handwrittenFont:'caveat',typeScale:1,spacing:1,contentWidth:1248,cardRadius:5,buttonRadius:4,
  backgroundColor:'#fffaf2',textColor:'#261e1c',accentColor:'#a7211d',secondaryColor:'#28734f',surfaceColor:'#fffdf7',
  heroLayout:'split',formSide:'right',invitationOrder:['game','speaker'],sectionOrder:['reading','extras','takeaways','closing'],hiddenSections:[]
};
const designSections={game:'Interactive game',speaker:'Speaker introduction',reading:'Recommended reading',extras:'Additional sections',takeaways:'What to expect',closing:'Closing invitation'};
function currentDesign(){return {...clone(designDefaults),...(state.config.design||{})};}
function designSelect(key,label,options,description=''){
  const d=currentDesign();return `<div class="control"><label class="control-label" for="design-${key}">${esc(label)}</label><select id="design-${key}" data-path="design.${key}">${options.map(([value,text])=>`<option value="${value}"${d[key]===value?' selected':''}>${esc(text)}</option>`).join('')}</select>${description?`<span class="help">${esc(description)}</span>`:''}</div>`;
}
function designSlider(key,label,min,max,step,unit='',description=''){
  const d=currentDesign(),raw=Number(d[key]),n=Math.min(max,Math.max(min,Number.isFinite(raw)?raw:designDefaults[key]));
  return `<div class="control wide design-slider"><label class="control-label" for="design-${key}">${esc(label)}<output id="output-${key}" for="design-${key}">${n}${unit}</output></label><input id="design-${key}" type="range" data-design-range="${key}" min="${min}" max="${max}" step="${step}" value="${n}" data-unit="${attr(unit)}">${description?`<span class="help">${esc(description)}</span>`:''}</div>`;
}
function designColor(key,label){
  const d=currentDesign(),value=/^#[a-f0-9]{6}$/i.test(d[key])?d[key]:designDefaults[key];
  return `<div class="design-color"><label for="design-${key}">${esc(label)}</label><div><input type="color" id="design-${key}" data-design-color="${key}" value="${value}" aria-label="${attr(label)} color"><input type="text" value="${value}" maxlength="7" pattern="#[a-fA-F0-9]{6}" data-design-hex="${key}" aria-label="${attr(label)} hex color" spellcheck="false"></div></div>`;
}
function designOrder(group,label,description){
  const d=currentDesign();const order=d[group]||designDefaults[group];
  return `<section class="section-card"><h3>${esc(label)}</h3><p>${esc(description)}</p><ol class="design-order">${order.map((key,index)=>`<li><span class="item-number">${String(index+1).padStart(2,'0')}</span><div><strong>${esc(designSections[key])}</strong><label class="design-visibility"><input type="checkbox" data-design-visible="${key}"${!d.hiddenSections.includes(key)&&state.config[key]?.enabled!==false?' checked':''}> Show this section</label></div><div class="repeat-actions"><button type="button" class="icon-button" data-design-move="${group}" data-index="${index}" data-direction="-1"${index===0?' disabled':''} aria-label="Move ${attr(designSections[key])} up">↑</button><button type="button" class="icon-button" data-design-move="${group}" data-index="${index}" data-direction="1"${index===order.length-1?' disabled':''} aria-label="Move ${attr(designSections[key])} down">↓</button></div></li>`).join('')}</ol></section>`;
}
function renderDesign(){
  return heading('DESIGN DESK / MAKE IT YOURS','Shape the whole invitation.','Choose the typography, colors, layout, and rhythm. Watch the draft change beside you, and click any preview section to edit its words.')+
    `<div class="notice">The meeting link, speaker, reading, questions, and every page description remain editable in The invitation and Registration fields. These design settings style the public page; email appearance is previewed separately.</div>`+
    `<section class="section-card" data-edit-section="design"><h3>A layout that fits your event.</h3><div class="fields-grid">${designSelect('heroLayout','Page layout',[['split','Invitation and form side by side'],['stacked','Invitation above the form']])}${designSelect('formSide','Form position on desktop',[['right','Form on the right'],['left','Form on the left']],'On phones, the page becomes one readable column.')}${designSlider('contentWidth','Page width',960,1600,8,' px','A narrower page feels focused; a wider one gives the invitation more room.')}${designSlider('spacing','Space between elements',.75,1.5,.05,'×','Adjust the page’s breathing room without changing the words.')}</div></section>`+
    `<section class="section-card"><h3>Choose your voice.</h3><div class="fields-grid">${designSelect('fontFamily','Body typeface',[['general','Freight Sans · clean & readable'],['cabinet','Gelica · warm & expressive'],['space','Input Mono · technical']])}${designSelect('headingFont','Heading typeface',[['cabinet','Gelica · bold & expressive'],['general','Freight Sans · clean & modern'],['space','Input Mono · technical']])}${designSelect('handwrittenFont','Handwritten accents',[['caveat','Felt Tip Roman · handwritten'],['inherit','Match the main typeface']])}${designSlider('typeScale','Type size',.85,1.25,.05,'×','Scale the public page’s typography while keeping it responsive.')}</div></section>`+
    `<section class="section-card"><h3>Your palette.</h3><p>All colors are editable. Keep text clearly readable against the page and paper colors.</p><div class="design-colors">${designColor('backgroundColor','Page background')}${designColor('surfaceColor','Paper & cards')}${designColor('textColor','Main text')}${designColor('accentColor','Main accent & buttons')}${designColor('secondaryColor','Secondary accent')}</div><div class="design-contrast" id="design-contrast" role="status"></div></section>`+
    `<section class="section-card"><h3>The small finishing touches.</h3><div class="fields-grid">${designSlider('cardRadius','Card corner softness',0,32,1,' px')}${designSlider('buttonRadius','Button corner softness',0,32,1,' px')}</div></section>`+
    designOrder('invitationOrder','Inside the introduction','Move the game and speaker block, or hide either. Their content is preserved.')+
    designOrder('sectionOrder','The rest of the story','Arrange the sections that follow the invitation. Hiding a section keeps its content for another edition.')+
    `<section class="section-card"><h3>Return to the original look.</h3><p>Restore the approved notebook design, including section order and visibility. Your written content, event details, questions, and email settings stay intact.</p><button class="button secondary" type="button" id="reset-design">Restore original design</button></section>`;
}
function luminance(hex){const values=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*values[0]+.7152*values[1]+.0722*values[2];}
function contrastRatio(a,b){const [lo,hi]=[luminance(a),luminance(b)].sort((x,y)=>x-y);return(hi+.05)/(lo+.05);}
function updateDesignContrast(){const target=$('#design-contrast');if(!target)return;const d=currentDesign();if(![d.backgroundColor,d.surfaceColor,d.textColor,d.accentColor].every(v=>/^#[a-f0-9]{6}$/i.test(v)))return;const text=Math.min(contrastRatio(d.textColor,d.backgroundColor),contrastRatio(d.textColor,d.surfaceColor));const button=contrastRatio('#ffffff',d.accentColor);target.className='design-contrast'+(text<4.5||button<4.5?' warning':'');target.textContent=text<4.5||button<4.5?'Some colors may be hard to read. Use darker text or a darker main accent for white button labels.':'Your main text and white button labels have strong contrast.';}
function bindDesign(root){
  $$('[data-design-range]',root).forEach(input=>input.addEventListener('input',()=>{setPath(`design.${input.dataset.designRange}`,Number(input.value));$(`#output-${input.dataset.designRange}`,root).textContent=input.value+(input.dataset.unit||'');}));
  $$('[data-design-color]',root).forEach(input=>input.addEventListener('input',()=>{setPath(`design.${input.dataset.designColor}`,input.value);$(`[data-design-hex="${input.dataset.designColor}"]`,root).value=input.value;updateDesignContrast();}));
  $$('[data-design-hex]',root).forEach(input=>input.addEventListener('input',()=>{const valid=/^#[a-f0-9]{6}$/i.test(input.value);input.setCustomValidity(valid?'':'Use a six-digit color such as #fffaf2.');if(valid){setPath(`design.${input.dataset.designHex}`,input.value);$(`[data-design-color="${input.dataset.designHex}"]`,root).value=input.value;updateDesignContrast();}}));
  $$('[data-design-move]',root).forEach(button=>button.onclick=()=>{const d=currentDesign(),group=button.dataset.designMove,index=Number(button.dataset.index),other=index+Number(button.dataset.direction);const order=[...d[group]];if(other<0||other>=order.length)return;[order[index],order[other]]=[order[other],order[index]];setPath(`design.${group}`,order);renderContent();});
  $$('[data-design-visible]',root).forEach(input=>input.onchange=()=>{const key=input.dataset.designVisible,hidden=new Set(currentDesign().hiddenSections);if(input.checked){hidden.delete(key);if(['game','speaker','reading'].includes(key))setPath(`${key}.enabled`,true);}else hidden.add(key);setPath('design.hiddenSections',[...hidden]);});
  $('#reset-design',root)?.addEventListener('click',()=>{state.config.design=clone(designDefaults);markDirty();renderContent();notify('Original page design restored in this draft. Your content is unchanged.');});
  updateDesignContrast();
}
function selectPreviewSection(message){
  const section=message.section,allowed=['hero','event','speaker','reading','game','takeaways','extras','closing','brand','meta','form','fields','confirmation','design'];
  if(!allowed.includes(section)||!state.config)return;
  const tab=['form','fields','confirmation'].includes(section)?'fields':section==='design'?'design':'page';
  state.tab=tab;if(window.matchMedia('(max-width: 940px)').matches)state.preview=false;renderEditor();
  const field=typeof message.field==='string'&&/^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+){1,4}$/.test(message.field)?message.field:'';
  let target=field?$$('[data-path]',$('#editor-content')).find(el=>el.dataset.path===field):null;
  if(!target)target=$(`[data-edit-section="${section}"]`,$('#editor-content'));
  if(!target&&section==='fields')target=$('[data-edit-section="fields"]');
  if(!target)return;
  if(target.tagName==='DETAILS')target.open=true;
  for(let ancestor=target.parentElement;ancestor&&ancestor!==$('#editor-content');ancestor=ancestor.parentElement)if(ancestor.tagName==='DETAILS')ancestor.open=true;
  const card=target.closest('.section-card')||target;card.classList.add('selected-section');setTimeout(()=>card.classList.remove('selected-section'),1800);target.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});if(target.matches('input,textarea,select'))target.focus({preventScroll:true});
}

function eventLocalValue(iso,zone){
  if(!iso||!Number.isFinite(Date.parse(iso)))return '';
  try{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone||'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}catch{return '';}
}
function localTimeToUtc(value,zone){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Choose a complete event date and time.');
  const [y,m,d,h,min]=value.split(/[-T:]/).map(Number),wall=Date.UTC(y,m-1,d,h,min);let instant=wall;
  for(let i=0;i<5;i++){const seen=eventLocalValue(new Date(instant).toISOString(),zone);if(seen===value)return new Date(instant).toISOString().replace('.000Z','Z');if(!seen)break;const [sy,sm,sd,sh,smin]=seen.split(/[-T:]/).map(Number);instant+=wall-Date.UTC(sy,sm-1,sd,sh,smin);}
  throw new Error('That local time is unavailable in this time zone, possibly because the clocks change. Choose another time.');
}
function eventDisplayLabels(utc,zone,eventLabel=''){
  const instant=new Date(utc),format=options=>new Intl.DateTimeFormat('en-US',{timeZone:zone,...options}).format(instant);
  const dateToken=[format({day:'2-digit'}),format({month:'2-digit'}),format({year:'2-digit'})].join('.');
  return {displayDate:format({year:'numeric',month:'long',day:'numeric'}),displayTime:format({hour:'numeric',minute:'2-digit',timeZoneName:'short'}),month:format({month:'short'}).toUpperCase(),day:format({day:'numeric'}),weekday:format({weekday:'long'}).toUpperCase(),eventLabel:String(eventLabel).replace(/\b\d{2}\.\d{2}\.\d{2}\b/,dateToken)};
}
function eventHelper(){
  const e=state.config.event||{},zone=e.timeZone||'UTC';
  const choices=[['America/Los_Angeles','Pacific time · Los Angeles'],['America/Denver','Mountain time · Denver'],['America/Chicago','Central time · Chicago'],['America/New_York','Eastern time · New York'],['Europe/London','UK time · London'],['Europe/Zurich','Central European time · Zurich'],['Asia/Kolkata','India time · Kolkata'],['Asia/Singapore','Singapore time'],['Asia/Tokyo','Japan time · Tokyo'],['Australia/Sydney','Australia time · Sydney'],['UTC','UTC']];
  if(!choices.some(([id])=>id===zone))choices.unshift([zone,zone.replaceAll('_',' ')]);
  return `<div class="event-helper"><p class="small muted">Pick the time your attendees should join. The meeting link is directly below.</p><div class="fields-grid"><div class="control"><label class="control-label" for="friendly-event-date">Event date & time</label><input id="friendly-event-date" type="datetime-local" value="${attr(eventLocalValue(e.startUtc,zone))}"></div><div class="control"><label class="control-label" for="friendly-event-zone">Event time zone</label><select id="friendly-event-zone">${choices.map(([id,label])=>`<option value="${attr(id)}"${id===zone?' selected':''}>${esc(label)}</option>`).join('')}</select></div></div><label class="event-sync"><input id="event-date-sync" type="checkbox" checked> Also update the date and time shown on the page</label><p class="small muted" id="event-date-summary">${esc(e.displayDate||'')} ${esc(e.displayTime||'')}</p></div>`;
}
function bindEventHelper(root){
  const date=$('#friendly-event-date',root),zone=$('#friendly-event-zone',root);if(!date||!zone)return;
  const change=()=>{try{const utc=localTimeToUtc(date.value,zone.value);setPath('event.startUtc',utc);setPath('event.timeZone',zone.value);const reference=$('[data-path="event.startUtc"]',root);if(reference)reference.value=utc;const zoneReference=$('[data-path="event.timeZone"]',root);if(zoneReference)zoneReference.value=zone.value;
    if($('#event-date-sync',root).checked){const labels=eventDisplayLabels(utc,zone.value,state.config.hero?.eventLabel||'');for(const[key,value]of Object.entries(labels)){const path=key==='eventLabel'?'hero.eventLabel':`event.${key}`;setPath(path,value);const input=$(`[data-path="${path}"]`,root);if(input)input.value=value;}$('#event-date-summary',root).textContent=`${labels.displayDate} · ${labels.displayTime}`;}
  }catch(error){notify(errorMessage(error),true);}};
  date.addEventListener('change',change);zone.addEventListener('change',change);
}

function renderPage() {
  const c=state.config;
  return heading('01 / MAKE IT AN INVITATION','Every detail, your voice.','The complete template is here. Refine the words, speaker, optional reading, and little moments that make this event yours.')+
    `<div class="notice">Start with the event date, meeting link, and speaker. The live draft preview updates as you type; the published page changes only when you publish.</div>`+
    section('hero','The opening invitation','The large title, handwritten accent, and introductory copy.')+
    section('event','When, where, and how to join','Calendar files and reminder timing follow the event start, not the hand-written display labels.')+
    section('speaker','Meet the speaker','The same details can appear on the page and in your automated emails.')+
    `<div class="image-tools">${c.speaker?.imageUrl?`<img src="${attr(imagePreviewURL(c.speaker.imageUrl))}" alt="Current speaker photo">`:''}<div><label for="portrait-upload">Upload a speaker portrait<input type="file" id="portrait-upload" accept="image/jpeg,image/png,image/webp"></label><p>JPEG, PNG, or WebP. Converted to a compact JPEG for the page and emails; no public file hosting needed.</p>${c.speaker?.emailImageData?'<button type="button" class="button quiet small" id="remove-email-photo">Clear uploaded photo copy</button>':''}</div></div>`+
    section('reading','A little primer before the event','Recommended, optional reading is preserved across the page and the email templates.')+
    section('game','A moment of discovery','Keep the tested game, edit its surrounding words, or switch it off.')+
    genericArray('takeaways',c.takeaways||[],'Takeaways')+genericArray('extras',c.extras||[],'Additional sections')+
    section('closing','The closing thought')+section('brand','Brand & navigation','Edit the organization, header button, contact link, and footer text.')+section('meta','Page identity','The browser title and description used when you share the page.');
}
function imagePreviewURL(value){if(/^data:image\/(jpeg|png|webp);base64,/i.test(value))return value;return safeURL(value);}
function deadlineHelper() {
  const form=state.config.form||{}, zone=state.config.event?.timeZone||'UTC';
  return `<section class="section-card" data-edit-section="form"><h3>When does registration close?</h3><p>By default, registration closes when the event starts. Choose a different deadline below if needed. The server enforces the closing time, even if someone leaves the page open.</p><div class="fields-grid"><div class="control wide"><label class="control-label" for="registration-close-date">Registration closing date & time</label><input id="registration-close-date" type="datetime-local" value="${attr(eventLocalValue(form.closesAtUtc,zone))}"><span class="help">Time zone: ${esc(zone)}. Leave empty to close at the event start. Save and publish to apply changes.</span></div>${control('form.showClosingCountdown',form.showClosingCountdown!==false,'showClosingCountdown')}</div><p class="small muted" id="registration-close-summary">${esc(form.closesAtUtc ? dateLabel(form.closesAtUtc) : 'Uses the event start time.')}</p><button class="button quiet small" type="button" id="use-event-deadline">Use event start time</button></section>`;
}
function bindDeadlineHelper(root) {
  const date=$('#registration-close-date',root);if(!date)return;
  const summary=$('#registration-close-summary',root);
  const refresh=()=>{summary.textContent=state.config.form.closesAtUtc ? dateLabel(state.config.form.closesAtUtc) : 'Uses the event start time.';};
  date.addEventListener('change',()=>{try{const utc=date.value?localTimeToUtc(date.value,state.config.event?.timeZone||'UTC'):'';setPath('form.closesAtUtc',utc);date.setCustomValidity('');refresh();}catch(error){date.setCustomValidity('Choose a valid closing date and time.');date.reportValidity();notify(errorMessage(error),true);}});
  $('#use-event-deadline',root).addEventListener('click',()=>{setPath('form.closesAtUtc','');date.value='';date.setCustomValidity('');refresh();});
}

function renderFields() {
  const fields=state.config.fields||[];
  const form=state.config.form||{};
  const mainKeys=Object.keys(form).filter(key=>!/^success|^meeting|^calendarLabel/.test(key)&&!['closesAtUtc','showClosingCountdown'].includes(key));
  const successKeys=Object.keys(form).filter(key=>/^success|^meeting|^calendarLabel/.test(key));
  return heading('02 / ASK THOUGHTFULLY','A place on the guest list.','Add, arrange, and refine every question. Each response keeps its stable field ID, even when you rename or remove a question.')+
    `<div class="notice">Keep one required field with purpose <strong>Name</strong> and one with purpose <strong>Email</strong>. The consent checkbox and spam protection are always handled separately.</div>`+
    deadlineHelper()+
    `<section class="section-card" data-edit-section="form"><h3>The registration panel</h3>${objectControls('form',form,mainKeys)}</section>`+
    `<section class="section-card" data-edit-section="fields"><h3>Your questions <span class="muted small">${fields.length} / 30</span></h3>${fields.map((field,index)=>renderField(field,index,fields.length)).join('')}<button class="button add-repeat" type="button" data-array-add="fields"${fields.length>=30?' disabled':''}>Add a question ＋</button></section>`+
    `<section class="section-card" data-edit-section="confirmation"><h3>After successful registration</h3><p>Shown only after the response has been saved. Keep meeting instructions clear and useful.</p>${objectControls('form',form,successKeys)}</section>`;
}
function renderField(field,index,length) {
  const path=`fields.${index}`;
  return `<div class="repeat-item"><div class="repeat-heading"><span class="item-number">Q${index+1}</span><h4>${esc(field.label||'New question')}</h4>${repeatActions('fields',index,length)}</div><div class="fields-grid">${control(`${path}.label`,field.label||'','label')}<div class="control"><label class="control-label" for="type-${index}">Answer type</label><select id="type-${index}" data-field-type="${index}">${['text','email','textarea','select','checkbox','number','date','url','tel'].map(type=>`<option value="${type}"${field.type===type?' selected':''}>${({text:'Short text',email:'Email address',textarea:'Long text',select:'Dropdown choice',checkbox:'Checkbox',number:'Number',date:'Date',url:'Website link',tel:'Phone number'})[type]}</option>`).join('')}</select></div><div class="control"><label class="control-label" for="semantic-${index}">Answer purpose</label><select id="semantic-${index}" data-path="${path}.semantic"><option value=""${!field.semantic?' selected':''}>Other answer</option><option value="name"${field.semantic==='name'?' selected':''}>Name — personalizes emails</option><option value="email"${field.semantic==='email'?' selected':''}>Email — delivery address</option></select></div>${control(`${path}.required`,!!field.required,'required')}${control(`${path}.placeholder`,field.placeholder||'','placeholder')}${control(`${path}.help`,field.help||'','help')}${control(`${path}.maxLength`,field.maxLength??1000,'maxLength')}${field.type==='select'?`<div class="control wide"><label class="control-label" for="options-${index}">Choices · one per line</label><textarea id="options-${index}" data-options="${index}" rows="4">${esc((field.options||[]).join('\n'))}</textarea></div>`:''}</div>${Object.keys(field).filter(key=>!['id','label','type','required','placeholder','help','options','maxLength','semantic'].includes(key)).map(key=>key==='width'?`<div class="control"><label class="control-label" for="width-${index}">Question width</label><select id="width-${index}" data-path="${path}.width"><option value="full"${field.width==='full'?' selected':''}>Full row</option><option value="half"${field.width==='half'?' selected':''}>Half row on desktop</option></select></div>`:control(`${path}.${key}`,field[key],key)).join('')}</div>`;
}
function renderEmails() {
  const emails=state.config.emails||{};const kind=state.emailKind;const template=emails[kind]||{};
  const settings=Object.keys(emails).filter(key=>!['confirmation','day_before','ten_minutes'].includes(key));
  return heading('03 / KEEP THE CONVERSATION GOING','A thoughtful follow-through.','Customize the confirmation and two scheduled reminders. Your page’s speaker, meeting details, and recommended reading are reused automatically.')+
    `<section class="section-card"><h3>Delivery settings</h3>${Number.isFinite(Number(state.quota?.remainingRecipients))?`<p class="small muted">Team account allowance: ${Number(state.quota.remainingRecipients)} email recipients remaining when last checked ${esc(dateLabel(state.quota.checkedAt))}. This allowance is shared with the team’s other Google email apps.</p>`:''}${objectControls('emails',emails,settings)}<div class="notice">Automatic emails are sent only for published forms with delivery switched on. Tests go only to <strong>stem2connect@gmail.com</strong>, never to participants.</div></section>`+
    `<section class="section-card"><div class="tab-strip" role="tablist" aria-label="Email template">${[['confirmation','On registration'],['day_before','One day before'],['ten_minutes','Before we begin']].map(([id,label])=>`<button type="button" role="tab" aria-selected="${id===kind}" data-email-kind="${id}">${label}</button>`).join('')}</div><h3>${kind==='confirmation'?'You’re on the list.':kind==='day_before'?'A little anticipation.':'The room is almost ready.'}</h3>${objectControls(`emails.${kind}`,template)}<details class="disclosure"><summary>Personalize with event details</summary><p class="small muted">Click a token to insert it at your cursor in the email message. Tokens become the recipient’s name or the event’s saved details.</p><div class="token-list">${tokens.map(token=>`<button type="button" class="token-button" data-token="${token}">{{${token}}}</button>`).join('')}</div></details><div class="email-actions"><button class="button secondary" type="button" id="email-preview-button">Preview this email ↗</button><button class="button quiet" type="button" id="email-test-button">Send test to team inbox</button></div><p class="small muted" style="margin-top:12px">The test uses your current draft. It does not resend any participant emails.</p><div id="email-preview-result"></div></section>`;
}
function renderResponses() {
  return `<div class="heading-actions">${heading('04 / THE PEOPLE BEHIND THE NUMBERS','Your guest list.','Review responses, correct a typo, or export the data. Editing an address affects future reminders; it does not resend an earlier confirmation.')}<button class="button secondary" type="button" id="load-responses">Refresh</button></div><div class="action-row"><button type="button" class="button secondary" id="export-xlsx">Download Excel</button><button type="button" class="button quiet" id="export-csv">Download CSV</button>${state.envelope.responseSheetUrl?`<a class="button quiet" href="${attr(safeURL(state.envelope.responseSheetUrl))}" target="_blank" rel="noopener noreferrer">Open Google Sheet ↗</a>`:''}<button type="button" class="button quiet" id="load-email-log">Email delivery log</button></div><div class="notice">Exports include the complete response set, not only the current page. Your private Google Sheet keeps the underlying response records.</div><div id="responses-result">${state.responseData?responseTable(state.responseData):'<div class="empty-state"><h3>Your guest list is ready when you are.</h3><p class="muted">Load responses to see the latest registrations.</p><button type="button" class="button primary" id="load-responses-initial">Load responses</button></div>'}</div><div id="email-log-result"></div>`;
}
function responseTable(data) {
  const headers=data.headers||[];const rows=data.rows||[];
  if(!rows.length)return '<div class="empty-state"><span class="handwritten">The first curious mind is on its way.</span><h3>No responses yet</h3><p class="muted">Publish and share your invitation to start collecting registrations.</p></div>';
  return `<div class="table-scroll"><table><thead><tr><th>Registered</th>${headers.map(h=>`<th>${esc(h.label||h.id)}</th>`).join('')}<th>Actions</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(dateLabel(row.createdAt))}<br><span class="muted">${esc(row.registrationId)}</span></td>${headers.map(h=>`<td>${esc(row.values?.[h.id]??'')}</td>`).join('')}<td><button type="button" class="button quiet small" data-edit-response="${attr(row.registrationId)}">Edit</button></td></tr>`).join('')}</tbody></table></div><div class="pagination"><span>${Number(data.offset||0)+1}–${Number(data.offset||0)+rows.length} of ${Number(data.total||rows.length)} responses</span><div><button class="button secondary small" type="button" id="responses-previous"${!data.offset?' disabled':''}>← Previous</button><button class="button secondary small" type="button" id="responses-next"${Number(data.offset||0)+rows.length>=data.total?' disabled':''}>Next →</button></div></div>`;
}
function publishChecks() {
  const c=state.config,fields=c.fields||[];const start=Date.parse(c.event?.startUtc);
  return [
    [!!state.title.trim(),'Your studio title is set.'],[/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state.slug),'The page address uses lowercase letters, numbers, and hyphens.'],
    [!!c.hero?.title?.trim(),'The invitation has a headline.'],[Number.isFinite(start),'The actual event start is a valid date and time.'],
    [fields.filter(f=>f.semantic==='name'&&f.required&&f.type==='text').length===1,'Exactly one required short-text Name field is configured.'],[fields.filter(f=>f.semantic==='email'&&f.required&&f.type==='email').length===1,'Exactly one required Email field is configured.'],
    [!!c.form?.consentText?.trim(),'The registration consent statement is present.'],[!!c.form?.privacyText?.trim(),'The registration privacy note is present.'],
  ];
}
function renderPublishing() {
  const envelope=state.envelope;const live=!!envelope.publishedRevision&&envelope.status==='published';const checks=publishChecks();
  return heading('05 / SEND YOUR INVITATION INTO THE WORLD','Ready when you are.','Save a draft, check the details, then publish. Your address stays the same; publishing creates a restorable version.')+
    `<section class="section-card"><h3>Page details</h3><div class="fields-grid"><div class="control"><label class="control-label" for="studio-title">Studio title</label><input id="studio-title" value="${attr(state.title)}" maxlength="180"></div><div class="control"><label class="control-label" for="studio-slug">Page address</label><input id="studio-slug" value="${attr(state.slug)}" maxlength="64" pattern="[a-z0-9]+(?:-[a-z0-9]+)*"${envelope.publishedRevision?' readonly':''}><span class="help">${envelope.publishedRevision?'This published address is kept stable. Duplicate the form to use a different address.':'Choose the shareable address before first publishing. It stays stable afterward.'}</span></div></div><ul class="publish-checks">${checks.map(([ok,label])=>`<li${!ok?' class="fail"':''}><span aria-hidden="true">${ok?'✓':'○'}</span><span>${esc(label)}</span></li>`).join('')}</ul>${state.config.emails?.enabled?'<div class="notice warning"><strong>Email automation is enabled.</strong> Publishing activates the enabled confirmation and reminder templates for this form. Check the meeting time and email preview before publishing.</div>':'<div class="notice warning"><strong>Automatic email delivery is off.</strong> The inherited field help and success message may promise confirmation emails and reminders. Update those words under Registration fields, or enable delivery before publishing. Participants can still register and see the meeting details on the confirmation screen.</div>'}${Date.parse(state.config.event?.startUtc)<=Date.now()?'<div class="notice warning">The event start is in the past. Update the event details for a future event. Scheduled reminders are not sent after the event begins.</div>':''}<div class="action-row"><button class="button primary" type="button" id="publish-form">${live?'Save & publish changes':'Save & publish page'} ↗</button>${live?'<button type="button" class="button secondary" id="unpublish-form">Unpublish</button>':''}<button type="button" class="button quiet" id="duplicate-current">Duplicate form</button></div></section>`+
    `<section class="section-card"><h3>${live?'Your live invitation':'Publication status'}</h3><p><span class="badge ${attr(envelope.status)}">${esc(envelope.status)}</span> ${live?`Version ${envelope.publishedRevision} · ${esc(dateLabel(envelope.publishedAt))}`:'This page is not accepting public registrations.'}</p>${live?`<div class="url-box"><a href="${attr(safeURL(publicURL()))}" target="_blank" rel="noopener noreferrer">${esc(publicURL())}</a><button class="button secondary small" type="button" id="copy-public-url">Copy link</button></div>`:''}${envelope.responseSheetUrl?`<a href="${attr(safeURL(envelope.responseSheetUrl))}" target="_blank" rel="noopener noreferrer">Open this form’s private response Sheet ↗</a>`:''}</section>`+
    `<section class="section-card"><h3>A record of every edition.</h3><p>Restore any published edition as a new draft. It will not replace the live page until you publish again.</p><button class="button secondary" type="button" id="load-versions">Load published versions</button><div id="versions-result"></div></section>`+
    `<section class="section-card"><h3>Put this invitation away</h3><p>Archiving stops new registrations and reminders, while keeping the form, published snapshots, and responses. You can reopen it and publish again.</p><button class="button danger" type="button" id="archive-form"${envelope.status==='archived'?' disabled':''}>Archive form</button></section>`;
}
function renderAdvanced() {
  const known=['schemaVersion','meta','brand','hero','event','speaker','form','fields','reading','game','takeaways','extras','closing','emails','design'];
  const additional=Object.keys(state.config).filter(key=>!known.includes(key));
  return heading('06 / KEEP THE WHOLE BLUEPRINT','Nothing gets left behind.','Export the complete template, including every text field, image, section, and email setting. Importing replaces only the current draft; review it before saving.')+
    `<section class="section-card"><h3>Your complete template</h3><div class="action-row"><button class="button secondary" type="button" id="export-template">Download template JSON</button><button class="button quiet" type="button" id="reload-draft">Reload saved draft</button><label class="button quiet" for="import-template">Import template JSON<input class="sr-only" type="file" id="import-template" accept=".json,application/json"></label></div><p class="small muted" style="margin-top:12px">Templates may contain your meeting link and embedded speaker photo. Share them only with the appropriate team members.</p><label for="config-json" class="control-label">Complete draft configuration</label><textarea class="advanced-json" id="config-json" spellcheck="false">${esc(JSON.stringify(state.config,null,2))}</textarea><div class="action-row"><button class="button secondary" type="button" id="apply-json">Apply JSON to draft</button><button class="button quiet" type="button" id="reset-json">Reset this editor to current draft</button></div><p class="small muted" style="margin-top:12px">All configuration is validated by the server before saving or publishing. Custom scripts and executable HTML are not supported.</p></section>`+
    additional.map(key=>state.config[key]&&typeof state.config[key]==='object'?(Array.isArray(state.config[key])?genericArray(key,state.config[key],humanLabel(key)):section(key,humanLabel(key))):`<section class="section-card">${control(key,state.config[key],key)}</section>`).join('')+
    `<section class="section-card"><h3>What this template preserves</h3><p>Branding, all invitation copy, event and calendar details, speaker details and images, reading recommendations, the interactive game, additional sections, takeaways, registration questions and consent, success-screen labels, and three fully editable email templates.</p><div class="notice">Each form has its own responses and email history. Duplicating a form creates a separate draft; it does not copy participants or send email.</div></section>`;
}


function validateDraftForEditor() {
  const c=state.config, fields=c.fields||[];
  if(!state.title.trim())throw new Error('Add a studio title under Publish & versions.');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state.slug))throw new Error('Use lowercase letters, numbers, and hyphens for the page address under Publish & versions.');
  if(fields.length<2||fields.length>30)throw new Error('Keep between 2 and 30 registration questions.');
  if(fields.filter(f=>f.semantic==='name').length!==1||fields.filter(f=>f.semantic==='email').length!==1)throw new Error('Choose exactly one Name and one Email purpose under Registration fields.');
  for(const field of fields){
    if(!String(field.label||'').trim())throw new Error('Give every registration question a label.');
    if(field.semantic==='name'&&(!field.required||field.type!=='text'))throw new Error('The Name question must be required and use Short text.');
    if(field.semantic==='email'&&(!field.required||field.type!=='email'))throw new Error('The Email question must be required and use Email address.');
    if(field.type==='select'&&!field.options?.length)throw new Error(`Add at least one choice to “${field.label}”.`);
    if(field.type==='select'&&new Set(field.options).size!==field.options.length)throw new Error(`Remove repeated choices from “${field.label}”.`);
    if(!Number.isInteger(field.maxLength)||field.maxLength<1||field.maxLength>(field.type==='textarea'?4000:1000))throw new Error(`Set a maximum answer length between 1 and ${field.type==='textarea'?4000:1000} for “${field.label}”.`);
  }
  if(c.event?.startUtc&&(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?Z$/.test(c.event.startUtc)||!Number.isFinite(Date.parse(c.event.startUtc))))throw new Error('Enter the event start as a UTC date ending in Z, for example 2026-10-23T00:00:00Z.');
  if(c.form?.closesAtUtc&&(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?Z$/.test(c.form.closesAtUtc)||!Number.isFinite(Date.parse(c.form.closesAtUtc))))throw new Error('Choose a valid registration closing date and time.');
  if(c.event?.timeZone){try{new Intl.DateTimeFormat('en-US',{timeZone:c.event.timeZone});}catch{throw new Error('Enter a valid event time zone, such as America/Los_Angeles or Asia/Kolkata.');}}
  for(const kind of ['confirmation','day_before','ten_minutes']){
    const email=c.emails?.[kind];if(!email)continue;
    if(/[\r\n]/.test(email.subject||''))throw new Error('Email subjects must fit on a single line.');
    const unknown=[...(String(email.subject||'')+String(email.body||'')).matchAll(/{{\s*([^{}]+?)\s*}}/g)].find(match=>!tokens.includes(match[1]));
    if(unknown)throw new Error(`The email token {{${unknown[1]}}} is not supported. Choose a token from the personalization menu.`);
  }
}

function bindConfigControls(root) {
  $$('[data-path]',root).forEach(input=>input.addEventListener(input.type==='checkbox'||input.tagName==='SELECT'?'change':'input',()=>{
    const value=input.type==='checkbox'?input.checked:input.hasAttribute('data-number')?(input.value===''?0:Number(input.value)):input.value;
    setPath(input.dataset.path,value);
  }));
  $$('[data-field-type]',root).forEach(select=>select.addEventListener('change',()=>{state.config.fields[Number(select.dataset.fieldType)].type=select.value;markDirty();renderContent();}));
  $$('[data-options]',root).forEach(input=>input.addEventListener('input',()=>setPath(`fields.${input.dataset.options}.options`,input.value.split('\n').map(s=>s.trim()).filter(Boolean))));
}
function blankArrayItem(path,list) {
  if(path==='fields')return {id:uid(),label:'New question',type:'text',required:false,placeholder:'',help:'',options:[],maxLength:1000,semantic:''};
  if(path==='takeaways')return {title:'A new perspective',text:''};
  if(path==='extras')return {id:uid().replace('field_','section_'),enabled:true,title:'An extra detail',text:'',imageUrl:'',imageAlt:'',linkUrl:'',linkLabel:''};
  const previous=list.at(-1);if(typeof previous==='string')return '';
  if(previous&&typeof previous==='object'){const blank=clone(previous);for(const key of Object.keys(blank)){blank[key]=key==='id'?uid():typeof blank[key]==='boolean'?true:typeof blank[key]==='number'?0:Array.isArray(blank[key])?[]:typeof blank[key]==='object'?{}:'';}return blank;}
  return '';
}
function bindRepeaters(root) {
  $$('[data-array-add]',root).forEach(button=>button.addEventListener('click',()=>{const path=button.dataset.arrayAdd;const list=getPath(path)||[];if(path==='fields'&&list.length>=30)return;list.push(blankArrayItem(path,list));setPath(path,list);renderContent();}));
  $$('[data-move]',root).forEach(button=>button.addEventListener('click',()=>{const list=getPath(button.dataset.move);const index=Number(button.dataset.index),other=index+Number(button.dataset.direction);if(other<0||other>=list.length)return;[list[index],list[other]]=[list[other],list[index]];markDirty();renderContent();}));
  $$('[data-remove]',root).forEach(button=>button.addEventListener('click',()=>{const list=getPath(button.dataset.remove);list.splice(Number(button.dataset.index),1);markDirty();renderContent();notify(button.dataset.remove==='fields'?'Question removed from the draft. Previously collected answers remain stored.':'Section removed from this draft.');}));
}
function bindSpecific(root) {
  const on=(id,event,handler)=>$(id,root)?.addEventListener(event,handler);
  on('#portrait-upload','change',event=>busy(null,()=>uploadPortrait(event.target.files?.[0])));
  on('#remove-email-photo','click',()=>{setPath('speaker.emailImageData','');renderContent();notify('Uploaded email photo cleared. The page photo URL is unchanged.');});
  $$('[data-email-kind]',root).forEach(button=>button.onclick=()=>{state.emailKind=button.dataset.emailKind;renderContent();});
  $$('[data-token]',root).forEach(button=>button.onclick=()=>{const textarea=$(`[data-path="emails.${state.emailKind}.body"]`,root);if(!textarea)return;const token=`{{${button.dataset.token}}}`;const start=textarea.selectionStart??textarea.value.length,end=textarea.selectionEnd??start;textarea.value=textarea.value.slice(0,start)+token+textarea.value.slice(end);setPath(textarea.dataset.path,textarea.value);textarea.focus();textarea.setSelectionRange(start+token.length,start+token.length);});
  on('#email-preview-button','click',event=>busy(event.currentTarget,previewEmail));
  on('#email-test-button','click',event=>busy(event.currentTarget,async()=>{const result=await call('sendTest',{id:state.envelope.id,kind:state.emailKind,config:state.config});if(result.accepted)notify('Test accepted for delivery to stem2connect@gmail.com. Participant emails were not sent.');else throw new Error('The test was not accepted. Check the delivery settings and try again.');}));
  on('#load-responses','click',event=>busy(event.currentTarget,()=>loadResponses(0)));
  on('#load-responses-initial','click',event=>busy(event.currentTarget,()=>loadResponses(0)));
  bindResponseActions(root);
  on('#export-xlsx','click',event=>busy(event.currentTarget,async()=>{const data=await allResponses();downloadResponsesXlsx(data.headers,data.rows,`${state.slug}-registrations.xlsx`);notify(`Exported ${data.rows.length} responses to Excel.`);}));
  on('#export-csv','click',event=>busy(event.currentTarget,async()=>{const data=await allResponses();downloadCSV(data);notify(`Exported ${data.rows.length} responses to CSV.`);}));
  on('#load-email-log','click',event=>busy(event.currentTarget,loadEmailLog));
  on('#studio-title','input',event=>{state.title=event.target.value;markDirty();});
  on('#studio-slug','input',event=>{state.slug=event.target.value;markDirty();});
  on('#publish-form','click',event=>busy(event.currentTarget,publish));
  on('#unpublish-form','click',event=>busy(event.currentTarget,()=>changePublication('unpublish')));
  on('#archive-form','click',event=>busy(event.currentTarget,()=>changePublication('archive')));
  on('#duplicate-current','click',event=>busy(event.currentTarget,async()=>{if(state.dirty)await save();if(state.dirty)throw new Error('Save your latest edits before duplicating this form.');const result=await call('duplicate',{id:state.envelope.id});setEnvelope(result);state.tab='page';renderEditor();notify('Independent draft created. It has its own response store and email delivery starts off.');}));
  on('#copy-public-url','click',()=>busy(null,async()=>{await navigator.clipboard.writeText(publicURL());notify('Public page link copied.');}));
  on('#load-versions','click',event=>busy(event.currentTarget,loadVersions));
  on('#export-template','click',()=>downloadJSON(state.config,`${state.slug||'invitation'}-template.json`));
  on('#reload-draft','click',event=>busy(event.currentTarget,async()=>{if(!(await allowDiscard()))return;await openForm(state.envelope.id);notify('Latest saved draft loaded.');}));
  on('#import-template','change',event=>busy(null,async()=>{const file=event.target.files?.[0];if(!file)return;if(file.size>450000)throw new Error('This template exceeds the 450 KB import limit.');applyImportedJSON(await file.text());}));
  on('#apply-json','click',()=>busy(null,()=>applyImportedJSON($('#config-json').value)));
  on('#reset-json','click',()=>{$('#config-json').value=JSON.stringify(state.config,null,2);});
}
async function uploadPortrait(file) {
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Please choose a JPEG, PNG, or WebP photo.');
  if(file.size>15000000)throw new Error('Please choose a photo under 15 MB.');
  const image=new Image();const objectUrl=URL.createObjectURL(file);
  try {image.src=objectUrl;await image.decode();const scale=Math.min(1,520/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=canvas.getContext('2d');context.fillStyle='#fffaf2';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);let quality=.86,data=canvas.toDataURL('image/jpeg',quality);while(data.length>80000&&quality>.25){quality-=.08;data=canvas.toDataURL('image/jpeg',quality);}if(data.length>80000)throw new Error('This photo is still too large after compression. Try a smaller or simpler portrait.');setPath('speaker.imageUrl',data);setPath('speaker.emailImageData',data);if(!state.config.speaker.imageAlt)setPath('speaker.imageAlt',state.config.speaker.name||'Speaker portrait');renderContent();notify(`Portrait ready for the page and emails (${Math.round(data.length/1024)} KB). Save the draft to keep it.`);}
  finally{URL.revokeObjectURL(objectUrl);}
}
async function previewEmail() {
  const data=await call('emailPreview',{id:state.envelope.id,kind:state.emailKind,config:state.config});
  const target=$('#email-preview-result');if(!target)return;
  target.innerHTML=`<div class="email-preview-title">Subject: ${esc(data.subject)}</div><iframe class="email-preview" title="Email template preview" sandbox=""></iframe><details class="disclosure"><summary>Plain-text version</summary><pre style="white-space:pre-wrap;font:12px/1.7 freight-sans-pro,General">${esc(data.text)}</pre></details>`;
  $('iframe',target).srcdoc=data.html||'<p>No preview returned.</p>';
}
async function loadResponses(offset=0) {
  const data=await call('responses',{id:state.envelope.id,offset,limit:50});state.responseData=data;state.responsePage=offset;
  const target=$('#responses-result');if(target){target.innerHTML=responseTable(data);bindResponseActions(target);}
}
function bindResponseActions(root) {
  $('#responses-previous',root)?.addEventListener('click',event=>busy(event.currentTarget,()=>loadResponses(Math.max(0,state.responsePage-50))));
  $('#responses-next',root)?.addEventListener('click',event=>busy(event.currentTarget,()=>loadResponses(state.responsePage+50)));
  $$('[data-edit-response]',root).forEach(button=>button.addEventListener('click',()=>editResponse(button.dataset.editResponse)));
}
function editResponse(id) {
  const row=state.responseData?.rows.find(row=>row.registrationId===id);if(!row)return;const headers=state.responseData.headers;
  showDialog(`${dialogHead('A small correction.','Changes are logged. Past email history is preserved, and no confirmation is resent.')}<form id="response-edit"><div class="fields-grid">${headers.map((header,index)=>`<div class="control wide"><label class="control-label" for="response-value-${index}">${esc(header.label||header.id)}<span class="control-path">${esc(header.id)}</span></label><textarea id="response-value-${index}" data-response-key="${attr(header.id)}" rows="2">${esc(row.values?.[header.id]??'')}</textarea></div>`).join('')}</div><div class="dialog-actions"><button class="button secondary" type="button" data-close>Cancel</button><button class="button primary" type="submit">Save response</button></div></form>`,dialog=>{
    $('form',dialog).addEventListener('submit',event=>{event.preventDefault();busy($('button[type=submit]',dialog),async()=>{const values={...row.values};$$('[data-response-key]',dialog).forEach(input=>values[input.dataset.responseKey]=input.value);await call('updateResponse',{id:state.envelope.id,registrationId:id,values});dialog.close();await loadResponses(state.responsePage);notify('Response updated. No confirmation email was resent.');});});
  });
}
async function allResponses() {
  let offset=0,all=[],headers=[],total=Infinity;const formId=state.envelope.id;
  while(offset<total){const data=await call('responses',{id:formId,offset,limit:100});headers=data.headers||headers;total=Number(data.total)||0;all.push(...(data.rows||[]));offset+=data.rows?.length||0;if(!data.rows?.length)break;if(all.length>100000)throw new Error('This export is too large for the browser. Open the Google Sheet to export directly.');}
  return{headers,rows:all};
}
function downloadCSV(data) {
  const cell=value=>{let text=String(value??'');if(/^[\s\r\n]*[=+@-]/.test(text))text=`'${text}`;return`"${text.replaceAll('"','""')}"`;};
  const rows=[['Registration ID','Registered at',...data.headers.map(h=>h.label||h.id)],...data.rows.map(row=>[row.registrationId,row.createdAt,...data.headers.map(h=>row.values?.[h.id]??'')])];
  downloadBlob(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),`${state.slug}-registrations.csv`);
}
async function loadEmailLog(offset=0) {
  const data=await call('emailLog',{id:state.envelope.id,offset,limit:50});const target=$('#email-log-result');if(!target)return;
  const rows=data.rows||[];const keys=[...new Set(rows.flatMap(row=>Object.keys(row)))];
  target.innerHTML=`<section class="section-card"><h3>Email delivery history</h3><p>${Number(data.total??rows.length)} logged entries. “Accepted” or “sent” records the sending service’s acceptance; it is not an inbox read receipt.</p>${rows.length?`<div class="table-scroll"><table><thead><tr>${keys.map(key=>`<th>${esc(humanLabel(key))}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${keys.map(key=>`<td>${esc(typeof row[key]==='object'?JSON.stringify(row[key]):row[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="muted">No email activity for this form yet.</p>'}<div class="pagination"><span>Entries ${rows.length?offset+1:0}–${offset+rows.length}</span><div><button type="button" class="button secondary small" data-log-previous${offset===0?' disabled':''}>← Previous</button><button type="button" class="button secondary small" data-log-next${offset+rows.length>=(data.total||rows.length)?' disabled':''}>Next →</button></div></div></section>`;
  $('[data-log-previous]',target).onclick=event=>busy(event.currentTarget,()=>loadEmailLog(Math.max(0,offset-50)));$('[data-log-next]',target).onclick=event=>busy(event.currentTarget,()=>loadEmailLog(offset+50));
}
async function publish() {
  const invalid=publishChecks().filter(([ok])=>!ok);if(invalid.length)throw new Error(`Before publishing: ${invalid[0][1]}`);
  await save();if(state.dirty)throw new Error('You made another edit while saving. Save those latest changes, then publish.');const result=await call('publish',{id:state.envelope.id,revision:state.envelope.revision});setEnvelope(result);renderContent();notify('Published. Your new invitation is ready to share.');
}
async function changePublication(action) {
  const id=state.envelope.id;
  const decision=await new Promise(resolve=>{
    const archive=action==='archive';const dialog=showDialog(`${dialogHead(archive?'Archive this invitation?':'Take this invitation offline?',archive?'Registrations and future reminders stop. The form, responses, and published versions are kept. You can publish it again later.':'The public page stops accepting registrations and sending reminders. Your saved versions and responses are kept.')}<div class="dialog-actions"><button type="button" class="button secondary" data-cancel>Keep as is</button><button type="button" class="button danger" data-confirm>${archive?'Archive form':'Unpublish form'}</button></div>`);let done=false;$('[data-cancel]',dialog).onclick=()=>{done=true;dialog.close();resolve(false);};$('[data-confirm]',dialog).onclick=()=>{done=true;dialog.close();resolve(true);};dialog.addEventListener('close',()=>{if(!done)resolve(false);},{once:true});
  });
  if(!decision)return;if(state.dirty)await save();if(state.dirty)throw new Error('Save your latest edits before changing this form’s publication status.');const result=await call(action,{id,revision:state.envelope.revision});setEnvelope(result);renderContent();notify(action==='archive'?'Form archived. All responses and published versions are preserved.':'Form unpublished. All responses and published versions are preserved.');
}
async function loadVersions() {
  const data=await call('versions',{id:state.envelope.id});const target=$('#versions-result');if(!target)return;
  target.innerHTML=data.versions?.length?data.versions.map(version=>`<div class="version-row"><div><strong>Version ${esc(version.revision)} · ${esc(version.title||state.title)}</strong><span>${esc(dateLabel(version.publishedAt))}</span></div><button class="button secondary small" type="button" data-restore="${attr(version.revision)}">Restore as draft</button></div>`).join(''):'<p class="small muted" style="margin-top:20px">No published versions yet. Your first publication will appear here.</p>';
  $$('[data-restore]',target).forEach(button=>button.onclick=()=>busy(button,async()=>{if(!(await allowDiscard()))return;const data=await call('restore',{id:state.envelope.id,revision:state.envelope.revision,version:Number(button.dataset.restore)});setEnvelope(data);renderContent();notify('Version restored as a new draft. Publish it when you’re ready; the live snapshot is unchanged.');}));
}
function applyImportedJSON(text) {
  let parsed;try{parsed=JSON.parse(text);}catch{throw new Error('This is not valid JSON. Check the syntax before applying.');}
  if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'||parsed.schemaVersion!==1||!parsed.form||!Array.isArray(parsed.fields)||!parsed.event||!parsed.emails)throw new Error('Choose a complete Form Studio template with schemaVersion 1, event, form, fields, and emails.');
  if(JSON.stringify(parsed).length>450000)throw new Error('The template is too large. Keep it below 450 KB.');
  if(containsUnsafeKeys(parsed))throw new Error('The template contains an unsupported configuration key.');
  state.config=parsed;markDirty();renderContent();notify('Template applied to this draft. Review it, then save. The live page is unchanged.');
}
function containsUnsafeKeys(value) {if(!value||typeof value!=='object')return false;return Object.keys(value).some(key=>['__proto__','constructor','prototype'].includes(key)||containsUnsafeKeys(value[key]));}
let previewTimer;
function sendPreviewSoon(){clearTimeout(previewTimer);previewTimer=setTimeout(sendPreview,160);}
function sendPreview(){if(!state.config)return;$('#page-preview')?.contentWindow?.postMessage({type:'stem2connect-studio-preview',config:clone(state.config),screen:state.previewScreen},location.origin);}
function updatePreviewPanel(){const pane=$('#preview-pane');pane.hidden=!state.preview;pane.classList.toggle('mobile',state.mobilePreview);$('.editor-layout').classList.toggle('with-preview',state.preview);$('#toggle-preview').textContent=state.preview?'Hide preview':'Show preview';$('#preview-mobile').setAttribute('aria-pressed',String(state.mobilePreview));if(state.preview)sendPreviewSoon();}
$('#toggle-preview').addEventListener('click',()=>{state.preview=!state.preview;updatePreviewPanel();});
$('#close-preview').addEventListener('click',()=>{state.preview=false;updatePreviewPanel();});
$('#preview-mobile').addEventListener('click',()=>{state.mobilePreview=!state.mobilePreview;updatePreviewPanel();});
$('#page-preview').addEventListener('load',sendPreview);
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==$('#page-preview').contentWindow)return;if(['stem2connect-preview-ready','stem2connect-studio-preview-ready'].includes(event.data?.type))sendPreview();else if(event.data?.type==='stem2connect-studio-select')selectPreviewSection(event.data);});
$('#preview-screen')?.addEventListener('change',event=>{state.previewScreen=event.target.value==='confirmation'?'confirmation':'page';sendPreview();});
