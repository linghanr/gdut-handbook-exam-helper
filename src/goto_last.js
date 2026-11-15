#!/usr/bin/env node
/**
 * 跳到最后一题（不交卷），并打印当前题号与已选选项。
 *
 * 用法: node src/goto_last.js [--port 9222]
 */
const fs = require('fs');
const path = require('path');
const { PATHS, loadConfig } = require('./lib/paths');
const { findExamPage, evaluate } = require('./lib/cdp');

const args = (() => {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
})();
const config = loadConfig({ debugPort: 9222, debugHost: '127.0.0.1', examUrlMatch: 'exam.yooc.me' });

(async () => {
  const wsUrl = await findExamPage(Number(args.port || config.debugPort), config.debugHost, config.examUrlMatch);
  const script = `
    (async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const txt = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      const counter = () => {
        const el = Array.from(document.querySelectorAll('li,span,div')).find((e) => /^\\s*\\d+\\s*\\/\\s*\\d+\\s*$/.test(txt(e)));
        return el ? Number(txt(el).split('/')[0].trim()) : null;
      };
      const nextBtn = () => Array.from(document.querySelectorAll('button')).find((b) => txt(b) === '下一题') || null;
      const total = (() => {
        const el = Array.from(document.querySelectorAll('li,span,div')).find((e) => /^\\s*\\d+\\s*\\/\\s*\\d+\\s*$/.test(txt(e)));
        return el ? Number(txt(el).split('/')[1].trim()) : 0;
      })();
      for (let i = 0; i < 60; i++) {
        const cur = counter();
        if (cur >= total) break;
        const btn = nextBtn();
        if (!btn) break;
        const before = cur;
        btn.click();
        for (let j = 0; j < 20; j++) {
          await sleep(100);
          if (counter() !== before) break;
        }
      }
      const stem = Array.from(document.querySelectorAll('h3')).map(txt).filter((t) => /^\\s*\\d+\\s*[、.．]/.test(t))[0] || null;
      const selected = Array.from(document.querySelectorAll('li'))
        .filter((li) => /^\\s*[A-N][.．、]/.test(txt(li)))
        .filter((li) => String(li.className).split(/\\s+/).includes('_c'))
        .map((li) => txt(li));
      const atom = localStorage.getItem('examAnswersAtom') || '{}';
      const first = Object.values(JSON.parse(atom))[0] || {};
      return JSON.stringify({ counter: counter(), total, stem, selected, answered: Object.keys(first).length });
    })()
  `;
  const state = JSON.parse(await evaluate(wsUrl, script));
  fs.writeFileSync(path.join(PATHS.DATA, 'last_state.json'), JSON.stringify(state, null, 2));
  console.log(JSON.stringify(state, null, 2));
})().catch((err) => {
  console.error('ERROR: ' + err.message);
  process.exit(1);
});
