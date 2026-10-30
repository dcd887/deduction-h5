/* 存档层：localStorage 为主，禁用时退回内存
   三个页面共用（选案 / 开始游戏 / 首页不读存档） */
(function () {
  'use strict';

  var KEY = 'tuili_save_v1';
  var MEM = null;                 // localStorage 不可用时的兜底
  var MAX_HIST = 12;              // 每个案子最多留 12 步回档

  function canUseLS() {
    try {
      var k = '__t';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }
  var LS = canUseLS();

  function blank() { return { lastCase: null, cases: {} }; }

  function load() {
    if (!LS) return MEM || (MEM = blank());
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : blank();
    } catch (e) { return blank(); }
  }

  function save(db) {
    if (!LS) { MEM = db; return false; }
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { return false; }
  }

  /* ---------- 单个案子的进度 ---------- */

  function fresh(caseId, quota) {
    return {
      id: caseId, quota: quota, quotaMax: quota,
      opened: {}, asked: {}, pinned: {}, sel: {},
      selKiller: null, judged: null, hint: 0,
      hintLog: [], hintSig: '', hintSame: 0,
      startedAt: Date.now(), updatedAt: Date.now(),
      hist: []
    };
  }

  function getCase(db, caseId, quota) {
    var st = db.cases[caseId];
    if (!st || typeof st !== 'object') return fresh(caseId, quota);
    // 迁移/补字段，老存档也能读
    st.quota = typeof st.quota === 'number' ? st.quota : quota;
    st.quotaMax = st.quotaMax || quota;
    st.opened = st.opened || {}; st.asked = st.asked || {};
    st.pinned = st.pinned || {}; st.sel = st.sel || {};
    st.hint = st.hint || 0;
    st.hintLog = Array.isArray(st.hintLog) ? st.hintLog : [];
    st.hintSig = st.hintSig || '';
    st.hintSame = typeof st.hintSame === 'number' ? st.hintSame : 0;
    st.hist = Array.isArray(st.hist) ? st.hist : [];
    return st;
  }

  /* 快照：只留会变的字段（hist 自己不进快照，否则无限套娃） */
  // 注意：不含 hint。提示用过就是用过，回档不能把它撤掉
  var SNAP = ['quota', 'opened', 'asked', 'pinned', 'sel', 'selKiller', 'judged'];
  function snapshots(st) {
    var o = {};
    SNAP.forEach(function (k) {
      o[k] = (st[k] && typeof st[k] === 'object') ? JSON.parse(JSON.stringify(st[k])) : st[k];
    });
    return o;
  }
  function restore(st, snap) {
    SNAP.forEach(function (k) { st[k] = snap[k]; });
  }

  /* ---------- 对外 ---------- */

  var API = {
    available: LS,

    /* 读某案进度（没有就返回初始进度） */
    read: function (caseId, quota) {
      var db = load();
      return getCase(db, caseId, quota);
    },

    /* 写回某案进度 */
    write: function (st) {
      var db = load();
      st.updatedAt = Date.now();
      st.sel = (st.sel && typeof st.sel === 'object') ? st.sel : {};
      st.selKiller = st.selKiller || null;
      // 快照只留最近 MAX_HIST 条
      if (st.hist.length > MAX_HIST) st.hist = st.hist.slice(-MAX_HIST);
      db.cases[st.id] = st;
      db.lastCase = st.id;
      return save(db);
    },

    /* 动之前压一帧，供「回档一步」 */
    push: function (st, why) {
      st.hist = st.hist || [];
      var s = snapshots(st);
      s.why = why || '';
      s.at = Date.now();
      st.hist.push(s);
      if (st.hist.length > MAX_HIST) st.hist = st.hist.slice(-MAX_HIST);
      return API.write(st);
    },

    /* 回退一步：返回是否成功 */
    undo: function (st) {
      if (!st.hist || !st.hist.length) return false;
      var s = st.hist.pop();
      restore(st, s);
      API.write(st);
      return { ok: true, why: s.why || '' };
    },

    canUndo: function (st) { return !!(st.hist && st.hist.length); },

    /* 重置本关：清进度，保留「已完成过」的标记 */
    reset: function (caseId, quota) {
      var db = load();
      var old = db.cases[caseId];
      var st = fresh(caseId, quota);
      if (old && old.bestHint) st.bestHint = old.bestHint;
      if (old && old.cleared) st.cleared = old.cleared;
      db.cases[caseId] = st;
      db.lastCase = caseId;
      save(db);
      return st;
    },

    /* 选案页要用的概览 */
    overview: function () {
      var db = load();
      return db;
    },

    lastCase: function () {
      var db = load();
      return db.lastCase;
    },

    setLast: function (caseId) {
      var db = load();
      db.lastCase = caseId;
      save(db);
    },

    /* 通关时记一笔（供选案页显示「已通关」） */
    markCleared: function (st) {
      st.cleared = true;
      st.bestHint = st.bestHint === undefined ? st.hint : Math.min(st.bestHint, st.hint);
      API.write(st);
    }
  };

  window.SAVE = API;
})();
