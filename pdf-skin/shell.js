/*
 * bccHub shell cho bộ công cụ PDF (/pdf/*).
 * - Đồng bộ giao diện Sáng/Tối với Hub (localStorage `bccpdf_theme`), áp dụng trước khi vẽ trang.
 * - Nút đổi giao diện, phím tắt Ctrl+K mở tìm kiếm của Hub.
 * - Yêu thích / Vừa sử dụng dùng chung kho lưu trữ với Hub.
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
  var themeParam = new URLSearchParams(location.search).get('theme');
  if (themeParam === 'light' || themeParam === 'dark') safeSet(THEME_KEY, themeParam);
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

  function onReady() {
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
        location.href = '/?search=1';
      }
    });

    var head = document.querySelector('[data-bcc-tool-id]');
    if (head) recordRecent(head.getAttribute('data-bcc-tool-id'));
    syncFavButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
