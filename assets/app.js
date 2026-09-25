/* Атлас МОЖД — карта построек Московской окружной железной дороги */
(function () {
  'use strict';
  const D = window.MOZD || {objects: [], stations: [], media: {}, albums: {}, kinds: {}};
  const OV = window.MOZD_OVERLAYS || [];
  const RING = window.MOZD_RING || [];
  const STATIONS = D.stations || [];

  const STATUS = {
    okn: {label: 'Сохранился, объект культурного наследия', short: 'ОКН'},
    nostatus: {label: 'Сохранился, без охранного статуса', short: 'без статуса'},
    moved: {label: 'Перенесён на другое место', short: 'перенесён'},
    lost: {label: 'Утрачен', short: 'утрачен'},
    unknown: {label: 'Сохранность не установлена', short: 'нет данных'}
  };
  const BRIDGE_KINDS = new Set(['bridge', 'overpass', 'viaduct', 'culvert', 'footbridge']);
  const byId = new Map(D.objects.map(o => [o.id, o]));
  const stById = new Map(STATIONS.map(s => [s.id, s]));

  // ---------- map ----------
  const map = L.map('map', {zoomControl: false, attributionControl: true, minZoom: 9, maxZoom: 19}).setView([55.765, 37.61], 11);
  L.control.zoom({position: 'bottomleft'}).addTo(map);
  L.control.scale({position: 'bottomleft', imperial: false}).addTo(map);

  // Подложки. Стандартные тайлы tile.openstreetmap.org отдаются только страницам с заголовком Referer,
  // поэтому при открытии файла с диска (file://) они недоступны; тайлы OSM France и Esri работают и так.
  // CARTO с сентября 2026 г. требует бесплатный ключ: его можно вписать в CONFIG.cartoKey.
  const CONFIG = Object.assign({cartoKey: ''}, window.MOZD_CONFIG || {});
  const isFile = location.protocol === 'file:';
  const OSM_ATTR = '© участники <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  const osmfr = (cls) => L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {subdomains: 'abc', maxZoom: 20, maxNativeZoom: 19, className: cls || '', attribution: OSM_ATTR + ', тайлы © <a href="https://www.openstreetmap.fr/">OpenStreetMap France</a>'});
  const esri = (svc, attr, native) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`, {maxZoom: 20, maxNativeZoom: native || 19, attribution: attr});
  const bases = {
    light: {title: 'Светлая (OSM, серая)', layer: osmfr('tiles-gray')},
    color: {title: 'OSM, цветная', layer: osmfr('')},
    osm: {title: 'OpenStreetMap (стандартная)', layer: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 20, maxNativeZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', attribution: OSM_ATTR}),
          disabled: isFile, hint: 'работает только на сайте, не с диска'},
    gray: {title: 'Esri, светло-серая', layer: esri('Canvas/World_Light_Gray_Base', 'Карта © Esri, HERE, Garmin, © OpenStreetMap', 16)},
    sat: {title: 'Спутник (Esri)', layer: esri('World_Imagery', 'Снимки © Esri, Maxar, Earthstar Geographics')},
    none: {title: 'Без подложки', layer: L.layerGroup()}
  };
  if (CONFIG.cartoKey) {
    bases.carto = {title: 'Светлая (CARTO)', layer: L.tileLayer(`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CONFIG.cartoKey)}`, {subdomains: 'abcd', maxZoom: 20, attribution: OSM_ATTR + ', © <a href="https://carto.com/attributions">CARTO</a>'})};
  }
  let currentBase = 'light';
  bases[currentBase].layer.addTo(map);
  const basesBox = document.getElementById('bases');
  Object.entries(bases).forEach(([id, b]) => {
    const lab = document.createElement('label');
    if (b.disabled) lab.className = 'disabled';
    lab.innerHTML = `<input type="radio" name="base" value="${id}" ${id === currentBase ? 'checked' : ''} ${b.disabled ? 'disabled' : ''}> ${b.title}${b.disabled && b.hint ? ` <small>(${b.hint})</small>` : ''}`;
    lab.querySelector('input').addEventListener('change', () => { map.removeLayer(bases[currentBase].layer); currentBase = id; b.layer.addTo(map); if (b.layer.bringToBack) b.layer.bringToBack(); });
    basesBox.appendChild(lab);
  });

  // ---------- historical overlays ----------
  map.createPane('hist'); map.getPane('hist').style.zIndex = 350;
  map.createPane('stplan'); map.getPane('stplan').style.zIndex = 360;
  const ovBox = document.getElementById('overlays');
  let lastGroup = null;
  OV.forEach((o) => {
    const grp = L.layerGroup();
    const pane = o.id.startsWith('st_') ? 'stplan' : 'hist';
    const imgs = (o.chunks || []).map(c => L.imageOverlay(c.url, c.bounds, {pane, opacity: o.opacity ?? 0.75, interactive: false}));
    imgs.forEach(i => grp.addLayer(i));
    if (o.group && o.group !== lastGroup) { const g = document.createElement('div'); g.className = 'grp'; g.textContent = o.group; ovBox.appendChild(g); lastGroup = o.group; }
    const wrap = document.createElement('div'); wrap.className = 'ov';
    const op = Math.round((o.opacity ?? 0.75) * 100);
    wrap.innerHTML = `<label><input type="checkbox"> ${esc(o.title)}</label>` +
      (o.note ? `<p class="meta">${esc(o.note)}</p>` : '') +
      `<input type="range" min="0" max="100" value="${op}" aria-label="Непрозрачность: ${escAttr(o.title)}" disabled>`;
    const cb = wrap.querySelector('input[type=checkbox]'), rg = wrap.querySelector('input[type=range]');
    cb.addEventListener('change', () => {
      if (cb.checked) { grp.addTo(map); rg.disabled = false; if (o.fit && !o._silent) map.fitBounds(o.fit, {maxZoom: 16}); }
      else { map.removeLayer(grp); rg.disabled = true; }
      o._silent = false;
    });
    rg.addEventListener('input', () => imgs.forEach(i => i.setOpacity(rg.value / 100)));
    o._cb = cb;
    ovBox.appendChild(wrap);
    if (o.default) { o._silent = true; cb.checked = true; cb.dispatchEvent(new Event('change')); }
  });
  if (!OV.length) ovBox.innerHTML = '<p class="note">Слои появятся после привязки карт.</p>';

  // ---------- ring line ----------
  map.createPane('ring'); map.getPane('ring').style.zIndex = 420;
  if (RING.length) L.polyline(RING, {pane: 'ring', color: getCss('--ring'), weight: 2, opacity: .65, interactive: false}).addTo(map);

  // ---------- station labels ----------
  map.createPane('stlabels'); map.getPane('stlabels').style.zIndex = 630;
  const stLayer = L.layerGroup().addTo(map);
  STATIONS.forEach(s => {
    const icon = L.divIcon({className: 'st-label', html: `<button type="button">${esc(s.name)}</button>`, iconSize: null});
    const m = L.marker([s.lat, s.lon], {icon, pane: 'stlabels', keyboard: false, title: 'Станция ' + s.name});
    m.on('click', () => openStation(s.id));
    stLayer.addLayer(m);
  });
  const syncLabels = () => document.getElementById('map').classList.toggle('z-low', map.getZoom() < 12);
  map.on('zoomend', syncLabels); syncLabels();

  // ---------- markers ----------
  map.createPane('pts'); map.getPane('pts').style.zIndex = 640;
  const markers = new Map();
  const statusOn = Object.fromEntries(Object.keys(STATUS).map(k => [k, true]));
  const fStation = document.getElementById('f-station'), fKind = document.getElementById('f-kind');
  const counts = {};
  const stations = [...new Set(D.objects.map(o => o.station).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  stations.forEach(s => fStation.add(new Option(s, s)));
  const kinds = [...new Set(D.objects.map(o => o.kind))].sort((a, b) => kindName(a).localeCompare(kindName(b), 'ru'));
  kinds.forEach(k => fKind.add(new Option(kindName(k), k)));

  D.objects.forEach(o => {
    counts[o.status] = (counts[o.status] || 0) + 1;
    if (o.lat == null || o.lon == null) return;
    const icon = L.divIcon({className: 'mk', iconSize: [20, 20], html: symHTML(o)});
    const m = L.marker([o.lat, o.lon], {icon, pane: 'pts', keyboard: true, title: o.name, riseOnHover: true});
    m.bindTooltip(`<b>${esc(o.name)}</b>${o.station ? '<br>' + esc(o.station) : ''}`, {className: 'tt', direction: 'top', offset: [0, -8]});
    m.on('click', () => openCard(o.id));
    markers.set(o.id, {m, o});
  });

  const legend = document.getElementById('legend');
  Object.entries(STATUS).forEach(([k, s]) => {
    if (!counts[k]) return;
    const lab = document.createElement('label');
    lab.innerHTML = `<input type="checkbox" checked> <span class="sym ${k}"></span> ${s.label} <span class="n">${counts[k]}</span>`;
    lab.querySelector('input').addEventListener('change', e => { statusOn[k] = e.target.checked; applyFilters(); });
    legend.appendChild(lab);
  });
  const hint = document.createElement('p'); hint.className = 'legend-hint';
  hint.innerHTML = '<span class="sym unknown bridge"></span> ромб — мосты и путепроводы · <span class="sym unknown approx"></span> пунктир — положение приблизительное · подписи станций открывают карточку станции';
  legend.appendChild(hint);
  fStation.addEventListener('change', () => applyFilters(true));
  fKind.addEventListener('change', () => applyFilters());

  function applyFilters(fit) {
    let n = 0; const b = [];
    markers.forEach(({m, o}) => {
      const on = statusOn[o.status] !== false && (!fStation.value || o.station === fStation.value) && (!fKind.value || o.kind === fKind.value);
      if (on) { if (!map.hasLayer(m)) m.addTo(map); n++; b.push([o.lat, o.lon]); } else if (map.hasLayer(m)) map.removeLayer(m);
    });
    document.getElementById('counter').textContent = `На карте: ${n} из ${markers.size} · всего в каталоге: ${D.objects.length}`;
    if (fit && b.length) map.fitBounds(b, {padding: [60, 60], maxZoom: 17});
  }
  applyFilters();

  // unlocated list
  const unl = D.objects.filter(o => o.lat == null);
  const unBox = document.getElementById('unlocated');
  if (unBox) {
    if (unl.length) {
      unBox.querySelector('summary').textContent = `Без точной привязки (${unl.length})`;
      const ul = unBox.querySelector('ul');
      unl.sort((a, b) => (a.station || '').localeCompare(b.station || '', 'ru') || a.name.localeCompare(b.name, 'ru')).forEach(o => {
        const li = document.createElement('li');
        li.innerHTML = `<button type="button"><span class="sym ${o.status} ${BRIDGE_KINDS.has(o.kind) ? 'bridge' : ''}"></span> ${esc(o.name)}${o.station ? ' <small>' + esc(o.station) + '</small>' : ''}</button>`;
        li.querySelector('button').addEventListener('click', () => openCard(o.id));
        ul.appendChild(li);
      });
    } else unBox.hidden = true;
  }

  // ---------- panel toggle (mobile) ----------
  const panel = document.getElementById('panel'), pt = document.getElementById('panel-toggle');
  pt.addEventListener('click', () => { const open = panel.classList.toggle('open'); pt.setAttribute('aria-expanded', open); });

  // ---------- search ----------
  const q = document.getElementById('q'), res = document.getElementById('results');
  const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е');
  q.addEventListener('input', () => {
    const t = norm(q.value.trim()); res.innerHTML = '';
    if (t.length < 2) { res.hidden = true; return; }
    const sh = STATIONS.filter(s => norm('станция ' + s.name).includes(t)).slice(0, 4);
    const hits = D.objects.filter(o => norm([o.name, o.station, o.address, kindName(o.kind)].join(' ')).includes(t)).slice(0, 14);
    sh.forEach(s => addRes(`<span class="st-dot"></span> Станция ${esc(s.name)}<br><small>карточка станции</small>`, () => openStation(s.id, true)));
    hits.forEach(o => addRes(`<span class="sym ${o.status} ${BRIDGE_KINDS.has(o.kind) ? 'bridge' : ''}" style="width:10px;height:10px;vertical-align:middle"></span> ${esc(o.name)}<br><small>${esc(o.station || kindName(o.kind))}${o.lat == null ? ' · без привязки' : ''}</small>`, () => openCard(o.id, true)));
    res.hidden = !(hits.length + sh.length);
  });
  function addRes(html, fn) { const li = document.createElement('li'); li.innerHTML = `<button type="button">${html}</button>`; li.querySelector('button').addEventListener('click', () => { res.hidden = true; q.value = ''; fn(); }); res.appendChild(li); }
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { res.hidden = true; q.blur(); } });

  // ---------- card ----------
  const card = document.getElementById('card'), body = document.getElementById('card-body');
  let selected = null;
  document.getElementById('card-close').addEventListener('click', closeCard);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) closeLb(); else if (e.key === 'Escape' && !card.hidden) closeCard(); });

  function showCard(html, hash) {
    body.innerHTML = html;
    body.querySelectorAll('[data-full]').forEach(btn => btn.addEventListener('click', () => openLb(btn.dataset.full, btn.dataset.cap)));
    body.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); route(a.getAttribute('href').slice(1), true); }));
    card.hidden = false; card.scrollTop = 0;
    if (window.innerWidth > 760) panel.style.visibility = 'hidden';
    try { history.replaceState(null, '', '#' + hash); } catch (e) {}
  }
  function unselect() { if (selected) { const s = markers.get(selected); if (s && s.m.getElement()) s.m.getElement().classList.remove('sel'); selected = null; } }
  function openCard(id, fly) {
    const o = byId.get(id); if (!o) return;
    const rec = markers.get(id);
    unselect(); selected = id; if (rec && rec.m.getElement()) rec.m.getElement().classList.add('sel');
    showCard(renderCard(o), id);
    if (fly && rec) map.flyTo([o.lat, o.lon], Math.max(map.getZoom(), 16), {duration: .6});
  }
  function openStation(id, fly) {
    const s = stById.get(id); if (!s) return;
    unselect(); showCard(renderStation(s), id);
    if (fly) map.flyTo([s.lat, s.lon], Math.max(map.getZoom(), 15), {duration: .6});
  }
  function route(id, fly) { if (byId.has(id)) openCard(id, fly); else if (stById.has(id)) openStation(id, fly); }
  function closeCard() {
    card.hidden = true; panel.style.visibility = '';
    unselect();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }

  function chips(o) {
    const st = STATUS[o.status] || STATUS.unknown;
    let h = `<div class="chips"><span class="chip"><span class="sym ${o.status}"></span>${st.label}</span>`;
    if (o.okn && o.okn.cat) h += `<span class="chip">${esc(o.okn.cat)}</span>`;
    if (o.approx) h += `<span class="chip">положение приблизительное</span>`;
    if (o.lat == null) h += `<span class="chip">на карту не нанесено</span>`;
    return h + `</div>`;
  }

  function albumBlock(list, empty) {
    if (!list || !list.length) return `<p class="empty">${empty}</p>`;
    return `<div class="shots">` + list.map(a => {
      const A = D.albums[a.a]; if (!A) return '';
      const pages = a.pages > 1 ? `стр. ${a.page}–${a.page + a.pages - 1}` : `стр. ${a.page}`;
      const cap = `${A.short}${a.sheet ? ', л. ' + a.sheet : ''}, ${pages} PDF`;
      return `<figure class="shot"><button type="button" data-full="${pageThumb(A, a.page, 1920)}" data-cap="${escAttr(a.title + ' — ' + cap)}"><img loading="lazy" src="${pageThumb(A, a.page, 960)}" alt="${escAttr(a.title)}"></button>` +
        `<figcaption><b>${esc(a.title)}</b><br><span class="sheet-ref">${esc(cap)}</span> · <a href="${pageLink(A, a.page)}" target="_blank" rel="noopener">открыть лист</a></figcaption></figure>`;
    }).join('') + `</div>`;
  }

  function renderCard(o) {
    let h = `<p class="eyebrow">${esc(o.station || '')}${o.station ? ' · ' : ''}${esc(kindName(o.kind))}</p><h2>${esc(o.name)}</h2>` + chips(o);
    const rows = [];
    if (o.built) rows.push(['Постройка', esc(o.built)]);
    if (o.arch) rows.push(['Авторы', esc(o.arch)]);
    if (o.address) rows.push(['Адрес', esc(o.address)]);
    if (o.verst) rows.push(['Пикетаж', esc(o.verst + '-я верста')]);
    if (o.demolished) rows.push([o.status === 'moved' ? 'Перенесён' : 'Утрачен', esc(o.demolished)]);
    if (o.okn && o.okn.reg) rows.push(['Рег. № ЕГРОКН', `<span class="sheet-ref">${esc(o.okn.reg)}</span>`]);
    const stn = STATIONS.find(s => s.name === o.station);
    if (stn) rows.push(['Станция', `<a href="#${stn.id}">${esc(stn.name)} — карточка станции</a>`]);
    if (rows.length) h += `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

    h += `<h3>В альбомах 1908–1909 гг.</h3>` + albumBlock(o.album, 'Отдельного листа для этого объекта в альбомах нет или он ещё не найден.');

    if (o.status === 'lost') {
      h += `<h3>Утрата</h3><p>${esc(o.state || 'Обстоятельства утраты не установлены.')}</p>`;
    } else {
      h += `<h3>Сейчас</h3>`;
      if (o.state) h += `<p>${esc(o.state)}</p>`;
      h += shots(o.photos, 'Современных фото пока нет — добавьте свои снимки с выезда.');
    }
    h += `<h3>Исторические фото</h3>` + shots(o.hist, 'Исторических фото пока не найдено. Проверьте PastVu по ссылке ниже.');
    h += linksBlock(o);
    if (o.sources) h += `<p class="note" style="margin-top:12px">Источники: ${esc(o.sources)}</p>`;
    return h;
  }

  function renderStation(s) {
    const objs = D.objects.filter(o => o.station === s.name);
    const c = {}; objs.forEach(o => c[o.status] = (c[o.status] || 0) + 1);
    let h = `<p class="eyebrow">Станция МОЖД</p><h2>${esc(s.name)}</h2>`;
    h += `<div class="chips">` + Object.keys(STATUS).filter(k => c[k]).map(k => `<span class="chip"><span class="sym ${k}"></span>${STATUS[k].short}: ${c[k]}</span>`).join('') + (s.okn && s.okn.cat ? `<span class="chip">${esc(s.okn.cat)}</span>` : '') + `</div>`;
    if (s.text) h += `<p>${esc(s.text)}</p>`;
    if (s.okn && s.okn.reg) h += `<p class="note">Рег. № комплекса в ЕГРОКН: <span class="sheet-ref">${esc(s.okn.reg)}</span></p>`;
    const ov = OV.find(o => o.id.startsWith('st_') && o.title.endsWith(s.name));
    if (ov) h += `<p><button type="button" class="btn-inline" id="st-plan-btn">Показать план станции 1909 г. на карте</button></p>`;
    if (objs.length) {
      h += `<h3>Постройки (${objs.length})</h3><ul class="objlist">` + objs.sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(o =>
        `<li><a href="#${o.id}"><span class="sym ${o.status} ${BRIDGE_KINDS.has(o.kind) ? 'bridge' : ''}"></span><span>${esc(o.name)}${o.address ? '<small>' + esc(o.address) + '</small>' : ''}</span></a></li>`).join('') + `</ul>`;
    }
    h += `<h3>В альбомах 1908–1909 гг.</h3>` + albumBlock(s.album, 'Листов нет.');
    if (s.note) h += `<p class="note">${esc(s.note)}</p>`;
    if (s.hist && s.hist.length) h += `<h3>Исторические фото</h3>` + shots(s.hist, '');
    if (s.photos && s.photos.length) h += `<h3>Сейчас</h3>` + shots(s.photos, '');
    h += linksBlock(s);
    setTimeout(() => { const b = document.getElementById('st-plan-btn'); if (b && ov) b.addEventListener('click', () => { if (!ov._cb.checked) { ov._cb.checked = true; ov._cb.dispatchEvent(new Event('change')); } else map.fitBounds(ov.fit, {maxZoom: 16}); }); }, 0);
    return h;
  }

  function linksBlock(o) {
    const L2 = [];
    if (o.lat != null) L2.push(['PastVu рядом', `https://pastvu.com/?g=${o.lat},${o.lon}&z=17&s=osm&t=mapnik&y=1`]);
    if (o.lat != null) L2.push(['Яндекс Карты', `https://yandex.ru/maps/?ll=${o.lon},${o.lat}&z=18&l=map`]);
    if (o.okn && o.okn.knid) L2.push(['Викигид', `https://ru.wikivoyage.org/w/index.php?search=${o.okn.knid}`]);
    if (o.wd) L2.push(['Wikidata', `https://www.wikidata.org/wiki/${o.wd}`]);
    if (o.commonscat) L2.push(['Фото на Commons', `https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(o.commonscat.replace(/ /g, '_'))}`]);
    (o.links || []).forEach(l => L2.push(l));
    if (!L2.length) return '';
    return `<h3>Ссылки</h3><div class="links">${L2.map(([t, u]) => u.startsWith('#') ? `<a href="${escAttr(u)}">${esc(t)}</a>` : `<a href="${escAttr(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join('')}</div>`;
  }

  function shots(list, emptyText) {
    if (!list || !list.length) return emptyText ? `<p class="empty">${emptyText}</p>` : '';
    return `<div class="shots">` + list.map(p => {
      let src, full, cap, credit = '';
      if (p.a) { const A = D.albums[p.a]; src = pageThumb(A, p.page, 960); full = pageThumb(A, p.page, 1920); cap = p.cap || A.short; credit = `${A.short}, стр. ${p.page} PDF · <a href="${pageLink(A, p.page)}" target="_blank" rel="noopener">источник</a>`; }
      else if (p.src) { src = p.src; full = p.full || p.src; cap = p.cap || ''; credit = p.credit || ''; }
      else {
        const m = (D.media || {})[p.file]; if (!m) return '';
        src = m.thumb; full = m.full || m.thumb; cap = p.cap || m.desc || '';
        credit = [m.date, m.author, m.lic].filter(Boolean).map(esc).join(' · ') + ` · <a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.file.replace(/ /g, '_'))}" target="_blank" rel="noopener">Commons</a>`;
      }
      return `<figure class="shot"><button type="button" data-full="${escAttr(full)}" data-cap="${escAttr(cap)}"><img loading="lazy" src="${escAttr(src)}" alt="${escAttr(cap)}"></button><figcaption>${cap ? '<b>' + esc(cap) + '</b><br>' : ''}${credit}</figcaption></figure>`;
    }).join('') + `</div>`;
  }

  // ---------- lightbox ----------
  const lb = document.getElementById('lightbox'), lbImg = document.getElementById('lb-img'), lbCap = document.getElementById('lb-cap');
  function openLb(src, cap) { lbImg.src = src; lbImg.alt = cap || ''; lbCap.textContent = cap || ''; lb.hidden = false; }
  function closeLb() { lb.hidden = true; lbImg.removeAttribute('src'); }
  document.getElementById('lb-close').addEventListener('click', closeLb);
  lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });

  // ---------- helpers ----------
  function pageThumb(A, page, w) { const f = encodeURIComponent(A.file); return `https://upload.wikimedia.org/wikipedia/commons/thumb/${A.hash}/${f}/page${page}-${w}px-${f}.jpg`; }
  function pageLink(A, page) { return `https://commons.wikimedia.org/w/index.php?title=File:${encodeURIComponent(A.file)}&page=${page}`; }
  function kindName(k) { return (D.kinds && D.kinds[k]) || k || ''; }
  function symHTML(o) { return `<span class="sym ${o.status} ${BRIDGE_KINDS.has(o.kind) ? 'bridge' : ''} ${o.approx ? 'approx' : ''}"></span>`; }
  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])); }
  function escAttr(s) { return esc(s).replace(/'/g, '&#39;'); }
  function getCss(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#B3261E'; }

  // deep link / initial view
  window.addEventListener('hashchange', () => { const h = decodeURIComponent(location.hash.slice(1)); if (h && (byId.has(h) || stById.has(h))) route(h, true); });
  const h0 = decodeURIComponent(location.hash.slice(1));
  if (h0 && (byId.has(h0) || stById.has(h0))) setTimeout(() => route(h0, true), 300);
  else if (markers.size) { const b = [...markers.values()].map(({o}) => [o.lat, o.lon]); map.fitBounds(b, {padding: [40, 40]}); }
})();
