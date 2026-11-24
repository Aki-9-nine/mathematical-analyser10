/* 数学错题整理智能体 · 真实模型接入层
   - 浏览器直连 DeepSeek（无代理），Key 只存本地
   - 诊断支持三种输入：纯文字 / 图片直诊 / OCR 后再诊断
   - 输出协议以 Markdown 小标题为主（稳），JSON 兼容（旧）
   - 流式输出、自动重试、缺段补齐、失败原文留档
   依赖：无。挂到 window.AI。                                              */
(function () {
  'use strict';

  var LS = {
    key: 'mr.key', base: 'mr.baseUrl', model: 'mr.model',
    prompt: 'mr.promptCache.v2', verified: 'mr.verified', fail: 'mr.lastFail'
  };
  var DEFAULT_BASE = 'https://api.deepseek.com';
  var DEFAULT_MODEL = 'deepseek-flash';
  var TYPES = ['概念混淆', '计算失误', '条件对应错误', '审题遗漏', '步骤跳步', '知识盲区'];

  function lsGet(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function lsSet(k, v) {
    try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { }
  }

  var NET = {
    key: lsGet(LS.key, ''),
    base: lsGet(LS.base, DEFAULT_BASE),
    model: lsGet(LS.model, DEFAULT_MODEL)
  };

  function ApiError(status, message, hint) {
    var e = new Error(message || ('HTTP ' + status));
    e.name = 'ApiError';
    e.status = status || 0;
    e.hint = hint || '';
    return e;
  }

  function humanError(status, raw) {
    switch (status) {
      case 0: return { msg: '连不上模型服务', hint: '检查网络；用 file:// 直接打开网页时可能被跨域拦住，建议用线上地址或本地服务。' };
      case 400: return { msg: '请求被拒绝（400）', hint: raw || '题目或图片可能过长，删掉一点再试。' };
      case 401: return { msg: '401 · Key 无效', hint: '检查是否完整复制（通常以 sk- 开头），前后不要带空格。' };
      case 402: return { msg: '402 · 余额不足', hint: '去 platform.deepseek.com 的「充值」页充一点，一次诊断约 0.02 元。' };
      case 429: return { msg: '429 · 提交太快', hint: '已自动重试；还不行就等几秒再点。' };
      case 500: case 502: case 503: return { msg: '503 · 服务繁忙', hint: '已自动重试；模型侧在排队，等一会儿再试。' };
      default: return { msg: 'HTTP ' + status, hint: raw || '' };
    }
  }

  /* ---------------- 底层请求 ---------------- */
  function endpoint() {
    return NET.base.replace(/\/+$/, '') + '/chat/completions';
  }
  function headers() {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + NET.key };
  }

  function chatOnce(payload, opts) {
    opts = opts || {};
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeout || 90000) : null;
    return fetch(endpoint(), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        return res.text().then(function (txt) {
          var raw = txt;
          try { var j = JSON.parse(txt); raw = (j.error && (j.error.message || j.error.code)) || txt; } catch (e) { }
          var h = humanError(res.status, String(raw).slice(0, 200));
          throw ApiError(res.status, h.msg, h.hint);
        });
      }
      return res.json();
    }, function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === 'AbortError') throw ApiError(0, '超时了', '模型 90 秒没回话，换个说法或过会儿再试。');
      var h = humanError(0);
      throw ApiError(0, h.msg, h.hint);
    });
  }

  // 429 / 5xx / 网络抖动：自动重试 2 次
  function chat(payload, opts) {
    var tries = 0;
    function attempt() {
      return chatOnce(payload, opts).catch(function (err) {
        var s = err && err.status;
        var transient = !s || s === 429 || s === 500 || s === 502 || s === 503;
        if (transient && tries < 2) {
          tries++;
          return new Promise(function (r) { setTimeout(r, tries === 1 ? 900 : 2200); }).then(attempt);
        }
        throw err;
      });
    }
    return attempt();
  }

  // 流式：边收边喂给 onDelta，最后拼成完整文本
  function chatStream(payload, onDelta, opts) {
    opts = opts || {};
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeout || 120000) : null;
    var body = Object.assign({}, payload, { stream: true });

    return fetch(endpoint(), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (!res.ok || !res.body) {
        if (timer) clearTimeout(timer);
        return res.text().then(function (txt) {
          var h = humanError(res.status, txt.slice(0, 200));
          throw ApiError(res.status, h.msg, h.hint);
        });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buf = '';
      var all = '';
      var allThink = '';
      var finish = '';

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) { if (timer) clearTimeout(timer); return { text: all, think: allThink, finish: finish || 'stop' }; }
          buf += decoder.decode(r.value, { stream: true });
          var parts = buf.split('\n');
          buf = parts.pop();
          parts.forEach(function (line) {
            line = line.trim();
            if (!line || line.indexOf('data:') !== 0) return;
            var data = line.slice(5).trim();
            if (data === '[DONE]') return;
            try {
              var j = JSON.parse(data);
              var d = j.choices && j.choices[0] && (j.choices[0].delta || {});
              if (j.choices && j.choices[0] && j.choices[0].finish_reason) finish = j.choices[0].finish_reason;
              if (d && typeof d.reasoning_content === 'string' && d.reasoning_content) {
                allThink += d.reasoning_content;
                if (onDelta) onDelta({ kind: 'think', delta: d.reasoning_content, think: allThink, content: all });
              }
              if (d && typeof d.content === 'string' && d.content) {
                all += d.content;
                if (onDelta) onDelta({ kind: 'content', delta: d.content, think: allThink, content: all });
              }
            } catch (e) { }
          });
          return pump();
        });
      }
      return pump();
    }, function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === 'AbortError') throw ApiError(0, '超时了', '流式输出中断，再点一次试试。');
      var h = humanError(0);
      throw ApiError(0, h.msg, h.hint);
    });
  }

  /* ---------------- 解析 ---------------- */
  function pickText(resp) {
    var msg = resp && resp.choices && resp.choices[0] && resp.choices[0].message;
    var c = msg && msg.content;
    return typeof c === 'string' ? c : '';
  }

  function repairJSON(s) {
    var out = '', inStr = false, esc = false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (esc) { out += c; esc = false; continue; }
      if (c === '\\') { out += c; esc = true; continue; }
      if (c === '"') { inStr = !inStr; out += c; continue; }
      if (inStr) {
        if (c === '\n') { out += '\\n'; continue; }
        if (c === '\r') { continue; }
        if (c === '\t') { out += '\\t'; continue; }
      }
      out += c;
    }
    if (inStr) out += '"';
    var open = (out.match(/\{/g) || []).length, close = (out.match(/\}/g) || []).length;
    while (close < open) { out += '}'; close++; }
    return out;
  }

  function parseJSON(text) {
    var s = String(text || '').trim();
    var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    var i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i >= 0) s = s.slice(i, j > i ? j + 1 : s.length);

    try { return JSON.parse(s); } catch (e1) { }
    var fixed = repairJSON(s);
    try { return JSON.parse(fixed); } catch (e2) { }
    var q = fixed.match(/"question"\s*:\s*"([\s\S]*?)"/);
    if (q) {
      var a = fixed.match(/"answer"\s*:\s*"([\s\S]*?)"/);
      return { question: q[1].replace(/\\n/g, '\n'), answer: a ? a[1].replace(/\\n/g, '\n') : '' };
    }
    throw new Error('JSON_UNPARSEABLE');
  }

  // 把模型给的 Markdown（或散装文本）按小标题拆开
  var HEAD_MAP = [
    ['知识点', 'kp'], ['错误类型', 'type'], ['错因诊断', 'diagnosis'],
    ['为什么错', 'why'], ['为什么', 'why'], ['正确做法', 'approach'],
    ['下次', 'trigger'], ['变式', 'variant'], ['一句话总结', 'summary'], ['总结', 'summary']
  ];

  function matchHead(line) {
    var plain = line
      .replace(/^\s*#{1,6}\s*/, '')
      .replace(/^\*\*(.+?)\*\*$/, '$1')
      .replace(/^\d+\s*[.、)]\s*/, '')
      .trim();
    for (var i = 0; i < HEAD_MAP.length; i++) {
      if (plain.indexOf(HEAD_MAP[i][0]) === 0) return { key: HEAD_MAP[i][1], kw: HEAD_MAP[i][0] };
    }
    return null;
  }

  // 变式题拆分：模型常写成「题目：… 答案：…」，也可能重复两遍或先占位
  function splitVariant(txt) {
    var t = String(txt || '').replace(/\r/g, '').trim();
    if (!t) return { question: '', answer: '' };
    var QRE = /(题目|问题|问)\s*[:：]/g;
    var ARE = /(答案|解答|答)\s*[:：]/g;
    var qs = [], as2 = [], m;
    while ((m = QRE.exec(t))) qs.push(m.index + m[0].length);
    while ((m = ARE.exec(t))) as2.push(m.index + m[0].length);
    var q = '', a = '';
    if (qs.length && as2.length) {
      var qi = qs[qs.length - 1], ai = as2[as2.length - 1];
      if (qi < ai) {
        q = t.slice(qi, ai).replace(/(答案|解答|答)\s*[:：]\s*$/, '').trim();
        a = t.slice(ai).trim();
      } else {
        q = t.slice(qi).replace(/(答案|解答|答)\s*[:：][\s\S]*$/, '').trim();
      }
    } else if (as2.length) {
      a = t.slice(as2[0]).trim();
      q = t.slice(0, as2[0]).replace(/(答案|解答|答)\s*[:：]\s*$/, '').trim();
    } else if (qs.length) {
      q = t.slice(qs[0]).trim();
    } else {
      q = t;
    }
    // 只剩省略号/空白的，视为没有
    var blank = /^[\s.…·]*$/;
    if (blank.test(q)) q = '';
    if (blank.test(a)) a = '';
    q = q.replace(/^(题目|问题|问)\s*[:：]\s*/, '').trim();
    return { question: q, answer: a };
  }

  function parseSections(text) {
    var t = String(text || '').replace(/\r/g, '');
    var fence = t.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1];
    var lines = t.split('\n');
    var bag = {}, cur = null;

    lines.forEach(function (line) {
      var h = matchHead(line);
      if (h) {
        cur = h.key;
        var rest = line.replace(/^\s*#{1,6}\s*/, '').replace(/^\*\*(.+?)\*\*$/, '$1')
          .replace(/^\d+\s*[.、)]\s*/, '').trim();
        rest = rest.replace(/^[①②③④⑤⑥⑦⑧\s]*/, '').trim();
        // 去掉标题关键词本身（含紧跟的冒号），剩下的才算内容
        if (rest.indexOf(h.kw) === 0) rest = rest.slice(h.kw.length);
        rest = rest.replace(/^\s*[:：]\s*/, '').trim();
        if (rest) bag[cur] = (bag[cur] ? bag[cur] + ' ' : '') + rest;
        return;
      }
      if (cur && line.trim()) bag[cur] = bag[cur] ? bag[cur] + '\n' + line.trim() : line.trim();
    });

    if (!bag.diagnosis && !bag.why) throw new Error('MD_UNPARSEABLE');

    var kp = String(bag.kp || '').split(/[、,，;；\n]+/)
      .map(function (x) { return x.trim(); }).filter(Boolean);

    var type = '', sec = '';
    var tline = String(bag.type || '');
    var mMain = tline.match(/(?:主要|主因|类型)\s*[:：]?\s*([^\n。；;]+)/);
    var mSec = tline.match(/次因\s*[:：]?\s*([^\n。；;]+)/);
    if (mMain) type = mMain[1].trim();
    if (mSec) sec = mSec[1].trim();
    if (!type) {
      for (var i = 0; i < TYPES.length; i++) {
        if (tline.indexOf(TYPES[i]) >= 0) { type = TYPES[i]; break; }
      }
    }

    var variant = splitVariant(bag.variant);

    var out = {
      knowledgePoints: kp.length ? kp : ['未分类/未分类'],
      mistakeType: type || '概念混淆',
      secondaryTypes: sec ? [sec] : [],
      diagnosis: String(bag.diagnosis || '').trim(),
      why: String(bag.why || '').trim(),
      approach: String(bag.approach || '').trim(),
      trigger: String(bag.trigger || '').trim(),
      variant: variant,
      summarySuggestion: String(bag.summary || '').trim()
    };
    if (!out.diagnosis) out.diagnosis = out.why;
    if (!out.why) out.why = out.diagnosis;
    return out;
  }

  function saveFail(raw, err) {
    try {
      localStorage.setItem(LS.fail, JSON.stringify({
        at: new Date().toISOString(),
        error: String(err || ''),
        raw: String(raw || '').slice(0, 4000)
      }));
    } catch (e) { }
  }

  /* ---------------- 提示词 ---------------- */
  function stripFrontmatter(md) {
    var t = String(md || '');
    if (t.slice(0, 3) === '---') {
      var end = t.indexOf('\n---', 3);
      if (end > 0) t = t.slice(end + 4);
    }
    return t.trim();
  }

  var FALLBACK_PROMPT = [
    '你是一位数学老师，任务不是讲题，而是还原学生的错误路径。语气平静具体，不做人格评价。',
    '严格按下面的 Markdown 结构输出，标题原样照抄，不要输出 JSON，不要用代码块：',
    '## 知识点（两段式「章节/知识点」，1–3 个，顿号分隔）',
    '## 错误类型（主要：概念混淆/计算失误/条件对应错误/审题遗漏/步骤跳步/知识盲区；次因：可选）',
    '## 错因诊断（2–5 句，指出错在哪一步）',
    '## 为什么错（2–5 句，讲到机制层）',
    '## 正确做法（① ② ③ 分步骤，每步带为什么）',
    '## 下次看到相应条件怎么做？（看到 X → 立刻做 Y）',
    '## 变式题（题目：… 答案：…）',
    '## 一句话总结（≤30 字）',
    '规则：数学式子用纯文本（x² − 4x + 3、Δ、≤、√），不要 LaTeX；有作答就引用学生原话；不要「加油」这类空话。'
  ].join('\n');

  var promptCache = null;
  function loadPrompt() {
    if (promptCache) return Promise.resolve(promptCache);
    var cached = lsGet(LS.prompt, '');
    if (cached && cached.length > 200) { promptCache = cached; return Promise.resolve(cached); }
    var paths = ['../skills/math-error-analysis/SKILL.md', 'skills/math-error-analysis/SKILL.md'];
    var idx = 0;
    function tryNext() {
      if (idx >= paths.length) { promptCache = FALLBACK_PROMPT; return Promise.resolve(promptCache); }
      var url = paths[idx++];
      return fetch(url, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) return tryNext();
        return r.text().then(function (txt) {
          var body = stripFrontmatter(txt);
          if (body.length > 200) { promptCache = body; lsSet(LS.prompt, body); return body; }
          return tryNext();
        });
      }).catch(function () { return tryNext(); });
    }
    return tryNext();
  }

  /* ---------------- 归一化 ---------------- */
  function normalize(json, hasAnswer) {
    if (!json || typeof json !== 'object') throw new Error('返回的不是对象');
    var kps = Array.isArray(json.knowledgePoints)
      ? json.knowledgePoints.filter(function (k) { return typeof k === 'string' && k.trim(); })
      : [];
    if (!kps.length) kps = ['未分类/未分类'];
    if (kps.length > 4) kps = kps.slice(0, 4);

    var type = String(json.mistakeType || '').trim();
    if (TYPES.indexOf(type) < 0) {
      var hit = TYPES.filter(function (t) { return type.indexOf(t) >= 0; })[0];
      type = hit || '概念混淆';
    }
    var sec = Array.isArray(json.secondaryTypes)
      ? json.secondaryTypes.filter(function (k) { return typeof k === 'string' && k.trim(); }).slice(0, 1)
      : [];

    var v = json.variant || {};
    var out = {
      knowledgePoints: kps,
      mistakeType: type,
      secondaryTypes: sec,
      diagnosis: String(json.diagnosis || '').trim(),
      why: String(json.why || '').trim(),
      approach: String(json.approach || '').trim(),
      trigger: String(json.trigger || '').trim(),
      variant: (function () {
        var q = String(v.question || '').trim(), a = String(v.answer || '').trim();
        var blank = /^[\s.…·]*$/;
        if ((!q || blank.test(q)) && a) return splitVariant(a);
        if (a && /(题目|问题|问)\s*[:：]/.test(a) && /(答案|解答|答)\s*[:：]/.test(a)) return splitVariant(a);
        return { question: blank.test(q) ? '' : q, answer: blank.test(a) ? '' : a };
      })(),
      summarySuggestion: String(json.summarySuggestion || '').trim(),
      hasAnswer: !!hasAnswer
    };
    if (!out.diagnosis && !out.why) throw new Error('缺诊断正文');
    if (!out.diagnosis) out.diagnosis = out.why;
    if (!out.why) out.why = out.diagnosis;
    return out;
  }

  function parseAny(text, hasAnswer) {
    var t = String(text || '').trim();
    if (!t) throw new Error('模型返回为空');
    try { return normalize(parseSections(t), hasAnswer); } catch (e1) { }
    try { return normalize(parseJSON(t), hasAnswer); } catch (e2) { }
    var salvaged = {
      knowledgePoints: ['未分类/未分类'],
      mistakeType: '概念混淆',
      secondaryTypes: [],
      diagnosis: t.slice(0, 1200),
      why: '（模型这次没按固定结构输出，以上是它的原话）',
      approach: '', trigger: '',
      variant: { question: '', answer: '' },
      summarySuggestion: ''
    };
    if (!salvaged.diagnosis) throw new Error('MD_UNPARSEABLE');
    return normalize(salvaged, hasAnswer);
  }

  /* ---------------- 缺段补齐 ---------------- */
  function missingFields(res) {
    var need = [];
    if (!res.approach || res.approach.length < 8) need.push('正确做法');
    if (!res.trigger || res.trigger.length < 8) need.push('下次看到相应条件怎么做？');
    if (!res.variant.question) need.push('变式题');
    return need;
  }

  function fillMissing(res, ctx, prompt) {
    var need = missingFields(res);
    if (!need.length) return Promise.resolve(res);
    var ask = '你上一份回答里这几段缺失或过短：' + need.join('、') +
      '。请只输出这几段，标题用 ## ，每段只写一遍：不要先写「...」这类占位行，' +
      '也不要先把空模板贴一遍再写真的内容。变式题要写成「题目：… 答案：…」两行，各出现一次。';
    var msgs = [
      { role: 'system', content: prompt },
      { role: 'user', content: ctx },
      { role: 'user', content: ask }
    ];
    return chat({ model: NET.model, messages: msgs, max_tokens: 900 }, { timeout: 60000 })
      .then(function (resp) {
        var more = pickText(resp);
        if (!more || !more.trim()) return res;
        var patch;
        try { patch = parseSections(more); } catch (e) { return res; }
        if (patch.approach && (!res.approach || res.approach.length < 8)) res.approach = patch.approach;
        if (patch.trigger && (!res.trigger || res.trigger.length < 8)) res.trigger = patch.trigger;
        if (patch.variant && patch.variant.question && !res.variant.question) res.variant = patch.variant;
        return res;
      })
      .catch(function () { return res; });
  }

  function usageOf(resp) {
    var u = (resp && resp.usage) || {};
    var p = u.prompt_tokens || 0, c = u.completion_tokens || 0;
    return {
      promptTokens: p, completionTokens: c,
      costEstimate: Math.round(((p * 2 + c * 8) / 1e6) * 1000) / 1000
    };
  }

  /* ---------------- 诊断 ---------------- */
  function buildUserContent(input) {
    var q = String(input.question || '').trim();
    var a = String(input.answer || '').trim();
    var hasAnswer = !!a;
    if (input.imageDataUrl) {
      var text = (q ? '题目文字（初步识别，可能有错，请以图片为准）：\n' + q + '\n\n' : '') +
        (hasAnswer ? '我的作答：\n' + a + '\n\n' : '') +
        '题目图片在下面，请自己读图。';
      return [{
        role: 'user',
        content: [
          { type: 'text', text: text },
          { type: 'image_url', image_url: { url: input.imageDataUrl } }
        ]
      }];
    }
    return [{
      role: 'user',
      content: '我的错题：\n' + q + (hasAnswer ? '\n\n我的作答：\n' + a : '\n\n（我这次没有提供作答）')
    }];
  }

  function diagnose(input) {
    var q = String(input.question || '').trim();
    var a = String(input.answer || '').trim();
    var hasAnswer = !!a;
    if (!q && !input.imageDataUrl) return Promise.reject(ApiError(0, '还没有题目', '贴一道题，或导入一张图片。'));

    var modeNote = hasAnswer
      ? '\n\n本次口径：有作答（trace）。错因诊断必须引用学生作答里的具体内容。'
      : '\n\n本次口径：无作答（trap）。讲这类题的常见错法，只给主要错误类型。';

    return loadPrompt().then(function (prompt) {
      var userMsgs = buildUserContent(input);
      var ctx = '[题目]\n' + (q || '（见图片）') + (a ? '\n[作答]\n' + a : '');
      var msgs = [{ role: 'system', content: prompt + modeNote }].concat(userMsgs);
      var body = { model: NET.model, messages: msgs, max_tokens: 6000 };

      function handleText(text, usage, finish) {
        if (!text || !text.trim()) {
          saveFail('', 'EMPTY_CONTENT finish=' + (finish || '?') +
            ' thinkLen=' + ((usage && usage.thinkLen) || 0) + ' usage=' + JSON.stringify(usage || {}));
          throw new Error('EMPTY_CONTENT');
        }
        if (finish === 'length') {
          saveFail(text, 'TRUNCATED finish=length');
          throw new Error('TRUNCATED_LENGTH');
        }
        var res;
        try { res = parseAny(text, hasAnswer); }
        catch (e) { saveFail(text, e); throw e; }
        res.usage = usage || { promptTokens: 0, completionTokens: 0, costEstimate: 0 };
        return fillMissing(res, ctx, prompt);
      }

      // 正文为空 / 被长度截断：关掉思考模式、把上限拉满，再要一次正文
      function retryPlain() {
        var plain = {
          model: NET.model,
          messages: msgs.concat([{
            role: 'user',
            content: '请直接输出那份 Markdown 诊断（不要输出 JSON，不要解释），标题用 ## ，现在就开始写。'
          }]),
          max_tokens: 8000,
          thinking: { type: 'disabled' }
        };
        return chat(plain, { timeout: 120000 }).then(function (resp2) {
          var t = pickText(resp2);
          var fr = resp2 && resp2.choices && resp2.choices[0] && resp2.choices[0].finish_reason;
          return handleText(t, usageOf(resp2), fr);
        });
      }

      var first;
      if (input.onDelta) {
        first = chatStream(body, input.onDelta, { timeout: 120000 }).then(function (r) {
          return handleText(r.text, null, r.finish);
        });
      } else {
        first = chat(body).then(function (resp) {
          var fr = resp && resp.choices && resp.choices[0] && resp.choices[0].finish_reason;
          return handleText(pickText(resp), usageOf(resp), fr);
        });
      }

      return first.catch(function (err) {
        if (err && err.name === 'ApiError') throw err;
        var msg = String((err && err.message) || err);
        if (msg === 'EMPTY_CONTENT' || msg === 'TRUNCATED_LENGTH') {
          return retryPlain().catch(function () {
            throw ApiError(0, '模型没有返回正文（可能思考占满了输出长度）',
              '已自动关掉思考重试一次仍失败。改用「先识别文字」模式，或换一道题再试。');
          });
        }
        // 失败自愈：把上次的毛病写回去，让它按协议重做一次
        var fix = {
          role: 'user',
          content: '你上一次的输出不能用（' + String((err && err.message) || err) + '）。' +
            '请严格按 system 里的 Markdown 结构重写：## 知识点 / ## 错误类型 / ## 错因诊断 / ' +
            '## 为什么错 / ## 正确做法 / ## 下次看到相应条件怎么做？ / ## 变式题 / ## 一句话总结。' +
            '不要 JSON，不要代码块，不要额外解释。'
        };
        return chat({ model: NET.model, messages: msgs.concat([fix]), max_tokens: 2600 })
          .then(function (resp) { return handleText(pickText(resp), usageOf(resp)); })
          .catch(function (err2) {
            if (err2 && err2.name === 'ApiError') throw err2;
            saveFail('', err2);
            throw ApiError(0, '模型输出格式异常',
              '再点一次「开始诊断」；设置页有「最近一次失败」，里面有模型原话和 finish_reason，复制给我能直接定位。');
          });
      });
    });
  }

  /* ---------------- 图片 OCR ---------------- */
  function ocr(dataUrl) {
    var body = {
      model: NET.model,
      messages: [
        {
          role: 'system',
          content: '你是 OCR 助手。只输出一个 JSON 对象：{"question":"题目原文","answer":"学生的作答原文"}。' +
            '看不清的字用「□」代替，不要猜测；没有作答就把 answer 留空字符串。不要解释，不要代码块。' +
            '字符串里不要出现真正的换行，题目有多行就用反斜杠 n 转义。'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: '把这张图里的数学题目原文提取出来；如果有学生手写的解答，也放进 answer。保留公式符号（x²、Δ、√）。' },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      max_tokens: 2000
    };
    return chat(body, { timeout: 60000 }).then(function (resp) {
      var text = pickText(resp);
      if (!text || !text.trim()) throw ApiError(0, '图片里没读到文字', '换一张更清楚、别带大片空白的截图再试。');
      var j;
      try { j = parseJSON(text); }
      catch (e) { saveFail(text, e); throw ApiError(0, '识别结果没读懂', '再点一次「识别文字」；还不行就点「换一张」。'); }
      var q = String(j.question || '').trim();
      if (!q) throw ApiError(0, '这张图里没找到题目', '确认截图里含题干；只有手写作答的话，请把题目贴到输入框。');
      return { question: q, answer: String(j.answer || '').trim() };
    });
  }

  /* ---------------- 测试连接 ---------------- */
  function testConnection() {
    var t0 = Date.now();
    return chat({
      model: NET.model,
      messages: [{ role: 'user', content: '只回复两个字：可用' }],
      max_tokens: 8
    }, { timeout: 30000 }).then(function (resp) {
      return { ok: true, ms: Date.now() - t0, text: pickText(resp) };
    });
  }

  /* ---------------- 图片压缩 ---------------- */
  function compressImage(file, maxSide, quality) {
    maxSide = maxSide || 1600;
    quality = quality || 0.86;
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('不是图片文件'));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxSide / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        resolve({ dataUrl: cv.toDataURL('image/jpeg', quality), width: cw, height: ch });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片读不出来')); };
      img.src = url;
    });
  }

  window.AI = {
    Net: NET,
    LS: LS,
    TYPES: TYPES,
    hasKey: function () { return !!(NET.key && NET.key.replace(/\s/g, '').length >= 20); },
    isVerified: function () { return lsGet(LS.verified, '') === '1' && !!(NET.key); },
    setVerified: function (v) { lsSet(LS.verified, v ? '1' : ''); },
    saveNet: function (o) {
      if (o.key !== undefined) { NET.key = String(o.key || '').trim(); lsSet(LS.key, NET.key); }
      if (o.base !== undefined) { NET.base = String(o.base || DEFAULT_BASE).trim() || DEFAULT_BASE; lsSet(LS.base, NET.base); }
      if (o.model !== undefined) { NET.model = String(o.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL; lsSet(LS.model, NET.model); }
    },
    defaultBase: DEFAULT_BASE,
    defaultModel: DEFAULT_MODEL,
    loadPrompt: loadPrompt,
    diagnose: diagnose,
    ocr: ocr,
    testConnection: testConnection,
    compressImage: compressImage,
    parseJSON: parseJSON,
    parseSections: parseSections,
    splitVariant: splitVariant
  };
})();
