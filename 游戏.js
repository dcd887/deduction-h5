/* 《找出唯一说得通的那个人》新版界面 · 游戏主逻辑
   依赖：window.CASES（数据_案件.js）、window.SAVE（存档.js）
   接入方式：把本文件与 界面.css、数据_案件.js、存档.js 放在同一目录，游戏.html 引用即可。 */
(function () {
  'use strict';

  var CASES = window.CASES || [];
  if (!CASES.length) {
    document.getElementById('app').innerHTML =
      '<div class="wrap" style="padding:40px 0;color:#98a1b3">没有读到案件数据，请确认 数据_案件.js 与本页在同一目录。</div>';
    return;
  }

  var qi = parseInt((location.search.match(/[?&]c=(\d+)/) || [])[1], 10);
  if (isNaN(qi) || !CASES[qi]) qi = 0;
  var C = CASES[qi];
  var SAVE = window.SAVE;
  var st = SAVE.read(C.id, C.quota);

  var tab = st.judged ? 'result' : (location.hash.replace('#', '') || 'scene');
  if (['scene', 'ask', 'rec', 'board', 'result'].indexOf(tab) < 0) tab = 'scene';
  var curWho = (C.suspects && C.suspects[0] && C.suspects[0].name) || '';
  var sheet = null;          // {kind:'scene'|'rec'|'progress', i/id}
  var scrollY = 0;

  /* ---------------- 基础 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function persist() { SAVE.write(st); }
  function act(why, fn) { SAVE.push(st, why); fn(); persist(); }

  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 1600);
  }

  /* ---------------- 卡片与进度 ---------------- */
  function cards() {
    var out = [];
    (C.scene || []).forEach(function (s, i) {
      out.push({
        key: 'S' + i, kind: 'scene', i: i,
        type: '勘查',
        title: '勘查 ' + (s.no || (i + 1)) + ' · ' + s.place,
        body: s.desc || '',
        place: s.place || ''
      });
    });
    (C.records || []).forEach(function (r) {
      out.push({
        key: r.id, kind: 'record', type: '档案',
        title: r.id + ' · ' + r.name,
        body: r.content || '',
        src: r.source || ''
      });
    });
    (C.suspects || []).forEach(function (p) {
      var fr = (C.firstRound || {})[p.name] || p.claim || '';
      out.push({ key: 'T' + p.name, kind: 'testi', round: 1, who: p.name, type: '证词',
        title: p.name + ' · 首轮说法', body: fr });
      var rd = (C.judge && C.judge.rounds || {})[p.name];
      if (rd && rd.r2 && st.asked[p.name + '-2'])
        out.push({ key: 'T' + p.name + '-2', kind: 'testi', round: 2, who: p.name, type: '证词',
          title: p.name + ' · 第 2 轮', body: rd.r2 });
      if (rd && rd.r3 && st.asked[p.name + '-3'])
        out.push({ key: 'T' + p.name + '-3', kind: 'testi', round: 3, who: p.name, type: '证词',
          title: p.name + ' · 第 3 轮', body: rd.r3 + (rd.ref ? '\n\n关联线索：' + rd.ref : '') });
    });
    return out;
  }
  function byKey(k) {
    var a = cards();
    for (var i = 0; i < a.length; i++) if (a[i].key === k) return a[i];
    return null;
  }
  function openedCards() {
    return cards().filter(function (x) {
      if (x.kind === 'scene') return !!st.opened[x.key];
      if (x.kind === 'record') return !!st.opened[x.key];
      return true; // 证词：首轮本就公开，已追问的才进列表
    });
  }
  function isPinned(k) { return !!st.pinned[k]; }
  function isSel(k) { return !!st.sel[k]; }

  function provedNow() {
    var m = (C.judge && C.judge.cardMap) || {}, set = {};
    Object.keys(st.opened).forEach(function (k) {
      if (!st.opened[k]) return;
      (m[k] || []).forEach(function (id) { set[id] = 1; });
    });
    return set;
  }
  function missingNecessary() {
    var p = provedNow();
    return ((C.judge && C.judge.necessary) || []).filter(function (id) { return !p[id]; });
  }
  function clueById(id) {
    var cl = (C.judge && C.judge.clues) || [];
    for (var i = 0; i < cl.length; i++) if (cl[i].id === id) return cl[i];
    return null;
  }
  function provingCards(id) {
    var m = (C.judge && C.judge.cardMap) || {}, out = [];
    Object.keys(m).forEach(function (k) {
      if ((m[k] || []).indexOf(id) >= 0) {
        var cd = byKey(k);
        if (cd) out.push(cd);
      }
    });
    return out;
  }

  function askRounds(name) {
    var n = 1;
    if (st.asked[name + '-2']) n = 2;
    if (st.asked[name + '-3']) n = 3;
    return n;
  }
  function askCount() {
    var n = 0;
    (C.suspects || []).forEach(function (p) { if (st.asked[p.name + '-3']) n++; });
    return n;
  }

  function progressPct() {
    var total = (C.scene || []).length + (C.records || []).length + (C.suspects || []).length * 2;
    var done = 0;
    (C.scene || []).forEach(function (s, i) { if (st.opened['S' + i]) done++; });
    (C.records || []).forEach(function (r) { if (st.opened[r.id]) done++; });
    (C.suspects || []).forEach(function (p) {
      if (st.asked[p.name + '-2'] || st.asked[p.name + '-3']) done++;
      if (st.asked[p.name + '-3']) done++;
    });
    return total ? Math.round(done / total * 100) : 0;
  }

  /* ---------------- 提示（按当前进度现算） ---------------- */
  /* 进度指纹：只算「获得新信息」的动作（勘查/调档/追问），
     不含上板（pin）与剩余额度——上板是整理材料，回档退额度不该让提示退步 */
  function hintSig() {
    var openedN = Object.keys(st.opened).filter(function (k) { return st.opened[k]; }).length;
    var recUsed = (st.quotaMax || 0) - st.quota;
    return [openedN, recUsed, askCount()].join(':');
  }

  function phaseLabel() {
    var openedN = Object.keys(st.opened).filter(function (k) { return st.opened[k]; }).length;
    var recUsed = (st.quotaMax || 0) - st.quota;
    return '已开 ' + openedN + ' 项 · 调档 ' + recUsed + '/' + (st.quotaMax || 0) +
      ' · 追问 ' + askCount() + ' 次' + (st.judged ? ' · 已指认一次' : '');
  }
  function ensureHint(withLog) {
    var sig = hintSig();
    var changed = (st.hintSig !== sig);
    if (changed || !st.hint) {
      st.hintSig = sig;
      st.hint = 1;                      // 进度一变，提示回到「方向级」
      persist();
    }
    // 同一进度下「打开过一次」记一条第 1 级，重开抽屉不重复记
    if (withLog && st.hintSeen !== sig) {
      st.hintSeen = sig;
      st.hintLog = st.hintLog || [];
      st.hintLog.push({ lv: 1, level: 1, sig: sig, at: Date.now(), phase: phaseLabel() });
      if (st.hintLog.length > 30) st.hintLog = st.hintLog.slice(-30);
      persist();
    }
  }

  function hintText(level) {
    var lack = missingNecessary();
    var unScene = (C.scene || []).filter(function (s, i) { return !st.opened['S' + i]; }).length;
    var unRec = (C.records || []).filter(function (r) { return !st.opened[r.id]; }).length;
    var askLeft = (C.suspects || []).filter(function (p) { return !st.asked[p.name + '-3']; }).length;

    var kinds = [];
    lack.forEach(function (id) {
      var cl = clueById(id);
      if (!cl) return;
      if (kinds.indexOf(cl.type) < 0) kinds.push(cl.type);
    });
    var typeStr = kinds.length ? kinds.join('、') : '现场与记录';

    if (!lack.length) {
      return '关键线索都到手了。回到「案卷」，选凶手，再选至少三条依据。';
    }
    if (level <= 1) {
      var parts = [];
      if (unScene) parts.push('现场还有 ' + unScene + ' 处没点');
      if (unRec) parts.push('记录还有 ' + unRec + ' 份没调');
      if (askLeft) parts.push(askLeft + ' 人还没问到第 3 轮');
      return '还差 ' + lack.length + ' 条关键线索，它们藏在' + typeStr + '里。' +
        (parts.length ? parts.join('、') + '。' : '');
    }
    if (level === 2) {
      var id = lack[0], keys = provingCards(id), labels = [];
      keys.slice(0, 2).forEach(function (cd) { labels.push('「' + cd.title.replace(/^\S+\s·\s/, '') + '」'); });
      var tail = '';
      var r3 = (C.suspects || []).filter(function (p) { return st.asked[p.name + '-3']; });
      if (r3.length && keys.some(function (cd) { return cd.kind === 'record'; }))
        tail = '你已经把 ' + r3[0].name + ' 问到第 3 轮，缺口不在证词里，在记录里。';
      return (labels.length ? '去看 ' + labels.join(' 或 ') + '。' : '') + tail + '那里有一条你要的关键线索。';
    }
    var cl = clueById(lack[0]);
    if (!cl) return '这个案子没有更多提示。';
    return '「' + cl.id + '」' + cl.text + (cl.breaks ? '\n\n能推出：' + cl.breaks : '') +
      '\n\n来源：' + (cl.source || '案卷');
  }

  /* ---------------- 视图 ---------------- */
  function header() {
    var pct = progressPct();
    var chips = '';
    chips += '<span class="chip num hide-narrow">勘查 ' + (C.scene || []).filter(function (s, i) { return st.opened['S' + i]; }).length + '/' + (C.scene || []).length + '</span>';
    chips += '<span class="chip num' + (st.quota <= 1 ? ' warn' : '') + '">剩 ' + st.quota + ' 次</span>';
    return '<div class="top" style="--p:' + pct + '%">' +
      '<div class="bar"></div><div class="in">' +
      '<a class="back" href="选案.html">←</a>' +
      '<div><div class="title">' + esc(C.title) + '</div><div class="sub">' + esc(C.difficulty || '') + ' · ' + pct + '%</div></div>' +
      '<div class="right">' + chips +
      '<button class="chip" data-act="progress">进度</button>' +
      '</div></div></div>';
  }

  function tabsBar() {
    function t(v, label) {
      return '<div class="tab' + (tab === v ? ' on' : '') + '" data-act="tab" data-v="' + v + '">' +
        label + '</div>';
    }
    return '<div class="tabs">' + t('scene', '现场') + t('ask', '人物') + t('rec', '档案') + t('board', '案卷') + '</div>';
  }

  function viewScene() {
    var rows = (C.scene || []).map(function (s, i) {
      var on = !!st.opened['S' + i];
      var empty = on && s.valid && s.valid !== '有效';
      var one = (s.desc || '').split('；')[0];
      return '<div class="row' + (on ? ' on' : '') + (empty ? ' odd' : '') + '" data-act="scene" data-i="' + i + '">' +
        '<div class="no num">' + esc(s.no || i + 1) + '</div>' +
        '<div class="body"><div class="name">' + esc(s.place) + '</div>' +
        '<div class="one">' + (on ? esc(one) : '未勘查') + '</div></div>' +
        '<div class="stat">' + (on ? (empty ? '无物证' : '已入卷') : '待查') + '</div></div>';
    }).join('');

    return '<div class="wrap">' +
      (C.sceneIntro ? '<div class="sect"><div class="t">现 场</div></div><div class="intro">' + esc(C.sceneIntro) + '</div>' : '') +
      '<div class="rows">' + rows + '</div>' +
      '<div style="color:#6b7488;font-size:11px;margin:12px 2px 18px;line-height:1.7">点开一处就记进案卷。空的地方也会如实记下「无物证」。</div>' +
      '</div>';
  }

  function viewAsk() {
    // 证人（在 firstRound 里但不是嫌疑人）也要能点开看首轮笔录
    var names = (C.suspects || []).map(function (p) { return p.name; });
    Object.keys(C.firstRound || {}).forEach(function (k) {
      if (names.indexOf(k) < 0) names.push(k);
    });
    var whos = names.map(function (nm) {
      var isSus = (C.suspects || []).some(function (p) { return p.name === nm; });
      return '<div class="who' + (nm === curWho ? ' on' : '') + '" data-act="who" data-n="' + esc(nm) + '">' +
        esc(nm) + '<span class="r num">' + (isSus ? askRounds(nm) + '/3' : '证人') + '</span></div>';
    }).join('');

    var p = null;
    (C.suspects || []).forEach(function (x) { if (x.name === curWho) p = x; });
    if (!p) {
      // 证人：没有嫌疑人档案，只有首轮笔录
      if ((C.firstRound || {})[curWho]) p = { name: curWho, role: '证人（非嫌疑人）', age: '' };
      else return '<div class="wrap">没有这位关系人。</div>';
    }

    var rd = (C.judge && C.judge.rounds || {})[p.name] || {};
    var claim = (C.firstRound || {})[p.name] || p.claim || '';
    var html = '<div class="wrap"><div class="whos">' + whos + '</div>';

    html += '<div class="askcard"><div class="meta">' + esc(p.name) + (p.age ? '　' + esc(p.age) + ' 岁' : '') + '　' + esc(p.role || '') + '</div>' +
      '<div class="txt">' + esc(claim) + '</div></div>';

    if (st.asked[p.name + '-2'] && rd.r2) {
      html += '<div class="askcard me"><div class="meta">追问 · 第 2 轮</div><div class="txt">' + esc(rd.r2) + '</div></div>';
    }
    if (st.asked[p.name + '-3'] && rd.r3) {
      html += '<div class="askcard me"><div class="meta">追问 · 第 3 轮</div><div class="txt">' + esc(rd.r3) + '</div>' +
        (rd.ref ? '<div class="tag red">与 ' + esc(rd.ref) + ' 对不上</div>' : '') + '</div>';
    }

    var btn;
    if (!st.asked[p.name + '-2'] && rd.r2) btn = '<div class="btn main" data-act="ask" data-n="' + esc(p.name) + '" data-r="2">追问第 2 轮（剩 1 次追问机会）</div>';
    else if (!st.asked[p.name + '-3'] && rd.r3) btn = '<div class="btn main" data-act="ask" data-n="' + esc(p.name) + '" data-r="3">追问第 3 轮（最后一次）</div>';
    else btn = (rd.r2 || rd.r3) ? '<div class="btn ghost" style="flex:1">这位已经问尽了</div>' : '';

    if (btn) html += '<div class="btnrow">' + btn + '</div>';
    html += '<div style="color:#6b7488;font-size:11px;margin:12px 2px 18px;line-height:1.7">首轮说法是警方笔录。追问要自己点——问过就记进案卷，可以钉上板。</div>';
    return html + '</div>';
  }

  function viewRec() {
    var rows = (C.records || []).map(function (r) {
      var got = !!st.opened[r.id];
      var lock = !got && st.quota <= 0;
      return '<div class="rec' + (got ? ' done' : '') + (lock ? ' lock' : '') + '" data-act="rec" data-id="' + esc(r.id) + '">' +
        '<div class="h"><div class="nm">' + esc(r.name) + '</div>' +
        '<div class="q">' + (got ? '已调' : '1 次') + '</div></div>' +
        '<div class="src">' + esc(r.source || '') + '</div></div>';
    }).join('');

    return '<div class="wrap">' +
      '<div class="sect"><div class="t">档 案</div><div class="n num">剩 ' + st.quota + ' 次</div></div>' +
      (C.haveRecords && C.haveRecords.length ? '' : '') +
      '<div class="rows">' + rows + '</div>' +
      '<div style="color:#6b7488;font-size:11px;margin:12px 2px 18px;line-height:1.7">' +
      '共 ' + (C.records || []).length + ' 份，额度 ' + st.quotaMax + ' 次。调完不能退——想清楚哪几份真的能对上现场和证词。</div>' +
      '</div>';
  }

  function viewBoard() {
    var pinned = Object.keys(st.pinned).filter(function (k) { return st.pinned[k]; });
    var pool = openedCards().filter(function (cd) { return !st.pinned[cd.key]; });

    var pinHtml = pinned.length ? pinned.map(function (k) {
      var cd = byKey(k); if (!cd) return '';
      var sel = isSel(k);
      return '<div class="ecard pin' + (cd.kind === 'record' ? ' red' : '') + (sel ? ' sel' : '') + '" data-act="sel" data-k="' + esc(k) + '">' +
        '<div class="k">' + esc(cd.type) + '</div><span class="tt">' + esc(cd.title) + '</span>' +
        '<div class="pick">' + (sel ? '已选为依据' : '点选为依据') + '</div></div>';
    }).join('') : '<div class="hintempty">案卷还是空的。去现场勘查、问人、调档，点「钉上案卷」把材料放进来。</div>';

    var poolHtml = pool.length ? pool.map(function (cd) {
      return '<div class="ecard" data-act="pin" data-k="' + esc(cd.key) + '">' +
        '<div class="k">' + esc(cd.type) + '</div><span class="tt">' + esc(cd.title) + '</span>' +
        '<div class="pick">+ 钉上案卷</div></div>';
    }).join('') : '';

    var sus = (C.suspects || []).map(function (p) {
      var on = st.selKiller === p.name;
      return '<div class="s' + (on ? ' on' : '') + '" data-act="killer" data-n="' + esc(p.name) + '">' + esc(p.name) +
        '<span class="ro">' + esc((p.role || '').slice(0, 14)) + '</span></div>';
    }).join('');

    var selCount = Object.keys(st.sel).filter(function (k) { return st.sel[k]; }).length;
    var bar = '<div class="verdictbar">' +
      '<div class="l">结 案 指 认</div>' +
      '<div class="v">' + (st.selKiller ? esc(st.selKiller) : '<span style="color:#6b7488;font-weight:400">还没有选人</span>') + '</div>' +
      '<div class="count">' + [1, 2, 3].map(function (n) {
        return '<div class="p' + (selCount >= n ? ' on' : '') + '">' + n + '</div>';
      }).join('') + '<span class="hint num">依据 ' + selCount + ' / 3（只能选已上板的）</span>' +
      '<button class="btn main sm" data-act="submit" style="margin-left:auto">提交</button></div>' +
      '</div>';

    return '<div class="wrap">' +
      '<div class="sect"><div class="t">指 认 对 象</div></div><div class="sus">' + sus + '</div>' +
      '<div class="sect"><div class="t">案 卷 板</div><div class="n">已上板 ' + pinned.length + '</div></div>' +
      '<div class="bin">' + pinHtml + '</div>' +
      (poolHtml ? '<div class="sect"><div class="t">可 钉 入</div></div><div class="bin">' + poolHtml + '</div>' : '') +
      '<div style="height:8px"></div>' + bar +
      '</div>';
  }

  function viewResult() {
    var g = st.judged || {};
    var t = { pass: ['指认成立', 'pass'], soft: ['依据不足', 'soft'], fail: ['指认不成立', 'fail'] }[g.verdict] || ['待复核', 'soft'];
    var nec = (C.judge && C.judge.necessary) || [];
    var tr = C.truth || {};

    var html = '<div class="wrap"><div class="result">' +
      '<div class="vbanner ' + t[1] + '"><div class="vt">' + t[0] + '</div>' +
      '<div class="vs">你指认：' + esc(g.selected || '—') + '　·　命中 ' + (g.hit || []).length + ' / ' + nec.length + ' 条关键线索</div>' +
      '<div class="hits">' + (g.hit || []).map(function (id) { return '<span class="h">' + esc(id) + '</span>'; }).join('') +
      (g.missed || []).map(function (id) { return '<span class="m">漏 ' + esc(id) + '</span>'; }).join('') + '</div></div>';

    // 本局统计（含提示使用情况）
    var recUsed = (st.quotaMax || C.quota) - st.quota;
    var askN = Object.keys(st.asked || {}).filter(function (k) { return /-\d$/.test(k); }).length;
    var hints = st.hintLog || [];
    html += '<div class="sect"><div class="t">本 局</div></div><div class="paper">' +
      rowKV('调档', recUsed + ' / ' + (st.quotaMax || C.quota)) +
      rowKV('追问', askN + ' 次') +
      rowKV('提示', hints.length
        ? '看 ' + hints.length + ' 次 · 最高第 ' + Math.max.apply(null, hints.map(function (h) { return h.lv || h.level || 1; })) + ' 级'
        : '未使用') +
      rowKV('依据', (g.chosen || []).length + ' 条') +
      '</div>';
    if (hints.length) {
      html += '<div class="paper" style="margin-top:8px">' +
        hints.slice(-4).map(function (h) {
          return '<div style="font-size:11.5px;color:#6b7488;line-height:1.9">第 ' +
            (h.lv || h.level || 1) + ' 级　' + esc(h.phase || '') + '</div>';
        }).join('') + '</div>';
    }

    html += '<div class="sect"><div class="t">真 相</div></div><div class="paper">' +
      '<div class="k">凶手</div><h3>' + esc(tr.killer || '—') + '</h3></div>';

    if ((C.notes || []).length) {
      html += '<div class="paper" style="margin-top:8px;background:#fbf7ee">' +
        (C.notes || []).map(function (n) {
          return '<div style="font-size:11.5px;color:#8a7f6a;line-height:1.9">' + esc(n) + '</div>';
        }).join('') + '</div>';
    }

    if (tr.timeline && tr.timeline.length) {
      html += '<div class="sect"><div class="t">时 间 线</div><div class="n">' + tr.timeline.length + ' 段</div></div><div class="tl">' +
        tr.timeline.map(function (e) {
          return '<div class="e"><div class="tm num">' + esc(e.time) + '</div>' +
            '<div class="ev">' + esc(e.event) + '</div>' +
            (e.src ? '<div class="sc">' + esc(e.src) + '</div>' : '') + '</div>';
        }).join('') + '</div>';
    }

    html += '<div class="btnrow" style="margin-top:18px">' +
      '<div class="btn" data-act="undo">撤销指认</div>' +
      '<a class="btn main" href="选案.html">换一案</a></div>' +
      '</div></div>';
    return html;
  }

  function rowKV(k, v) {
    return '<div style="display:flex;padding:7px 0;border-bottom:1px solid #ece4d2;font-size:12.5px">' +
      '<div style="color:#8a7f6a;width:4.5em">' + esc(k) + '</div>' +
      '<div style="flex:1;text-align:right">' + esc(v) + '</div></div>';
  }

  function viewProgressSheet() {
    ensureHint(true);
    var openedS = (C.scene || []).filter(function (s, i) { return st.opened['S' + i]; }).length;
    var gotR = (C.records || []).filter(function (r) { return st.opened[r.id]; }).length;
    var lvl = Math.min(3, st.hint || 1);

    return '<div class="mask" data-act="close"></div><div class="sheet"><div class="hd"><div class="title">进度与提示</div>' +
      '<div class="x" data-act="close">收起</div></div>' +
      '<div class="prog">' +
      '<div class="cell"><div class="k">勘 查</div><div class="v num">' + openedS + '<span style="font-size:11px;color:#6b7488">/' + (C.scene || []).length + '</span></div></div>' +
      '<div class="cell"><div class="k">已 调 档</div><div class="v num">' + (st.quotaMax - st.quota) + '<span style="font-size:11px;color:#6b7488">/' + st.quotaMax + '</span></div></div>' +
      '<div class="cell"><div class="k">第 3 轮</div><div class="v num">' + askCount() + '<span style="font-size:11px;color:#6b7488">/' + (C.suspects || []).length + '</span></div></div>' +
      '</div>' +
      '<div class="hintbox"><div class="lv">提示 · 按你现在的进度现算（第 ' + lvl + ' 级）</div>' +
      '<div style="white-space:pre-wrap">' + esc(hintText(lvl)) + '</div>' +
      '<div class="note">进度变了，提示会重新从方向级算起。不看也能通关。</div></div>' +
      '<div class="btnrow">' +
      (lvl < 3 ? '<div class="btn main" data-act="hintmore">再具体一点</div>' : '<div class="btn ghost" style="flex:1">已经讲到最具体</div>') +
      '</div>' +
      '<div class="btnrow">' +
      '<div class="btn" data-act="undo">回档一步</div>' +
      '<div class="btn ghost" data-act="reset">重置本关</div>' +
      '</div>' +
      '<div style="color:#6b7488;font-size:11px;margin-top:10px;line-height:1.7">存档在本机浏览器里，关掉页面再打开能接着玩。换设备不会同步。</div>' +
      '</div>';
  }

  function viewSheet() {
    if (!sheet) return '';
    if (sheet.kind === 'progress') return viewProgressSheet();

    if (sheet.kind === 'scene') {
      var s = (C.scene || [])[sheet.i] || {};
      var clauses = String(s.desc || '').split('；');
      var lines = clauses.map(function (x, i) {
        return '<div class="line"><b>' + (i === 0 ? '记录' : '') + '</b><span class="v">' + esc(x.replace(/。$/, '')) + '</span></div>';
      }).join('');
      return '<div class="mask" data-act="close"></div><div class="sheet"><div class="hd">' +
        '<div class="title">勘查 ' + esc(s.no || '') + '</div><div class="x" data-act="close">收起</div></div>' +
        '<div class="paper"><div class="k">' + esc(s.valid === '有效' ? '有效物证' : (s.valid || '现场记录')) + '</div>' +
        '<h3>' + esc(s.place) + '</h3>' + lines +
        (s.valid && s.valid !== '有效' ? '<div class="flag">这一处没有可用的物证。空点也是记录——它说明这里没人动过手。</div>' : '') +
        '</div>' +
        '<div class="btnrow"><div class="btn main" data-act="pin" data-k="S' + sheet.i + '">钉上案卷</div></div>' +
        '</div>';
    }

    if (sheet.kind === 'rec') {
      var r = null;
      (C.records || []).forEach(function (x) { if (x.id === sheet.id) r = x; });
      if (!r) return '';
      var got = !!st.opened[r.id];
      return '<div class="mask" data-act="close"></div><div class="sheet"><div class="hd">' +
        '<div class="title">' + esc(r.id) + '</div><div class="x" data-act="close">收起</div></div>' +
        '<div class="paper"><div class="k">' + esc(r.source || '') + '</div><h3>' + esc(r.name) + '</h3>' +
        '<div style="white-space:pre-wrap;font-size:12.5px;line-height:1.8;color:#2a251d">' + esc(r.content) + '</div></div>' +
        '<div class="btnrow">' +
        (got ? '<div class="btn main" data-act="pin" data-k="' + esc(r.id) + '">钉上案卷</div>'
          : '<div class="btn main" data-act="fetch" data-id="' + esc(r.id) + '">调取（耗 1 次，剩 ' + st.quota + '）</div>') +
        '</div></div>';
    }
    return '';
  }

  function view() {
    if (tab === 'result' && st.judged) return header() + viewResult() + tabsBar();
    var body = tab === 'ask' ? viewAsk() : tab === 'rec' ? viewRec() : tab === 'board' ? viewBoard() : viewScene();
    return header() + body + tabsBar();
  }

  function render() {
    document.getElementById('app').innerHTML = view();
    document.getElementById('sheet').innerHTML = viewSheet();
  }

  /* ---------------- 判定 ---------------- */
  function doJudge() {
    if (!st.selKiller) { toast('先选一个指认对象'); return; }
    var sel = Object.keys(st.sel).filter(function (k) { return st.sel[k]; });
    if (sel.length < 3) { toast('依据至少 3 条（现 ' + sel.length + ' 条）'); return; }

    var tr = C.truth || {};
    var accept = (tr.accept || [tr.killer]).map(function (x) { return String(x || '').replace(/\s+/g, ''); });
    var picked = String(st.selKiller).replace(/\s+/g, '');
    var killerOk = accept.some(function (a) { return a && (a.indexOf(picked) >= 0 || picked.indexOf(a) >= 0); });

    var nec = (C.judge && C.judge.necessary) || [];
    var cm = (C.judge && C.judge.cardMap) || {};
    var proved = {};
    sel.forEach(function (k) { (cm[k] || []).forEach(function (id) { proved[id] = 1; }); });
    var hit = nec.filter(function (id) { return proved[id]; });
    var missed = nec.filter(function (id) { return !proved[id]; });
    var verdict = !killerOk ? 'fail' : (hit.length >= 3 ? 'pass' : 'soft');

    act('指认', function () {
      st.judged = { verdict: verdict, killerOk: killerOk, hit: hit, missed: missed, chosen: sel, selected: st.selKiller };
      if (verdict === 'pass') SAVE.markCleared(st);
    });
    tab = 'result';
    render();
  }

  /* ---------------- 交互 ---------------- */
  /* 案卷板横向拖动：桌面用鼠标拖，触屏用滑动；拖动超过 6px 就不算点击 */
  (function () {
    var drag = null;
    function bins(e) { return e.target.closest && e.target.closest('.bin'); }
    document.addEventListener('pointerdown', function (e) {
      var b = bins(e);
      if (!b) return;
      if (b.scrollWidth <= b.clientWidth + 2) return;   // 不需要滚就不接管
      drag = { el: b, x: e.clientX, left: b.scrollLeft, moved: false, id: e.pointerId };
    }, true);
    document.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      if (!drag.moved) {
        drag.moved = true;
        try { drag.el.setPointerCapture(e.pointerId); } catch (err) {}
        drag.el.classList.add('grabbing');
      }
      drag.el.scrollLeft = drag.left - dx;
      e.preventDefault();
    }, true);
    function end(e) {
      if (!drag) return;
      var moved = drag.moved, el = drag.el;
      el.classList.remove('grabbing');
      drag = null;
      if (moved) {
        // 拖动之后吞掉这一次点击，避免误选依据
        var swallow = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
        document.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(function () { document.removeEventListener('click', swallow, true); }, 60);
      }
    }
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
  })();

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var a = el.getAttribute('data-act');

    if (a === 'tab') { tab = el.getAttribute('data-v'); sheet = null; render(); document.getElementById('app').scrollIntoView({ block: 'start' }); return; }
    if (a === 'close') { sheet = null; render(); return; }

    if (a === 'scene') {
      var i = +el.getAttribute('data-i');
      var first = !st.opened['S' + i];
      if (first) act('勘查 ' + ((C.scene || [])[i].place || ''), function () { st.opened['S' + i] = true; });
      sheet = { kind: 'scene', i: i };
      render(); return;
    }

    if (a === 'who') { curWho = el.getAttribute('data-n'); render(); return; }

    if (a === 'ask') {
      var n = el.getAttribute('data-n'), r = el.getAttribute('data-r');
      act('追问 ' + n + ' 第' + r + '轮', function () { st.asked[n + '-' + r] = true; });
      render(); return;
    }

    if (a === 'rec') {
      var id = el.getAttribute('data-id');
      sheet = { kind: 'rec', id: id };
      render(); return;
    }

    if (a === 'fetch') {
      var rid = el.getAttribute('data-id');
      if (st.opened[rid]) { sheet = { kind: 'rec', id: rid }; render(); return; }
      if (st.quota <= 0) { toast('额度用完了'); return; }
      act('调档 ' + rid, function () { st.opened[rid] = true; st.quota -= 1; });
      sheet = { kind: 'rec', id: rid };
      render(); return;
    }

    if (a === 'pin') {
      var k = el.getAttribute('data-k');
      if (!st.opened[k] && k.charAt(0) !== 'T') {
        // 未调取的记录不能上板
        toast('这份还没调取'); return;
      }
      act('钉上案卷', function () { st.pinned[k] = true; });
      sheet = null; tab = 'board'; render(); return;
    }

    if (a === 'sel') {
      var k2 = el.getAttribute('data-k');
      act('选为依据', function () {
        if (st.sel[k2]) delete st.sel[k2]; else st.sel[k2] = true;
      });
      render(); return;
    }

    if (a === 'killer') {
      var nm = el.getAttribute('data-n');
      act('指认 ' + nm, function () { st.selKiller = nm; });
      render(); return;
    }

    if (a === 'submit') { doJudge(); return; }

    if (a === 'progress') { sheet = { kind: 'progress' }; render(); return; }

    if (a === 'hintmore') {
      act('看更具体的提示', function () {
        st.hint = Math.min(3, (st.hint || 1) + 1);
        st.hintLog = st.hintLog || [];
        st.hintLog.push({ lv: st.hint, level: st.hint, at: Date.now(), phase: phaseLabel() });
        if (st.hintLog.length > 30) st.hintLog = st.hintLog.slice(-30);
      });
      render(); return;
    }

    if (a === 'undo') {
      var res = SAVE.undo(st);
      if (!res) { toast('没有可回退的步骤'); return; }
      tab = st.judged ? 'result' : (tab === 'result' ? 'board' : tab);
      sheet = null; render(); toast('已回退：' + (res.why || '上一步')); return;
    }

    if (a === 'reset') {
      if (!confirm('重置本关？本关的勘查、调档、追问记录都会清空（已通关标记保留）。')) return;
      st = SAVE.reset(C.id, C.quota);
      tab = 'scene'; sheet = null; render(); toast('本关已重置'); return;
    }
  });

  ensureHint(false);
  render();
})();
