#!/usr/bin/env node
/**
 * 自动作答驱动器：注入页面端机器人，按 data/answers.json 逐题勾选并点「下一题」。
 *
 * 用法: node src/run_exam.js [--from 1] [--to 100] [--batch 25] [--port 9222]
 *
 * 注意：本脚本只点选项与「下一题」，永远不会点「交卷」。
 */
const fs = require('fs');
const path = require('path');
const { PATHS, loadConfig } = require('./lib/paths');
const { findExamPage, evaluate } = require('./lib/cdp');

/** 解析 --key value 参数 */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const config = loadConfig({ debugPort: 9222, debugHost: '127.0.0.1', examUrlMatch: 'exam.yooc.me' });
const FROM = Number(args.from || 1);
const TO = Number(args.to || 100);
const BATCH = Number(args.batch || 25);

(async () => {
  const answersFile = path.resolve(PATHS.ROOT, args.answers || PATHS.ANSWERS);
  const all = JSON.parse(fs.readFileSync(answersFile, 'utf8')).questions;
  const botCode = fs.readFileSync(path.join(PATHS.SRC, 'exam_bot.js'), 'utf8');
  const wsUrl = await findExamPage(Number(args.port || config.debugPort), config.debugHost, config.examUrlMatch);

  console.log('安装作答机器人...');
  await evaluate(wsUrl, botCode);

  let failures = 0;
  for (let start = FROM; start <= TO; start += BATCH) {
    const end = Math.min(start + BATCH - 1, TO);
    const subset = {};
    for (let q = start; q <= end; q++) {
      const item = all[String(q)];
      if (item) subset[q] = item.answerTexts;
    }
    // 注意：run() 返回 Promise，直接求值（配合 awaitPromise）即可拿到结构化结果
    const res = await evaluate(wsUrl, `window.__bot.run(${start}, ${end}, ${JSON.stringify(subset)})`);
    for (const item of (res && res.log) || []) {
      if (item.error) {
        failures += 1;
        console.log(`✗ 题${item.q} ${item.error}`);
      } else {
        const bad = item.picks.filter((p) => p.status === 'fail' || p.status === 'nomatch');
        const mark = bad.length || !item.match ? '✗' : '✓';
        if (bad.length || !item.match) failures += 1;
        console.log(`${mark} 题${item.q} [${item.picks.map((p) => p.status).join(',')}] ${String(item.stem).slice(0, 40)}`);
      }
    }
    const state = JSON.parse(await evaluate(wsUrl, 'JSON.stringify(window.__bot.state())'));
    console.log(`--- 批次 ${start}-${end} 完成，当前题号 ${state.q} ---`);
  }

  const state = JSON.parse(await evaluate(wsUrl, 'JSON.stringify(window.__bot.state())'));
  fs.writeFileSync(path.join(PATHS.DATA, 'exam_state.json'), JSON.stringify(state, null, 2));
  console.log('异常题数: ' + failures);
  console.log('当前状态已写入 data/exam_state.json');
})().catch((err) => {
  console.error('ERROR: ' + err.message);
  process.exit(1);
});
