#!/usr/bin/env node
/**
 * 抓取试卷数据：在已登录的考试页面上下文中复用页面自己的接口参数，
 * 取回试卷（题面 + 选项 + 题型），写入 data/paper.json。
 *
 * 用法: node src/fetch_paper.js [--port 9222] [--out data/paper.json]
 *
 * 前置条件：用带调试端口的 Chrome 打开考试页面并完成登录。
 */
const fs = require('fs');
const path = require('path');
const { PATHS, loadConfig } = require('./lib/paths');
const { findExamPage, evaluate } = require('./lib/cdp');

/** 从命令行读取 --key value 形式的参数 */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const config = loadConfig({ debugPort: 9222, debugHost: '127.0.0.1', examUrlMatch: 'exam.yooc.me' });

(async () => {
  const wsUrl = await findExamPage(Number(args.port || config.debugPort), config.debugHost, config.examUrlMatch);
  console.log('已连接考试页面:', wsUrl);

  // 页面自己发出的接口请求里带有 token / userId / yibanId / examId，直接复用
  const raw = await evaluate(
    wsUrl,
    `(async () => {
      const entries = performance.getEntriesByType('resource').map(e => e.name);
      const setting = entries.find(u => u.includes('/api/exam/setting/get'));
      if (!setting) return JSON.stringify({ error: '页面尚未发起过 setting/get 请求，请刷新考试页面后重试' });
      const settingData = await (await fetch(setting, { credentials: 'include' })).json();
      const examuserId = settingData?.data?.examuserId || settingData?.examuserId;
      if (!examuserId) return JSON.stringify({ error: 'setting/get 未返回 examuserId：' + JSON.stringify(settingData) });
      const url = new URL('/api/exam/paper/get', setting);
      url.searchParams.set('examuserId', examuserId);
      for (const [k, v] of new URL(setting).searchParams) url.searchParams.set(k, v);
      const paper = await (await fetch(url.toString(), { credentials: 'include' })).json();
      return JSON.stringify({ paper });
    })()`
  );

  const result = JSON.parse(raw);
  if (result.error) throw new Error(result.error);

  const outPath = path.resolve(PATHS.ROOT, args.out || PATHS.PAPER);
  fs.writeFileSync(outPath, JSON.stringify(result.paper));
  const sections = result.paper.data || [];
  const total = sections.reduce((n, s) => n + (s.subjects?.length || 0), 0);
  console.log(`试卷已保存: ${outPath}`);
  sections.forEach((s, i) => console.log(`  section ${i}: ${s.subjects?.length || 0} 题`));
  console.log(`合计 ${total} 题`);
})().catch((err) => {
  console.error('ERROR: ' + err.message);
  process.exit(1);
});
