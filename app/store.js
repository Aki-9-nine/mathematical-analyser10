/* 错题显微镜 · 本地存档（IndexedDB，失败时退回内存）
   - 记录整体存进一个 store，键 = id
   - file:// 等不支持 IndexedDB 的环境自动降级为内存（刷新即丢），并置 persistent=false
   依赖：无。挂到 window.Store。                                            */
(function () {
  'use strict';

  var DB_NAME = 'math-error-db';
  var VERSION = 1;
  var STORE = 'errors';

  var db = null;
  var mem = {};
  var persistent = false;

  function openDB() {
    return new Promise(function (resolve) {
      if (typeof indexedDB === 'undefined') return resolve(null);
      var req;
      try { req = indexedDB.open(DB_NAME, VERSION); } catch (e) { return resolve(null); }
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
  }

  function tx(mode) {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  function ready() {
    if (persistent) return Promise.resolve(true);
    if (db) return Promise.resolve(true);
    return openDB().then(function (d) {
      if (d) { db = d; persistent = true; return true; }
      persistent = false;
      return false;
    });
  }

  function all() {
    return ready().then(function (ok) {
      if (!ok) {
        return Object.keys(mem).map(function (k) { return mem[k]; });
      }
      return new Promise(function (resolve) {
        var out = [];
        var req = tx('readonly').openCursor();
        req.onsuccess = function (e) {
          var cur = e.target.result;
          if (cur) { out.push(cur.value); cur.continue(); }
          else resolve(out);
        };
        req.onerror = function () { resolve(Object.keys(mem).map(function (k) { return mem[k]; })); };
      });
    });
  }

  function put(rec) {
    return ready().then(function (ok) {
      mem[rec.id] = rec;
      if (!ok) return true;
      return new Promise(function (resolve) {
        var req = tx('readwrite').put(rec);
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { resolve(false); };
      });
    });
  }

  function del(id) {
    return ready().then(function (ok) {
      delete mem[id];
      if (!ok) return true;
      return new Promise(function (resolve) {
        var req = tx('readwrite').delete(id);
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { resolve(false); };
      });
    });
  }

  function clear() {
    return ready().then(function (ok) {
      mem = {};
      if (!ok) return true;
      return new Promise(function (resolve) {
        var req = tx('readwrite').clear();
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { resolve(false); };
      });
    });
  }

  window.Store = {
    ready: ready,
    all: all,
    put: put,
    del: del,
    clear: clear,
    isPersistent: function () { return persistent; }
  };
})();
