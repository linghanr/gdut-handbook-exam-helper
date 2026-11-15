#!/usr/bin/env node
/**
 * 在手册纯文本中检索关键词，并输出所在 PDF 页码与原句，便于核对答案出处。
 *
 * 用法: node src/find_in_handbook.js <关键词> [最大命中数] [最小句长]
 * 例:   node src/find_in_handbook.js "外借期限" 5
 */
const fs = require('fs');
const path = require('path');
const { PATHS } = require('./lib/paths');

const keyword = process.argv[2];
const maxHits = Number(process.argv[3] || 10);
const minLen = Number(process.argv[4] || 8);

if (!keyword) {
  console.error('用法: node src/find_in_handbook.js <关键词> [最大命中数] [最小句长]');
  process.exit(1);
}

const files = fs.existsSync(PATHS.HANDBOOK_DIR) ? fs.readdirSync(PATHS.HANDBOOK_DIR).filter((f) => f.endsWith('.txt')) : [];

if (!files.length) {
  console.error('尚未找到手册纯文本（data/handbook/*.txt）。');
  console.error('请先执行：node src/fetch_handbooks.js   （详见 docs/手册来源与抓取.md）');
  process.exit(1);
}

for (const file of files) {
  const raw = fs.readFileSync(path.join(PATHS.HANDBOOK_DIR, file), 'utf8');
  // 还原页码锚点，逐页记录页号
  const pages = raw.split(/===== \[PAGE (\d+)\] =====/);
  for (let i = 1; i < pages.length; i += 2) {
    const pageNo = pages[i];
    const body = pages[i + 1] || '';
    for (const sentence of body.split(/[。；\n]/)) {
      const line = sentence.replace(/\s+/g, ' ').trim();
      if (line.length >= minLen && line.includes(keyword)) {
        console.log(`[${file} p${pageNo}] ${line}`);
      }
    }
  }
}
