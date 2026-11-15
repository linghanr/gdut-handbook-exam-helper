/**
 * 包内路径解析：全部基于脚本自身位置，保证目录整体移动后仍可运行。
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const PATHS = {
  ROOT,
  SRC: path.join(ROOT, 'src'),
  DATA: path.join(ROOT, 'data'),
  DOCS: path.join(ROOT, 'docs'),
  MANUALS: path.join(ROOT, 'manuals'),
  ANSWERS: path.join(ROOT, 'data', 'answers.json'),
  ANSWERS_SRC: path.join(ROOT, 'data', 'answers_src'),
  PAPER: path.join(ROOT, 'data', 'paper.json'),
  QUESTIONS: path.join(ROOT, 'data', 'questions.txt'),
  HANDBOOK_DIR: path.join(ROOT, 'data', 'handbook'),
  CONFIG: path.join(ROOT, 'config.json'),
};

/** 读取可选的 config.json（不存在则返回默认值） */
function loadConfig(defaults = {}) {
  if (!fs.existsSync(PATHS.CONFIG)) return { ...defaults };
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(PATHS.CONFIG, 'utf8')) };
  } catch (err) {
    throw new Error('config.json 解析失败: ' + err.message);
  }
}

module.exports = { PATHS, loadConfig };
