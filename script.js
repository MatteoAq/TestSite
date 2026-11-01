'use strict';
const stores = window.CHEHLYANDIA_STORES || [];
const EN_LAYOUT = "`qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const RU_LAYOUT = "ёйцукенгшщзхъфывапролджэячсмитьбю";

const RU_TO_LAT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
};

const LAT_TO_RU_SEQUENCES = [
  ['shch', 'щ'], ['sch', 'щ'], ['yo', 'ё'], ['jo', 'ё'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'],
  ['ch', 'ч'], ['sh', 'ш'], ['yu', 'ю'], ['ju', 'ю'], ['ya', 'я'], ['ja', 'я'], ['ye', 'е'], ['ie', 'е']
];

const LAT_TO_RU_SINGLE = {
  a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'й', k: 'к',
  l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в',
  w: 'в', x: 'кс', y: 'ы', z: 'з'
};

function normalizeSearchText(value) {
  return String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[–\u2014−-]/g, ' ')
    .replace(/[«»„“”\"'(){}[\],.:;!?/\\|+_=*&^%$#@~`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactSearchText(value) {
  return normalizeSearchText(value).replace(/\s+/g, '');
}

function swapKeyboardLayout(value, fromLayout, toLayout) {
  return [...String(value || '').toLocaleLowerCase('ru-RU')]
    .map((char) => {
      const index = fromLayout.indexOf(char);
      return index >= 0 ? toLayout[index] : char;
    })
    .join('');
}

function transliterateRuToLat(value) {
  return [...String(value || '').toLocaleLowerCase('ru-RU')]
    .map((char) => RU_TO_LAT[char] ?? char)
    .join('');
}

function transliterateLatToRu(value) {
  let result = String(value || '').toLocaleLowerCase('ru-RU');
  LAT_TO_RU_SEQUENCES.forEach(([latin, cyrillic]) => {
    result = result.split(latin).join(cyrillic);
  });
  return [...result].map((char) => LAT_TO_RU_SINGLE[char] ?? char).join('');
}

function buildSearchVariants(value) {
  const raw = String(value || '').toLocaleLowerCase('ru-RU').trim();
  if (!raw) return [];

  const layoutRu = swapKeyboardLayout(raw, EN_LAYOUT, RU_LAYOUT);
  const layoutEn = swapKeyboardLayout(raw, RU_LAYOUT, EN_LAYOUT);
  const firstPass = [raw, layoutRu, layoutEn, transliterateRuToLat(raw), transliterateLatToRu(raw)];
  const exactCandidates = [
    ...firstPass,
    transliterateRuToLat(layoutRu),
    transliterateLatToRu(layoutRu),
    transliterateRuToLat(layoutEn),
    transliterateLatToRu(layoutEn)
  ];

  const normalized = new Set();
  exactCandidates.forEach((item) => {
    const normal = normalizeSearchText(item);
    if (normal) normalized.add(normal);
    const compact = compactSearchText(item);
    if (compact) normalized.add(compact);
  });
  return [...normalized];
}

function buildFuzzySearchVariants(value) {
  const raw = String(value || '').toLocaleLowerCase('ru-RU').trim();
  if (!raw) return [];
  const candidates = [
    raw,
    swapKeyboardLayout(raw, EN_LAYOUT, RU_LAYOUT),
    swapKeyboardLayout(raw, RU_LAYOUT, EN_LAYOUT),
    transliterateRuToLat(raw),
    transliterateLatToRu(raw)
  ];
  return [...new Set(candidates.map(normalizeSearchText).filter(Boolean))];
}
function levenshteinDistance(a, b, maxDistance = Infinity) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[b.length];
}

function fuzzyTokenMatch(queryToken, targetToken) {
  if (queryToken === targetToken) return true;
  if (queryToken.length >= 3 && targetToken.includes(queryToken)) return true;
  const length = Math.max(queryToken.length, targetToken.length);
  if (length < 4) return false;
  const threshold = length >= 6 ? 2 : 1;
  return levenshteinDistance(queryToken, targetToken, threshold) <= threshold;
}

function buildStoreSearchIndex(store) {
  const rawFields = [store.name, store.address, store.hint, ...(store.aliases || [])].filter(Boolean);
  const fields = rawFields.map((value) => ({
    normal: normalizeSearchText(value),
    compact: compactSearchText(value)
  }));
  const normal = fields.map((field) => field.normal).join(' ');
  const compact = fields.map((field) => field.compact).join(' ');
  const tokens = new Set(normal.split(' ').filter(Boolean));
  return { normal, compact, tokens: [...tokens], fields };
}

stores.forEach((store) => {
  store.searchIndex = buildStoreSearchIndex(store);
});

function getStoreMatchScore(store, query) {
  const exactVariants = buildSearchVariants(query);
  if (!exactVariants.length) return 1;
  const { normal, compact, tokens, fields } = store.searchIndex;
  let best = 0;

  exactVariants.forEach((variant) => {
    const normalizedVariant = normalizeSearchText(variant);
    const compactVariant = compactSearchText(variant);
    if (!normalizedVariant) return;

    fields.forEach((field) => {
      if (field.normal === normalizedVariant || field.compact === compactVariant) best = Math.max(best, 120);
      else if (field.normal.startsWith(normalizedVariant) || field.compact.startsWith(compactVariant)) best = Math.max(best, 110);
      else if (field.normal.includes(normalizedVariant) || field.compact.includes(compactVariant)) best = Math.max(best, 95);
    });

    if (normal.includes(normalizedVariant) || compact.includes(compactVariant)) best = Math.max(best, 85);
  });

  if (best) return best;

  const rawTokens = String(query || '').toLocaleLowerCase('ru-RU').trim().split(/\s+/).filter(Boolean);
  const fuzzyMatch = rawTokens.length > 0 && rawTokens.every((rawToken) => {
    const tokenVariants = buildSearchVariants(rawToken)
      .map((variant) => normalizeSearchText(variant))
      .filter(Boolean);
    return tokenVariants.some((queryToken) => tokens.some((targetToken) => fuzzyTokenMatch(queryToken, targetToken)));
  });
  return fuzzyMatch ? 50 : 0;
}

function storeMatchesQuery(store, query) {
  return getStoreMatchScore(store, query) > 0;
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const cityButtons = $$('[data-city]');
const citySwitcher = $('[data-city-switcher]');
const grid = $('[data-store-grid]');
const searchInput = $('[data-search]');
const clearSearch = $('[data-search-clear]');
const resetSearchButton = $('[data-reset-search]');
let activeCity = 'khabarovsk';
const quickList=$('[data-quick-store-list]');
const showAllStoresButton=$('[data-show-all-stores]');
let listExpanded=false;
const DEFAULT_VISIBLE_STORES=6;
const viewButtons=$$('[data-view]');
let storeView='list';
function setStoreView(view){
  if(view!=='list'&&view!=='photos')return;
  const changed=storeView!==view;
  storeView=view;
  const listView=view==='list';
  quickList.hidden=!listView;
  grid.hidden=listView;
  showAllStoresButton.hidden=!listView||!showAllStoresButton.dataset.more;
  // Never load 14 large photo cards while the visitor only wants addresses.
  if(listView)grid.replaceChildren();
  viewButtons.forEach(button=>{
    const selected=button.dataset.view===view;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
  if(changed&&!listView)renderStores();
}
viewButtons.forEach(button=>button.addEventListener('click',()=>setStoreView(button.dataset.view)));


function nounStores(value) {
  const n = value % 10, nn = value % 100;
  return n === 1 && nn !== 11 ? 'магазин' : n >= 2 && n <= 4 && (nn < 12 || nn > 14) ? 'магазина' : 'магазинов';
}
function timeLabel(store) {
  // Все магазины находятся в часовом поясе UTC+10.
  // Режим ежедневный; исключения по праздникам неизвестны.
  const local = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Vladivostok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const parts = Object.fromEntries(local.map(part => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const [openText, closeText] = store.hours.split('–');
  if (!openText || !closeText) return {state: 'unknown', text: 'Уточняйте график'};
  const [oh, om] = openText.split(':').map(Number);
  const [ch, cm] = closeText.split(':').map(Number);
  const start = oh * 60 + om, end = ch * 60 + cm;
  if (![start, end].every(Number.isFinite)) return {state: 'unknown', text: 'Уточняйте график'};
  if (minutes >= start && minutes < end) {
    return minutes >= end - 60
      ? {state: 'closing', text: `Скоро закрытие · до ${closeText}`}
      : {state: 'open', text: `Открыто · до ${closeText}`};
  }
  if (minutes < start) {
    return {state: 'closed', text: `Закрыто · сегодня с ${openText}`};
  }
  return {state: 'closed', text: `Закрыто · завтра с ${openText}`};
}
function makeCard(store, i) {
  const article=document.createElement('article');
  article.className='store-card';
  article.dataset.storeId=store.id;
  const photoBtn=document.createElement('button');
  photoBtn.type='button';photoBtn.className='store-photo-button';
  photoBtn.setAttribute('aria-label',`Посмотреть фотографии магазина ${store.name}`);
  const photo=document.createElement('img');
  const storefrontPhoto=store.gallery[store.coverIndex];
  const picture=document.createElement('picture');picture.className='store-card-picture';
  picture.style.setProperty('--store-blur',`url("${storefrontPhoto}")`);
  picture.style.setProperty('--cover-y',`${store.coverY ?? 43}%`);
  photo.src=storefrontPhoto;photo.alt=`Вход в магазин «Чехляндия»: ${store.name}`;
  photo.loading=i<3?'eager':'lazy';photo.decoding='async';
  if(i>=3) photo.fetchPriority='low';
  photo.width=900;photo.height=720;
  picture.append(photo);
  const openIcon=document.createElement('span');openIcon.className='photo-open';openIcon.setAttribute('aria-hidden','true');openIcon.textContent='↗';
  photoBtn.append(picture,openIcon);
  photoBtn.addEventListener('click',event=>openGallery(store,event.detail===0));
  const body=document.createElement('div');body.className='store-card-body';
  const titleRow=document.createElement('div');titleRow.className='store-title-row';
  const title=document.createElement('h3');title.textContent=store.name;
  const icon=document.createElement('span');icon.className='store-location-pin';icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  titleRow.append(title,icon);
  const address=document.createElement('a');address.className='store-address';address.textContent=store.address;
  address.href=store.map;address.target='_blank';address.rel='noopener noreferrer';
  address.setAttribute('aria-label',`Открыть адрес в 2ГИС: ${store.name}, ${store.address}`);
  const hint=document.createElement('p');hint.className='store-hint';hint.textContent=store.hint || ' '; 
  const separator=document.createElement('div');separator.className='store-divider';
  const hoursRow=document.createElement('div');hoursRow.className='store-hours-row';
  const hours=document.createElement('p');hours.className='store-hours';
  hours.textContent='Ежедневно';
  const strong=document.createElement('strong');strong.textContent=store.hours;
  hours.append(strong);
  const status=document.createElement('span');status.className='status';
  const state=timeLabel(store);status.dataset.state=state.state;
  const dot=document.createElement('span');dot.className='status-dot';dot.setAttribute('aria-hidden','true');
  const statusText=document.createElement('span');statusText.textContent=state.text;
  status.append(dot,statusText);
  hoursRow.append(hours,status);
  const actions=document.createElement('div');actions.className='store-actions';
  const route=document.createElement('a');route.className='store-map';route.href=store.map;
  route.target='_blank';route.rel='noopener noreferrer';route.textContent='Открыть в 2ГИС ↗';
  const photos=document.createElement('button');photos.className='store-gallery-btn';photos.type='button';photos.textContent='Смотреть фото ↗';
  photos.addEventListener('click',()=>openGallery(store));
  actions.append(route,photos);
  body.append(titleRow,address,hint,separator,hoursRow,actions);
  article.append(photoBtn,body);
  return article;
}
function renderStores() {
  const query=searchInput.value.trim();
  const candidates=stores.filter(store=>store.city===activeCity);
  const found=candidates.map((store,position)=>({store,position,score:getStoreMatchScore(store,query)})).filter(result=>result.score>0).sort((a,b)=>b.score-a.score || a.position-b.position).map(x=>x.store);
  if(storeView==='photos')grid.replaceChildren(...found.map((store,index)=>makeCard(store,index)));
  else grid.replaceChildren();
  const hasQuery=query.length>0;
  const canExpand=!hasQuery&&found.length>DEFAULT_VISIBLE_STORES;
  const visibleStores=(canExpand&&!listExpanded)?found.slice(0,DEFAULT_VISIBLE_STORES):found;
  showAllStoresButton.dataset.more=canExpand?"yes":"";
  showAllStoresButton.textContent=listExpanded?"Свернуть список":`Показать все ${found.length} ${nounStores(found.length)}`;
  showAllStoresButton.setAttribute("aria-expanded",String(listExpanded));
  const rows=visibleStores.map((store,index)=>{
    const row=document.createElement('article');row.className='quick-store-row';row.dataset.storeId=store.id;
    const thumbnail=document.createElement('div');thumbnail.className='quick-store-thumb';
    const image=document.createElement('img');
    image.src=store.gallery[store.coverIndex ?? 0].replace('photos/','photos/thumb/');
    image.alt='';image.loading=index<2?'eager':'lazy';image.decoding='async';
    image.width=85;image.height=85;
    image.style.objectPosition=`center ${store.coverY ?? 43}%`;
    thumbnail.append(image);

    const info=document.createElement('div');info.className='quick-store-text';
    const name=document.createElement('h3');name.textContent=store.name;
    const address=document.createElement('a');address.className='quick-store-address';address.textContent=store.address;
    address.href=store.map;address.target='_blank';address.rel='noopener noreferrer';
    address.setAttribute('aria-label',`Открыть адрес в 2ГИС: ${store.name}, ${store.address}`);
    const meta=document.createElement('div');meta.className='quick-store-meta';
    const hours=document.createElement('span');hours.className='quick-store-hours';hours.textContent=store.hours;
    const state=timeLabel(store);
    const status=document.createElement('span');status.className='quick-store-status';status.dataset.state=state.state;
    status.textContent=state.text;
    meta.append(hours,status);info.append(name,address,meta);

    const actions=document.createElement('div');actions.className='quick-store-actions';
    const route=document.createElement('a');route.href=store.map;route.target='_blank';route.rel='noopener noreferrer';
    route.className='quick-store-map';route.textContent='В 2ГИС';route.setAttribute('aria-label',`Открыть маршрут в 2ГИС: ${store.name}`);
    actions.append(route);
    // A single focusable button opens photos from anywhere in the row.
    // The 2GIS link is a separate control drawn over the button.
    const openRow=document.createElement('button');openRow.type='button';openRow.className='quick-store-open';
    openRow.setAttribute('aria-label',`Посмотреть фотографии магазина ${store.name}, ${store.address}`);
    openRow.addEventListener('click',event=>openGallery(store,event.detail===0));
    row.append(thumbnail,info,openRow,actions);
    return row;
  });
  quickList.replaceChildren(...rows);
  setStoreView(storeView);
  $('[data-results-count]').textContent=query?`Найдено: ${found.length} ${nounStores(found.length)}`:`${found.length} ${nounStores(found.length)} в ${activeCity==='khabarovsk'?'Хабаровске':'Владивостоке'}`;
  $('[data-empty-search]').hidden=found.length!==0;
  clearSearch.hidden=!query;
}
showAllStoresButton.addEventListener('click',()=>{
  listExpanded=!listExpanded;
  renderStores();
});
cityButtons.forEach(button=>button.addEventListener('click',()=>{
  listExpanded=false;
  activeCity=button.dataset.city;
  citySwitcher.dataset.selected=activeCity;
  cityButtons.forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active))});
  searchInput.value='';searchInput.placeholder=activeCity==='khabarovsk'?'Название, адрес или ориентир':'Например, Черёмушки или Полетаева';
  renderStores();
}));
searchInput.addEventListener('input',renderStores);
function resetSearch(){searchInput.value='';renderStores();searchInput.focus()}
clearSearch.addEventListener('click',resetSearch);
resetSearchButton.addEventListener('click',resetSearch);
function shortStoreStatus(state){
  return state.state==='open'?'Открыто':state.state==='closing'?'Скоро закрытие':state.state==='closed'?'Закрыто':'Уточняйте';
}
const refreshStatus=()=>{
  $$('.store-card').forEach(card=>{
    const store=stores.find(item=>item.id===card.dataset.storeId);
    if(!store)return;
    const state=timeLabel(store),status=$('.status',card);
    status.dataset.state=state.state;$('.status span:last-child',card).textContent=state.text;
  });
  $$('.quick-store-row').forEach(row=>{
    const store=stores.find(item=>item.id===row.dataset.storeId);
    if(!store)return;
    const state=timeLabel(store),status=$('.quick-store-status',row);
    status.dataset.state=state.state;status.textContent=state.text;
  });
};
renderStores();setInterval(refreshStatus,60000);

// Мобильная навигация
const mobileToggle=$('[data-menu-toggle]'),mobileNav=$('[data-mobile-nav]');
function closeMenu(){mobileNav.hidden=true;mobileToggle.setAttribute('aria-expanded','false');mobileToggle.setAttribute('aria-label','Открыть меню')}
mobileToggle.addEventListener('click',()=>{const open=mobileToggle.getAttribute('aria-expanded')==='true';mobileNav.hidden=open;mobileToggle.setAttribute('aria-expanded',String(!open));mobileToggle.setAttribute('aria-label',open?'Открыть меню':'Закрыть меню')});
$$('a',mobileNav).forEach(link=>link.addEventListener('click',closeMenu));
window.addEventListener('resize',()=>{if(window.innerWidth>760)closeMenu()});
// Keep sticky header dimensions independent of scroll position.
// CSS smooth scrolling applies to anchor navigation, but not mouse-wheel input.
// We soften discrete mouse wheel steps while leaving trackpads, touchscreens,
// keyboard navigation, zoom gestures and nested scroll containers native.
const scrollRoot = document.scrollingElement || document.documentElement;
let wheelFrame = 0;
let wheelTarget = 0;
let wheelLastFrame = 0;
let backToTopFrame = 0;

function stopWheelAnimation() {
  if (wheelFrame) cancelAnimationFrame(wheelFrame);
  wheelFrame = 0;
  wheelLastFrame = 0;
}
function stopBackToTopAnimation() {
  if (backToTopFrame) cancelAnimationFrame(backToTopFrame);
  backToTopFrame = 0;
}
function hasScrollableAncestor(target, deltaY) {
  let element = target instanceof Element ? target : target?.parentElement;
  while (element && element !== document.body && element !== scrollRoot) {
    const style = getComputedStyle(element);
    if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) {
      const atUpperEdge = element.scrollTop <= 1;
      const atLowerEdge = element.scrollTop >= element.scrollHeight - element.clientHeight - 1;
      if ((deltaY < 0 && !atUpperEdge) || (deltaY > 0 && !atLowerEdge)) return true;
    }
    element = element.parentElement;
  }
  return false;
}
function advanceWheelScroll(time) {
  const dt = wheelLastFrame ? Math.min(50, time - wheelLastFrame) : 16;
  wheelLastFrame = time;
  const current = window.scrollY;
  const distance = wheelTarget - current;
  if (Math.abs(distance) < 0.75) {
    window.scrollTo({ top: wheelTarget, behavior: 'instant' });
    wheelFrame = 0;
    wheelLastFrame = 0;
    return;
  }
  const smoothing = 1 - Math.exp(-dt / 95);
  window.scrollTo({ top: current + distance * smoothing, behavior: 'instant' });
  wheelFrame = requestAnimationFrame(advanceWheelScroll);
}
window.addEventListener('wheel', (event) => {
  // User interaction always interrupts the "Наверх" animation.
  stopBackToTopAnimation();
  if (reduceMotion || !event.cancelable || event.defaultPrevented ||
      event.ctrlKey || event.metaKey || event.shiftKey ||
      document.body.classList.contains('modal-open') ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY) * 0.25 || !event.deltaY) {
    stopWheelAnimation();
    return;
  }
  // Modern precision trackpads already supply smooth pixel-by-pixel input.
  if (event.deltaMode === 0 && Math.abs(event.deltaY) < 35) {
    stopWheelAnimation();
    return;
  }
  if (hasScrollableAncestor(event.target, event.deltaY)) {
    stopWheelAnimation();
    return;
  }
  const maxScroll = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
  const current = window.scrollY;
  const delta = event.deltaMode === 2
    ? event.deltaY * window.innerHeight * 0.85
    : event.deltaMode === 1 ? event.deltaY * 36 : event.deltaY;
  if (!wheelFrame && ((delta > 0 && current >= maxScroll - 1) ||
                      (delta < 0 && current <= 0))) return;
  event.preventDefault();
  // Cap exceptional wheel deltas and combine successive notches into one target.
  if (!wheelFrame) wheelTarget = current;
  wheelTarget = Math.max(0, Math.min(maxScroll,
    wheelTarget + Math.max(-480, Math.min(480, delta))));
  if (!wheelFrame) wheelFrame = requestAnimationFrame(advanceWheelScroll);
}, { passive: false });

// Quick smooth "back to top" (about 0.4–0.65 s), even on very long pages.
// Explicit instant steps avoid a conflict with CSS scroll-behavior: smooth.
function scrollToPageTop() {
  stopWheelAnimation();
  stopBackToTopAnimation();
  const from = window.scrollY;
  if (reduceMotion || from < 2) {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    return;
  }
  const duration = Math.min(650, 340 + Math.sqrt(from) * 3.8);
  let started = null;
  const animate = (time) => {
    if (started === null) started = time;
    const t = Math.min(1, (time - started) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    window.scrollTo({ top: from * (1 - eased), left: 0, behavior: 'instant' });
    if (t < 1) backToTopFrame = requestAnimationFrame(animate);
    else {
      backToTopFrame = 0;
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  };
  backToTopFrame = requestAnimationFrame(animate);
}
$$('a[href="#page-top"]').forEach(link => link.addEventListener('click', (event) => {
  event.preventDefault();
  scrollToPageTop();
  if (window.location.hash && window.history?.replaceState) {
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch {}
  }
}));
// Native user navigation should always take precedence over JS animations.
window.addEventListener('touchstart', () => { stopWheelAnimation(); stopBackToTopAnimation(); }, { passive: true });
document.addEventListener('keydown', (event) => {
  if (['PageDown', 'PageUp', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar'].includes(event.key)) {
    stopWheelAnimation(); stopBackToTopAnimation();
  }
});
document.addEventListener('pointerdown', (event) => {
  if (event.target instanceof Element && event.target.closest('a[href^="#"]')) {
    stopWheelAnimation();
  }
});

// Плавная смена фотографий первого экрана
const heroStoreIds=["store-09", "store-12", "store-08", "store-03", "store-15", "store-13", "store-07", "store-05", "store-16", "store-10", "store-06", "store-17", "store-02", "store-01"];
const heroImages=heroStoreIds.map(id=>{
  const store=stores.find(item=>item.id===id);
  return {src:store.gallery[store.coverIndex],alt:`Магазин Чехляндия: ${store.name}, ${store.cityName}`};
});
let heroIndex=0,heroTimeout;
const heroImg=$('[data-hero-image]');
const heroSection=$('.hero-visual');
function setHero(delta){
  heroIndex=(heroIndex+delta+heroImages.length)%heroImages.length;
  const current=heroImages[heroIndex];
  heroImg.classList.add('change');
  clearTimeout(heroTimeout);
  heroTimeout=setTimeout(()=>{
    heroImg.src=current.src;heroImg.alt=current.alt;
    heroImg.parentElement.style.setProperty('--hero-blur',`url("${current.src}")`);
    heroImg.classList.remove('change');
  },reduceMotion?0:190);

}
if(!reduceMotion){setInterval(()=>{
  if(!document.hidden && !heroSection.matches(':hover') && !galleryStore)setHero(1);
},5800)}

// Доступная галерея: кнопки, клавиатура, свайпы и предпросмотр соседних кадров.
const overlay=$('[data-gallery]'),dialog=$('[data-gallery-dialog]'),galleryImg=$('[data-gallery-image]');
let galleryStore=null,photoIndex=0,returnFocus=null,touchStartX=null,toastTimer;
const photoCache=new Set();
function preload(url){if(photoCache.has(url))return;photoCache.add(url);const image=new Image();image.src=url}
function showPhoto(nextIndex){
  if(!galleryStore)return;
  const photos=galleryStore.gallery;
  photoIndex=(nextIndex+photos.length)%photos.length;
  resetPhotoZoom();
  galleryImg.classList.add('loading');galleryImg.src=photos[photoIndex];galleryImg.alt=`${galleryStore.name} – фото ${photoIndex+1} из ${photos.length}`;
  if(galleryImg.complete)galleryImg.classList.remove('loading');
  $('[data-gallery-counter]').textContent=`${photoIndex+1} / ${photos.length}`;
  const tray=$('[data-gallery-thumbnails]');tray.replaceChildren();
  const radius=Math.min(3,Math.floor((photos.length-1)/2));
  for(let step=-radius;step<=radius;step++){
    const index=(photoIndex+step+photos.length)%photos.length;
    const thumb=document.createElement('button');thumb.type='button';thumb.className=index===photoIndex?'active':'';
    thumb.setAttribute('aria-label',`Перейти к фотографии ${index+1}`);
    if(index===photoIndex)thumb.setAttribute('aria-current','true');
    const img=document.createElement('img');img.src=photos[index].replace('photos/','photos/thumb/');img.loading='lazy';img.decoding='async';img.alt='';
    thumb.append(img);thumb.addEventListener('click',()=>showPhoto(index));tray.append(thumb);
  }
  preload(photos[(photoIndex+1)%photos.length]);
  preload(photos[(photoIndex-1+photos.length)%photos.length]);
}
galleryImg.addEventListener('load',()=>galleryImg.classList.remove('loading'));
let galleryOpenedByKeyboard=false;
function openGallery(store,openedByKeyboard=false){
  galleryOpenedByKeyboard=openedByKeyboard;
  returnFocus=document.activeElement;galleryStore=store;photoIndex=0;
  $('[data-gallery-title]').textContent=store.name;
  $('[data-gallery-address]').textContent=store.address;
  $('[data-gallery-hint]').textContent=`Ежедневно ${store.hours}${store.hint?' · '+store.hint:''}`;
  $('[data-gallery-map]').href=store.map;
  overlay.hidden=false;document.body.classList.add('modal-open');
  showPhoto(store.coverIndex ?? 0);
  requestAnimationFrame(()=>$('[data-gallery-close]',dialog).focus());
}
function closeGallery(){
  if(!galleryStore)return;
  resetPhotoZoom();overlay.hidden=true;galleryStore=null;
  document.body.classList.remove('modal-open');galleryImg.removeAttribute('src');
  if(returnFocus?.isConnected){
    const opener=returnFocus;
    if(!galleryOpenedByKeyboard){
      opener.classList.add('gallery-focus-return');
      opener.addEventListener('blur',()=>opener.classList.remove('gallery-focus-return'),{once:true});
      opener.addEventListener('keydown',()=>opener.classList.remove('gallery-focus-return'),{once:true});
    }
    opener.focus({preventScroll:true});
  }
  returnFocus=null;galleryOpenedByKeyboard=false;
}
// Remember pointer-activated arrows so the scripted gallery focus does not
// draw keyboard-only outlines after a mouse click.
$$('.gallery-nav',dialog).forEach(button=>{
  button.addEventListener('pointerdown',()=>button.classList.add('pointer-activated'));
  button.addEventListener('keydown',()=>button.classList.remove('pointer-activated'));
  button.addEventListener('blur',()=>button.classList.remove('pointer-activated'));
});
$$('[data-gallery-close]').forEach(el=>el.addEventListener('click',closeGallery));
$('[data-gallery-prev]').addEventListener('click',()=>showPhoto(photoIndex-1));
$('[data-gallery-next]').addEventListener('click',()=>showPhoto(photoIndex+1));
document.addEventListener('keydown',event=>{
  if(!galleryStore){if(event.key==='Escape'&&!mobileNav.hidden){closeMenu();mobileToggle.focus()}return}
  if(event.key==='Escape'){event.preventDefault();closeGallery()}
  else if(event.key==='ArrowLeft'){event.preventDefault();showPhoto(photoIndex-1)}
  else if(event.key==='ArrowRight'){event.preventDefault();showPhoto(photoIndex+1)}
  else if(event.key==='Tab'){
    const list=$$('button:not([disabled]),a[href]',dialog).filter(x=>x.getClientRects().length);
    const first=list[0],last=list[list.length-1];
    if(!list.length)return;
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus()}
  }
});
const viewer=$('.gallery-viewer');
const zoomIn=$('[data-zoom-in]');
const zoomOut=$('[data-zoom-out]');
const zoomReset=$('[data-zoom-reset]');
let photoScale=1,photoOffsetX=0,photoOffsetY=0;
let activeGesture=null,lastTap=0;
function updatePhotoZoom(){
  const iw=galleryImg.clientWidth,ih=galleryImg.clientHeight;
  const maxX=Math.max(0,(iw*photoScale-viewer.clientWidth)/2);
  const maxY=Math.max(0,(ih*photoScale-viewer.clientHeight)/2);
  photoOffsetX=Math.min(maxX,Math.max(-maxX,photoOffsetX));
  photoOffsetY=Math.min(maxY,Math.max(-maxY,photoOffsetY));
  galleryImg.style.transform=`translate(${photoOffsetX}px,${photoOffsetY}px) scale(${photoScale})`;
  viewer.classList.toggle('zoomed',photoScale>1.02);
  zoomReset.textContent=`${Math.round(photoScale*100)}%`;
  zoomOut.disabled=photoScale<=1.01;
  zoomIn.disabled=photoScale>=4.99;
}
function setPhotoZoom(nextScale){
  photoScale=Math.max(1,Math.min(5,nextScale));
  if(photoScale===1){photoOffsetX=0;photoOffsetY=0;}
  updatePhotoZoom();
}
function resetPhotoZoom(){photoScale=1;photoOffsetX=0;photoOffsetY=0;updatePhotoZoom();}
zoomIn.addEventListener('click',()=>setPhotoZoom(photoScale*1.5));
zoomOut.addEventListener('click',()=>setPhotoZoom(photoScale/1.5));
zoomReset.addEventListener('click',resetPhotoZoom);
galleryImg.addEventListener('load',updatePhotoZoom);
window.addEventListener('resize',()=>{if(galleryStore)updatePhotoZoom()});
viewer.addEventListener('wheel',event=>{
  if(!galleryStore)return;
  event.preventDefault();
  setPhotoZoom(photoScale*(event.deltaY>0?.84:1.19));
},{passive:false});
viewer.addEventListener('dblclick',event=>{
  if(event.target.closest('button'))return;
  setPhotoZoom(photoScale>1.02?1:2.4);
});
const pinchDistance=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
viewer.addEventListener('touchstart',event=>{
  if(!galleryStore||event.target.closest('button'))return;
  if(event.touches.length===2){
    activeGesture={mode:'pinch',startDistance:pinchDistance(event.touches[0],event.touches[1]),startScale:photoScale};
  } else if(event.touches.length===1){
    const t=event.touches[0];
    activeGesture={mode:photoScale>1.02?'pan':'swipe',startX:t.clientX,startY:t.clientY,offsetX:photoOffsetX,offsetY:photoOffsetY};
  }
},{passive:true});
viewer.addEventListener('touchmove',event=>{
  if(!activeGesture||!galleryStore)return;
  if(event.touches.length===2){
    event.preventDefault();
    if(activeGesture.mode!=='pinch')activeGesture={mode:'pinch',startDistance:pinchDistance(event.touches[0],event.touches[1]),startScale:photoScale};
    setPhotoZoom(activeGesture.startScale*(pinchDistance(event.touches[0],event.touches[1])/Math.max(10,activeGesture.startDistance)));
  } else if(event.touches.length===1&&activeGesture.mode==='pan'){
    event.preventDefault();
    photoOffsetX=activeGesture.offsetX+(event.touches[0].clientX-activeGesture.startX);
    photoOffsetY=activeGesture.offsetY+(event.touches[0].clientY-activeGesture.startY);
    updatePhotoZoom();
  }
},{passive:false});
viewer.addEventListener('touchend',event=>{
  if(!activeGesture||!galleryStore)return;
  if(event.touches.length>0){if(event.touches.length===1)activeGesture=null;return;}
  if(activeGesture.mode==='swipe'&&event.changedTouches.length){
    const end=event.changedTouches[0];
    const dx=end.clientX-activeGesture.startX,dy=end.clientY-activeGesture.startY;
    if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.2){showPhoto(photoIndex+(dx<0?1:-1));lastTap=0;}
    else if(Math.abs(dx)<16&&Math.abs(dy)<16){
      const now=Date.now();
      if(now-lastTap<320){setPhotoZoom(photoScale>1.02?1:2.5);lastTap=0;}
      else lastTap=now;
    }
  }
  activeGesture=null;
},{passive:true});
viewer.addEventListener('touchcancel',()=>{activeGesture=null},{passive:true});
let mouseDrag=null;
viewer.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'||photoScale<=1.02||event.target.closest('button'))return;
  mouseDrag={x:event.clientX,y:event.clientY,ox:photoOffsetX,oy:photoOffsetY};
  viewer.setPointerCapture(event.pointerId);
});
viewer.addEventListener('pointermove',event=>{
  if(!mouseDrag)return;
  photoOffsetX=mouseDrag.ox+event.clientX-mouseDrag.x;
  photoOffsetY=mouseDrag.oy+event.clientY-mouseDrag.y;
  updatePhotoZoom();
});
viewer.addEventListener('pointerup',()=>{mouseDrag=null});
viewer.addEventListener('pointercancel',()=>{mouseDrag=null});

// Копирование телефона с fallback для локального просмотра.
function showToast(message){const el=$('[data-toast]');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2000)}
async function copy(value){
 if(navigator.clipboard && window.isSecureContext){await navigator.clipboard.writeText(value);return}
 const field=document.createElement('textarea');field.value=value;field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();const ok=document.execCommand('copy');field.remove();if(!ok)throw new Error('copy failed');
}
$('[data-copy-phone]').addEventListener('click',async()=>{
 try {await copy('+7 914 200-44-55');showToast('Телефон скопирован')}catch{showToast('Не удалось скопировать номер')}
});


const requisitesDialog=document.querySelector('[data-requisites-dialog]');
const requisitesTrigger=document.querySelector('[data-requisites-open]');
const requisitesClose=document.querySelector('[data-requisites-close]');
if(requisitesDialog&&requisitesTrigger&&requisitesClose){
  requisitesTrigger.addEventListener('click',()=>requisitesDialog.showModal());
  requisitesClose.addEventListener('click',()=>requisitesDialog.close());
  requisitesDialog.addEventListener('click',event=>{
    if(event.target===requisitesDialog)requisitesDialog.close();
  });
}
