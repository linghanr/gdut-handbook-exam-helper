#!/usr/bin/env node
/**
 * 最终核验：读取页面 localStorage 中的作答缓存，与 data/answers.json 逐题比对。
 *
 * 用法: node src/verify_final.js [--port 9222]
 *
 * 作答缓存在 localStorage.examAnswersAtom，key 为 “节序号-题序号”，value 为选项原始序号。
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
const norm = (s) => (s || '').replace(/\s+/g, '').trim();

(async () => {
  const wsUrl = await findExamPage(Number(args.port || config.debugPort), config.debugHost, config.examUrlMatch);
  const state = JSON.parse(
    await evaluate(
      wsUrl,
      `JSON.stringify({
        atom: localStorage.getItem('examAnswersAtom'),
        pos: localStorage.getItem('examTakePosAtom'),
        url: location.href,
        counter: (() => {
          const el = Array.from(document.querySelectorAll('li,span')).find((e) => /^\\s*\\d+\\s*\\/\\s*\\d+\\s*$/.test((e.innerText || '').replace(/\\s+/g, ' ').trim()));
          return el ? el.innerText.replace(/\\s+/g, ' ').trim() : null;
        })(),
        hasResult: /成绩|得分|交卷成功|已交卷/.test(document.body.innerText),
      })`
    )
  );

  const paper = JSON.parse(fs.readFileSync(PATHS.PAPER, 'utf8'));
  const answers = JSON.parse(fs.readFileSync(PATHS.ANSWERS, 'utf8')).questions;

  // 试卷原始顺序：data[0]=单选，data[1]=多选
  const sections = paper.data.map((sec) => sec.subjects.map((s) => s));
  const atom = JSON.parse(state.atom || '{}');
  const user = Object.values(atom)[0] || {};

  let ok = 0;
  const problems = [];
  let no = 0;
  sections.forEach((subjects, si) => {
    subjects.forEach((sub, i) => {
      no += 1;
      const key = `${si}-${i}`;
      const item = answers[String(no)];
      if (!item) {
        problems.push(`题${no} 无答案条目`);
        return;
      }
      const want = item.answer.map((l) => sub.option.findIndex((o) => norm((o || []).join('')) === norm(item.options[l]))).sort((a, b) => a - b);
      const raw = user[key];
      if (raw === undefined) {
        problems.push(`题${no} 未作答（缺少 ${key}）`);
        return;
      }
      let got;
      try {
        got = JSON.parse(raw);
      } catch {
        got = raw;
      }
      const gotArr = (Array.isArray(got) ? got : [Number(got)]).slice().sort((a, b) => a - b);
      const same = gotArr.length === want.length && gotArr.every((v, idx) => v === want[idx]);
      if (same) ok += 1;
      else problems.push(`题${no} 不一致：期望 ${JSON.stringify(want)} 实际 ${JSON.stringify(gotArr)}`);
    });
  });

  console.log(`核验通过 ${ok}/${no} 题`);
  if (problems.length) {
    console.log('问题清单:');
    problems.forEach((p) => console.log(' - ' + p));
  } else {
    console.log('全部作答与答案文件一致 ✅');
  }
  console.log('页面状态: ' + JSON.stringify({ url: state.url, counter: state.counter, hasResult: state.hasResult }));
  fs.writeFileSync(path.join(PATHS.DATA, 'verify_report.json'), JSON.stringify({ ok, total: no, problems, state }, null, 2));
  if (problems.length) process.exitCode = 1;
})().catch((err) => {
  console.error('ERROR: ' + err.message);
  process.exit(1);
});
