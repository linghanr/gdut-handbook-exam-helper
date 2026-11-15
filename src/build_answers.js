#!/usr/bin/env node
/**
 * 汇总答案：合并 data/answers_src/*.json 的答案条目，结合 data/paper.json 的题面，
 * 生成 data/answers.json（含手册原文出处）并刷新 docs/答案速查表.md。
 *
 * 用法: node src/build_answers.js
 */
const fs = require('fs');
const path = require('path');
const { PATHS } = require('./lib/paths');

/** 读取所有答案来源文件并按题号合并，同时检测冲突 */
function loadSources() {
  const merged = new Map();
  const files = fs.readdirSync(PATHS.ANSWERS_SRC).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const items = JSON.parse(fs.readFileSync(path.join(PATHS.ANSWERS_SRC, file), 'utf8'));
    for (const item of items) {
      const letters = Array.isArray(item.answer) ? item.answer : [item.answer];
      const prev = merged.get(item.q);
      if (prev) {
        const same = prev.answer.length === letters.length && prev.answer.every((v, i) => v === letters[i]);
        if (!same) throw new Error(`题 ${item.q} 在 ${file} 中与已有答案冲突: ${prev.answer} vs ${letters}`);
        // 保留出处信息更完整的一条
        if (!prev.src && item.src) prev.src = item.src;
        if (!prev.quote && item.quote) prev.quote = item.quote;
      } else {
        merged.set(item.q, { answer: letters, quote: item.quote || '', src: item.src || '' });
      }
    }
  }
  return merged;
}

/**
 * 从 paper.json 取出题面与选项（选项顺序即字母顺序）。
 * 仓库不包含 paper.json（运行时数据），故缺省时回退解析 data/questions.txt。
 */
function loadQuestions() {
  const map = new Map();
  if (fs.existsSync(PATHS.PAPER)) {
    const paper = JSON.parse(fs.readFileSync(PATHS.PAPER, 'utf8'));
    let no = 0;
    for (const sec of paper.data) {
      for (const sub of sec.subjects) {
        no += 1;
        const options = {};
        (sub.option || []).forEach((o, i) => (options[String.fromCharCode(65 + i)] = (o || []).join('')));
        map.set(no, { no, type: sec.sectionName, stem: (sub.title || []).join(''), options });
      }
    }
    return map;
  }
  return parseQuestionsTxt();
}

/** 解析 data/questions.txt（格式：[n] 题型 | 分值 | id=xxx / 题干 / A. 选项…） */
function parseQuestionsTxt() {
  const map = new Map();
  const lines = fs.readFileSync(PATHS.QUESTIONS, 'utf8').split(/\r?\n/);
  let type = '';
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    const section = line.match(/^=+\s*(.+?)\s*\(\d+题\)\s*=+$/);
    if (section) {
      type = section[1].trim();
      continue;
    }
    const head = line.match(/^\[(\d+)\]\s*(.+?)\s*\|/);
    if (head) {
      cur = { no: Number(head[1]), type, stem: '', options: {} };
      map.set(cur.no, cur);
      continue;
    }
    if (!cur) continue;
    const opt = line.match(/^([A-Z])\.\s*(.*)$/);
    if (opt) {
      cur.options[opt[1]] = opt[2];
      continue;
    }
    if (line && !line.startsWith('[enc-answer]') && !cur.stem) cur.stem = line;
  }
  return map;
}

/** 生成 Markdown 速查表 */
function buildMarkdown(questions) {
  const out = ['# 答案速查表（100 题）', '', '> 答案全部依据《广东工业大学学生手册》与《2026 广东工业大学研究生手册》原文推导，`出处`列给出可回查的 PDF 页码。', ''];
  let currentType = '';
  const items = Object.values(questions).sort((a, b) => a.no - b.no);
  for (const info of items) {
    const no = info.no;
    if (info.type !== currentType) {
      currentType = info.type;
      out.push('', `## ${currentType}`, '');
    }
    const ans = info.answer;
    const texts = ans.map((l) => (info.options[l] || '').replace(/\n/g, ' '));
    out.push(`### 第 ${no} 题 ${ans.join('')}`);
    out.push('');
    out.push(`**题干**：${info.stem.replace(/\n/g, ' ')}`);
    out.push('');
    ans.forEach((l, i) => out.push(`- ${l}. ${texts[i]}`));
    out.push('');
    out.push(`> ${info.quote.replace(/\n/g, ' ')}`);
    out.push('');
    out.push(`> 出处：${info.src}`);
    out.push('');
  }
  return out.join('\n');
}

const sources = loadSources();
const questions = loadQuestions();

const result = { questions: {} };
let missing = 0;
for (const [no, info] of questions) {
  const src = sources.get(no);
  if (!src) {
    missing += 1;
    continue;
  }
  result.questions[no] = {
    no,
    type: info.type,
    stem: info.stem,
    options: info.options,
    answer: src.answer,
    answerTexts: src.answer.map((l) => info.options[l] || ''),
    quote: src.quote,
    src: src.src,
  };
}

fs.writeFileSync(PATHS.ANSWERS, JSON.stringify(result, null, 2));
fs.writeFileSync(path.join(PATHS.DOCS, '答案速查表.md'), buildMarkdown(result.questions));

console.log(`已汇总 ${Object.keys(result.questions).length}/${questions.size} 题，缺失 ${missing} 题`);
console.log('答案文件: ' + PATHS.ANSWERS);
console.log('速查表: ' + path.join(PATHS.DOCS, '答案速查表.md'));
if (missing) process.exitCode = 1;
