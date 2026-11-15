#!/usr/bin/env node
/**
 * 启动带调试端口的 Chrome（独立用户目录，不影响日常浏览器），并打开考试页面。
 *
 * 用法: node src/start_chrome.js [url] [--port 9222] [--check]
 * 例:   node src/start_chrome.js https://exam.yooc.me/
 *       node src/start_chrome.js --check   # 仅检测 Chrome 路径，不启动
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig } = require('./lib/paths');

const argv = process.argv.slice(2);
const config = loadConfig({ debugPort: 9222, examUrl: 'https://exam.yooc.me/' });
let url = config.examUrl;
let port = config.debugPort;
let checkOnly = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--port') port = Number(argv[++i]);
  else if (argv[i] === '--check') checkOnly = true;
  else if (!argv[i].startsWith('--')) url = argv[i];
}

/** 常见安装位置 */
function candidatePaths() {
  if (process.platform === 'win32') {
    const roots = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA];
    return roots
      .filter(Boolean)
      .map((root) => path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  if (process.platform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
}

/** 已配置路径优先，其次扫描常见安装位置 */
function resolveExecutable() {
  if (config.chromePath && fs.existsSync(config.chromePath)) return config.chromePath;
  return candidatePaths().find((p) => fs.existsSync(p)) || '';
}

const exe = resolveExecutable();
if (!exe) {
  console.error('未找到 Chrome 可执行文件，请手动安装 Chrome 后重试，或自行用 --remote-debugging-port 启动。');
  process.exit(1);
}

/** 独立用户目录，避免调试端口影响日常浏览器配置 */
const profileDir = config.chromeUserDataDir
  ? config.chromeUserDataDir.replace(/^~(?=$|[\\/])/, os.homedir())
  : path.join(os.homedir(), '.gdut-exam-chrome');
const args = [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  url,
];

console.log('Chrome 路径:', exe);
console.log('参数:', args.join(' '));
if (checkOnly) {
  console.log('仅检测模式，未启动。');
  process.exit(0);
}
console.log('首次使用需在该窗口登录考试平台账号。');
spawn(exe, args, { detached: true, stdio: 'ignore' }).unref();
console.log(`已启动，调试端口 ${port}（可用 http://127.0.0.1:${port}/json/list 确认）`);
