/*
 * bccHub shell cho bộ công cụ PDF (/pdf/*).
 * - Đồng bộ giao diện Sáng/Tối với Hub (localStorage `bccpdf_theme`), áp dụng trước khi vẽ trang.
 * - Nút đổi giao diện, phím tắt Ctrl+K mở tìm kiếm của Hub.
 * - Yêu thích / Vừa sử dụng dùng chung kho lưu trữ với Hub.
 * - Giữ nguyên link về Hub (data-bcc-href) trước rewriteLinks() của BentoPDF (tránh /pdf/vi/c/... 404).
 * - Lưu tệp đầu vào của từng công cụ vào IndexedDB: quay lại / F5 tự mở lại tệp,
 *   kèm danh sách "Tệp gần đây" dùng chung giữa các công cụ (gồm cả tệp của Tách PDF hàng loạt).
 * Script thường (không phải module), nạp đồng bộ trong <head> để tránh nháy màu.
 */
(function () {
  'use strict';

  var THEME_KEY = 'bccpdf_theme';
  var FAV_KEY = 'bcc_hub_favorites_v1';
  var RECENT_KEY = 'bcc_hub_recent_v1';
  var MAX_RECENT = 12;
  var root = document.documentElement;

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* Bỏ qua lỗi quota / chế độ riêng tư */
    }
  }

  function readList(key) {
    try {
      var parsed = JSON.parse(safeGet(key) || '[]');
      return Array.isArray(parsed)
        ? parsed.filter(function (x) {
            return typeof x === 'string';
          })
        : [];
    } catch (e) {
      return [];
    }
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }

  // ?theme=light|dark (tiện cho kiểm thử / chia sẻ link)
  var params = new URLSearchParams(location.search);
  var themeParam = params.get('theme');
  if (themeParam === 'light' || themeParam === 'dark') safeSet(THEME_KEY, themeParam);
  if (params.get('embed') === '1') root.setAttribute('data-bcc-embed', '1');
  applyTheme(safeGet(THEME_KEY));

  window.addEventListener('storage', function (e) {
    if (e.key === THEME_KEY) applyTheme(e.newValue);
    if (e.key === FAV_KEY) syncFavButtons();
  });

  function syncFavButtons() {
    var favs = readList(FAV_KEY);
    var buttons = document.querySelectorAll('[data-bcc-fav]');
    for (var i = 0; i < buttons.length; i++) {
      var on = favs.indexOf(buttons[i].getAttribute('data-bcc-fav')) !== -1;
      buttons[i].classList.toggle('is-active', on);
      buttons[i].title = on ? 'Bỏ khỏi Yêu thích' : 'Lưu vào Yêu thích';
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function recordRecent(toolId) {
    var list = readList(RECENT_KEY).filter(function (x) {
      return x !== toolId;
    });
    list.unshift(toolId);
    safeSet(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  }

  // -------------------------------------------------------------------------
  // Giữ nguyên link về Hub: rewriteLinks() của BentoPDF đổi "/c/..." thành "/pdf/vi/c/..." (404)
  // -------------------------------------------------------------------------
  function restoreHubLink(el) {
    var orig = el && el.getAttribute ? el.getAttribute('data-bcc-href') : null;
    if (orig && el.getAttribute('href') !== orig) el.setAttribute('href', orig);
  }

  function protectHubLinks() {
    var links = document.querySelectorAll('a[data-bcc-href]');
    for (var i = 0; i < links.length; i++) restoreHubLink(links[i]);
    if (typeof MutationObserver === 'undefined') return;
    new MutationObserver(function (mutations) {
      for (var j = 0; j < mutations.length; j++) restoreHubLink(mutations[j].target);
    }).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
    });
    // Chốt chặn cuối: sửa href ngay trước khi trình duyệt điều hướng
    document.addEventListener(
      'click',
      function (e) {
        var a = e.target instanceof Element ? e.target.closest('a[data-bcc-href]') : null;
        if (a) restoreHubLink(a);
      },
      true
    );
  }

  // -------------------------------------------------------------------------
  // Lưu tệp đầu vào của công cụ (IndexedDB) -> quay lại / F5 tự mở lại, kèm "Tệp gần đây"
  // -------------------------------------------------------------------------
  var FILE_DB = 'bcchub_tool_files';
  var SESSION_STORE = 'sessions';
  var RECENT_FILE_STORE = 'recent';
  var MAX_RECENT_FILES = 12;
  var MAX_FILE_BYTES = 200 * 1024 * 1024;
  var MAX_SESSION_FILES = 50;
  var RECENT_CHIPS = 6;
  // Không lưu chứng thư số / khóa / ảnh chữ ký vào bộ nhớ trình duyệt
  var SENSITIVE_INPUT = /cert|p12|pfx|key|sig-image|password/i;
  var isRestoring = false;

  function getToolId() {
    var head = document.querySelector('[data-bcc-tool-id]');
    if (head) return head.getAttribute('data-bcc-tool-id');
    var m = location.pathname.match(/([^/]+)\.html$/);
    return m ? m[1] : null;
  }

  function isTrackableInput(input) {
    return (
      input instanceof HTMLInputElement &&
      input.type === 'file' &&
      !!input.id &&
      !SENSITIVE_INPUT.test(input.id)
    );
  }

  function fileSig(f) {
    return [f.name, f.size, f.lastModified || 0].join('::');
  }

  function openFileDb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB không khả dụng'));
      var req = indexedDB.open(FILE_DB, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(SESSION_STORE)) db.createObjectStore(SESSION_STORE, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(RECENT_FILE_STORE)) db.createObjectStore(RECENT_FILE_STORE, { keyPath: 'sig' });
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function idbRequest(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function withStore(storeName, mode, fn) {
    return openFileDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(storeName, mode);
        var result = fn(tx.objectStore(storeName));
        tx.oncomplete = function () {
          db.close();
          Promise.resolve(result).then(resolve, reject);
        };
        tx.onerror = function () {
          db.close();
          reject(tx.error);
        };
        tx.onabort = function () {
          db.close();
          reject(tx.error);
        };
      });
    });
  }

  function toRecord(f) {
    return { name: f.name, type: f.type || '', size: f.size, lastModified: f.lastModified || Date.now(), blob: f };
  }

  function toFile(rec) {
    return new File([rec.blob], rec.name, { type: rec.type || '', lastModified: rec.lastModified || Date.now() });
  }

  function saveToolFiles(toolId, input, fileList) {
    var files = Array.prototype.filter.call(fileList || [], function (f) {
      return f && f.size > 0 && f.size <= MAX_FILE_BYTES;
    });
    if (!toolId || !files.length) return;
    var key = toolId + '::' + input.id;
    var multiple = !!input.multiple;

    withStore(SESSION_STORE, 'readwrite', function (store) {
      var getReq = store.get(key);
      getReq.onsuccess = function () {
        var prev = multiple && getReq.result ? getReq.result.files || [] : [];
        var seen = {};
        var merged = [];
        prev.concat(files.map(toRecord)).forEach(function (rec) {
          var sig = fileSig(rec);
          if (seen[sig]) return;
          seen[sig] = true;
          merged.push(rec);
        });
        store.put({
          key: key,
          toolId: toolId,
          inputId: input.id,
          files: multiple ? merged.slice(-MAX_SESSION_FILES) : merged.slice(-1),
          updatedAt: Date.now(),
        });
      };
    }).catch(function (err) {
      console.warn('[bccHub] Không thể lưu tệp của công cụ:', err);
    });

    withStore(RECENT_FILE_STORE, 'readwrite', function (store) {
      var now = Date.now();
      files.forEach(function (f, i) {
        var rec = toRecord(f);
        rec.sig = fileSig(f);
        rec.usedAt = now + i;
        rec.toolId = toolId;
        store.put(rec);
      });
      var allReq = store.getAll();
      allReq.onsuccess = function () {
        var list = (allReq.result || []).sort(function (a, b) {
          return b.usedAt - a.usedAt;
        });
        list.slice(MAX_RECENT_FILES).forEach(function (old) {
          store.delete(old.sig);
        });
      };
    }).catch(function (err) {
      console.warn('[bccHub] Không thể cập nhật Tệp gần đây:', err);
    });
  }

  function loadToolSessions(toolId) {
    return withStore(SESSION_STORE, 'readonly', function (store) {
      return idbRequest(store.getAll());
    }).then(function (all) {
      return (all || []).filter(function (s) {
        return s.toolId === toolId && s.files && s.files.length;
      });
    });
  }

  function clearToolSessions(toolId) {
    return loadToolSessions(toolId).then(function (sessions) {
      return withStore(SESSION_STORE, 'readwrite', function (store) {
        sessions.forEach(function (s) {
          store.delete(s.key);
        });
      });
    });
  }

  function loadOwnRecents() {
    return withStore(RECENT_FILE_STORE, 'readonly', function (store) {
      return idbRequest(store.getAll());
    }).catch(function () {
      return [];
    });
  }

  // Đọc (chỉ đọc) danh sách tệp của "Tách PDF hàng loạt" (bccpdf_db / recent_files)
  function loadMultiSplitRecents() {
    return new Promise(function (resolve) {
      if (typeof indexedDB === 'undefined') return resolve([]);
      var req;
      try {
        req = indexedDB.open('bccpdf_db');
      } catch (e) {
        return resolve([]);
      }
      req.onupgradeneeded = function () {
        // CSDL chưa tồn tại: không tạo mới thay cho Multi-Split
        req.transaction.abort();
      };
      req.onerror = function () {
        resolve([]);
      };
      req.onsuccess = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('recent_files')) {
          db.close();
          return resolve([]);
        }
        var getAll = db.transaction('recent_files', 'readonly').objectStore('recent_files').getAll();
        getAll.onsuccess = function () {
          db.close();
          resolve(
            (getAll.result || [])
              .filter(function (it) {
                return it && it.pdfMeta && it.pdfMeta.arrayBuffer && it.pdfMeta.name;
              })
              .map(function (it) {
                return {
                  name: it.pdfMeta.name,
                  type: 'application/pdf',
                  size: it.pdfMeta.size || it.pdfMeta.arrayBuffer.byteLength,
                  lastModified: it.lastUpdated || 0,
                  usedAt: it.lastUpdated || 0,
                  blob: new Blob([it.pdfMeta.arrayBuffer], { type: 'application/pdf' }),
                };
              })
          );
        };
        getAll.onerror = function () {
          db.close();
          resolve([]);
        };
      };
    });
  }

  function acceptsFile(input, rec) {
    var accept = (input.getAttribute('accept') || '').trim().toLowerCase();
    if (!accept) return true;
    var name = String(rec.name || '').toLowerCase();
    var type = String(rec.type || '').toLowerCase();
    return accept.split(',').some(function (raw) {
      var a = raw.trim();
      if (!a) return false;
      if (a.charAt(0) === '.') return name.slice(-a.length) === a;
      if (a.slice(-2) === '/*') return type.indexOf(a.slice(0, -1)) === 0;
      return type === a;
    });
  }

  function injectFiles(input, files) {
    if (typeof DataTransfer === 'undefined' || !files.length) return false;
    try {
      var dt = new DataTransfer();
      (input.multiple ? files : files.slice(0, 1)).forEach(function (f) {
        dt.items.add(f);
      });
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (err) {
      console.warn('[bccHub] Không thể nạp lại tệp:', err);
      return false;
    }
  }

  function formatBytes(n) {
    if (!n) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + units[i];
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function mountBar(bar) {
    var old = document.querySelector('.bcc-session-bar');
    if (old) old.remove();
    var head = document.querySelector('[data-bcc-tool-id]');
    if (head) head.insertAdjacentElement('afterend', bar);
    else {
      var page = document.querySelector('.bcc-page') || document.querySelector('header.bcc-shell');
      if (page) page.insertAdjacentElement(page.tagName === 'HEADER' ? 'afterend' : 'afterbegin', bar);
    }
  }

  function showRestoredBar(toolId, names) {
    var bar = el('div', 'bcc-session-bar bcc-session-bar--restored');
    bar.setAttribute('role', 'status');
    var label = el('span', 'bcc-session-bar__text');
    label.appendChild(el('strong', null, 'Đã mở lại tệp lần trước: '));
    var shown = names.slice(0, 3).join(', ');
    label.appendChild(document.createTextNode(shown + (names.length > 3 ? ' (+' + (names.length - 3) + ' tệp)' : '')));
    bar.appendChild(label);

    var actions = el('span', 'bcc-session-bar__actions');
    var resetBtn = el('button', 'bcc-session-btn', 'Bắt đầu lại với tệp khác');
    resetBtn.type = 'button';
    resetBtn.title = 'Xóa tệp đã lưu của công cụ này và tải lại trang';
    resetBtn.addEventListener('click', function () {
      clearToolSessions(toolId).then(
        function () {
          location.reload();
        },
        function () {
          location.reload();
        }
      );
    });
    var closeBtn = el('button', 'bcc-session-btn bcc-session-btn--ghost', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Ẩn thông báo');
    closeBtn.addEventListener('click', function () {
      bar.remove();
    });
    actions.appendChild(resetBtn);
    actions.appendChild(closeBtn);
    bar.appendChild(actions);
    mountBar(bar);
  }

  function showRecentBar(toolId, input, recents) {
    var bar = el('div', 'bcc-session-bar');
    bar.appendChild(el('span', 'bcc-session-bar__text', 'Tệp gần đây:'));
    var chips = el('span', 'bcc-session-bar__chips');
    recents.forEach(function (rec) {
      var chip = el('button', 'bcc-session-chip');
      chip.type = 'button';
      chip.title = 'Mở ' + rec.name + ' (' + formatBytes(rec.size) + ')';
      chip.appendChild(el('span', 'bcc-session-chip__name', rec.name));
      chip.appendChild(el('span', 'bcc-session-chip__size', formatBytes(rec.size)));
      chip.addEventListener('click', function () {
        var file = toFile(rec);
        // injectFiles phát sự kiện change -> listener ở initFileSessions tự lưu phiên
        if (injectFiles(input, [file])) showRestoredBar(toolId, [rec.name]);
      });
      chips.appendChild(chip);
    });
    bar.appendChild(chips);
    var closeBtn = el('button', 'bcc-session-btn bcc-session-btn--ghost', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Ẩn Tệp gần đây');
    closeBtn.addEventListener('click', function () {
      bar.remove();
    });
    bar.appendChild(closeBtn);
    mountBar(bar);
  }

  function primaryFileInput() {
    var main = document.getElementById('file-input');
    if (isTrackableInput(main)) return main;
    var all = document.querySelectorAll('input[type="file"][id]');
    for (var i = 0; i < all.length; i++) if (isTrackableInput(all[i])) return all[i];
    return null;
  }

  function initFileSessions(toolId) {
    if (!toolId || typeof indexedDB === 'undefined') return;

    // Ghi lại tệp người dùng chọn qua hộp thoại
    document.addEventListener(
      'change',
      function (e) {
        var input = e.target;
        if (isRestoring || !isTrackableInput(input) || !input.files || !input.files.length) return;
        saveToolFiles(toolId, input, input.files);
      },
      true
    );

    // Ghi lại tệp kéo-thả (công cụ xử lý trực tiếp, không qua input)
    document.addEventListener(
      'drop',
      function (e) {
        var files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        var node = e.target instanceof Element ? e.target : null;
        var input = null;
        while (node && node !== document.body && !input) {
          var found = node.querySelectorAll('input[type="file"][id]');
          for (var i = 0; i < found.length; i++) {
            if (isTrackableInput(found[i])) {
              input = found[i];
              break;
            }
          }
          node = node.parentElement;
        }
        input = input || primaryFileInput();
        if (input) saveToolFiles(toolId, input, files);
      },
      true
    );

    var embedded = root.getAttribute('data-bcc-embed') === '1';

    loadToolSessions(toolId)
      .then(function (sessions) {
        // Trong Launcher (embed) tệp do Raycast truyền vào được ưu tiên -> không tự mở lại
        if (embedded) return false;
        var restoredNames = [];
        isRestoring = true;
        try {
          sessions.forEach(function (s) {
            var input = document.getElementById(s.inputId);
            if (!isTrackableInput(input)) return;
            var files = s.files.map(toFile);
            if (injectFiles(input, files)) {
              (input.multiple ? files : files.slice(0, 1)).forEach(function (f) {
                restoredNames.push(f.name);
              });
            }
          });
        } finally {
          isRestoring = false;
        }
        if (restoredNames.length) {
          showRestoredBar(toolId, restoredNames);
          return true;
        }
        return false;
      })
      .catch(function () {
        return false;
      })
      .then(function (restored) {
        if (restored) return;
        var input = primaryFileInput();
        if (!input) return;
        return Promise.all([loadOwnRecents(), loadMultiSplitRecents()]).then(function (lists) {
          var seen = {};
          var merged = lists[0]
            .concat(lists[1])
            .filter(function (rec) {
              var k = rec.name + '::' + rec.size;
              if (seen[k] || !acceptsFile(input, rec)) return false;
              seen[k] = true;
              return true;
            })
            .sort(function (a, b) {
              return (b.usedAt || 0) - (a.usedAt || 0);
            })
            .slice(0, RECENT_CHIPS);
          if (merged.length) showRecentBar(toolId, input, merged);
        });
      })
      .catch(function (err) {
        console.warn('[bccHub] Không thể khôi phục phiên làm việc:', err);
      });
  }

  function onReady() {
    protectHubLinks();

    var themeBtn = document.querySelector('[data-bcc-theme-toggle]');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        safeSet(THEME_KEY, next);
        applyTheme(next);
      });
    }

    document.addEventListener('click', function (e) {
      var btn = e.target instanceof Element ? e.target.closest('[data-bcc-fav]') : null;
      if (!btn) return;
      e.preventDefault();
      var id = btn.getAttribute('data-bcc-fav');
      var favs = readList(FAV_KEY);
      var idx = favs.indexOf(id);
      if (idx === -1) favs.unshift(id);
      else favs.splice(idx, 1);
      safeSet(FAV_KEY, JSON.stringify(favs));
      syncFavButtons();
    });

    window.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        if (root.getAttribute('data-bcc-embed') === '1' && window.parent !== window) {
          window.parent.postMessage({ type: 'bcc:embed-back' }, '*');
        } else {
          location.href = '/?search=1';
        }
        return;
      }
      if (
        e.key === 'Escape' &&
        root.getAttribute('data-bcc-embed') === '1' &&
        window.parent !== window
      ) {
        var tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          window.parent.postMessage({ type: 'bcc:embed-back' }, '*');
        }
      }
    });

    var head = document.querySelector('[data-bcc-tool-id]');
    if (head) recordRecent(head.getAttribute('data-bcc-tool-id'));
    syncFavButtons();

    // Đợi script công cụ gắn xong listener cho input tệp rồi mới mở lại tệp đã lưu
    var startSessions = function () {
      setTimeout(function () {
        initFileSessions(getToolId());
      }, 400);
    };
    if (document.readyState === 'complete') startSessions();
    else window.addEventListener('load', startSessions);

    // Nhận tệp PDF/Ảnh truyền trực tiếp từ Raycast Launcher (khi người dùng trỏ vào file rồi nhấn Alt+Space -> Enter)
    if (root.getAttribute('data-bcc-embed') === '1' && window.parent !== window) {
      window.addEventListener('message', function (ev) {
        if (!ev.data || ev.data.type !== 'bcc:load-context-file' || !ev.data.file) return;
        try {
          var fileInput =
            document.getElementById('file-input') ||
            document.querySelector('input[type="file"]');
          if (fileInput && typeof DataTransfer !== 'undefined') {
            var dt = new DataTransfer();
            dt.items.add(ev.data.file);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } catch (err) {
          console.warn('Không thể tự nạp tệp vào công cụ PDF:', err);
        }
      });
      window.parent.postMessage({ type: 'bcc:embed-ready' }, '*');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
