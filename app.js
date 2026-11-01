const LOCAL_BACKEND='http://127.0.0.1:8765';
function localURL(url){return url.startsWith('/')?LOCAL_BACKEND+url:url}
function localAssets(value){
 if(typeof value==='string'&&value.startsWith('/covers/'))return localURL(value);
 if(Array.isArray(value))return value.map(localAssets);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,localAssets(v)]));
 return value;
}
const $=s=>document.querySelector(s), E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token='',mode='local',page=1,pages=1,tag='',favorites=false,tags=[],generation=0,activeBook=null;
const pageCache=new Map(),pageLoads=new Map();let cacheEpoch=0;
const n=x=>Number(x||0).toLocaleString('zh-CN');
const reviewDate=x=>/^\d{10}$/.test(String(x))?new Date(Number(x)*1000).toLocaleString('zh-CN'):String(x||'');
async function api(url,data,retry=true){const r=await fetch(localURL(url),data===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':token},body:JSON.stringify(data)});const j=localAssets(await r.json());if(r.status===403&&data!==undefined&&retry){const fresh=await api('/api/status');token=fresh.token;return api(url,data,false)}if(!r.ok)throw Error(j.error||'请求失败');if(data!==undefined&&['/api/favorite','/api/refresh','/api/live','/api/douban-enrich'].includes(url)){pageCache.clear();pageLoads.clear();cacheEpoch++}return j}
let searchLabelTimer;let toastTimer;function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),5000)}
function error(e){toast(e.message||String(e))}
const genres=['全部','玄幻','奇幻','仙侠','武侠','都市','历史','科幻','游戏','悬疑','灵异','言情','轻小说','同人','军事','竞技','现实'];
$('#genres').innerHTML=genres.map((x,i)=>`<button class="chip ${i?'':'on'}" data-tag="${i?x:''}">${x}</button>`).join('');
$('#genres').onclick=e=>{const b=e.target.closest('[data-tag]');if(!b)return;tag=b.dataset.tag;$('#genres').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));page=1;load()};
function filterTags(){const q=$('#tagsearch').value.trim();const keep=$('#sub').value;const list=tags.filter(t=>!q||t.tag.toLowerCase().includes(q.toLowerCase()));$('#sub').innerHTML='<option value="">全部标签</option>'+list.map(t=>`<option value="${E(t.tag)}">${E(t.tag)}${t.count?' · '+n(t.count):''}</option>`).join('');if(list.some(x=>x.tag===keep))$('#sub').value=keep;$('#tagtotal').textContent=`${n(list.length)} 个原始标签`}
$('#tagsearch').oninput=filterTags;
function params(){const p=new URLSearchParams({q:$('#q').value.trim(),field:$('#field').value,sort:$('#sort').value,page,tag,favorites:favorites?'1':''});if($('#has_intro').checked)p.set('has_intro','1');for(const k of ['sub','status','score','votes','words'])if($('#'+k).value)p.set(k,$('#'+k).value);return p}
function otherIntroLinks(source){return (source?.sources||[]).filter(s=>s.url&&s.url!==source.url).map(s=>`<a class="source-link" href="${E(s.url)}" target="_blank" rel="noopener">${E(s.site)} ↗</a>`).join(' · ')}
function editionLabel(source){if(source?.site!=='豆瓣读书')return '';let info={};try{info=JSON.parse(source.raw||'{}')}catch{}return [info.publisher,info.published,info.isbn?'ISBN '+info.isbn:''].filter(Boolean).join(' · ')}
function fallbackCover(title){
 const chars=Array.from(String(title||'未命名'));const lines=[];
 for(let i=0;i<chars.length;i+=8)lines.push(chars.slice(i,i+8).join(''));
 const size=Math.min(27,250/(lines.length*1.65));const gap=size*1.65;const top=180-(lines.length-1)*gap/2;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360" viewBox="0 0 240 360"><rect width="240" height="360" fill="white"/><text text-anchor="middle" fill="#39433d" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="${size}">${lines.map((line,i)=>`<tspan x="120" y="${top+i*gap}">${E(line)}</tspan>`).join('')}</text></svg>`;
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function coverImage(id,title,url){return `<button class="book-cover" data-detail="${id}" aria-label="查看${E(title)}详情"><img src="${E(url||fallbackCover(title))}" data-cover-title="${E(title)}" alt="${E(title)}封面" width="96" height="144" loading="lazy" decoding="async"></button>`}
let coverTimer;
function cachedBooks(url){
 const saved=pageCache.get(url);if(saved&&Date.now()-saved.at<20000)return Promise.resolve(saved.data);
 if(pageLoads.has(url))return pageLoads.get(url);
 const epoch=cacheEpoch;const request=api(url).then(data=>{if(epoch===cacheEpoch){pageCache.set(url,{at:Date.now(),data});while(pageCache.size>48)pageCache.delete(pageCache.keys().next().value)}return data}).finally(()=>{if(pageLoads.get(url)===request)pageLoads.delete(url)});
 pageLoads.set(url,request);return request;
}
function prefetchNext(data){if(mode!=='local'||data.page>=data.pages||$('#field').value==='review')return;const next=params();next.set('page',String(data.page+1));const url='/api/books?'+next;setTimeout(()=>cachedBooks(url).catch(()=>{}),100)}
function render(data){if($('#field').value==='author_exact')$('#heading').textContent=$('#q').value.trim()+'的全部作品';else if(!favorites)$('#heading').innerHTML='从这里，翻开下一页 <span>✦</span>';pages=data.pages;page=data.page;$('#count').textContent=`${mode==='local'?'当前书库':'原站本次查询'} · ${n(data.total)} 本${mode==='local'?' · 评分保留原始来源':''}`;$('#pageinfo').textContent=`第 ${page} / ${n(pages)} 页`;$('#prev').disabled=page<=1;$('#next').disabled=page>=pages;
 $('#books').innerHTML=data.books.length?data.books.map(b=>`<article class="book has-cover" data-book-id="${b.id}">${coverImage(b.id,b.title,b.cover_url)}<button class="heart ${b.favorite?'saved':''}" data-fav="${b.id}" aria-label="${b.favorite?'取消待读':'加入待读'}">${b.favorite?'♥':'♡'}</button><div class="booktop"><div><button class="titlebutton" data-detail="${b.id}"><h3>${E(b.title)}</h3></button><div class="author">${E(b.author)}</div></div></div><div class="booktags">${(b.tags||'暂无分类').split(/[,，]/).slice(0,2).map(t=>`<span class="pill">${E(t.trim())}</span>`).join('')}<span class="pill">${E(b.status||'状态未知')}</span>${b.words?`<span class="pill">${(b.words/10000).toFixed(0)} 万字</span>`:''}</div><p class="intro">${E(b.intro||'简介尚未采集，打开详情可从原站获取。')}</p><div class="bookfoot"><div class="rating">${b.score?Number(b.score).toFixed(1):'—'}<small>${n(b.votes)} 人 · ${b.local_id?'历史':'来源'}评分</small></div><button data-detail="${b.id}">查看详情 ↗</button></div></article>`).join(''):'<div class="empty">这里暂时没有找到匹配的故事。<br><button class="chip on" data-searchall>搜索全部书目</button></div>';
 warmCovers(data.books).catch(()=>{});
}
function updateCompactControls(){const active=['sub','status','score','votes','words'].filter(k=>$('#'+k).value).length+Number($('#has_intro').checked);$('#filterbadge').textContent=active?'已选 '+active+' 项':'';}
async function load(){updateCompactControls();if(mode!=='local'&&!$('#q').value.trim()){toast('请输入书名或作者后搜索');return}const gen=++generation;$('#books').classList.add('busy');$('#notice').hidden=true;$('#count').textContent=$('#q').value.trim()?`正在搜索「${$('#q').value.trim()}」…`:'正在读取书库…';if(!$('#books .book'))$('#books').innerHTML='<div class="search-loading"><span></span>正在查找，请稍候…</div>';$('#books').setAttribute('aria-busy','true');const searchButton=$('#searchform button[type="submit"]');clearTimeout(searchLabelTimer);searchButton.disabled=true;searchButton.classList.add('is-searching');searchButton.setAttribute('aria-busy','true');searchButton.innerHTML='<i class="button-spinner" aria-hidden="true"></i>正在找书…';let searchSucceeded=false;let searchTotal=0;try{let data;if(mode==='local')data=await cachedBooks('/api/books?'+params());else{if(!$('#q').value.trim()){toast('输入关键词后搜索在线书库');return}data=await api('/api/live',{q:$('#q').value.trim(),source:mode,page})}if(gen!==generation)return;render(data);prefetchNext(data);searchSucceeded=true;searchTotal=data.total;if(data.note){$('#notice').textContent=data.note;$('#notice').hidden=false}}catch(e){if(gen===generation){$('#notice').textContent='查询未完成：'+e.message+'。可使用本地书库或打开原站重试。';$('#notice').hidden=false;$('#count').textContent='查询失败，未将失败误报为没有结果';$('#books').innerHTML='<div class="empty">暂时无法读取此来源。<br><button class="chip on" data-searchall>搜索本地全部书目</button></div>'}}finally{if(gen===generation){$('#books').classList.remove('busy');$('#books').removeAttribute('aria-busy');searchButton.disabled=false;searchButton.classList.remove('is-searching');searchButton.removeAttribute('aria-busy');searchButton.innerHTML=searchSucceeded?`找到 ${n(searchTotal)} 本 ✓`:'重新搜索 ↻';searchLabelTimer=setTimeout(()=>{if(gen===generation)searchButton.innerHTML='找一本好书 <span>↗</span>'},1800)}}}
$('#searchform').onsubmit=e=>{e.preventDefault();if($('#q').value.trim())$('#has_intro').checked=false;page=1;load();$('.results').scrollIntoView({behavior:'smooth',block:'start'})};
for(const k of ['sub','status','score','votes','words','sort','field','has_intro'])$('#'+k).onchange=()=>{page=1;load()};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;$('#sourcepicker').open=false;page=1;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('on',x===b));const online=mode!=='local';$('.filters').classList.toggle('busy',online);$('#field').disabled=online;$('#sort').disabled=online;$('#scopehelp').textContent=online?'在线按书名 / 作者查询，结果自动缓存':'离线也能发现好书';load()});
$('#reset').onclick=()=>{tag='';$('#has_intro').checked=false;for(const k of ['sub','status','score','votes','words'])$('#'+k).value='';$('#tagsearch').value='';filterTags();$('#genres').querySelectorAll('button').forEach((b,i)=>b.classList.toggle('on',!i));page=1;load()};
$('#prev').onclick=()=>{if(page>1){page--;load();$('.results').scrollIntoView({behavior:'auto',block:'start'})}};$('#next').onclick=()=>{if(page<pages){page++;load();$('.results').scrollIntoView({behavior:'auto',block:'start'})}};$('#go').onclick=()=>{page=Math.max(1,Math.min(pages,parseInt($('#jump').value)||1));load();$('.results').scrollIntoView({behavior:'auto',block:'start'})};$('#jump').onkeydown=e=>{if(e.key==='Enter')$('#go').click()};
async function favorite(id){const r=await api('/api/favorite',{id});toast(r.favorite?'已加入我的待读':'已移出待读');if(activeBook===id&&$('#detail').open)await showDetail(id);load()}
$('#books').onclick=e=>{if(e.target.closest('[data-searchall]')){mode='local';document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode==='local'));$('.filters').classList.remove('busy');$('#field').disabled=false;$('#sort').disabled=false;tag='';for(const key of ['sub','status','score','votes','words'])$('#'+key).value='';$('#has_intro').checked=false;favorites=false;$('#genres').querySelectorAll('button').forEach((b,i)=>b.classList.toggle('on',!i));page=1;load();return}const fav=e.target.closest('[data-fav]'),d=e.target.closest('[data-detail]');if(fav)favorite(+fav.dataset.fav).catch(error);else if(d)showDetail(+d.dataset.detail).catch(error)};
function showAuthor(author){
 if(!author?.trim()){toast('暂无作者资料');return}
 $('#detail').close();activeBook=null;favorites=false;mode='local';page=1;tag='';
 $('#q').value=author;$('#field').value='author_exact';$('#field').disabled=false;$('#sort').disabled=false;$('#sort').value='votes';
 $('#has_intro').checked=false;for(const key of ['sub','status','score','votes','words'])$('#'+key).value='';$('#tagsearch').value='';filterTags();
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode==='local'));$('.filters').classList.remove('busy');$('#scopehelp').textContent='已收录的全部作品';
 $('#genres').querySelectorAll('button').forEach((b,i)=>b.classList.toggle('on',!i));$('#discover').classList.add('on');$('#shelf').classList.remove('on');
 load();$('.results').scrollIntoView({behavior:'auto',block:'start'});
}
async function showDetail(id){
 activeBook=id;
 if(!$('#detail').open)$('#detail').showModal();
 $('#detailbody').innerHTML='<p class="muted">正在加载…</p>';
 const b=await api('/api/detail?id='+id);if(activeBook!==id)return;
 const sources=b.sources||[], available=b.intro_groups||sources.filter(s=>s.intro?.trim());
 const selected=available.find(s=>s.site==='优书网')||available[0];
 const rating=sources.find(s=>s.site===selected?.site&&s.score>0)||sources.find(s=>s.score>0);
 const categories=(b.tags||'').split(/[,，]/).map(t=>t.trim()).filter(Boolean);
 const reviews=b.reviews||[];
 $('#detailbody').innerHTML=`<header class="detail-heading with-cover"><img class="detail-cover" src="${E(b.cover_url||fallbackCover(b.title))}" data-cover-title="${E(b.title)}" alt="${E(b.title)}封面" width="112" height="168"><div class="detail-heading-copy"><h2>${E(b.title)}</h2><p class="detail-byline"><a class="author-link" id="detailauthor" href="?author=${encodeURIComponent(b.author)}" target="_blank" rel="noopener" aria-label="在新标签页查看${E(b.author)}的全部作品">${E(b.author)} <span aria-hidden="true">↗</span></a><span>·</span>${E(b.status||'状态未知')}${b.words?`<span>·</span>${(b.words/10000).toFixed(1)} 万字`:''}</p><div class="detail-tags">${categories.slice(0,5).map(t=>`<span class="pill">${E(t)}</span>`).join('')}</div>${rating?`<div class="detail-score"><strong>${Number(rating.score).toFixed(1)}</strong><span>${E(rating.site)} · ${n(rating.votes)} 人评分</span></div>`:''}</div></header>
 <div class="detailactions"><button class="primary" id="download">下载 ↗</button><button class="detail-save" id="detailfav">${b.favorite?'♥ 已加入待读':'♡ 加入待读'}</button></div>
 <section class="synopsis"><div class="section-heading"><h3 id="synopsis-heading">${selected?.site==='豆瓣读书'?'豆瓣简介':'简介'}</h3>${available.length>1?`<select id="intro-source" aria-label="简介来源">${available.map(s=>`<option value="${E(s.site)}" ${s===selected?'selected':''}>${E(s.label||s.site)}</option>`).join('')}</select>`:selected?`<a class="source-link" href="${E(selected.url)}" target="_blank" rel="noopener">${E(selected.site)} ↗</a>`:''}</div><p id="synopsis-edition" class="detailmeta" ${editionLabel(selected)?'':'hidden'}>${E(editionLabel(selected))}</p><p id="synopsis-text">${E(selected?.intro||'暂无简介')}</p><a id="synopsis-link" class="source-link" ${selected?`href="${E(selected.url)}"`:'hidden'} target="_blank" rel="noopener">查看原文 ↗</a><span id="synopsis-other-links">${otherIntroLinks(selected)}</span></section>
 <details class="review-disclosure"><summary><span>查看书评 <small>${n(reviews.length)}</small></span><span class="disclosure-arrow">⌄</span></summary><div class="review-content"><div class="review-toolbar"><select id="review-source" aria-label="书评来源"><option value="">全部来源</option>${[...new Set(reviews.map(r=>r.site))].map(site=>`<option value="${E(site)}">${E(site)}</option>`).join('')}</select></div><div id="review-list"></div><button id="more-reviews" class="chip">再看几条 ↓</button></div></details>
 <details class="book-information"><summary>来源与更多信息 <span>＋</span></summary><div class="information-body">${b.local_id?`<div class="information-row"><span>历史评分 · 2024-07</span><span>${b.score||'—'} / 10 · ${n(b.votes)} 人</span></div>`:''}${sources.map(s=>`<div class="information-row"><a href="${E(s.url)}" target="_blank" rel="noopener">${E(s.site)} ↗</a><span>${s.score?Number(s.score).toFixed(1)+' / 10 · ':''}${n(s.votes)} 人</span></div>`).join('')}${sources.filter(source=>source.site==='豆瓣读书').map(source=>{let info={};try{info=JSON.parse(source.raw||'{}')}catch{}return `<p class="detailmeta">${E([info.publisher,info.published,info.isbn?'ISBN '+info.isbn:''].filter(Boolean).join(' · '))}</p>`}).join('')}${categories.length>5?`<p class="detailmeta">${E(categories.slice(5).join(' · '))}</p>`:''}<button class="chip" id="refresh">更新资料 ↻</button><p id="refreshresult" class="small muted" role="status"></p></div></details>`;
 $('#detail').scrollTop=0;

 if($('#intro-source'))$('#intro-source').onchange=e=>{const source=available.find(s=>s.site===e.target.value);$('#synopsis-text').textContent=source.intro;$('#synopsis-link').href=source.url;$('#synopsis-heading').textContent=source.site==='豆瓣读书'?'豆瓣简介':'简介';$('#synopsis-edition').textContent=editionLabel(source);$('#synopsis-edition').hidden=!editionLabel(source);$('#synopsis-other-links').innerHTML=otherIntroLinks(source);};
 let reviewLimit=6;
 function drawReviews(){const filtered=reviews.filter(r=>!$('#review-source').value||r.site===$('#review-source').value);$('#review-list').innerHTML=filtered.length?filtered.slice(0,reviewLimit).map(r=>`<article class="review"><div class="reviewmeta"><span class="review-author">${E(r.historical?'书友':r.author||'书友')}</span><span>${E(r.site)}</span>${r.praise?`<span>赞 ${n(r.praise)}</span>`:''}${r.url?`<a href="${E(r.url)}" target="_blank" rel="noopener">原文 ↗</a>`:''}</div><p>${E(r.content)}</p></article>`).join(''):'<p class="muted small">暂无书评</p>';$('#more-reviews').hidden=filtered.length<=reviewLimit;}
 $('.review-disclosure').ontoggle=e=>{if(e.currentTarget.open&&activeBook===id&&$('#review-list'))drawReviews()};
 $('#review-source').onchange=()=>{reviewLimit=6;drawReviews()};
 $('#more-reviews').onclick=()=>{reviewLimit+=6;drawReviews()};
 $('#download').onclick=()=>openDownloadHub(b.title,b.author);
 $('#detailfav').onclick=async()=>{try{const r=await api('/api/favorite',{id});b.favorite=r.favorite;$('#detailfav').textContent=r.favorite?'♥ 已加入待读':'♡ 加入待读';load()}catch(e){error(e)}};
 $('#refresh').onclick=async()=>{const button=$('#refresh');button.disabled=true;button.textContent='更新中…';try{const result=await api('/api/refresh',{id});if(activeBook!==id)return;await showDetail(id);if(result.errors.length)toast(result.errors.join('；'));else toast('资料已更新');load();updateStatus().catch(()=>{})}catch(e){error(e)}finally{if(button.isConnected){button.disabled=false;button.textContent='更新资料 ↻'}}};
}
for(const d of document.querySelectorAll('dialog')){d.querySelector('.close').onclick=()=>{d.close();if(d.id==='detail')activeBook=null};d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}})}
$('#shelf').onclick=()=>{favorites=true;mode='local';document.querySelector('[data-mode="local"]').click();$('#heading').textContent='为下一段故事，留个位置';$('#shelf').classList.add('on');$('#discover').classList.remove('on')};
$('#discover').onclick=()=>{if($('#field').value==='author_exact'){$('#field').value='all';$('#q').value='';$('#has_intro').checked=false;$('#scopehelp').textContent='离线也能发现好书'}favorites=false;$('#heading').innerHTML='从这里，翻开下一页 <span>✦</span>';$('#discover').classList.add('on');$('#shelf').classList.remove('on');page=1;load()};
async function updateStatus(){const s=await api('/api/status');token=s.token;if(tags.length!==s.tags.length){tags=s.tags;filterTags()}$('#coverage').textContent=`${n(s.books)} 本书 · ${n(s.intros)} 条已采集简介`;$('#stats').innerHTML=[[s.books,'当前可搜索书目'],[s.online,'在线来源记录'],[s.intros,'已采集原文简介'],[s.historical_reviews,'本地历史书评'],[s.reviews,'新增公开书评'],[s.tags.length,'细分类与标签']].map(([v,t])=>`<div class="stat"><strong>${n(v)}</strong><span>${t}</span></div>`).join('');$('#job').textContent=(s.job.message||'随时开始第一批采集')+(s.job.errors?.length?'\n'+s.job.errors.join('；'):'');$('#startsync').disabled=s.running;$('#stopsync').disabled=!s.running;return s}
$('#sync').onclick=()=>{$('#syncdialog').showModal();xkongStatus().catch(error);doubanStatus().catch(error);coverStatus().catch(error);introStatus().catch(error);updateStatus().catch(error)};$('#startsync').onclick=async()=>{try{await api('/api/collect',{pages:+$('#batch').value});toast('采集已开始，可以继续浏览书库');await updateStatus()}catch(e){error(e)}};$('#stopsync').onclick=async()=>{await api('/api/stop',{});toast('将在当前请求结束后暂停')};
function applyTheme(theme){
 if(!['light','dark','paper'].includes(theme))theme='light';
 document.body.classList.toggle('dark',theme==='dark');document.body.classList.toggle('paper',theme==='paper');
 document.documentElement.style.colorScheme=theme==='dark'?'dark':'light';$('#theme').value=theme;
 try{localStorage.setItem('book-theme',theme)}catch{}
}
let savedTheme='light';try{savedTheme=localStorage.getItem('book-theme')||'light'}catch{}applyTheme(savedTheme);
$('#theme').onchange=()=>applyTheme($('#theme').value);
const initialAuthor=new URLSearchParams(location.search).get('author');if(initialAuthor?.trim()){$('#q').value=initialAuthor;$('#field').value='author_exact';$('#has_intro').checked=false;$('#scopehelp').textContent='已收录的全部作品';document.title=initialAuthor+'的全部作品 · 书间';}
async function connectLocal(){
 const button=$('#connectlocal');button.disabled=true;
 $('#localconnectiontext').textContent='正在连接本机服务…';
 try{
  await updateStatus();
  $('#localconnection').classList.add('connected');
  $('#localconnectiontext').textContent='已连接本机，正在加载书库…';
  await load();
  $('#localconnectiontext').textContent='已连接本机，书库数据和下载均在你的电脑处理。';
 }catch(e){
  const message=e.message||String(e);
  $('#localconnectiontext').textContent=(e instanceof TypeError?'浏览器未能访问本机服务。请在地址栏左侧的网站设置中允许“本地网络访问”，再重试；也可点击右侧“打开本机入口”直接使用。':'书库加载失败：'+message+'。可点击右侧本机入口继续使用。');
  $('#localconnection').classList.remove('connected');
  console.error('Local library connection:',e);
 }finally{button.disabled=false;button.textContent='重新连接本机'}
}
$('#connectlocal').onclick=connectLocal;
// Connect once on page open; manual retry remains available.
connectLocal();
setInterval(()=>{if($('#syncdialog').open)updateStatus().catch(()=>{})},4000);

async function introStatus(){const r=await api('/api/intro-status');$('#introprogress').textContent=`已入库 ${n(r.total)} 条原文简介，覆盖原书库 ${n(r.local_covered)} 本。`+(r.running?'正在持续采集。':'采集已暂停。')+Object.entries(r.sites?.length?{}:(r.sites||{})).map(([k,v])=>` ${k}：${v.last_title||v.status||''}`).join('');$('#startintros').disabled=r.running;$('#stopintros').disabled=!r.running;}
$('#startintros').onclick=async()=>{try{await api('/api/intro-start',{});toast('已开始优先补齐原书库简介');setTimeout(()=>introStatus().catch(error),1500)}catch(e){error(e)}};
$('#stopintros').onclick=async()=>{try{await api('/api/intro-stop',{});toast('当前请求结束后暂停，进度会保存')}catch(e){error(e)}};
setInterval(()=>{if($('#syncdialog').open)introStatus().catch(()=>{})},4000);

async function warmCovers(books){
 clearTimeout(coverTimer);const viewGeneration=generation;const pending=books.filter(b=>!b.cover_url);if(!pending.length)return;
 await api('/api/cover-warm',{ids:pending.map(b=>b.id)});
 let rounds=0;
 async function poll(){if(viewGeneration!==generation)return;try{const ready=await api('/api/covers?ids='+pending.map(b=>b.id).join(','));if(viewGeneration!==generation)return;for(const b of pending){if(!ready[b.id])continue;const card=document.querySelector(`[data-book-id="${b.id}"]`);if(card){const image=card.querySelector('.book-cover img');if(image)image.src=ready[b.id];b.cover_url=ready[b.id]}}if(++rounds<40&&pending.some(b=>!b.cover_url))coverTimer=setTimeout(poll,3000)}catch{}}
 coverTimer=setTimeout(poll,2000);
}
document.addEventListener('error',e=>{const image=e.target;if(image.matches?.('.book-cover img,.detail-cover')&&!image.src.startsWith('data:'))image.src=fallbackCover(image.dataset.coverTitle)},true);
async function coverStatus(){const s=await api('/api/cover-status');$('#coverprogress').textContent=`已缓存 ${n(s.ready)} 本真实封面 · 已找到 ${n(s.candidates)} 本封面链接`+(s.running?' · 持续采集中':' · 已暂停');$('#startcovers').disabled=s.running;$('#stopcovers').disabled=!s.running;}
$('#startcovers').onclick=async()=>{await api('/api/cover-start',{});toast('封面采集已开始');setTimeout(()=>coverStatus().catch(error),1200)};
$('#stopcovers').onclick=async()=>{await api('/api/cover-stop',{});toast('本批结束后暂停封面采集')};
setInterval(()=>{if($('#syncdialog').open)coverStatus().catch(()=>{})},4000);

async function doubanStatus(){const s=await api('/api/douban-status');$('#doubanprogress').textContent=`已关联 ${n(s.books)} 本 · ${n(s.intros)} 条简介 · ${n(s.editions)} 个出版版本`+(s.running?' · 正在补充':' · 已暂停')+(s.progress?.message?' · '+s.progress.message:'');$('#startdouban').disabled=s.running;$('#stopdouban').disabled=!s.running;}
$('#startdouban').onclick=async()=>{try{await api('/api/douban-start',{});toast('开始核验豆瓣书籍资料');setTimeout(()=>doubanStatus().catch(error),1500)}catch(e){error(e)}};
$('#stopdouban').onclick=async()=>{await api('/api/douban-stop',{});toast('当前请求完成后暂停')};
setInterval(()=>{if($('#syncdialog').open)doubanStatus().catch(()=>{})},4000);

async function xkongStatus(){const s=await api('/api/xkong-status');$('#xkongprogress').textContent=`已关联 ${n(s.books)} 本 · ${n(s.intros)} 条简介`+(s.running?' · 正在补充':' · 已暂停')+(s.progress?.message?' · '+s.progress.message:'');$('#startxkong').disabled=s.running;$('#stopxkong').disabled=!s.running;}
$('#startxkong').onclick=async()=>{try{await api('/api/xkong-start',{});toast('开始补充星空评分网资料');setTimeout(()=>xkongStatus().catch(error),1500)}catch(e){error(e)}};
$('#stopxkong').onclick=async()=>{await api('/api/xkong-stop',{});toast('当前请求完成后暂停')};
$('#startall').onclick=async()=>{try{const result=await api('/api/enrichment-start',{});toast(Object.entries(result.sources).map(([k,v])=>k+'：'+v).join('；'));setTimeout(()=>{introStatus().catch(error);doubanStatus().catch(error);xkongStatus().catch(error);coverStatus().catch(error)},1500)}catch(e){error(e)}};
setInterval(()=>{if($('#syncdialog').open)xkongStatus().catch(()=>{})},4000);

// Integrated source search and download workspace.
const dlLatency=r=>typeof r.latency_ms==='number'&&Number.isFinite(r.latency_ms)&&r.latency_ms>0?r.latency_ms:Infinity;
let dlSearchId=null,dlAuthor='',dlState={jobs:[]},dlSig='',dlBusy=false,dlTracked=new Set(),dlReported=new Set(),dlDismissed=new Set(),dlValidationReported=new Set();
const dlAPI=(action,data)=>api('/api/downloader/'+action,data);
async function openDownloadHub(title='',author=''){
 $('#downloaddialog').showModal();
 if(title){$('#dlquery').value=title;dlAuthor=author;$('#dlcontext').textContent=title+(author?' · '+author:'');await dlSearch()}
 dlPoll();
}
$('#downloadhub').onclick=()=>openDownloadHub();
async function dlSearch(){
 try{
  const q=$('#dlquery').value.trim();if(dlSearchId)await dlAPI('cancel',{id:dlSearchId});dlSearchId=null;dlSig='';$('#dlresults').innerHTML='';
  if(!q){$('#dlmessage').textContent='已重置找源搜索';dlAuthor='';return}
  dlSearchId=(await dlAPI('search',{q})).id;$('#dlmessage').textContent='正在查询健康书源…';dlPoll();
 }catch(e){$('#dlmessage').textContent=e.message}
}
$('#dlsearch').onsubmit=e=>{e.preventDefault();dlAuthor='';dlSearch()};
$('#dlreset').onclick=()=>{$('#dlquery').value='';dlSearch()};
$('#dlimportbutton').onclick=()=>$('#dlimport').click();
$('#dlhealth').onclick=async()=>{try{await dlAPI('health',{});$('#dlmessage').textContent='健康检测已开始，完成后可重新查找书源';dlPoll()}catch(e){error(e)}};
$('#dlimport').onchange=async e=>{try{const f=e.target.files[0];if(f)toast((await dlAPI('import',{text:await f.text()})).message)}catch(e){error(e)}finally{e.target.value=''}};
const dlIdentity=s=>String(s||'').normalize('NFKC').replace(/[\s《》]/g,'').toLowerCase();
async function dlPoll(){
 if(dlBusy||(!$('#downloaddialog').open&&!dlTracked.size))return;dlBusy=true;
 try{
  dlState=await dlAPI('state');$('#dlhealth').disabled=dlState.checking;$('#dlhealth strong').textContent=dlState.checking?'检测中…':'健康检测';$('#dlstats').textContent=`${dlState.sources} 个书源 · ${dlState.healthy} 个可用${dlState.checking?' · 检测中':''}`;
  const job=dlState.jobs.find(j=>j.id===dlSearchId);
  if(job){
   const sig=job.id+job.results.length+job.state;
   if(sig!==dlSig){dlSig=sig;const results=job.results.filter(r=>!dlAuthor||(dlIdentity(r.title)===dlIdentity($('#dlquery').value)&&(!r.author||dlIdentity(r.author)===dlIdentity(dlAuthor)))).sort((a,b)=>dlLatency(a)-dlLatency(b));
    $('#dlmessage').textContent=job.state==='running'?`正在查找，已返回 ${results.length} 个匹配来源…`:job.state==='error'?job.message:`找到 ${results.length} 个匹配来源，请核对书名与作者后下载`;
    const wasOpen=$('#dlresultfold')?.open||false;const scrollTop=$('.dl-resultlist')?.scrollTop||0;
    $('#dlresults').innerHTML=results.map(r=>`<article class="dl-source"><div><strong>${E(r.title)}</strong><p class="small muted">${E(r.author||'作者待核实')} · ${E(r.source)} · ${Number.isFinite(dlLatency(r))?Math.round(r.latency_ms)+' ms':'延迟未知'}</p></div><div><button class="chip" data-dl-id="${r.id}" data-dl-format="txt">TXT</button> <button class="chip" data-dl-id="${r.id}" data-dl-format="epub">EPUB</button></div></article>`).join('')||(job.state==='running'?'':'<p class="muted">暂无匹配结果，可以重新检测或导入更多书源。</p>');
    if(results.length){const rows=$('#dlresults').innerHTML;$('#dlresults').innerHTML=`<details id="dlresultfold" class="dl-resultfold" ${wasOpen?'open':''}><summary><span><strong>匹配书源</strong> <span class="dl-resultcount">${results.length}</span><small>按健康检测延迟从低到高 · 展开选择格式</small></span><span class="dl-foldarrow" aria-hidden="true">⌄</span></summary><div class="dl-resultlist">${rows}</div></details>`;$('.dl-resultlist').scrollTop=scrollTop;}
   }
  }
  const tasks=dlState.jobs.filter(j=>j.kind==='download');
  for(const j of tasks){if(j.state==='done'&&j.validation?.warnings?.length&&!dlValidationReported.has(j.id)){dlValidationReported.add(j.id);alert('《'+(j.title||'小说')+'》下载完整性提醒\n\n'+j.validation.warnings.join('\n')+'\n\n'+j.validation.reference_note+'\n文件已保留，可换源重新下载。')}}
  if(!$('#downloaddialog').open)for(const j of tasks)if(j.state==='done')dlDismissed.add(j.id);
  $('#dltasks').innerHTML=tasks.filter(j=>j.state!=='error'&&j.state!=='cancelled'&&!dlDismissed.has(j.id)).map((j,i)=>`<article class="dl-task"><div class="dl-taskhead"><strong>${E(j.title||'准备下载')}</strong><span>${Math.round(j.progress*100)}%</span></div><progress value="${j.progress}" max="1" style="accent-color:${['#4d8669','#5c8dc5','#b18a50','#9772ba'][i%4]}"></progress><div class="dl-taskhead"><span class="small muted">${E(j.message)}${j.validation?' · '+j.validation.successful_chapters+'/'+j.validation.toc_chapters+'章 · '+j.validation.body_characters.toLocaleString()+'字 · '+(j.validation.file_bytes/1024).toFixed(1)+'KB'+(j.validation.warnings.length?' · ⚠ 请核对完整性':' · 统计校验通过'):''}</span>${j.file_removed?'临时文件已清理':j.state==='done'?`<a href="${LOCAL_BACKEND}/api/downloader/file/${j.id}">保存文件 ↓</a>`:`<button class="chip" data-dl-cancel="${j.id}">停止下载</button>`}</div></article>`).join('')||'<p class="muted small">暂无下载任务。完成的文件保留在本机下载目录。</p>';
  for(const j of tasks){if(j.state!=='running'){dlTracked.delete(j.id);if((j.state==='error'||j.state==='cancelled')&&!dlReported.has(j.id)){dlReported.add(j.id);toast((j.title||'下载')+'：'+j.message);$('#dlmessage').textContent=(j.title||'下载')+'：'+j.message}}}
  const active=tasks.filter(j=>j.state==='running').length;$('#downloadhub').textContent='找源与下载'+(active?' · '+active:'');
 }catch(e){$('#dlmessage').textContent=e.message}finally{dlBusy=false}
}
document.addEventListener('click',async e=>{
 const btn=e.target.closest('[data-dl-id],[data-dl-cancel]');if(!btn)return;btn.disabled=true;
 try{if(btn.dataset.dlCancel)await dlAPI('cancel',{id:btn.dataset.dlCancel});else{const item=dlState.jobs.flatMap(j=>j.results).find(r=>r.id===btn.dataset.dlId);if(item&&!item.author&&!confirm('该来源未提供作者，请核对书名。继续下载？'))return;const j=await dlAPI('download',{id:btn.dataset.dlId,format:btn.dataset.dlFormat});dlTracked.add(j.id);dlOwned.add(j.id);toast('已加入下载任务')}await dlPoll()}catch(e){error(e)}finally{if(btn.isConnected)btn.disabled=false}
});
setInterval(dlPoll,1000);

// Closing the workspace dismisses finished progress rows, not downloaded files.
$('#downloaddialog').addEventListener('close',()=>{
 for(const j of dlState.jobs)if(j.kind==='download'&&j.state==='done')dlDismissed.add(j.id);
 $('#dltasks').innerHTML='';
 // Capture completions that arrived between the last poll and closing.
 dlAPI('state').then(snapshot=>{
  for(const j of snapshot.jobs)if(j.kind==='download'&&j.state==='done')dlDismissed.add(j.id);
  if($('#downloaddialog').open)dlPoll();
 }).catch(()=>{});
});

const dlOwned=new Set();
window.addEventListener('pagehide',()=>{if(!token||!dlOwned.size)return;fetch(LOCAL_BACKEND+'/api/downloader/cleanup',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json','X-Local-Token':token},body:JSON.stringify({ids:[...dlOwned].slice(-200)})}).catch(()=>{});});
