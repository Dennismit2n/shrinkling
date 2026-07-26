/* shrinkling — app logic. Everything runs locally; no image ever leaves the browser. */
'use strict';

(function () {
  var MAX_FILES = 40;
  var MIN_QUALITY = 0.4;

  var PRESETS = {
    // maxEdge on the byte-limited presets keeps quality high: shrinking pixels
    // first beats crushing a huge photo with quality 0.4 at the same byte cost.
    email: { maxBytes: 2 * 1024 * 1024, maxEdge: 2560, format: 'jpeg', quality: 0.87 },
    apply: { maxBytes: 1 * 1024 * 1024, maxEdge: 2560, format: 'jpeg', quality: 0.87 },
    ads:   { maxBytes: 1 * 1024 * 1024, maxEdge: 1920, format: 'jpeg', quality: 0.87 },
    web:   { maxBytes: null,            maxEdge: 1920, format: 'webp', quality: 0.82 }
  };
  var MIME = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
  var EXT = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };

  var $ = function (id) { return document.getElementById(id); };
  var dropzone = $('dropzone'), fileInput = $('fileInput'), btnPick = $('btnPick'),
      btnPaste = $('btnPaste'), toastEl = $('toast'),
      presetBtns = document.querySelectorAll('.preset'),
      customBox = $('customBox'), sizeInput = $('sizeInput'), sizeUnit = $('sizeUnit'),
      edgeInput = $('edgeInput'), formatSelect = $('formatSelect'),
      qualityRange = $('qualityRange'), qualityOut = $('qualityOut'),
      resultsPanel = $('resultsPanel'), resultList = $('resultList'),
      btnZip = $('btnZip'), btnClear = $('btnClear'), totalLine = $('totalLine'),
      lightbox = $('lightbox'), lightboxImg = $('lightboxImg'), lightboxClose = $('lightboxClose'),
      langSelect = $('langSelect');

  var activePreset = 'email';
  var items = [];           // { file, row: {...dom}, status, blob, url, outName, forcePng, notes }
  var queue = Promise.resolve();
  var runToken = 0;         // bumped when settings change: stale reprocess runs bail out

  /* ---------- settings ---------- */

  function readSettings() {
    if (activePreset !== 'custom') {
      var p = PRESETS[activePreset];
      return { maxBytes: p.maxBytes, maxEdge: p.maxEdge, format: p.format, quality: p.quality };
    }
    var bytes = null;
    var n = parseFloat(sizeInput.value);
    if (isFinite(n) && n > 0) {
      bytes = Math.round(n * (sizeUnit.value === 'mb' ? 1024 * 1024 : 1024));
    }
    var edge = parseInt(edgeInput.value, 10);
    return {
      maxBytes: bytes,
      maxEdge: (isFinite(edge) && edge >= 16) ? edge : null,
      format: formatSelect.value,
      quality: qualityRange.value / 100
    };
  }

  function setActivePreset(id) {
    activePreset = id;
    for (var i = 0; i < presetBtns.length; i++) {
      presetBtns[i].setAttribute('aria-pressed', String(presetBtns[i].dataset.preset === id));
    }
  }

  for (var pi = 0; pi < presetBtns.length; pi++) {
    presetBtns[pi].addEventListener('click', function () {
      setActivePreset(this.dataset.preset);
      reprocessAll();
    });
  }

  function onCustomChange() {
    if (activePreset !== 'custom') { setActivePreset('custom'); }
    qualityOut.textContent = qualityRange.value + ' %';
    reprocessAllDebounced();
  }

  var debounceTimer = null;
  function reprocessAllDebounced() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reprocessAll, 400);
  }

  var customInputs = [sizeInput, sizeUnit, edgeInput, formatSelect, qualityRange];
  for (var ci = 0; ci < customInputs.length; ci++) {
    customInputs[ci].addEventListener('input', onCustomChange);
    customInputs[ci].addEventListener('change', onCustomChange);
  }

  /* ---------- file intake ---------- */

  function looksLikeHeic(file) {
    return /image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name);
  }

  function acceptFiles(fileList) {
    var files = [];
    for (var i = 0; i < fileList.length; i++) { files.push(fileList[i]); }
    if (!files.length) { return; }
    var room = MAX_FILES - items.length;
    if (files.length > room) {
      files = files.slice(0, Math.max(0, room));
      alert(i18n.fmt('errTooMany', { n: MAX_FILES }));
      if (!files.length) { return; }
    }
    resultsPanel.hidden = false;
    for (var j = 0; j < files.length; j++) {
      var item = makeItem(files[j]);
      items.push(item);
      enqueue(item);
    }
    resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  btnPick.addEventListener('click', function (e) {
    e.stopPropagation();
    fileInput.click();
  });

  // the whole zone is a convenient mouse target; keyboard users use the real button inside
  dropzone.addEventListener('click', function () { fileInput.click(); });

  fileInput.addEventListener('change', function () {
    acceptFiles(fileInput.files);
    fileInput.value = '';
  });

  ['dragover', 'drop'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); });
  });

  dropzone.addEventListener('dragover', function () { dropzone.classList.add('is-drag'); });
  dropzone.addEventListener('dragleave', function (e) {
    // ignore dragleave fired when moving over the zone's own children
    if (e.relatedTarget && dropzone.contains(e.relatedTarget)) { return; }
    dropzone.classList.remove('is-drag');
  });
  dropzone.addEventListener('drop', function (e) {
    dropzone.classList.remove('is-drag');
    if (e.dataTransfer && e.dataTransfer.files) { acceptFiles(e.dataTransfer.files); }
  });

  document.addEventListener('paste', function (e) {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) {
      acceptFiles(e.clipboardData.files);
    }
  });

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3000);
  }

  // visible paste path for people who never learned Ctrl+V (context menus
  // offer no paste on plain elements) — only where the clipboard API exists
  if (navigator.clipboard && navigator.clipboard.read) {
    btnPaste.hidden = false;
    btnPaste.addEventListener('click', function (e) {
      e.stopPropagation();
      navigator.clipboard.read().then(function (clipItems) {
        var picks = [];
        var chain = Promise.resolve();
        clipItems.forEach(function (ci) {
          var type = null;
          for (var i = 0; i < ci.types.length; i++) {
            if (ci.types[i].indexOf('image/') === 0) { type = ci.types[i]; break; }
          }
          if (!type) { return; }
          chain = chain.then(function () {
            return ci.getType(type).then(function (blob) {
              var name = 'clipboard-' + (picks.length + 1) + '.' + (EXT[blob.type] || 'png');
              picks.push(new File([blob], name, { type: blob.type }));
            });
          });
        });
        return chain.then(function () {
          if (picks.length) { acceptFiles(picks); }
          else { toast(i18n.t('errNoClipImage')); }
        });
      }).catch(function () {
        toast(i18n.t('errNoClipImage'));
      });
    });
  }

  /* ---------- result rows ---------- */

  function makeItem(file) {
    var li = document.createElement('li');
    li.className = 'result-row';

    var thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'result-thumb is-empty';
    thumb.setAttribute('aria-label', i18n.t('viewLarge'));
    thumb.setAttribute('data-i18n-aria', 'viewLarge');

    var info = document.createElement('div');
    info.className = 'result-info';
    var name = document.createElement('p');
    name.className = 'result-name';
    name.textContent = file.name;
    name.title = file.name;
    var sizes = document.createElement('p');
    sizes.className = 'result-sizes';
    sizes.innerHTML = '<span class="spinner"></span> <span class="status-text"></span>';
    var note = document.createElement('p');
    note.className = 'result-note';
    note.hidden = true;
    info.appendChild(name);
    info.appendChild(sizes);
    info.appendChild(note);

    var dl = document.createElement('div');
    dl.className = 'result-dl';
    var dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.className = 'btn';
    dlBtn.disabled = true;
    dlBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3v10.6l-3.3-3.3-1.4 1.4L12 17.4l4.7-5.7-1.4-1.4L13 13.6V3h-1zM5 19h14v2H5z" fill="currentColor"/></svg><span data-i18n="btnDownload"></span>';
    dlBtn.querySelector('span').textContent = i18n.t('btnDownload');
    // aria-label keeps the name when CSS hides the span on narrow screens
    dlBtn.setAttribute('aria-label', i18n.t('btnDownload'));
    dlBtn.setAttribute('data-i18n-aria', 'btnDownload');
    dl.appendChild(dlBtn);

    li.appendChild(thumb);
    li.appendChild(info);
    li.appendChild(dl);
    resultList.appendChild(li);

    var item = {
      file: file,
      status: 'waiting',
      blob: null,
      url: null,
      outName: null,
      forcePng: false,
      row: { li: li, thumb: thumb, sizes: sizes, note: note, dlBtn: dlBtn }
    };

    setStatus(item, 'waiting');

    thumb.addEventListener('click', function () {
      if (item.url) { openLightbox(item.url); }
    });

    dlBtn.addEventListener('click', function () {
      if (item.blob) { downloadBlob(item.blob, item.outName); }
    });

    return item;
  }

  function setStatus(item, status) {
    item.status = status;
    var st = item.row.sizes.querySelector('.status-text');
    if (st) {
      var key = status === 'waiting' ? 'statusWaiting' : 'statusWorking';
      st.textContent = i18n.t(key);
      st.setAttribute('data-i18n', key);
    }
  }

  // span carrying data-i18n so a language switch retranslates it in place
  function noteSpan(key) {
    var s = document.createElement('span');
    s.setAttribute('data-i18n', key);
    s.textContent = i18n.t(key);
    return s;
  }

  function setNote(item, kind, node) {
    item.row.note.className = 'result-note ' + kind;
    item.row.note.innerHTML = '';
    if (node) { item.row.note.appendChild(node); }
    item.row.note.hidden = !node;
  }

  function renderSizes(item) {
    var pct = Math.round((1 - item.blob.size / item.file.size) * 100);
    var badge = pct > 0 ? ' <span class="saved-badge">−' + pct + '&nbsp;%</span>' : '';
    item.row.sizes.innerHTML =
      '<span>' + formatBytes(item.file.size) + ' → <strong>' + formatBytes(item.blob.size) + '</strong></span>' + badge;
  }

  function showResult(item) {
    if (item.url) { URL.revokeObjectURL(item.url); }
    item.url = URL.createObjectURL(item.blob);
    var img = document.createElement('img');
    img.src = item.url;
    img.alt = '';
    item.row.thumb.innerHTML = '';
    item.row.thumb.appendChild(img);
    item.row.thumb.classList.remove('is-empty');

    renderSizes(item);
    item.row.dlBtn.disabled = false;
    item.status = 'done';
    updateSummary();
  }

  function showError(item, msgKey) {
    item.status = 'error';
    item.blob = null;
    item.row.sizes.innerHTML = '<span>' + formatBytes(item.file.size) + '</span>';
    setNote(item, 'error', noteSpan(msgKey));
    updateSummary();
  }

  function updateSummary() {
    var done = items.filter(function (it) { return it.status === 'done'; });
    btnZip.hidden = done.length < 2;
    if (!done.length) { totalLine.hidden = true; return; }
    var from = 0, to = 0;
    for (var i = 0; i < done.length; i++) { from += done[i].file.size; to += done[i].blob.size; }
    var pct = Math.max(0, Math.round((1 - to / from) * 100));
    totalLine.textContent = i18n.fmt('totalLine', { from: formatBytes(from), to: formatBytes(to), pct: pct });
    totalLine.hidden = false;
  }

  btnClear.addEventListener('click', function () {
    runToken++;
    for (var i = 0; i < items.length; i++) {
      if (items[i].url) { URL.revokeObjectURL(items[i].url); }
    }
    items = [];
    resultList.innerHTML = '';
    resultsPanel.hidden = true;
    btnZip.hidden = true;
    totalLine.hidden = true;
  });

  /* ---------- processing pipeline ---------- */

  function enqueue(item) {
    var token = runToken;
    queue = queue.then(function () {
      if (token !== runToken || item.status === 'removed') { return; }
      return processItem(item);
    }).catch(function () { /* keep the queue alive */ });
  }

  function reprocessAll() {
    runToken++;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      item.forcePng = false;
      item.row.dlBtn.disabled = true;
      item.row.sizes.innerHTML = '<span class="spinner"></span> <span class="status-text"></span>';
      setNote(item, '', null);
      setStatus(item, 'waiting');
      enqueue(item);
    }
    updateSummary();
  }

  function decodeFile(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file).catch(function () { return decodeViaImg(file); });
    }
    return decodeViaImg(file);
  }

  function decodeViaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      img.src = url;
    });
  }

  function sourceSize(src) {
    return {
      w: src.naturalWidth || src.width,
      h: src.naturalHeight || src.height
    };
  }

  // Downscale in halving steps for decent interpolation quality, then encode.
  function drawScaled(src, targetW, targetH, whiteBg) {
    var size = sourceSize(src);
    var w = size.w, h = size.h;
    var cur = src;
    while (w / 2 >= targetW && h / 2 >= targetH) {
      w = Math.round(w / 2);
      h = Math.round(h / 2);
      var step = document.createElement('canvas');
      step.width = w;
      step.height = h;
      var sctx = step.getContext('2d');
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(cur, 0, 0, w, h);
      cur = step;
    }
    var canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    var ctx = canvas.getContext('2d');
    if (whiteBg) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, targetW, targetH);
    return canvas;
  }

  function hasAlpha(src) {
    // cheap check on a small readback; exact enough for a warning
    var probe = document.createElement('canvas');
    var s = 64;
    probe.width = s;
    probe.height = s;
    var ctx = probe.getContext('2d');
    ctx.drawImage(src, 0, 0, s, s);
    var data = ctx.getImageData(0, 0, s, s).data;
    for (var i = 3; i < data.length; i += 4) {
      if (data[i] < 250) { return true; }
    }
    return false;
  }

  function encodeCanvas(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) { resolve(blob); } else { reject(new Error('encode failed')); }
      }, mime, quality);
    });
  }

  function pickFormat(item, settings) {
    if (item.forcePng) { return 'image/png'; }
    if (settings.format === 'original') {
      return MIME[({ 'image/png': 'png', 'image/webp': 'webp' })[item.file.type]] || MIME.jpeg;
    }
    return MIME[settings.format] || MIME.jpeg;
  }

  function processItem(item) {
    var settings = readSettings();
    var token = runToken;
    setStatus(item, 'working');

    if (!/^image\//.test(item.file.type) && !looksLikeHeic(item.file)) {
      showError(item, 'errNotImage');
      return Promise.resolve();
    }

    return decodeFile(item.file).then(function (src) {
      if (token !== runToken) { return; }
      return shrink(item, src, settings, token).then(function () {
        if (src.close) { src.close(); }
      });
    }).catch(function () {
      if (token !== runToken) { return; }
      showError(item, looksLikeHeic(item.file) ? 'errHeic' : 'errDecode');
    });
  }

  function shrink(item, src, settings, token) {
    var size = sourceSize(src);
    if (!size.w || !size.h) {
      showError(item, 'errDecode');
      return Promise.resolve();
    }

    var mime = pickFormat(item, settings);
    var wantsJpeg = mime === 'image/jpeg';
    var mayHaveAlpha = /image\/(png|webp|gif)/.test(item.file.type);
    var alpha = wantsJpeg && mayHaveAlpha && hasAlpha(src);

    var longest = Math.max(size.w, size.h);
    var scale = settings.maxEdge ? Math.min(1, settings.maxEdge / longest) : 1;

    function canvasAt(s) {
      var w = Math.max(1, Math.round(size.w * s));
      var h = Math.max(1, Math.round(size.h * s));
      return drawScaled(src, w, h, wantsJpeg);
    }

    function encodeLossy(canvas) {
      // largest allowed quality first; binary-search downward only when over target
      var hi = settings.quality, lo = MIN_QUALITY;
      return encodeCanvas(canvas, mime, hi).then(function (blob) {
        if (blob.type !== mime) {
          // encoder unsupported (e.g. WebP in Safari): fall back to JPEG
          mime = 'image/jpeg';
          wantsJpeg = true;
          return encodeLossy(canvasAt(scale));
        }
        if (!settings.maxBytes || blob.size <= settings.maxBytes) { return blob; }
        return encodeCanvas(canvas, mime, MIN_QUALITY).then(function (bMin) {
          if (bMin.size > settings.maxBytes) { return null; } // dimensions must shrink
          // bisect [lo,hi] towards the largest quality that still fits
          var best = bMin;
          var step = function (iter) {
            if (iter >= 6) { return Promise.resolve(best); }
            var q = (hi + lo) / 2;
            return encodeCanvas(canvas, mime, q).then(function (b) {
              if (b.size <= settings.maxBytes) { best = b; lo = q; }
              else { hi = q; }
              return step(iter + 1);
            });
          };
          return step(0);
        });
      });
    }

    function encodePng(canvas) {
      return encodeCanvas(canvas, 'image/png');
    }

    function attempt(round) {
      var canvas = canvasAt(scale);
      var enc = (mime === 'image/png') ? encodePng(canvas) : encodeLossy(canvas);
      return enc.then(function (blob) {
        if (token !== runToken) { return null; }
        var over = blob === null ||
          (settings.maxBytes && blob.size > settings.maxBytes);
        if (over && round < 5 && Math.max(size.w, size.h) * scale > 200) {
          var factor = blob === null ? 0.7
            : Math.max(0.5, Math.sqrt(settings.maxBytes / blob.size) * 0.95);
          scale = scale * factor;
          return attempt(round + 1);
        }
        if (blob !== null) { return blob; }
        // even minimum quality at minimum dimensions is over target: best effort
        return encodeCanvas(canvas, mime, MIN_QUALITY);
      });
    }

    return attempt(0).then(function (blob) {
      if (!blob || token !== runToken) { return; }
      item.blob = blob;
      item.outName = outputName(item.file.name, blob.type);
      showResult(item);

      var missed = settings.maxBytes && blob.size > settings.maxBytes;
      var bigger = blob.size >= item.file.size;
      if (alpha) {
        var frag = document.createDocumentFragment();
        frag.appendChild(noteSpan('warnTransparency'));
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn';
        b.textContent = i18n.t('btnKeepPng');
        b.setAttribute('data-i18n', 'btnKeepPng');
        b.addEventListener('click', function () {
          item.forcePng = true;
          item.row.dlBtn.disabled = true;
          item.row.sizes.innerHTML = '<span class="spinner"></span> <span class="status-text"></span>';
          setNote(item, '', null);
          setStatus(item, 'waiting');
          enqueue(item);
        });
        frag.appendChild(b);
        setNote(item, 'warn', frag);
      } else if (missed) {
        setNote(item, 'warn', noteSpan('bestEffort'));
      } else if (bigger) {
        setNote(item, 'warn', noteSpan('warnBigger'));
      }
    });
  }

  /* ---------- names, sizes, downloads ---------- */

  function outputName(original, mimeType) {
    var base = original.replace(/\.[^.]+$/, '');
    return base + '-small.' + (EXT[mimeType] || 'jpg');
  }

  function formatBytes(n) {
    var mb = 1024 * 1024;
    if (n >= mb) {
      var v = n / mb;
      return v.toLocaleString(i18n.lang, { minimumFractionDigits: v < 10 ? 1 : 0, maximumFractionDigits: 1 }) + ' ' + i18n.t('unitMB');
    }
    return Math.max(1, Math.round(n / 1024)) + ' ' + i18n.t('unitKB');
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- ZIP (store only — JPEG/WebP/PNG are already compressed) ---------- */

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  function zipStore(entries) {
    // entries: [{ name, bytes (Uint8Array) }]
    var encoder = new TextEncoder();
    var parts = [], central = [], offset = 0;
    var now = dosDateTime(new Date());

    for (var i = 0; i < entries.length; i++) {
      var nameBytes = encoder.encode(entries[i].name);
      var data = entries[i].bytes;
      var crc = crc32(data);

      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);          // version needed
      local.setUint16(6, 0x0800, true);      // UTF-8 names
      local.setUint16(8, 0, true);           // method: store
      local.setUint16(10, now.time, true);
      local.setUint16(12, now.date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);

      var cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, now.time, true);
      cen.setUint16(14, now.date, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, nameBytes.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), nameBytes);

      parts.push(new Uint8Array(local.buffer), nameBytes, data);
      offset += 30 + nameBytes.length + data.length;
    }

    var centralSize = 0;
    for (var c = 0; c < central.length; c++) { centralSize += central[c].length; }

    var eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, entries.length, true);
    eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, centralSize, true);
    eocd.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [new Uint8Array(eocd.buffer)]), { type: 'application/zip' });
  }

  btnZip.addEventListener('click', function () {
    var done = items.filter(function (it) { return it.status === 'done'; });
    if (!done.length) { return; }
    btnZip.disabled = true;
    var used = {};
    Promise.all(done.map(function (it) {
      return it.blob.arrayBuffer().then(function (buf) {
        var name = it.outName;
        if (used[name]) {
          name = name.replace(/(\.[^.]+)$/, '-' + used[name] + '$1');
        }
        used[it.outName] = (used[it.outName] || 1) + 1;
        return { name: name, bytes: new Uint8Array(buf) };
      });
    })).then(function (entries) {
      downloadBlob(zipStore(entries), 'shrinkling.zip');
    }).finally(function () {
      btnZip.disabled = false;
    });
  });

  /* ---------- lightbox ---------- */

  var lightboxReturnFocus = null;

  function openLightbox(url) {
    lightboxReturnFocus = document.activeElement;
    lightboxImg.src = url;
    lightbox.hidden = false;
    lightboxClose.focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = '';
    if (lightboxReturnFocus && lightboxReturnFocus.focus) { lightboxReturnFocus.focus(); }
    lightboxReturnFocus = null;
  }

  lightbox.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', function (e) {
    if (lightbox.hidden) { return; }
    if (e.key === 'Escape') { closeLightbox(); }
    // the close button is the dialog's only focusable element: keep Tab on it
    if (e.key === 'Tab') { e.preventDefault(); lightboxClose.focus(); }
  });

  /* ---------- language ---------- */

  (function () {
    var codes = Object.keys(I18N);
    for (var i = 0; i < codes.length; i++) {
      var opt = document.createElement('option');
      opt.value = codes[i];
      opt.textContent = I18N[codes[i]]._name;
      langSelect.appendChild(opt);
    }
    var lang = i18n.detect();
    langSelect.value = lang;
    i18n.apply(lang);
    qualityOut.textContent = qualityRange.value + ' %';
  })();

  langSelect.addEventListener('change', function () {
    i18n.apply(langSelect.value);
    // number formatting is locale-dependent, so re-render finished rows too
    for (var i = 0; i < items.length; i++) {
      if (items[i].status === 'done') { renderSizes(items[i]); }
    }
    updateSummary();
  });

  /* ---------- service worker ---------- */

  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* offline support is optional */ });
    });
  }
})();
