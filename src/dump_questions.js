#!/usr/bin/env node
/**
 * 导出试卷题面为可读文本：data/questions.txt
 * 用法: node src/dump_questions.js
 */
const fs = require('fs');
const { PATHS } = require('./lib/paths');

const paper = JSON.parse(fs.readFileSync(PATHS.PAPER, 'utf8'));
const NL = String.fromCharCode(10);
const lines = [];
let idx = 0;

for (const sec of paper.data) {
  lines.push('======== ' + sec.sectionName + ' (' + sec.subjects.length + '题) ========');
  for (const s of sec.subjects) {
    idx += 1;
    lines.push('');
    lines.push('[' + idx + '] ' + sec.sectionName + ' | ' + s.points + '分 | id=' + s.subjectId);
    lines.push((s.title || []).join(''));
    (s.option || []).forEach((o, i) => {
      lines.push(String.fromCharCode(65 + i) + '. ' + o.join(''));
    });
  }
}

fs.writeFileSync(PATHS.QUESTIONS, lines.join(NL), 'utf8');
console.log('题目已导出: ' + PATHS.QUESTIONS + ' (共 ' + idx + ' 题)');
