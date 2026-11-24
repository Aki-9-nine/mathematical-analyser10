/* 数学错题整理智能体 · 学习台
   不调用模型、不落盘，全部状态在内存里。
   契约：docs/product-overview.md                                          */
(function () {
  'use strict';

  /* ---------------- 基础工具 ---------------- */
  var DAY = 864e5;
  var T0 = Date.now();
  var INTERVALS = [1, 3, 7, 15];
  var CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

  var THEMES = [
    { id: 'paper', name: '纸感赭石', sw: ['#f4f1ea', '#a04a1e', '#1f1d1a'] },
    { id: 'celadon', name: '青瓷', sw: ['#f0f4f2', '#2f6a5e', '#17211e'] },
    { id: 'indigo', name: '靛蓝', sw: ['#f3f4f9', '#474fa0', '#1a1c26'] },
    { id: 'sand', name: '暖沙', sw: ['#f7f2e8', '#a2622a', '#241f18'] },
    { id: 'slate', name: '石青', sw: ['#f4f5f6', '#3d5a80', '#1b1f22'] },
    { id: 'night', name: '夜读', sw: ['#191817', '#d98d5a', '#efeae1'] }
  ];

  var STEP_DEFS = [
    { key: 'diagnosis', name: '你错在哪', d: '具体错在哪一步' },
    { key: 'why', name: '为什么会这样', d: '这个记法是怎么歪掉的' },
    { key: 'approach', name: '正确的做法', d: '一步一步该怎么走' },
    { key: 'trigger', name: '下次遇到这样做', d: '看到什么就做什么' },
    { key: 'variant', name: '同类题练一练', d: '换个数再练一遍' }
  ];

  // 旧记录的旧标题映射成白话，避免同一个产品里两套说法
  var TITLE_MAP = {
    '错因诊断': '你错在哪',
    '常见错因': '这类题常见的错法',
    '为什么错': '为什么会这样',
    '你为什么会做错？': '为什么会这样',
    '这类题最容易错在哪？': '这类题为什么容易错',
    '正确做法': '正确的做法',
    '正确做法：': '正确的做法',
    '下次怎么做': '下次遇到这样做',
    '下次看到相应条件怎么做？': '下次遇到这样做',
    '变式题': '同类题练一练'
  };
  function labelOf(b) {
    if (b && b.title && TITLE_MAP[b.title]) return TITLE_MAP[b.title];
    return b ? b.title : '';
  }

  function cssv(name, fallback) {
    var v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fallback;
  }
  function paletteColors() {
    return ['--accent', '--teal', '--gold', '--accent-2', '--ink-3', '--danger'].map(function (n) {
      return cssv(n, '#a04a1e');
    });
  }

  function ago(days) { return T0 - days * DAY; }
  function uid() { return 'r' + Math.random().toString(36).slice(2, 9); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function para(s) {
    var t = esc(s).split(/\n+/).filter(function (x) { return x.trim(); });
    if (!t.length) return '<p class="muted">（空）</p>';
    return t.map(function (p) { return '<p>' + p + '</p>'; }).join('');
  }
  function endOfToday() {
    var d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime();
  }
  function dayStart(ts) {
    var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime();
  }
  function fmtRel(ts) {
    if (!ts) return '';
    var diff = Date.now() - ts;
    if (diff < 60e3) return '刚刚';
    if (diff < 36e5) return Math.floor(diff / 60e3) + ' 分钟前';
    if (diff < DAY) return Math.floor(diff / 36e5) + ' 小时前';
    var d = Math.floor(diff / DAY);
    if (d < 30) return d + ' 天前';
    return Math.floor(d / 30) + ' 个月前';
  }
  function fmtNum(n) { return Number(n || 0).toLocaleString('en-US'); }
  function fmtCost(n) { return '¥' + (Number(n || 0)).toFixed(2); }

  /* ---------------- 示例数据 ---------------- */
  function base(o) {
    var r = {
      id: uid(), createdAt: T0, updatedAt: T0, source: 'text',
      question: '', hasAnswer: true, studentAnswer: '',
      diagnosisMode: 'trace', knowledgePoints: [], mistakeType: '', secondaryTypes: [],
      blocks: [], variant: { question: '', answer: '' }, mySummary: '',
      usage: { promptTokens: 0, completionTokens: 0, costEstimate: 0 },
      review: { count: 0, intervalIndex: 0, lastReviewedAt: 0, nextDueAt: 0 }
    };
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k];
    return r;
  }

  function seedData() {
    return [
      base({
        id: 's1', createdAt: ago(2), updatedAt: ago(2), isSample: true,
        question: '若关于 x 的一元二次方程 x² − 2x + m = 0 有两个不相等的实数根，则 m 的取值范围是（　）',
        studentAnswer: 'Δ = (−2)² − 4·1·m = 4 − 4m。因为方程有实数根，所以 Δ ≥ 0，即 4 − 4m ≥ 0，得 m ≤ 1。',
        knowledgePoints: ['一元二次方程/根的判别式'],
        mistakeType: '概念混淆', secondaryTypes: ['条件对应错误'],
        blocks: [
          { key: 'diagnosis', title: '错因诊断', text: '你算 Δ 这一步没有问题，错在把「有两个不相等的实数根」写成了「有实数根」。题目前半句的「不相等」你读到了，但在翻译成不等式时被自己吞掉了，Δ 的比较符号从 > 又落回 ≥。' },
          { key: 'why', title: '你为什么会做错？', text: '你记忆里存的是「有实数根 → Δ ≥ 0」，这本身没错，它是「有实数根（含重根）」的完整条件；而「两个不相等」正好排掉了重根那一种，所以界限是严格不等号。你缺的不是公式，是把「不相等 / 有两个 / 至少一个」这类字眼逐个映射成 >、≥、≠ 的对照动作。' },
          { key: 'approach', title: '正确做法：', text: '① 先把条件抄一遍，圈出「两个」「不相等」；② 写 Δ 与 0 的关系之前，先写一句话「不相等 ⇔ Δ > 0」；③ 代入 Δ = 4 − 4m > 0，得 m < 1；④ 回头验一句：m = 1 时方程是 (x − 1)² = 0，只有一根，与「不相等」冲突，应当排除。' },
          { key: 'trigger', title: '下次看到相应条件怎么做？', text: '见到「根的情况」四个字，先写一张小表再动笔：两个不相等 → Δ > 0；两个相等 → Δ = 0；有实数根 → Δ ≥ 0；没有实数根 → Δ < 0。表写完再代数值，不要在脑子里一口气跳过去。' }
        ],
        variant: {
          question: '若关于 x 的一元二次方程 kx² − 2x + 1 = 0 有两个不相等的实数根，求 k 的取值范围。',
          answer: '需同时满足二次项系数 k ≠ 0 与 Δ = 4 − 4k > 0，即 k < 1 且 k ≠ 0。'
        },
        mySummary: '读题时把「不相等」这种词圈出来，Δ 的比较符号就是它给的。',
        usage: { promptTokens: 1860, completionTokens: 571, costEstimate: 0.02 },
        review: { count: 0, intervalIndex: 0, lastReviewedAt: 0, nextDueAt: ago(1) }
      }),
    ];
  }

  /* ---------------- 模拟诊断模板（原型不接模型） ---------------- */
  var MOCK = {
    trace: {
      kp: ['二次函数/闭区间最值'],
      type: '步骤跳步', secondary: ['审题遗漏'],
      blocks: [
        { key: 'diagnosis', title: '错因诊断', text: '方向和起点都没问题，出错在中段：「分类讨论」这一步被跳过了。题目里的条件其实有两条约束，你只处理了更好算的那一条，另一条还停在草稿上没动，答案就少了整整一半的情况。\n（原型模拟：这段按版式写，正式版由模型针对你贴的题目生成。）' },
        { key: 'why', title: '你为什么会做错？', text: '这不是知识点缺口，是处理顺序的问题。人在有时间压力时会优先处理「好算的」而不是「必须的」：先浮出来的是那个能立刻算出数的条件，第二个条件还没被翻译成式子，手已经往下走了。' },
        { key: 'approach', title: '正确做法：', text: '① 把条件逐条编号抄出来，一条一行；② 每条后面写一句「它约束了哪个量」；③ 回头检查这些量是否都出现在你的式子里；④ 缺哪条补哪条，再动笔算；⑤ 最后用一组具体数字代回去检验。' },
        { key: 'trigger', title: '下次看到相应条件怎么做？', text: '条件超过两条时，不要直接开始算。先列一张两列小表：左边写条件，右边写它约束的量；用过一条划掉一条，最后没划掉的就是你漏掉的那条。' }
      ],
      variant: {
        question: '把原题里的「有两个」改成「至少有一个」，其他条件不变，重新求一遍取值范围。',
        answer: '（原型模拟）关键在「至少一个」对应 Δ ≥ 0，边界是否取等要单独验一次，别沿用上一问的严格不等号。'
      }
    },
    trap: {
      kp: ['分式方程/增根与检验'],
      type: '概念混淆', secondary: [],
      blocks: [
        { key: 'diagnosis', title: '错因诊断', text: '这类题最常见的错法不是算错，而是漏掉最后一步检验。去分母之后算得很顺，答案看着也像个整数，就直接交上去了——而这个「答案」往往恰好让分母为 0。\n（原型模拟：这段按版式写，正式版由模型针对你贴的题目生成。）' },
        { key: 'why', title: '这类题最容易错在哪？', text: '最容易错在把「检验」当成可以省的收尾动作。两边同乘的那一式可能是 0，乘 0 会凭空造出原本不存在的解；这一步不是形式，是判定解是否合法的唯一关口。' },
        { key: 'approach', title: '正确做法：', text: '① 先写最简公分母；② 两边同乘去分母，注意每一项都乘；③ 解出整式方程；④ 把解代回最简公分母判断是否为 0；⑤ 为 0 记为增根舍去，最后写清「原方程无解」还是「原方程的解是 x = ?」。' },
        { key: 'trigger', title: '下次看到相应条件怎么做？', text: '只要分母含未知数，解完固定写一行「检验：x = ? 代入最简公分母 = ?」，写在卷面上，不要只在心里过。' }
      ],
      variant: {
        question: '解方程 2/(x − 1) = 3/(x + 1)。',
        answer: '交叉相乘得 2(x + 1) = 3(x − 1)，解得 x = 5；检验：x − 1 = 4 ≠ 0，x + 1 = 6 ≠ 0，故 x = 5 是原方程的解。'
      }
    }
  };

  /* ---------------- 状态 ---------------- */
  var state = {
    screen: 'app',
    tab: 'entry',
    data: [],
    selectedId: null,
    mobileDetail: false,
    hasKey: false,
    filters: { kp: 'all', type: 'all', q: '' },
    edit: null,        // { id, draft, deleted:[] }
    pending: null,     // 诊断中的草稿记录
    timers: [],
    review: null,      // { queue:[], i, stage }
    entry: { q: '', a: '' },
    answerSwitch: true,
    addTag: null,      // 'kp' | 'type'
    theme: 'paper',
    steps: { diagnosis: true, why: true, approach: true, trigger: true, variant: true },
    listEdit: false,           // 错题本列表的「编辑」模式
    confirmDel: null,          // 待确认删除的记录 id
    exportPick: null,          // { ids: [...] } 选择导出的弹窗
    stage: 'input',            // 录入页子状态：input | confirm | diagnosing
    imgMode: (function () {
      try { return localStorage.getItem('mr.imgmode') || 'direct'; } catch (e) { return 'direct'; }
    })(),                       // ocr = 先识别文字；direct = 图片直诊
    streamText: '',            // 流式输出中的正文
    thinkText: '',             // 流式输出中的思考内容（单独存放，不混进正文）
    textOpen: false,           // 直达模式下「也可以贴文字」是否展开
    img: null,                 // { dataUrl, name, w, h }
    confirm: { q: '', a: '' }, // OCR 结果，可编辑
    ocrBusy: false,
    keyBusy: false,
    netErr: null,              // { msg, hint }
    progress: []               // 诊断进度文案
  };

  function stepOn(key) { return state.steps[key] !== false; }

  /* ---------------- 小工具：查询 ---------------- */
  function getRec(id) {
    var r = state.data.filter(function (x) { return x.id === id; })[0];
    if (r) return r;
    if (state.pending && state.pending.id === id) return state.pending;
    return null;
  }
  function isMobile() { return window.innerWidth < 900; }
  function totalCost() {
    return state.data.reduce(function (s, r) { return s + (r.usage.costEstimate || 0); }, 0);
  }
  function dueList() {
    var eod = endOfToday();
    return state.data.filter(function (r) {
      return r.review.nextDueAt > 0 && r.review.nextDueAt <= eod;
    }).sort(function (a, b) { return a.review.nextDueAt - b.review.nextDueAt; });
  }
  function dueCount() { return dueList().length; }

  function dueLabel(r) {
    if (!r.review.nextDueAt) return { t: '未排期', c: '' };
    var eod = endOfToday();
    if (r.review.nextDueAt <= eod) {
      var over = Math.floor((dayStart(Date.now()) - dayStart(r.review.nextDueAt)) / DAY);
      return over > 0 ? { t: '已过期 ' + over + ' 天', c: 'due' } : { t: '今日复习', c: 'due' };
    }
    var n = Math.round((dayStart(r.review.nextDueAt) - dayStart(Date.now())) / DAY);
    if (n === 1) return { t: '明天', c: '' };
    return { t: n + ' 天后', c: '' };
  }

  // 流式预览时把 Markdown 记号去掉，看起来更像成品
  function prettyStream(t) {
    return String(t || '')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\\*\*(.+?)\*\\*/g, '$1')
      .replace(/^\s*[-*]\s+/gm, '· ');
  }

  // 思考内容可能很长，界面上只留尾部，避免卡顿
  function tailText(t, n) {
    t = String(t || '');
    if (t.length <= n) return t;
    return '…（前面省略 ' + (t.length - n) + ' 字）' + '\n' + t.slice(-n);
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2400);
  }

  /* ---------------- 顶部 / 导航 ---------------- */
  var NAV = [
    { id: 'entry', label: '拍照', d: 'M4 8h3l2-2h6l2 2h3v12H4z M12 11a3 3 0 100 6 3 3 0 000-6' },
    { id: 'list', label: '错题本', d: 'M6 4h9a3 3 0 013 3v13H9a3 3 0 01-3-3z M9 9h6 M9 13h4' },
    { id: 'review', label: '复习', d: 'M4 12a8 8 0 1114 4.5 M4 20v-4h4' },
    { id: 'me', label: '我的', d: 'M12 11a4 4 0 100-8 4 4 0 000 8z M4 21c0-3.3 3.6-6 8-6s8 2.7 8 6' }
  ];

  function icon(d, cls) {
    return '<svg class="' + (cls || '') + '" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
  }

  function renderNav() {
    var nav = document.getElementById('nav');
    nav.innerHTML = NAV.map(function (n) {
      var c = n.id === 'list' ? state.data.length : (n.id === 'review' ? dueCount() : 0);
      return '<button class="nav-item" data-action="tab" data-tab="' + n.id + '" aria-current="' + (state.tab === n.id) + '">' +
        icon(n.d) + '<span>' + n.label + '</span>' +
        (c ? '<span class="count">' + c + '</span>' : '') + '</button>';
    }).join('');

    var tb = document.getElementById('tabbar');
    tb.innerHTML = NAV.map(function (n) {
      return '<button data-action="tab" data-tab="' + n.id + '" aria-current="' + (state.tab === n.id) + '">' +
        icon(n.d, '') + '<span>' + n.label + '</span></button>';
    }).join('');
  }

  function renderTopbar() {
    var tb = document.getElementById('topbar');
    var titles = { entry: '拍照录入', list: '错题本', review: '复习', me: '我的', stats: '统计', settings: '设置' };
    var dc = dueCount();
    tb.innerHTML =
      ((isMobile() && state.tab === 'list' && state.mobileDetail) || state.tab === 'stats' || state.tab === 'settings'
        ? '<button data-action="back-me" class="topback">← 返回</button>'
        : '') +
      '<strong style="font-size:14px;letter-spacing:.04em">' + titles[state.tab] + '</strong>' +
      '<span class="spacer"></span>' +
      (dc ? '<button class="chip due" data-action="tab" data-tab="review">今日待复习 ' + dc + '</button>' : '') +
      '<button class="chip ' + (AI.hasKey() ? (state.keyOk ? '' : 'warn') : 'warn') + '" data-action="go-onboard">' +
      (state.keyOk ? 'Key 已验证' : (AI.hasKey() ? 'Key 已保存 · 点此验证' : 'Key 未验证')) + '</button>';
  }

  /* ---------------- 列表 ---------------- */
  function kpOptions() {
    var set = {};
    state.data.forEach(function (r) { r.knowledgePoints.forEach(function (k) { set[k.split('/')[0]] = 1; }); });
    return Object.keys(set);
  }
  function typeOptions() {
    var set = {};
    state.data.forEach(function (r) { if (r.hasAnswer) set[r.mistakeType] = 1; });
    return Object.keys(set);
  }
  function filtered() {
    var f = state.filters;
    return state.data.filter(function (r) {
      if (f.kp !== 'all') {
        var hit = r.knowledgePoints.some(function (k) { return k.split('/')[0] === f.kp; });
        if (!hit) return false;
      }
      if (f.type !== 'all' && r.mistakeType !== f.type) return false;
      if (f.q) {
        var q = f.q.toLowerCase();
        if ((r.question + r.studentAnswer + r.mySummary).toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function renderFilters() {
    var box = document.getElementById('rail-filters');
    var kps = kpOptions(), types = typeOptions();
    box.innerHTML =
      '<input placeholder="搜索题目原文…" value="' + esc(state.filters.q) + '" data-filter="q">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
      '<select data-filter="kp"><option value="all">全部知识点</option>' +
      kps.map(function (k) { return '<option value="' + esc(k) + '"' + (state.filters.kp === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') +
      '</select>' +
      '<select data-filter="type"><option value="all">全部错误类型</option>' +
      types.map(function (k) { return '<option value="' + esc(k) + '"' + (state.filters.type === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="list-bar"><span class="tiny muted">共 ' + state.data.length + ' 道</span>' +
      '<button class="mini" data-action="toggle-list-edit">' + (state.listEdit ? '完成' : '编辑') + '</button></div>';
  }

  function itemHTML(r) {
    var dl = dueLabel(r);
    var kp = r.knowledgePoints[0] || '未归类';
    var typeTxt = r.hasAnswer ? (r.mistakeType || '未分类') : '仅存档';
    var del = state.listEdit
      ? '<button class="item-del" data-action="ask-del" data-id="' + r.id + '" title="删除这道">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>' +
        '</button>' : '';
    return '<div class="item' + (state.selectedId === r.id ? ' sel' : '') + (state.listEdit ? ' editing' : '') +
      '" data-action="select" data-id="' + r.id + '" role="button" tabindex="0">' +
      '<div class="item-top">' + (r.isSample ? '<span class="badge-sample">示例</span>' : '') +
      '<span class="kp">' + esc(kp) + '</span><span>·</span><span class="ty">' + esc(typeTxt) + '</span></div>' +
      '<div class="item-q">' + esc(r.question.slice(0, 62)) + '</div>' +
      '<div class="item-meta"><span>' + fmtRel(r.createdAt) + '</span>' +
      '<span class="pill ' + dl.c + '">' + dl.t + '</span></div>' +
      del + '</div>';
  }

  function renderList() {
    var box = document.getElementById('rail-list');
    var rows = filtered();
    if (!rows.length) {
      box.innerHTML = '<div class="empty tiny">没有匹配的错题。<br>清掉筛选试试。</div>';
      return;
    }
    box.innerHTML = rows.map(itemHTML).join('');
  }

  /* ---------------- 详情卡 ---------------- */
  function tagRow(d, editing) {
    var kp = d.knowledgePoints.map(function (k) {
      return '<span class="tag kp">' + esc(k) + (editing ? '<button data-action="deltag" data-field="kp" data-val="' + esc(k) + '">×</button>' : '') + '</span>';
    }).join('');
    var t = d.mistakeType
      ? '<span class="tag type">' + (d.hasAnswer ? '' : '常见错因 · ') + esc(d.mistakeType) + (editing ? '<button data-action="deltag" data-field="type" data-val="main">×</button>' : '') + '</span>'
      : '';
    var sec = d.secondaryTypes.map(function (k) {
      return '<span class="tag type">次因 ' + esc(k) + (editing ? '<button data-action="deltag" data-field="sec" data-val="' + esc(k) + '">×</button>' : '') + '</span>';
    }).join('');
    var add = '';
    if (editing) {
      if (state.addTag === 'kp' || state.addTag === 'sec') {
        add = '<span class="addtag"><input data-taginput="' + state.addTag + '" placeholder="新标签，回车" autofocus></span>';
      } else {
        add = '<button class="linkish" data-action="addtag" data-field="kp">+ 知识点</button>' +
          '<button class="linkish" data-action="addtag" data-field="sec">+ 次因</button>';
      }
    }
    return '<div class="tagrow">' + kp + t + sec + add + '</div>';
  }

  function sectionHTML(num, title, bodyHTML, cls) {
    return '<div class="sect"><div class="sect-head"><span class="sect-num">' + num + '</span>' +
      '<span class="sect-title ' + (cls || '') + '">' + esc(title) + '</span></div>' +
      '<div class="sect-body">' + bodyHTML + '</div></div>';
  }

  // 按当前显示的步骤实时编号：删一段 / 关一步，后面的序号自动往前补
  function buildSections(r, tagBlock) {
    var n = 0, html = '';
    html += sectionHTML(CIRCLED[n++] || '·', '知识点', tagBlock || tagRow(r, false));
    r.blocks.filter(function (b) { return stepOn(b.key); }).forEach(function (b) {
      html += sectionHTML(CIRCLED[n++] || '·', labelOf(b), para(b.text),
        b.key === 'why' && r.diagnosisMode === 'trap' ? 'mode-trap' : '');
    });
    return { html: html, next: n };
  }
  // 老记录里可能把「题目 + 答案」整段塞进了答案区，这里渲染时兜底拆开
  function fixVariant(v) {
    v = v || {};
    var q = String(v.question || '').trim();
    var a = String(v.answer || '').trim();
    var blank = /^[\s.…·]*$/;
    if (blank.test(q)) q = '';
    if (blank.test(a)) a = '';
    // 答案里又出现了「题目：…」→ 重新拆一次，取最后一对
    if (a && /(题目|问题|问)\s*[:：]/.test(a) && /(答案|解答|答)\s*[:：]/.test(a)) {
      var sp = (window.AI && AI.splitVariant) ? AI.splitVariant(a) : null;
      if (sp) {
        if (sp.question) q = sp.question;
        a = sp.answer || '';
      }
    }
    if (blank.test(q)) q = '';
    if (blank.test(a)) a = '';
    return { question: q, answer: a };
  }

  function variantOn(r) {
    if (!stepOn('variant')) return false;
    var v = fixVariant(r.variant);
    return !!(v.question || v.answer);
  }

  function cardHTML(r) {
    var editing = !!(state.edit && state.edit.id === r.id);
    var d = editing ? state.edit.draft : r;
    var dl = dueLabel(r);
    var isPending = !!(state.pending && state.pending.id === r.id);

    var top = '<div class="card-top">' +
      '<span class="pill">' + (d.source === 'image' ? '拍照' : '文本') + '</span>' +
      '<span>' + fmtRel(d.createdAt) + '</span>' +
      (isPending ? '<span class="pill draft">' + (editing ? '草稿' : '诊断中') + '</span>' : '') +
      (r.isSample ? '<span class="badge-sample">示例</span>' : '') +
      (r.mock ? '<span class="pill draft">模拟输出</span>' : '') +
      (editing && !isPending ? '<span class="pill draft">编辑中</span>' : '') +
      '<span style="margin-left:auto" class="tiny">' +
      (r.review.nextDueAt ? (dl.c === 'due' ? '待复习 · ' + dl.t : '下次复习 ' + dl.t) : '存档后自动排期') +
      '</span></div>';

    var q = editing
      ? '<div class="edit-block" style="border-top:0"><div class="edit-label">题目原文</div>' +
      '<textarea class="editor" data-input="question" rows="3">' + esc(d.question) + '</textarea></div>'
      : '<div class="card-q"><span class="qtext">' + esc(d.question) + '</span></div>';

    var ans;
    if (editing) {
      ans = d.hasAnswer
        ? '<div class="edit-block" style="border-top:0;padding-top:0"><div class="edit-label">我的作答</div>' +
        '<textarea class="editor small" data-input="studentAnswer" rows="4">' + esc(d.studentAnswer) + '</textarea></div>'
        : '';
    } else if (d.hasAnswer && d.studentAnswer) {
      ans = '<div class="answer-box"><span class="lbl">我的作答</span>' + esc(d.studentAnswer) + '</div>';
    } else {
      ans = '<div class="answer-box"><span class="lbl">我的作答</span>' +
        '没填作答 —— 会按「这类题最常见的错法」来分析，不计入错误类型分布。</div>';
    }

    var summary;
    if (editing) {
      summary = d.mySummary
        ? '<div class="summary-block"><div class="summary-lbl">我的总结 · 不在此处编辑</div>' +
        '<div style="font-family:var(--serif);font-size:14.5px;padding:4px 6px">' + esc(d.mySummary) + '</div></div>'
        : '';
    } else {
      summary = '<div class="summary-block">' +
        '<div class="summary-lbl">我的总结<span class="saved" data-saved="' + r.id + '">已保存</span></div>' +
        '<textarea class="summary-input" data-input="summary" data-id="' + r.id + '" rows="1" ' +
        'placeholder="写一句自己的话，复习时先看这句">' + esc(d.mySummary) + '</textarea></div>';
    }

    var body = '';
    if (editing) {
      body += '<div class="editing-note">正在编辑 · 保存后覆盖原内容 · Esc 撤销最近一次删除</div>';
      body += '<div class="edit-block" style="border-top:0;padding-top:0"><div class="edit-label">知识点 / 错误类型</div>' + tagRow(d, true) + '</div>';
      d.blocks.forEach(function (b, i) {
        body += '<div class="edit-block"><div class="edit-label"><span>' + esc(labelOf(b)) +
          (stepOn(b.key) ? '' : ' <span class="tiny muted">（设置里已关闭显示）</span>') + '</span>' +
          '<button class="del" data-action="delblock" data-idx="' + i + '">删除这一段</button></div>' +
          '<textarea class="editor" data-input="block" data-idx="' + i + '" rows="3">' + esc(b.text) + '</textarea></div>';
      });
      var vvE = fixVariant(d.variant);
      body += '<div class="edit-block"><div class="edit-label">同类题 · 题目</div>' +
        '<textarea class="editor small" data-input="variantQ" rows="2">' + esc(vvE.question) + '</textarea>' +
        '<div class="edit-label" style="margin-top:10px">同类题 · 答案</div>' +
        '<textarea class="editor small" data-input="variantA" rows="2">' + esc(vvE.answer) + '</textarea></div>';
    } else {
      var secs = buildSections(d);
      body += secs.html;
      if (isPending) {
        body += '<div class="sect"><div class="sect-body" style="padding-left:26px">' +
          '<div class="skel" style="width:92%"></div><div class="skel" style="width:78%"></div></div></div>';
      }
      if (variantOn(d)) {
        var vv = fixVariant(d.variant);
        body += '<div class="sect"><div class="sect-head"><span class="sect-num">' + (CIRCLED[secs.next] || '·') + '</span>' +
          '<span class="sect-title">同类题练一练</span></div><div class="sect-body">' +
          '<div class="variant"><div class="q">' +
          (vv.question ? esc(vv.question) : '<span class="tiny muted">这道题的同类题没出成，点「重新诊断」可再试一次。</span>') +
          '</div>' +
          (vv.answer
            ? '<div class="a" data-variant-answer="' + r.id + '" hidden>' + esc(vv.answer) + '</div>' +
              '<div style="margin-top:8px"><button class="linkish" data-action="toggle-variant" data-id="' + r.id + '">看答案</button></div>'
            : '') +
          '</div></div></div>';
      }
    }

    var actions = editing
      ? '<div class="card-actions"><button class="btn-primary" data-action="edit-save" data-id="' + r.id + '">' +
      (isPending ? '确认存入错题本' : '保存') + '</button>' +
      '<button data-action="edit-cancel" data-id="' + r.id + '">取消</button>' +
      '<span class="tiny muted">每段都能改、能删；标签能增删</span></div>'
      : '<div class="card-actions"><button data-action="edit-enter" data-id="' + r.id + '">编辑</button>' +
      '<button data-action="rediagnose" data-id="' + r.id + '">重新诊断</button>' +
      '<button data-action="review-this" data-id="' + r.id + '">现在复习这道</button>' +
      '<span class="tiny muted" style="margin-left:auto">' +
      (r.updatedAt && r.updatedAt !== r.createdAt ? '上次编辑 ' + fmtRel(r.updatedAt) : '') + '</span></div>';

    var foot = '<div class="card-foot"><span>本次 ' + fmtNum(d.usage.promptTokens + d.usage.completionTokens) +
      ' 字 · 约 ' + fmtCost(d.usage.costEstimate) + '</span>' +
      '<span>累计 ' + state.data.length + ' 道 · ' + fmtCost(totalCost()) + '</span></div>';

    return '<div class="card" data-card="' + r.id + '">' + top + q + ans + summary + body + actions + foot + '</div>';
  }

  /* ---------------- 各页视图 ---------------- */
  function emptyHTML(big, sub, actionLabel, action) {
    return '<div class="empty"><div class="big">' + esc(big) + '</div><div>' + esc(sub) + '</div>' +
      (actionLabel ? '<div style="margin-top:14px"><button data-action="' + action + '">' + esc(actionLabel) + '</button></div>' : '') +
      '</div>';
  }

  function imageZone(hasKey) {
    if (state.img) {
      return '<div class="shot-box">' +
        '<img src="' + state.img.dataUrl + '" alt="待识别的题目截图">' +
        '<div class="shot-side">' +
        '<div class="tiny muted">已选：' + esc(state.img.name || '截图') + ' · ' + state.img.w + '×' + state.img.h + '</div>' +
        '<button class="' + (state.imgMode === 'direct' ? '' : 'btn-primary') + '" data-action="do-ocr"' +
        (state.ocrBusy ? ' disabled' : '') + '>' +
        (state.ocrBusy ? '识别中…' : (state.imgMode === 'direct' ? '先识别文字（可选）' : '识别文字')) + '</button>' +
        (state.imgMode === 'direct'
          ? '<div class="tiny muted">当前是「直接看图」：点下面的「开始诊断」就够了</div>'
          : '') +
        '<button class="linkish" data-action="clear-image">换一张</button>' +
        (hasKey ? '' : '<div class="tiny muted">识别要先用 Key：<button class="link-tut" data-action="go-onboard">去填 Key →</button></div>') +
        '</div></div>';
    }
    return '<div class="dropzone" id="dropzone">' +
      '<b>添加题目图片</b>' +
      '<span>' + (state.imgMode === 'direct'
        ? (isMobile() ? '导入一张题目照片，直接交给模型读' : '导入图片，也可以拖进来，或 Ctrl+V 粘贴')
        : (isMobile() ? '导入一张题目照片，识别后可以改错字' : '导入一张图片，也可以直接把图片拖进来，或 Ctrl+V 粘贴')) + '</span>' +
      '<div class="zone-actions">' +
      '<button class="btn-primary" data-action="pick-album">导入图片</button>' +
      '</div>' +
      '<div class="zone-note">手机点它会弹出两个选项：选「文件」就是相册</div>' +
      '<div class="zone-hint">支持 JPG / PNG / WebP，自动压到 1600px；' +
      (state.imgMode === 'direct' ? '直接看图诊断，不再单独识别文字' : '识别完先进确认页，错了能改') +
      (hasKey ? '' : '　·　识别需要先填 Key') + '</div>' +
      '</div>';
  }

  // 文字输入块（题目 + 作答），两种模式共用
  function textBlock(a) {
    return '<textarea id="q-input" rows="6" placeholder="把题目原文贴进来，公式用普通文字写就行（如 x² − 4x + 3）">' + esc(a.q) + '</textarea>' +
      '<label class="answer-toggle"><input type="checkbox" id="ans-switch"' + (state.answerSwitch ? ' checked' : '') + '>' +
      '<span class="t">我有当时的作答<small>选填，但填了诊断更准</small></span></label>' +
      '<div id="a-wrap"' + (state.answerSwitch ? '' : ' hidden') + '>' +
      '<textarea id="a-input" rows="5" placeholder="当时是怎么写的？哪怕只记得思路也行。">' + esc(a.a) + '</textarea></div>';
  }

  // 拍照页：一个大按钮，没有小字说明
  function entryView() {
    var hasKey = AI.hasKey();

    // 已经选好图：大预览 + 一个主按钮
    if (state.img) {
      var direct = state.imgMode === 'direct';
      return '<div class="main-inner scan-page" id="dropzone">' +
        '<div class="shot-full"><img src="' + state.img.dataUrl + '" alt="题目图片"></div>' +
        '<div class="scan-actions">' +
        '<button class="scan-go" data-action="' + (direct ? 'diagnose' : 'do-ocr') + '"' +
        (state.ocrBusy ? ' disabled' : '') + '>' +
        (state.ocrBusy ? '处理中…' : (direct ? '开始诊断' : '识别文字')) + '</button>' +
        '<button class="ghost" data-action="clear-image">换一张</button>' +
        '</div></div>';
    }

    return '<div class="main-inner scan-page" id="dropzone">' +
      '<div class="scan-hero">' +
      '<button class="scan-btn" data-action="pick-album" aria-label="拍照或导入图片">' +
      '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2h6l2 2h3v12H4z"/>' +
      '<circle cx="12" cy="13" r="3.4"/></svg>' +
      '<span>拍照</span>' +
      '</button>' +
      '<div class="scan-hint">对准题目拍清楚</div>' +
      '</div>' +
      '<div class="scan-alt">' +
      '<button data-action="toggle-text">' + (state.textOpen ? '收起文字' : '粘贴文字') + '</button>' +
      '</div>' +
      (state.textOpen
        ? '<div class="text-panel">' + textBlock(state.entry) +
          '<div class="scan-actions"><button class="scan-go" data-action="diagnose"' +
          (hasKey ? '' : ' disabled') + '>开始诊断</button>' +
          '<button class="ghost" data-action="fill-sample">试填示例</button></div></div>'
        : '') +
      (hasKey ? '' : '<button class="key-chip" data-action="go-onboard">还没填 Key · 点这里 30 秒搞定</button>') +
      netErrHTML() +
      '</div>';
  }

  // 图片识别完的确认页：识别结果必须能改
  function confirmView() {
    var hasKey = AI.hasKey();
    return '<div class="main-inner">' +
      '<h2 class="entry-title">确认题目文字</h2>' +
      '<div class="entry-sub">识别结果可能错字或漏行，改完再诊断。手写和复杂公式最容易出错，纠错权在你手里。</div>' +
      (state.img ? '<div class="shot-mini"><img src="' + state.img.dataUrl + '" alt="截图"></div>' : '') +
      '<div class="field"><label>题目原文</label>' +
      '<textarea id="cq-input" rows="8">' + esc(state.confirm.q) + '</textarea></div>' +
      '<label class="answer-toggle"><input type="checkbox" id="c-ans-switch"' + (state.confirm.a ? ' checked' : '') + '>' +
      '<span class="t">图里有我的作答<small>有就一起填，诊断会更准</small></span></label>' +
      '<div id="ca-wrap"' + (state.confirm.a ? '' : ' hidden') + '>' +
      '<textarea id="ca-input" rows="4" placeholder="图里手写的解答内容">' + esc(state.confirm.a) + '</textarea></div>' +
      '<div class="entry-foot">' +
      '<button class="btn-primary" data-action="confirm-diagnose"' + (hasKey ? '' : ' disabled') + '>确认，开始诊断</button>' +
      '<button data-action="confirm-back">返回重选图片</button>' +
      '<span class="cost">识别结果仅供参考，最终以你改过的文字为准</span></div>' +
      '</div>';
  }

  // 诊断进行中
  function diagnosisProgress() {
    var steps = state.progress || [];
    return '<div class="main-inner">' +
      '<h2 class="entry-title">正在诊断</h2>' +
      '<div class="entry-sub">' +
      (AI.hasKey() ? '这一步会开启思考模式，通常 8–15 秒。' : '需要 Key 才能诊断。') + '</div>' +
      '<div class="panel" style="padding:22px 24px">' +
      '<div class="prog">' + ['读取题目', '生成七段诊断', '校验结构'].map(function (t, i) {
        var cls = steps[i] === 'done' ? 'done' : (steps[i] === 'now' ? 'now' : '');
        return '<div class="prog-row ' + cls + '"><span class="prog-dot"></span>' + t + '</div>';
      }).join('') + '</div>' +
      '<details class="think-box" id="think-box"' + (state.thinkText ? '' : ' hidden') + '>' +
      '<summary>思考过程（点开看，不影响正文）</summary>' +
      '<pre id="think-text">' + esc(tailText(state.thinkText, 1400)) + '</pre></details>' +
      (state.streamText
        ? '<pre class="stream-box" id="stream-box">' + esc(state.streamText) + '</pre>'
        : '<div class="tiny muted" style="margin-top:14px">正在跟模型通信，请不要关掉页面。</div>') +
      '</div></div>';
  }

  function confirmDialog() {
    if (!state.confirmDel) return '';
    var r = getRec(state.confirmDel);
    if (!r) return '';
    return '<div class="modal-mask"><div class="modal">' +
      '<div class="modal-t">删除这道错题？</div>' +
      '<div class="modal-q">' + esc(r.question.slice(0, 80)) + '</div>' +
      '<div class="modal-note">删除后不可恢复：诊断正文、标签、复习进度会一起清掉。</div>' +
      '<div class="modal-b"><button class="btn-danger" data-action="del-ok" data-id="' + r.id + '">删除</button>' +
      '<button data-action="del-cancel">取消</button></div></div></div>';
  }

  function exportPickerDialog() {
    var p = state.exportPick;
    if (!p) return '';
    var rows = state.data.map(function (r) {
      var on = p.ids.indexOf(r.id) >= 0;
      return '<label class="pick-row"><input type="checkbox" data-export-id="' + r.id + '"' + (on ? ' checked' : '') + '>' +
        '<span class="pick-q">' + esc(r.question.slice(0, 44)) + '</span>' +
        '<span class="pick-meta">' + fmtRel(r.createdAt) + '</span></label>';
    }).join('');
    return '<div class="modal-mask"><div class="modal modal-wide">' +
      '<div class="modal-t">选择要导出的错题</div>' +
      '<div class="modal-note">勾选后只导出这几道；诊断正文、标签、复习进度一起带走。</div>' +
      '<div class="pick-tools"><button class="linkish" data-action="export-all">全选</button>' +
      '<button class="linkish" data-action="export-none">全不选</button>' +
      '<span class="tiny muted" style="margin-left:auto">已选 ' + p.ids.length + ' / ' + state.data.length + '</span></div>' +
      '<div class="pick-list">' + (rows || '<div class="tiny muted">还没有错题</div>') + '</div>' +
      '<div class="modal-b">' +
      '<button class="btn-primary" data-action="export-selected"' + (p.ids.length ? '' : ' disabled') + '>导出 ' + p.ids.length + ' 道</button>' +
      '<button data-action="export-close">取消</button></div></div></div>';
  }

  function detailView() {
    var r = state.selectedId ? getRec(state.selectedId) : null;
    if (!r) return '<div class="main-inner">' + emptyHTML('还没有选中错题', '左边点一道，或者先去录入。') + '</div>';
    return '<div class="main-inner">' + cardHTML(r) + '</div>';
  }

  function listViewMobile() {
    var rows = filtered();
    var bar = '<div class="list-bar"><span class="tiny muted">共 ' + state.data.length + ' 道</span>' +
      '<button class="mini" data-action="toggle-list-edit">' + (state.listEdit ? '完成' : '编辑') + '</button></div>';
    if (!rows.length) return '<div class="main-inner">' + bar + emptyHTML('没有匹配的错题', '清掉筛选试试。') + '</div>';
    return '<div class="main-inner">' + bar + rows.map(itemHTML).join('') + '</div>';
  }

  function reviewView() {
    if (!state.review) {
      var q = dueList().map(function (r) { return r.id; });
      if (!q.length) {
        return '<div class="main-inner">' + emptyHTML('今天没有要复习的', '该复习的都复习完了。去录一道新的？', '去录入', 'tab-entry') + '</div>';
      }
      state.review = { queue: q, i: 0, stage: 'question' };
    }
    var rv = state.review;
    if (rv.i >= rv.queue.length) {
      return '<div class="main-inner"><div class="empty"><div class="big">这一轮复习做完了</div>' +
        '<div>' + rv.queue.length + ' 道过了一遍。明天的题会按 1 / 3 / 7 / 15 天的间隔排进来。</div>' +
        '<div style="margin-top:16px"><button data-action="review-reset">重新看今日清单</button></div></div></div>';
    }
    var r = getRec(rv.queue[rv.i]);
    if (!r) { rv.i++; return reviewView(); }
    var idx = rv.i + 1, total = rv.queue.length;

    var head = '<div class="review-step">第 ' + idx + ' / ' + total + ' 道 · 复习 · 已复习 ' + r.review.count + ' 次</div>';
    var qbox = '<div class="review-q">' + esc(r.question) + '</div>';

    if (rv.stage === 'question') {
      return '<div class="main-inner review-wrap">' + head + qbox +
        '<div class="review-actions"><button class="btn-primary grow" data-action="review-think">我先自己想想</button>' +
        '<button data-action="review-skip">直接看诊断</button></div>' +
        '<div class="tiny muted" style="margin-top:22px">先别往下滑。想完再点，这一步是复习里唯一真正有效的部分。</div>' +
        '</div>';
    }

    if (rv.stage === 'summary') {
      return '<div class="main-inner review-wrap">' + head + qbox +
        '<div class="review-step">你自己写的那句话</div>' +
        '<div class="summary-show">' + (r.mySummary ? esc(r.mySummary) : '（这道题你没写总结）') + '</div>' +
        '<div class="review-actions"><button class="btn-primary" data-action="review-full">继续看正文</button></div></div>';
    }

    // full
    var secs = buildSections(r);
    var blocks = secs.html;
    var summary2 = r.mySummary ? '<div class="summary-show">' + esc(r.mySummary) + '</div>' : '';
    var vvR = fixVariant(r.variant);
    var variant = variantOn(r)
      ? '<div class="sect"><div class="sect-head"><span class="sect-num">' + (CIRCLED[secs.next] || '·') + '</span><span class="sect-title">同类题练一练</span></div>' +
      '<div class="sect-body"><div class="variant"><div class="q">' +
      (vvR.question ? esc(vvR.question) : '<span class="tiny muted">（这道题没有配同类题）</span>') + '</div>' +
      (vvR.answer
        ? '<div class="a" data-variant-answer="rv-' + r.id + '" hidden>' + esc(vvR.answer) + '</div>' +
          '<div style="margin-top:8px"><button class="linkish" data-action="toggle-variant" data-id="rv-' + r.id + '">看答案</button></div>'
        : '') +
      '</div></div></div>' : '';

    return '<div class="main-inner review-wrap">' + head + qbox + summary2 +
      '<div class="card" style="padding-top:10px">' + blocks + variant + '</div>' +
      '<div class="review-actions"><button class="btn-primary grow" data-action="review-ok" data-id="' + r.id + '">会了</button>' +
      '<button class="grow" data-action="review-bad" data-id="' + r.id + '">还不会</button></div>' +
      '<div class="tiny muted" style="margin-top:14px">会了 → 间隔推进到 ' + nextIntervalLabel(r) + '；还不会 → 重置回 1 天后。</div>' +
      '</div>';
  }

  function nextIntervalLabel(r) {
    var ni = Math.min(r.review.intervalIndex + 1, INTERVALS.length - 1);
    return INTERVALS[ni] + ' 天后';
  }

  /* ---- 统计 ---- */
  function statsData() {
    var kp = {}, type = {}, trend = {};
    state.data.forEach(function (r) {
      r.knowledgePoints.forEach(function (k) {
        var root = k.split('/')[0];
        kp[root] = (kp[root] || 0) + 1;
      });
      if (r.hasAnswer && r.mistakeType) type[r.mistakeType] = (type[r.mistakeType] || 0) + 1;
      var d0 = dayStart(r.createdAt);
      trend[d0] = (trend[d0] || 0) + 1;
    });
    var kpArr = Object.keys(kp).map(function (k) { return { label: k, v: kp[k] }; })
      .sort(function (a, b) { return b.v - a.v || a.label.localeCompare(b.label); });
    var typeArr = Object.keys(type).map(function (k) { return { label: k, v: type[k] }; })
      .sort(function (a, b) { return b.v - a.v; });
    var days = [];
    for (var i = 29; i >= 0; i--) {
      var ds = dayStart(Date.now() - i * DAY);
      days.push({ ts: ds, v: trend[ds] || 0 });
    }
    return { kp: kpArr, type: typeArr, days: days, storedOnly: state.data.filter(function (r) { return !r.hasAnswer; }).length };
  }

  function svgBars(items) {
    if (!items.length) return '<div class="tiny muted">还没有数据。</div>';
    var max = Math.max.apply(null, items.map(function (x) { return x.v; })) || 1;
    var W = 620, rowH = 30, lw = 150, vw = 40, barMax = W - lw - vw - 10;
    var H = items.length * rowH;
    var cInk2 = cssv('--ink-2', '#544e45'), cTrack = cssv('--paper-2', '#efe9dd');
    var cMuted = cssv('--ink-3', '#8d8578'), cBarA = cssv('--bar-a', '#c1703f'), cBarB = cssv('--bar-b', '#a04a1e');
    var rows = items.map(function (it, i) {
      var y = i * rowH, w = Math.max(6, barMax * it.v / max);
      return '<text x="0" y="' + (y + 19) + '" font-size="13" fill="' + cInk2 + '">' + esc(it.label) + '</text>' +
        '<rect x="' + lw + '" y="' + (y + 9) + '" width="' + barMax + '" height="9" rx="4.5" fill="' + cTrack + '"/>' +
        '<rect x="' + lw + '" y="' + (y + 9) + '" width="' + w + '" height="9" rx="4.5" fill="url(#g1)"/>' +
        '<text x="' + (W - vw) + '" y="' + (y + 19) + '" font-size="12" fill="' + cMuted + '" font-family="monospace">' + it.v + '</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="height:auto;overflow:visible" role="img">' +
      '<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="' + cBarA + '"/><stop offset="1" stop-color="' + cBarB + '"/></linearGradient></defs>' + rows + '</svg>';
  }

  function svgDonut(items) {
    if (!items.length) return '<div class="tiny muted">还没有数据。</div>';
    var COLORS = paletteColors();
    var cInk = cssv('--ink', '#1f1d1a'), cMuted = cssv('--ink-3', '#8d8578');
    var total = items.reduce(function (s, x) { return s + x.v; }, 0);
    var R = 58, SW = 20, C = 2 * Math.PI * R, off = 0;
    var segs = items.map(function (it, i) {
      var len = C * it.v / total;
      var el = '<circle cx="80" cy="80" r="' + R + '" fill="none" stroke="' + COLORS[i % COLORS.length] +
        '" stroke-width="' + SW + '" stroke-dasharray="' + (len - 1.5) + ' ' + (C - len + 1.5) +
        '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 80 80)"/>';
      off += len;
      return el;
    }).join('');
    var legend = items.map(function (it, i) {
      return '<span><i style="background:' + COLORS[i % COLORS.length] + '"></i>' + esc(it.label) +
        '<span class="mono" style="color:' + cMuted + ';margin-left:4px">' + it.v + '</span></span>';
    }).join('');
    return '<div class="donut-wrap"><svg viewBox="0 0 160 160" width="160" height="160">' + segs +
      '<text x="80" y="76" text-anchor="middle" font-size="22" font-family="serif" fill="' + cInk + '">' + total + '</text>' +
      '<text x="80" y="95" text-anchor="middle" font-size="11" fill="' + cMuted + '">道统计在内</text></svg>' +
      '<div class="legend">' + legend + '</div></div>';
  }

  function svgTrend(days) {
    var cBar = cssv('--bar-b', '#a04a1e'), cTrack = cssv('--line', '#e6dfd2'), cMuted = cssv('--ink-3', '#8d8578');
    var W = 620, H = 110, pad = 4;
    var max = Math.max.apply(null, days.map(function (d) { return d.v; })) || 1;
    var bw = (W - pad * 2) / days.length;
    var bars = days.map(function (d, i) {
      var h = d.v ? Math.max(4, (H - 26) * d.v / max) : 1;
      var x = pad + i * bw;
      return '<rect x="' + (x + 1.5) + '" y="' + (H - 20 - h) + '" width="' + Math.max(2, bw - 3) + '" height="' + h +
        '" rx="1.5" fill="' + (d.v ? cBar : cTrack) + '" opacity="' + (d.v ? 0.85 : 1) + '"/>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="height:auto" role="img">' + bars +
      '<text x="' + pad + '" y="' + (H - 5) + '" font-size="10.5" fill="' + cMuted + '">30 天前</text>' +
      '<text x="' + (W - pad) + '" y="' + (H - 5) + '" font-size="10.5" fill="' + cMuted + '" text-anchor="end">今天</text></svg>';
  }

  function statsView() {
    var s = statsData();
    return '<div class="main-inner">' +
      '<div class="stats-grid">' +
      '<div class="panel"><h3>知识点薄弱排行</h3><div class="cap">按章节聚合，实时统计，不是快照</div>' +
      svgBars(s.kp) + '</div>' +
      '<div class="panel"><h3>错误类型分布</h3><div class="cap">只统计有作答的错题</div>' +
      svgDonut(s.type) +
      '<div class="note">' + (s.storedOnly ? '另有 ' + s.storedOnly + ' 道仅存档，未计入这张图。' : '暂无仅存档的记录。') + '</div></div>' +
      '<div class="panel"><h3>近 30 天新增错题</h3><div class="cap">每天录入的条数</div>' + svgTrend(s.days) + '</div>' +
      '</div>' +
      '<div class="cost-line">累计 ' + state.data.length + ' 道 · ' + fmtCost(totalCost()) +
      '　|　今日待复习 ' + dueCount() + ' 道</div>' +
      '</div>';
  }

  /* ---- 设置 ---- */
  function themeGridHTML() {
    return '<div class="theme-grid">' + THEMES.map(function (t) {
      return '<button class="theme-chip" data-action="set-theme" data-theme="' + t.id + '" aria-pressed="' +
        (state.theme === t.id) + '">' +
        '<span class="sw"><i style="background:' + t.sw[0] + '"></i>' +
        '<i style="background:' + t.sw[1] + '"></i>' +
        '<i style="background:' + t.sw[2] + '"></i></span>' +
        '<span>' + esc(t.name) + '</span></button>';
    }).join('') + '</div>';
  }

  // ---------------- 高中数学题库 ----------------
  function meRow(title, desc, tab, badge) {
    return '<button class="me-row" data-action="tab" data-tab="' + tab + '">' +
      '<span class="me-t">' + title + (badge ? '<em>' + badge + '</em>' : '') + '</span>' +
      '<span class="me-d">' + desc + '</span>' +
      '<span class="me-arrow">›</span></button>';
  }

  function meView() {
    var due = dueCount();
    var weak = (function () {
      var m = {};
      state.data.forEach(function (r) { if (r.hasAnswer) m[r.mistakeType] = (m[r.mistakeType] || 0) + 1; });
      var best = '', n = 0;
      Object.keys(m).forEach(function (k) { if (m[k] > n) { n = m[k]; best = k; } });
      return best ? best + ' ' + n + ' 道' : '还没有数据';
    })();
    return '<div class="main-inner me-page">' +
      '<div class="me-head"><div class="me-name">我的</div>' +
      '<div class="me-sub">' + state.data.length + ' 道错题 · ' + (due ? due + ' 道今天该复习' : '今天没有要复习的') + '</div></div>' +
      '<div class="me-rows">' +
      meRow('统计', '最常错：' + weak, 'stats') +
      meRow('设置', 'Key、诊断方式、导出与配色', 'settings') +
      '</div>' +
      '<div class="me-foot">学习台 v0.25 · 只做高中数学 · Key 与错题都存在本机</div>' +
      '</div>';
  }

  function settingsView() {
    return '<div class="main-inner">' +
      '<div class="set-group"><h3>Key 与模型</h3><div class="cap">只存在这台设备的 localStorage，不上传任何服务器</div>' +
      '<div class="field"><label>API Key</label><input id="sf-key" type="password" value="' + esc(maskKey(AI.Net.key)) + '" placeholder="sk-...">' +
      '<button class="link-tut" data-action="go-guide">还不会接 API？点击这里看教程 →</button></div>' +
      '<div class="row"><div class="field"><label>接口地址</label><input id="sf-base" value="' + esc(AI.Net.base) + '"></div>' +
      '<div class="field"><label>模型</label><input id="sf-model" value="' + esc(AI.Net.model) + '"></div></div>' +
      '<div style="display:flex;gap:12px;align-items:center;margin-top:6px">' +
      '<button data-action="test-key"' + (state.keyBusy ? ' disabled' : '') + '>' + (state.keyBusy ? '测试中…' : '保存并测试连接') + '</button>' +
      '<span class="tiny ' + (state.keyOk ? '' : 'muted') + '">' + (state.keyOk ? '通道正常' : '尚未验证') + '</span></div>' +
      netErrHTML() + '</div>' +

      '<div class="set-group"><h3>配色</h3><div class="cap">换一套顺眼的，整站跟着变，选过的会记住</div>' +
      themeGridHTML() + '</div>' +

      '<div class="set-group"><h3>诊断显示哪些步骤</h3>' +
      '<div class="cap">不喜欢的段落可以关掉；关掉后卡片与复习页都不显示，序号自动往前补</div>' +
      STEP_DEFS.map(function (st) {
        return '<div class="set-row"><div>' + esc(st.name) + '<div class="d">' + esc(st.d) + '</div></div>' +
          '<label><input type="checkbox" data-step="' + st.key + '"' + (stepOn(st.key) ? ' checked' : '') + '></label></div>';
      }).join('') +
      '<div class="tiny muted" style="margin-top:10px">知识点、我的总结、题目与作答始终保留。</div></div>' +

      '<div class="set-group"><h3>图片怎么诊断</h3>' +
      '<div class="cap">默认「直接看图」：图片交给模型自己读。手机上会弹「相机 / 文件」两个选项，文件就是相册。</div>' +
      '<div class="set-row"><div>诊断方式<div class="d">' +
      (state.imgMode === 'direct' ? '当前：直接看图（推荐）' : '当前：先识别文字再诊断') +
      '</div></div>' +
      '<select data-imgmode="1" style="width:100%">' +
      [['ocr', '先识别文字（可改错字）'], ['direct', '直接看图（推荐，少一步）']].map(function (o) {
        return '<option value="' + o[0] + '"' + (state.imgMode === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>' +

      '<div class="set-group"><h3>录入习惯</h3><div class="cap">记忆你上次的选择</div>' +
      '<div class="set-row"><div>默认勾选「我有当时的作答」<div class="d">取消勾选则按「这类题常见的错法」分析</div></div>' +
      '<label><input type="checkbox" id="set-ans"' + (state.answerSwitch ? ' checked' : '') + ' style="width:auto"></label></div></div>' +

      '<div class="set-group"><h3>数据</h3><div class="cap">换设备只靠这个文件，明说，不吹不藏</div>' +
      '<div class="set-row"><div>存放位置<div class="d">' +
      (Store.isPersistent() ? 'IndexedDB（浏览器本地，刷新不丢）' : '内存（这个环境不支持 IndexedDB，刷新会丢）') +
      '</div></div></div>' +
      '<div class="set-group" style="margin-top:-16px"><h3>备份</h3><div class="cap">&nbsp;</div>' +
      '<div class="set-row"><div>导出 JSON 备份<div class="d">' + state.data.length + ' 道错题 · 含诊断正文与复习进度</div></div>' +
      '<span style="display:flex;gap:8px"><button data-action="export-json">全部导出</button>' +
      '<button data-action="export-pick">选择…</button></span></div>' +
      '<div class="set-row"><div>重置为 5 道示例<div class="d">原型演示用，会丢掉你刚录入的内容</div></div>' +
      '<button class="btn-danger" data-action="reset-data">重置</button></div></div>' +

      '<div class="set-group"><h3>诊断失败时的线索</h3>' +
      '<div class="cap">格式异常时把模型原文存在本机，方便定位；不会上传</div>' +
      failBoxHTML() + '</div>' +

      '<div class="set-group"><h3>关于</h3><div class="cap">学习台 v0.25 · 已接入真实模型</div>' +
      '<div class="tiny" style="color:var(--ink-2);line-height:1.8">' +
      '诊断与图片识别都由你配置的 DeepSeek 账号直接完成，浏览器直连，没有中间服务器；' +
      'Key 与错题都只存在本机。产品契约在 <span class="mono">docs/product-overview.md</span>。</div></div>' +
      '</div>';
  }

  /* ---------------- 主渲染 ---------------- */
  function renderMain() {
    var html;
    if (state.tab === 'entry') {
      html = state.stage === 'confirm' ? confirmView()
        : (state.stage === 'diagnosing' ? diagnosisProgress() : entryView());
    }
    else if (state.tab === 'list') html = (isMobile() && !state.mobileDetail) ? listViewMobile() : detailView();
    else if (state.tab === 'review') html = reviewView();
    else if (state.tab === 'me') html = meView();
    else if (state.tab === 'stats') html = statsView();
    else html = settingsView();
    var host = document.querySelector('#main-body > .main-inner');
    if (host) host.outerHTML = html;
    else document.getElementById('main-body').innerHTML = html;
    autosizeAll();
  }

  function autosizeAll() {
    document.querySelectorAll('textarea.summary-input, textarea.editor').forEach(function (t) {
      t.style.height = 'auto';
      t.style.height = Math.max(38, t.scrollHeight) + 'px';
    });
  }

  function renderAll() {
    document.body.dataset.screen = state.screen;
    document.body.dataset.theme = state.theme;
    if (state.screen !== 'app') return;
    renderNav();
    renderTopbar();
    renderFilters();
    renderList();
    renderMain();
    renderModal();
  }

  function renderModal() {
    var root = document.getElementById('modal-root');
    if (!root) return;
    if (state.confirmDel) { root.innerHTML = confirmDialog(); return; }
    if (state.exportPick) { root.innerHTML = exportPickerDialog(); return; }
    root.innerHTML = '';
  }

  /* ---------------- 交互 ---------------- */
  function setScreen(s) { state.screen = s; renderAll(); window.scrollTo(0, 0); }

  function commitDraft() {
    var e = state.edit;
    if (!e) return;
    var d = e.draft;
    d.updatedAt = Date.now();
    if (state.pending && state.pending.id === d.id) {
      // 从「诊断中」转正
      state.pending = null;
      d.review = { count: 0, intervalIndex: 0, lastReviewedAt: 0, nextDueAt: Date.now() + DAY };
      state.data.unshift(d);
      state.selectedId = d.id;
      Store.put(d);
      toast('已存入错题本 · 明天会排进复习');
    } else {
      var i = state.data.findIndex(function (x) { return x.id === d.id; });
      if (i >= 0) state.data[i] = d;
      Store.put(d);
      toast('已保存');
    }
    state.edit = null;
    state.addTag = null;
    renderAll();
  }

  // 图片直诊：把图交给模型自己读，不再先 OCR
  function directImage() {
    return state.imgMode === 'direct' && state.img ? state.img.dataUrl : null;
  }

  function pickInput() {
    if (state.stage === 'confirm') {
      return { q: (state.confirm.q || '').trim(), a: (state.confirm.a || '').trim(), fromImage: true };
    }
    return {
      q: (state.entry.q || '').trim(),
      a: state.answerSwitch ? (state.entry.a || '').trim() : '',
      fromImage: false
    };
  }

  function netErrHTML() {
    if (!state.netErr) return '';
    return '<div class="notice err"><b>' + esc(state.netErr.msg) + '</b>' +
      (state.netErr.hint ? '<br>' + esc(state.netErr.hint) : '') + '</div>';
  }

  // 把模型返回的 JSON 装进记录（七段 + 标签 + 变式题）
  function fillRecord(rec, res) {
    var trap = rec.diagnosisMode === 'trap';
    rec.knowledgePoints = res.knowledgePoints;
    rec.mistakeType = res.mistakeType;
    rec.secondaryTypes = res.secondaryTypes || [];
    rec.variant = res.variant;
    if (!rec.mySummary) rec.mySummary = res.summarySuggestion || '';
    rec.blocks = [
      { key: 'diagnosis', title: '你错在哪', text: res.diagnosis },
      { key: 'why', title: trap ? '这类题为什么容易错' : '为什么会这样', text: res.why },
      { key: 'approach', title: '正确的做法', text: res.approach },
      { key: 'trigger', title: '下次遇到这样做', text: res.trigger }
    ];
    rec.usage = res.usage || { promptTokens: 0, completionTokens: 0, costEstimate: 0 };
  }

  function startDiagnose() {
    var inp = pickInput();
    var imgData = directImage();
    if (!inp.q && !imgData) { toast('先贴题目，或导入一张图片'); return; }
    if (!AI.hasKey()) { toast('还没有 Key，先去填一个'); setScreen('onboard'); return; }
    if (state.stage === 'diagnosing') return;

    var rec = base({
      id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
      source: (inp.fromImage || imgData) ? 'image' : 'text',
      question: inp.q || '（见图片）', hasAnswer: !!inp.a, studentAnswer: inp.a,
      diagnosisMode: inp.a ? 'trace' : 'trap', blocks: []
    });
    state.pending = rec;
    state.edit = null;
    state.netErr = null;
    state.stage = 'diagnosing';
    state.progress = ['now'];
    state.streamText = '';
    state.thinkText = '';
    state.tab = 'entry';
    state.mobileDetail = false;
    renderAll();

    var t1 = setTimeout(function () {
      if (state.pending !== rec) return;
      state.progress = ['done', 'now'];
      renderMain();
    }, 700);

    AI.diagnose({
      question: inp.q,
      answer: inp.a,
      imageDataUrl: imgData,
      onDelta: function (ch) {
        if (!ch) return;
        if (ch.kind === 'think') {
          state.thinkText = ch.think;
          var tb = document.getElementById('think-box');
          var tt = document.getElementById('think-text');
          if (tb && tt) {
            tb.hidden = false;
            tt.textContent = tailText(ch.think, 1400);
          }
          return;
        }
        state.streamText = ch.content;
        var box = document.getElementById('stream-box');
        if (box) box.textContent = prettyStream(ch.content);
      }
    }).then(function (res) {
      clearTimeout(t1);
      if (state.pending !== rec) return;
      state.progress = ['done', 'done', 'now'];
      renderMain();
      fillRecord(rec, res);
      return new Promise(function (r) { setTimeout(r, 240); });
    }).then(function () {
      if (state.pending !== rec) return;
      state.progress = [];
      state.streamText = '';
      state.thinkText = '';
      state.stage = 'input';
      state.selectedId = rec.id;
      state.edit = { id: rec.id, draft: clone(rec), deleted: [] };
      state.entry = { q: '', a: '' };
      state.confirm = { q: '', a: '' };
      state.img = null;
      state.tab = 'list';
      state.mobileDetail = true;
      renderAll();
      toast('诊断完成 · 先核对再「确认存入错题本」');
    }).catch(function (err) {
      clearTimeout(t1);
      if (state.pending !== rec) return;
      state.progress = [];
      state.pending = null;
      state.stage = state.stage === 'diagnosing' ? 'input' : state.stage;
      state.netErr = { msg: err.message || '诊断失败', hint: err.hint || '' };
      renderAll();
      toast(err.message || '诊断失败');
    });
  }

  /* ---------- 图片：选择 / 粘贴 / 拖入 → OCR ---------- */
  function handleImageFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('这不是图片文件'); return; }
    AI.compressImage(file).then(function (out) {
      state.img = { dataUrl: out.dataUrl, name: file.name || '粘贴的截图', w: out.width, h: out.height };
      state.netErr = null;
      state.stage = 'input';
      renderMain();
      toast('图片已就绪，点「识别文字」');
    }).catch(function (e) { toast(e.message || '图片处理失败'); });
  }

  function doOCR() {
    if (!state.img) { toast('先选一张图'); return; }
    if (!AI.hasKey()) { toast('先填 Key'); setScreen('onboard'); return; }
    if (state.ocrBusy) return;
    state.ocrBusy = true;
    state.netErr = null;
    renderMain();
    AI.ocr(state.img.dataUrl).then(function (res) {
      state.ocrBusy = false;
      state.confirm = { q: res.question || '', a: res.answer || '' };
      state.stage = 'confirm';
      renderMain();
      toast('识别完成，先核对文字再诊断');
    }).catch(function (err) {
      state.ocrBusy = false;
      state.netErr = { msg: err.message || '识别失败', hint: err.hint || '' };
      state.stage = 'input';
      renderMain();
      toast(err.message || '识别失败');
    });
  }

  function deleteRecord(id) {
    var idx = state.data.findIndex(function (x) { return x.id === id; });
    if (idx < 0) return;
    var removed = state.data[idx];
    state.data.splice(idx, 1);
    Store.del(id);
    state.confirmDel = null;
    state.edit = null;
    if (state.selectedId === id) {
      state.selectedId = state.data.length ? state.data[Math.min(idx, state.data.length - 1)].id : null;
    }
    if (state.review) {
      state.review.queue = state.review.queue.filter(function (q) { return q !== id; });
    }
    renderAll();
    toast('已删除这道错题 · 共剩 ' + state.data.length + ' 道' + (state.data.length ? '' : '，去录一道新的？'));
  }

  function clearTimers() {
    state.timers.forEach(clearTimeout);
    state.timers = [];
  }

  function exportJSON(ids) {
    var rows = ids ? state.data.filter(function (r) { return ids.indexOf(r.id) >= 0; }) : state.data;
    var payload = {
      exportedAt: new Date().toISOString(),
      app: '数学错题整理智能体', version: '0.25',
      count: rows.length,
      records: rows
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '数学错题整理智能体-' + (ids ? '选中' + rows.length + '道-' : '') +
      new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    toast('已导出 ' + rows.length + ' 道');
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { }
    ta.remove();
  }

  /* ---------------- 事件 ---------------- */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action;
    ev.preventDefault();

    switch (a) {
      case 'go-landing': setScreen('landing'); break;
      case 'go-guide': setScreen('guide'); break;
      case 'set-theme':
        state.theme = el.dataset.theme;
        renderAll();
        toast('已换成「' + (THEMES.filter(function (t) { return t.id === state.theme; })[0] || {}).name + '」');
        break;
      case 'go-onboard': setScreen('onboard'); break;
      case 'go-app': setScreen('app'); state.tab = 'entry'; renderAll(); break;
      case 'go-samples':
        state.screen = 'app'; state.tab = 'list';
        if (state.data[0]) state.selectedId = state.data[0].id;
        renderAll(); break;

      case 'tab':
        state.tab = el.dataset.tab;
        if (state.tab === 'list') state.mobileDetail = false;
        if (state.tab === 'review') state.review = null;
        renderAll(); break;
      case 'tab-entry': state.tab = 'entry'; renderAll(); break;
      case 'back': state.mobileDetail = false; renderAll(); break;

      case 'select':
        state.selectedId = el.dataset.id;
        state.tab = 'list';
        if (isMobile()) state.mobileDetail = true;
        state.edit = null;
        renderAll(); break;

      case 'pick-album': {
        var c2 = document.getElementById('file-album');
        if (c2) c2.click();
        break;
      }
      case 'do-ocr': doOCR(); break;
      case 'clear-image': state.img = null; state.stage = 'input'; renderMain(); break;
      case 'confirm-back': state.stage = 'input'; renderMain(); break;
      case 'confirm-diagnose': startDiagnose(); break;
      case 'back-me':
        state.tab = 'me';
        renderAll(); break;
      case 'toggle-text':
        state.textOpen = !state.textOpen;
        renderMain(); break;
      case 'fill-sample':
        state.entry.q = '求二次函数 y = x² − 4x + 3 在 1 ≤ x ≤ 4 上的最大值与最小值。';
        state.entry.a = '配方得 y = (x − 2)² − 1，顶点 x = 2 在区间内，最小值是 −1；左端点 x = 1 代入得 0，所以最大值是 0。';
        state.answerSwitch = true;
        state.textOpen = true;
        renderMain(); break;
      case 'diagnose': startDiagnose(); break;

      case 'edit-enter':
        var r0 = getRec(el.dataset.id);
        state.edit = { id: r0.id, draft: clone(r0), deleted: [] };
        state.selectedId = r0.id; state.addTag = null;
        renderAll(); break;
      case 'edit-save': commitDraft(); break;
      case 'edit-cancel':
        if (state.pending && state.edit && state.pending.id === state.edit.id) {
          state.pending = null;
          state.edit = null; state.selectedId = state.data[0].id;
          clearTimers();
          toast('已丢弃这次诊断');
        } else { state.edit = null; toast('已取消，什么都没改'); }
        renderAll(); break;

      case 'delblock':
        if (!state.edit) break;
        var idx = +el.dataset.idx;
        var rm = state.edit.draft.blocks.splice(idx, 1)[0];
        state.edit.deleted.push({ block: rm, idx: idx });
        renderAll(); break;

      case 'addtag':
        state.addTag = el.dataset.field; renderAll(); break;
      case 'deltag':
        if (!state.edit) break;
        var f = el.dataset.field, v = el.dataset.val, dft = state.edit.draft;
        if (f === 'kp') dft.knowledgePoints = dft.knowledgePoints.filter(function (k) { return k !== v; });
        if (f === 'sec') dft.secondaryTypes = dft.secondaryTypes.filter(function (k) { return k !== v; });
        if (f === 'type') dft.mistakeType = '';
        renderAll(); break;

      case 'toggle-variant':
        var box = document.querySelector('[data-variant-answer="' + el.dataset.id + '"]');
        if (box) {
          box.hidden = !box.hidden;
          el.textContent = box.hidden ? '看答案' : '收起答案';
        }
        break;

      case 'rediagnose': {
        var r1 = getRec(el.dataset.id);
        if (!r1) break;
        if (r1.question === '（见图片）') {
          toast('这道题来自图片，图片没有存档，请重新录入一次');
          break;
        }
        if (!AI.hasKey()) { toast('还没有 Key，先去填一个'); setScreen('onboard'); break; }
        var redBusy = state.rediagnosing;
        if (redBusy) break;
        state.rediagnosing = true;
        toast('重新诊断中…');
        AI.diagnose({ question: r1.question, answer: r1.studentAnswer || '' })
          .then(function (res) {
            var nd = clone(r1);
            fillRecord(nd, res);
            state.edit = { id: nd.id, draft: nd, deleted: [] };
            toast('重新诊断完成 · 我的总结保留不动');
            renderAll();
          })
          .catch(function (err) {
            state.netErr = { msg: err.message || '重新诊断失败', hint: err.hint || '' };
            toast(err.message || '重新诊断失败');
          })
          .then(function () { state.rediagnosing = false; });
        break;
      }

      case 'toggle-list-edit':
        state.listEdit = !state.listEdit;
        renderAll();
        toast(state.listEdit ? '点每条右侧的垃圾桶再确认，即可删除' : '已退出编辑');
        break;
      case 'ask-del':
        state.confirmDel = el.dataset.id;
        renderAll(); break;
      case 'del-cancel':
        state.confirmDel = null;
        renderAll(); break;
      case 'del-ok':
        deleteRecord(el.dataset.id);
        break;

      case 'review-this':
        state.tab = 'review';
        state.review = { queue: [el.dataset.id], i: 0, stage: 'question' };
        renderAll(); break;
      case 'review-think': state.review.stage = 'summary'; renderAll(); break;
      case 'review-skip': state.review.stage = 'full'; renderAll(); break;
      case 'review-full': state.review.stage = 'full'; renderAll(); break;
      case 'review-reset': state.review = null; renderAll(); break;
      case 'review-ok': gradeReview(el.dataset.id, true); break;
      case 'review-bad': gradeReview(el.dataset.id, false); break;

      case 'test-key': doTestKey(); break;
      case 'skip-key': state.keyOk = AI.hasKey(); state.screen = 'app'; state.tab = 'list';
        state.selectedId = state.data[0].id; renderAll(); break;

      case 'export-json': exportJSON(); break;
      case 'export-pick':
        state.exportPick = { ids: state.data.map(function (r) { return r.id; }) };
        renderAll(); break;
      case 'export-all':
        state.exportPick = { ids: state.data.map(function (r) { return r.id; }) };
        renderModal(); break;
      case 'export-none':
        state.exportPick = { ids: [] };
        renderModal(); break;
      case 'export-selected':
        var ids = (state.exportPick && state.exportPick.ids.slice()) || [];
        state.exportPick = null;
        renderAll();
        if (ids.length) exportJSON(ids);
        break;
      case 'copy-fail':
        try {
          var raw = localStorage.getItem('mr.lastFail') || '';
          fallbackCopy(raw);
          toast('已复制失败原文');
        } catch (e) { toast('复制失败，手动选中文字吧'); }
        break;
      case 'clear-fail':
        try { localStorage.removeItem('mr.lastFail'); } catch (e) { }
        renderAll();
        toast('已清空');
        break;
      case 'export-close':
        state.exportPick = null;
        renderAll(); break;
      case 'reset-data':
        Store.clear().then(function () {
          var seeds = seedData();
          state.data = seeds;
          state.selectedId = seeds[0].id;
          seeds.forEach(function (r) { Store.put(r); });
          state.edit = null; state.pending = null; state.review = null;
          state.stage = 'input'; state.img = null; state.confirm = { q: '', a: '' };
          renderAll(); toast('已还原 5 道示例');
        });
        break;
      default: break;
    }
  });

  function gradeReview(id, ok) {
    var r = getRec(id);
    if (!r) return;
    if (ok) {
      var ni = Math.min(r.review.intervalIndex + 1, INTERVALS.length - 1);
      r.review = {
        count: r.review.count + 1, intervalIndex: ni,
        lastReviewedAt: Date.now(), nextDueAt: Date.now() + INTERVALS[ni] * DAY
      };
      toast('会了 · ' + INTERVALS[ni] + ' 天后再见');
    } else {
      r.review = { count: r.review.count + 1, intervalIndex: 0, lastReviewedAt: Date.now(), nextDueAt: Date.now() + DAY };
      toast('还不会 · 明天再来一遍');
    }
    Store.put(r);
    state.review.i++;
    state.review.stage = 'question';
    renderAll();
  }

  function failBoxHTML() {
    var raw = '';
    try { raw = localStorage.getItem('mr.lastFail') || ''; } catch (e) { }
    if (!raw) return '<div class="tiny muted">还没有失败记录。</div>';
    var j = {};
    try { j = JSON.parse(raw); } catch (e) { j = { raw: raw }; }
    if (!j.raw) return '<div class="tiny muted">还没有失败记录。</div>';
    var text = (j.at ? '时间：' + j.at + '\n' : '') +
      (j.error ? '错误：' + j.error + '\n' : '') +
      '模型原文：' + '\n' + String(j.raw).slice(0, 1200);
    return '<details class="failbox"><summary>查看最近一次失败（可复制给我）</summary>' +
      '<pre>' + esc(text) + '</pre></details>' +
      '<div style="display:flex;gap:10px;margin-top:8px">' +
      '<button data-action="copy-fail">复制</button>' +
      '<button class="linkish" data-action="clear-fail">清空</button></div>';
  }

  function maskKey(k) {
    if (!k) return '';
    if (k.length <= 10) return '••••';
    return k.slice(0, 5) + '••••••' + k.slice(-4);
  }

  function doTestKey() {
    var keyEl = document.getElementById('f-key') || document.getElementById('sf-key');
    var baseEl = document.getElementById('f-base') || document.getElementById('sf-base');
    var modelEl = document.getElementById('f-model') || document.getElementById('sf-model');
    var v = keyEl ? keyEl.value.trim() : '';
    if (v.indexOf('•') >= 0) v = AI.Net.key;   // 掩码值 = 没改
    var msg = document.getElementById('key-msg');
    var say = function (cls, text) {
      if (!msg) return;
      msg.className = 'result-msg tiny ' + cls;
      msg.textContent = text;
    };
    if (!v) { say('err', '先填 Key。也可以点「先跳过」，用内置示例看看。'); toast('先填 Key'); return; }
    if (v.replace(/\s/g, '').length < 20) { say('err', '401 · Key 太短，检查是否完整复制（通常以 sk- 开头）。'); toast('Key 看起来不完整'); return; }

    AI.saveNet({
      key: v,
      base: baseEl ? baseEl.value.trim() : undefined,
      model: modelEl ? modelEl.value.trim() : undefined
    });
    state.keyBusy = true;
    state.netErr = null;
    say('', '正在测试连接…');
    if (state.screen !== 'onboard') renderAll();

    AI.testConnection().then(function (r) {
      state.keyBusy = false;
      state.keyOk = true;
      AI.setVerified(true);
      say('ok', '通道正常，用时 ' + (r.ms / 1000).toFixed(1) + ' 秒。');
      if (state.screen === 'onboard') {
        setTimeout(function () {
          state.screen = 'app'; state.tab = 'entry';
          renderAll();
          toast('已连上，先录一道试试');
        }, 700);
      } else {
        renderAll();
        toast('通道正常');
      }
    }).catch(function (err) {
      state.keyBusy = false;
      state.keyOk = false;
      state.netErr = { msg: err.message || '连接失败', hint: err.hint || '' };
      say('err', (err.message || '连接失败') + (err.hint ? '　' + err.hint : ''));
      if (state.screen !== 'onboard') renderAll();
      toast(err.message || '连接失败');
    });
  }

  var netSaveTimer = null;
  function scheduleNetSave(t) {
    var field = (t.id === 'f-key' || t.id === 'sf-key') ? 'key'
      : ((t.id === 'f-base' || t.id === 'sf-base') ? 'base'
        : ((t.id === 'f-model' || t.id === 'sf-model') ? 'model' : null));
    if (!field) return;
    var v = t.value.trim();
    if (field === 'key' && v.indexOf('•') >= 0) return;   // 掩码值 = 没改
    clearTimeout(netSaveTimer);
    netSaveTimer = setTimeout(function () {
      var o = {};
      o[field] = v;
      AI.saveNet(o);
      if (field === 'key') {
        AI.setVerified(false);
        state.keyOk = false;
        var hint = document.getElementById('key-saved-hint');
        if (hint) hint.textContent = v ? '已自动保存到这台设备，点「保存并测试连接」验证一下' : '还没填 Key';
        renderTopbar();
      }
    }, 700);
  }

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id === 'f-key' || t.id === 'sf-key' || t.id === 'f-base' || t.id === 'sf-base' ||
      t.id === 'f-model' || t.id === 'sf-model') { scheduleNetSave(t); return; }
    if (t.id === 'q-input') { state.entry.q = t.value; return; }
    if (t.id === 'a-input') { state.entry.a = t.value; return; }
    if (t.id === 'cq-input') { state.confirm.q = t.value; return; }
    if (t.id === 'ca-input') { state.confirm.a = t.value; return; }
    if (t.dataset.filter) {
      state.filters[t.dataset.filter] = t.value;
      renderList();
      return;
    }
    var k = t.dataset.input;
    if (!k) return;
    if (k === 'summary') {
      var r = getRec(t.dataset.id);
      if (r) r.mySummary = t.value;
      t.style.height = 'auto'; t.style.height = Math.max(38, t.scrollHeight) + 'px';
      return;
    }
    if (!state.edit) return;
    var d = state.edit.draft;
    if (k === 'question') d.question = t.value;
    else if (k === 'studentAnswer') d.studentAnswer = t.value;
    else if (k === 'block') d.blocks[+t.dataset.idx].text = t.value;
    else if (k === 'variantQ') d.variant.question = t.value;
    else if (k === 'variantA') d.variant.answer = t.value;
    t.style.height = 'auto'; t.style.height = Math.max(38, t.scrollHeight) + 'px';
  });

  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.id === 'file-album') {
      var f = t.files && t.files[0];
      t.value = '';
      if (f) handleImageFile(f);
      return;
    }
    if (t.id === 'c-ans-switch') {
      var cw = document.getElementById('ca-wrap');
      if (cw) cw.hidden = !t.checked;
      return;
    }
    if (t.id === 'ans-switch') {
      state.answerSwitch = t.checked;
      var w = document.getElementById('a-wrap');
      if (w) w.hidden = !t.checked;
    }
    if (t.id === 'set-ans') { state.answerSwitch = t.checked; toast(t.checked ? '以后默认带上作答框' : '以后默认不带作答框'); }
    if (t.dataset && t.dataset.imgmode) {
      state.imgMode = (t.value === 'ocr' || t.value === 'direct') ? t.value : 'direct';
      try { localStorage.setItem('mr.imgmode', state.imgMode); } catch (e) { }
      renderAll();
      toast(state.imgMode === 'direct' ? '以后图片直接看图诊断' : '以后图片先识别文字，可改错字');
      return;
    }
    if (t.dataset && t.dataset.exportId) {
      var pid = t.dataset.exportId;
      if (!state.exportPick) state.exportPick = { ids: [] };
      var at = state.exportPick.ids.indexOf(pid);
      if (t.checked && at < 0) state.exportPick.ids.push(pid);
      if (!t.checked && at >= 0) state.exportPick.ids.splice(at, 1);
      renderModal();
      return;
    }
    if (t.dataset && t.dataset.step) {
      state.steps[t.dataset.step] = t.checked;
      renderAll();
      toast(t.checked ? '这一段会显示出来' : '已隐藏这一段 · 序号自动往前补');
    }
    if (t.dataset && t.dataset.filter) {
      state.filters[t.dataset.filter] = t.value;
      renderList();
    }
  });

  document.addEventListener('dragover', function (ev) {
    var z = ev.target.closest && ev.target.closest('#dropzone');
    if (!z) return;
    ev.preventDefault();
    z.classList.add('over');
  });
  document.addEventListener('dragleave', function (ev) {
    var z = ev.target.closest && ev.target.closest('#dropzone');
    if (z) z.classList.remove('over');
  });
  document.addEventListener('drop', function (ev) {
    var z = ev.target.closest && ev.target.closest('#dropzone');
    if (!z) return;
    ev.preventDefault();
    z.classList.remove('over');
    var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) handleImageFile(f);
  });

  // Ctrl+V 直接粘贴截图
  document.addEventListener('paste', function (ev) {
    if (state.screen !== 'app' || state.tab !== 'entry' || state.stage !== 'input') return;
    var items = (ev.clipboardData && ev.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') === 0) {
        var f = items[i].getAsFile();
        if (f) { ev.preventDefault(); handleImageFile(f); return; }
      }
    }
  });

  document.addEventListener('blur', function (ev) {
    var t = ev.target;
    if (t.classList && t.classList.contains('summary-input')) {
      var badge = document.querySelector('[data-saved="' + t.dataset.id + '"]');
      if (badge) {
        badge.classList.add('on');
        setTimeout(function () { badge.classList.remove('on'); }, 1600);
      }
    }
  }, true);

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.taginput) {
      var v = ev.target.value.trim();
      var f = ev.target.dataset.taginput;
      if (v && state.edit) {
        if (f === 'kp') {
          if (state.edit.draft.knowledgePoints.indexOf(v) < 0) state.edit.draft.knowledgePoints.push(v);
        } else {
          if (state.edit.draft.secondaryTypes.indexOf(v) < 0) state.edit.draft.secondaryTypes.push(v);
        }
      }
      state.addTag = null;
      renderAll();
      return;
    }
    if (ev.key === 'Escape' && state.edit) {
      if (state.edit.deleted.length) {
        var last = state.edit.deleted.pop();
        state.edit.draft.blocks.splice(last.idx, 0, last.block);
        renderAll();
        toast('已撤销刚刚的删除');
      } else {
        state.edit = null;
        renderAll();
        toast('已退出编辑（Esc）');
      }
    }
  });

  // 手机弹出键盘只会改变视口高度：这种情况下绝不重绘，否则正在输入的内容会被回滚
  var lastWinW = window.innerWidth;
  window.addEventListener('resize', function () {
    if (state.screen !== 'app') return;
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
    if (window.innerWidth === lastWinW) return;
    lastWinW = window.innerWidth;
    renderNav(); renderTopbar(); renderMain();
  });

  /* ---------------- 启动 ---------------- */
  // 调试入口：index.html?screen=app&tab=stats
  try {
    var qs = new URLSearchParams(location.search);
    if (qs.get('screen')) state.screen = qs.get('screen');
    if (qs.get('tab')) state.tab = qs.get('tab');
    if (qs.get('theme')) state.theme = qs.get('theme');
    if (qs.get('select')) {
      state.selectedId = qs.get('select');
      if (window.innerWidth < 900) state.mobileDetail = true;
    }
  } catch (e) { }

  state.keyOk = AI.hasKey() && AI.isVerified();
  fillNetInputs();
  renderAll();

  // 把已保存的 Key / 地址 / 模型回填进向导与设置，避免看起来“像没存过”
  function fillNetInputs() {
    var v = { 'f-key': AI.hasKey() ? maskKey(AI.Net.key) : '',
      'sf-key': AI.hasKey() ? maskKey(AI.Net.key) : '',
      'f-base': AI.Net.base, 'sf-base': AI.Net.base,
      'f-model': AI.Net.model, 'sf-model': AI.Net.model };
    Object.keys(v).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.value) el.value = v[id];
    });
    var hint = document.getElementById('key-saved-hint');
    if (hint) {
      hint.textContent = AI.hasKey()
        ? '已保存在这台设备（' + maskKey(AI.Net.key) + '），要换就直接改上面的框'
        : '只存在你这台设备上，不上传任何服务器；填完会自动保存';
    }
  }

  // 自测钩子：只有 ?debug=1 时暴露，平时不存在
  try {
    if (/[?&]debug=1/.test(location.search)) {
      window.__app = { state: state, renderAll: renderAll, handleImageFile: handleImageFile, doOCR: doOCR };
    }
  } catch (e) { }

  // 存档读取：库空才注入 5 道示例
  Store.all().then(function (rows) {
    rows = rows || [];
    var real = rows.filter(function (r) { return !r.isSample; });
    if (real.length) {
      // 只要有用户自己的错题，示例就自动退场（并从存档里删掉）
      rows.filter(function (r) { return r.isSample; }).forEach(function (r) { Store.del(r.id); });
      real.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      state.data = real;
      state.selectedId = real[0].id;
    } else if (rows.length) {
      state.data = rows;
      state.selectedId = rows[0].id;
    } else {
      var seeds = seedData();
      state.data = seeds;
      state.selectedId = seeds[0].id;
      seeds.forEach(function (r) { Store.put(r); });
    }
    renderAll();
  });
})();
