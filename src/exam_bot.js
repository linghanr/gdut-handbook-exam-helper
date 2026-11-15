/**
 * 页面端自动作答机器人（在考试页面上下文中执行）。
 *
 * 由 src/run_exam.js 通过 CDP Runtime.evaluate 注入，注入后可用：
 *   window.__bot.run(from, to, answers)  逐题作答并点击「下一题」
 *   window.__bot.state()                  读取当前题号、选项与作答缓存
 *
 * 关键约定：
 * 1) 题号以页面顶部全局计数器 “n / 100” 为准，多选题节内的 h3 编号是 1..N，不能用于定位。
 * 2) 选项在页面上的显示顺序被打乱（试卷 isChoiceShuffle），必须按选项文本匹配，不能按下标。
 * 3) 已选中的选项不再点击，避免被切换取消（选中态：class 含 _c）。
 *
 * 安全约定（本工具绝不交卷）：
 * 4) 注入即安装「交卷/提交」点击拦截器，任何指向这两个按钮的点击都被吞掉。
 * 5) 最后一题不再点「下一题」，避免平台弹出「确认交卷」对话框。
 * 6) 弹窗确认按钮只对无害弹窗自动点「确定」；含交卷/提交/离开/放弃字样的一律不点。
 */
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').replace(/\s+/g, '').replace(/^[A-N][.．、]/, '').trim();
  const txt = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => !!(el && (el.offsetParent || el.getClientRects().length));

  const stemEl = () => Array.from(document.querySelectorAll('h3')).find((h) => /^\s*\d+\s*[、.．]/.test(txt(h))) || null;
  const counterEl = () => Array.from(document.querySelectorAll('li,span,div')).find((e) => /^\s*\d+\s*\/\s*\d+\s*$/.test(txt(e))) || null;
  const globalQ = () => {
    const el = counterEl();
    return el ? Number(txt(el).split('/')[0].trim()) : null;
  };
  const totalQ = () => {
    const el = counterEl();
    return el ? Number(txt(el).split('/')[1].trim()) : null;
  };
  const optionEls = () => {
    const h = stemEl();
    if (!h || !h.parentElement) return [];
    return Array.from(h.parentElement.querySelectorAll('li')).filter((li) => /^\s*[A-N][.．、]/.test(txt(li)));
  };
  const isSel = (li) => String(li.className || '').split(/\s+/).includes('_c');
  const selectedTexts = () => optionEls().filter(isSel).map((li) => norm(txt(li))).sort();
  const btnByText = (label) => Array.from(document.querySelectorAll('button')).find((b) => txt(b) === label) || null;

  /** 拦截「交卷/提交」类按钮的点击，防止误交卷（仅在作答期间生效） */
  const guardSubmit = () => {
    if (window.__botGuardInstalled) return;
    window.__botGuardInstalled = true;
    window.__botGuardActive = true;
    document.addEventListener(
      'click',
      (e) => {
        if (!window.__botGuardActive) return;
        const btn = e.target && e.target.closest ? e.target.closest('button') : null;
        if (!btn) return;
        if (/交卷|提交/.test(txt(btn))) {
          e.preventDefault();
          e.stopPropagation();
          window.__botBlocked = txt(btn);
        }
      },
      true
    );
  };

  /** 弹窗确认按钮的「祖先链」文本 */
  const ancestorText = (el) => {
    let node = el;
    let text = '';
    for (let i = 0; i < 6 && node; i++) {
      text += ' ' + txt(node);
      node = node.parentElement;
    }
    return text;
  };

  /** 危险弹窗（交卷/提交/离开/放弃/结束/重新）一律不自动确认 */
  const DANGEROUS = /交卷|提交|离开|退出|放弃|结束|重新|警告/;
  const safeConfirm = () => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => txt(b) === '确定' && visible(b));
    if (!btn) return null;
    if (DANGEROUS.test(ancestorText(btn))) return null;
    return btn;
  };

  /** 按文本点击选项；已选中则跳过 */
  const pick = async (label) => {
    let li = optionEls().find((x) => norm(txt(x)) === norm(label));
    if (!li) return { label, status: 'nomatch' };
    if (isSel(li)) return { label, status: 'already' };
    li.click();
    await sleep(160);
    li = optionEls().find((x) => norm(txt(x)) === norm(label)) || li;
    if (isSel(li)) return { label, status: 'ok' };
    const inner = li.querySelector('div.flex-auto') || li.querySelector('div');
    if (inner) {
      inner.click();
      await sleep(160);
    }
    li = optionEls().find((x) => norm(txt(x)) === norm(label)) || li;
    if (isSel(li)) return { label, status: 'ok-inner' };
    const svg = li.querySelector('svg');
    if (svg) {
      svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(160);
    }
    li = optionEls().find((x) => norm(txt(x)) === norm(label)) || li;
    return { label, status: isSel(li) ? 'ok-svg' : 'fail' };
  };

  /** 翻页一步：dir = 'next' | 'prev' */
  const turn = async (dir) => {
    if (dir === 'next') {
      const cur = globalQ();
      const total = totalQ();
      if (cur != null && total != null && cur >= total) return { status: 'at-last', cur };
    }
    const btn = btnByText(dir === 'next' ? '下一题' : '上一题');
    if (!btn) return { status: 'no-btn' };
    const before = globalQ();
    btn.click();
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      if (globalQ() !== before) return { status: 'ok', cur: globalQ() };
      const ok = safeConfirm();
      if (ok) {
        ok.click();
        await sleep(150);
      }
    }
    return { status: 'stuck', cur: globalQ() };
  };

  /** 定位到目标题（逐步前进或后退） */
  const goto = async (q) => {
    for (let guard = 0; guard < 140; guard++) {
      const cur = globalQ();
      if (cur === q) {
        await sleep(120);
        return { ok: true };
      }
      const r = await turn(cur < q ? 'next' : 'prev');
      if (r.status === 'no-btn') return { ok: false, r, cur };
      if (r.status === 'at-last') return { ok: false, r, cur };
      if (r.status === 'stuck' && r.cur === cur) return { ok: false, r, cur };
    }
    return { ok: false, cur: globalQ() };
  };

  window.__bot = {
    async run(from, to, answers) {
      guardSubmit();
      window.__botGuardActive = true;
      const log = [];
      try {
        for (let q = from; q <= to; q++) {
          const pos = await goto(q);
          if (!pos.ok) {
            log.push({ q, error: '定位失败，当前题号 ' + pos.cur, detail: pos.r });
            continue;
          }
          const list = Array.isArray(answers[q]) ? answers[q] : [answers[q]];
          const picks = [];
          for (const label of list) picks.push(await pick(label));

          const want = list.map(norm).sort();
          const got = selectedTexts();
          const match = want.length === got.length && want.every((v, i) => v === got[i]);
          log.push({ q, stem: txt(stemEl()), picks, sel: got, match });
          if (q < to) {
            const r = await turn('next');
            if (r.status !== 'ok') log.push({ q, error: '翻页失败', detail: r });
          }
        }
      } finally {
        window.__botGuardActive = false;
      }
      return { done: log.length, log, blocked: window.__botBlocked || null };
    },

    /** 解除交卷拦截（学生自己手动交卷前可调用） */
    releaseGuard() {
      window.__botGuardActive = false;
      return 'guard-released';
    },

    state() {
      const h = stemEl();
      return {
        q: globalQ(),
        total: totalQ(),
        stem: h ? txt(h) : '',
        options: optionEls().map((li) => ({ t: txt(li), sel: isSel(li) })),
        answersAtom: localStorage.getItem('examAnswersAtom'),
        posAtom: localStorage.getItem('examTakePosAtom'),
      };
    },
  };
  guardSubmit();
  return 'bot-installed';
})();
