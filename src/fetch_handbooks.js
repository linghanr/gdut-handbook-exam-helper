#!/usr/bin/env node
/**
 * 抓取广东工业大学两份学生手册（PDF）并转换为带页码锚点的纯文本。
 *
 * 数据来源：学校 OA 公示页
 *   https://oas.gdut.edu.cn/seeyon/newsData.do?method=newsView&newsId=4414529617552949729
 *   附件3《广东工业大学2026年学生手册》、附件4《广东工业大学2026年研究生手册》。
 *
 * OA 附件直链形如：
 *   /seeyon/fileDownload.do?method=doDownload&filename=<附件名>&v=<版本串>&fileId=<fileUrl>&createDate=<yyyy-MM-dd>
 * 其中 v 与会话绑定，且下载接口拒绝游客（返回 401 / 强制下线页），因此提供两种取件方式：
 *   1) --cookie "<浏览器里的 Cookie>"：直接带会话请求，无需浏览器；
 *   2) 默认：在带调试端口、已登录 OA 的 Chrome 中取件（页面上下文 fetch，credentials: 'include'）。
 *
 * 用法:
 *   node src/fetch_handbooks.js --list                  仅列出 OA 附件信息
 *   node src/fetch_handbooks.js --cookie "JSESSIONID=..." 用 Cookie 下载并转换
 *   node src/fetch_handbooks.js                          用已登录的调试 Chrome 下载并转换
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PATHS, loadConfig } = require('./lib/paths');
const { listTargets, openTab, evaluate } = require('./lib/cdp');

const OA_BASE = 'https://oas.gdut.edu.cn/seeyon';
const OA_PAGE = `${OA_BASE}/newsData.do?method=newsView&newsId=4414529617552949729`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

/** 需要的两份手册：按附件名匹配，并给出落地文件名 */
const TARGETS = [
  { label: '本科学生手册', match: /2026年学生手册/, keyword: '2026年学生手册', basename: '本科学生手册' },
  { label: '2026研究生手册', match: /2026年研究生手册/, keyword: '2026年研究生手册', basename: '2026研究生手册' },
];

/** 解析 --key value 形式的命令行参数 */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--list') out.list = true;
    else if (token.startsWith('--')) out[token.slice(2)] = argv[++i];
    else out._.push(token);
  }
  return out;
}

/** 取 OA 页面原始字节（页面正文为 GBK，附件 JSON 为 UTF-8，故按字节处理） */
async function fetchPage(url, cookie) {
  const headers = { 'User-Agent': UA, Referer: `${OA_BASE}/main.do` };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`打开 OA 页面失败：HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** 从页面字节中取出 attsdata 附件数组（按括号深度截取，避免 JSON 内含 ']' 时截断） */
function extractAttachments(buf) {
  const text = buf.toString('latin1');
  const start = text.indexOf("attsdata='");
  if (start < 0) throw new Error('OA 页面中未找到附件列表（attsdata），可能页面结构已变化');
  const open = text.indexOf('[', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error('OA 页面附件列表解析中断（JSON 未闭合）');
  const json = Buffer.from(text.slice(open, end), 'latin1').toString('utf8');
  return JSON.parse(json);
}

/** 拼出附件直链（v / createDate / fileId 均取自同一份 attsdata） */
function buildDownloadUrl(att) {
  const params = new URLSearchParams({
    method: 'doDownload',
    filename: att.filename,
    v: att.v,
    fileId: att.fileUrl,
    createDate: String(att.createdate).slice(0, 10),
  });
  return `${OA_BASE}/fileDownload.do?${params.toString()}`;
}

/** 校验下载结果：PDF magic + 期望字节数 */
function verifyPdf(buf, expectedSize, source) {
  if (buf.length < 5 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    const head = buf.subarray(0, 80).toString('utf8').replace(/\s+/g, ' ');
    throw new Error(`${source} 未取到 PDF（前 5 字节：${buf.subarray(0, 5).toString('latin1')}）——多半是 OA 未登录或会话已过期。${head.slice(0, 40)}`);
  }
  if (expectedSize && buf.length !== Number(expectedSize)) {
    console.warn(`  ! 字节数与附件声明不一致：下载 ${buf.length} / 声明 ${expectedSize}`);
  }
  return buf;
}

/** 方式一：直接带 Cookie 请求 */
async function downloadWithCookie(att, cookie) {
  const res = await fetch(buildDownloadUrl(att), {
    headers: { 'User-Agent': UA, Referer: `${OA_BASE}/main.do`, Cookie: cookie },
  });
  if (!res.ok) throw new Error(`附件下载 HTTP ${res.status}`);
  return verifyPdf(Buffer.from(await res.arrayBuffer()), att.size, 'Cookie 下载');
}

/** 在页面上下文中执行的取件脚本：读页面 DOM 里的附件元数据 → 逐个下载 → 回传 base64 分片 */
const BROWSER_FETCH_SCRIPT = (pageUrl, keyword) => `(async () => {
  const resp = await fetch(${JSON.stringify(pageUrl)}, { credentials: 'include' });
  const buf = new Uint8Array(await resp.arrayBuffer());
  let html = ''; for (let i = 0; i < buf.length; i += 8192) html += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
  const tag = "attsdata='";
  const tagAt = html.indexOf(tag);
  if (tagAt < 0) return JSON.stringify({ error: 'OA 页面中未找到附件列表（attsdata），可能未登录或页面结构已变化' });
  const raw = html.slice(tagAt + tag.length);
  const start = raw.indexOf('[');
  let depth = 0, end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '[') depth++;
    else if (raw[i] === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  let atts;
  try { atts = JSON.parse(decodeURIComponent(escape(raw.slice(start, end)))); }
  catch (err) { return JSON.stringify({ error: '附件列表解析失败: ' + String(err) }); }
  const att = atts.find(a => a.filename.includes(${JSON.stringify(keyword)}));
  if (!att) return JSON.stringify({ error: '附件未找到: ' + ${JSON.stringify(keyword)} });
  const params = new URLSearchParams({ method: 'doDownload', filename: att.filename, v: att.v, fileId: att.fileUrl, createDate: String(att.createdate).slice(0, 10) });
  const res = await fetch('/seeyon/fileDownload.do?' + params.toString(), { credentials: 'include' });
  const data = new Uint8Array(await res.arrayBuffer());
  let bin = ''; for (let i = 0; i < data.length; i += 8192) bin += String.fromCharCode.apply(null, data.subarray(i, i + 8192));
  window.__hb = { b64: btoa(bin), size: data.length, expect: Number(att.size) || 0, err: '' };
  return JSON.stringify({ ok: true, size: data.length, expect: Number(att.size) || 0 });
})()`;

/** 方式二：在已登录的 Chrome 页面上下文中取件（自动分片回传，避免大文件卡顿） */
async function downloadWithBrowser(att, pageUrl, port, host) {
  const targets = await listTargets(port, host);
  let page = targets.find((t) => t.type === 'page' && String(t.url).includes('oas.gdut.edu.cn'));
  if (!page) {
    console.log('未找到 OA 标签页，正在打开……');
    page = await openTab(pageUrl, port, host);
    await new Promise((r) => setTimeout(r, 2500));
    page = (await listTargets(port, host)).find((t) => t.id === page.id) || page;
  }
  const wsUrl = page.webSocketDebuggerUrl;
  const raw = await evaluate(wsUrl, BROWSER_FETCH_SCRIPT(pageUrl, att.keyword));
  const state = JSON.parse(raw);
  if (state.error) throw new Error(state.error);
  if (!state.ok) throw new Error('页面内取件失败');

  const chunks = [];
  const CHUNK = 1024 * 1024;
  for (;;) {
    const part = await evaluate(wsUrl, `(() => { const s = window.__hb.b64; const i = window.__hb.i || 0; window.__hb.i = i + ${CHUNK}; return s.slice(i, i + ${CHUNK}); })()`);
    if (!part) break;
    chunks.push(part);
    if (part.length < CHUNK) break;
  }
  const buf = Buffer.from(chunks.join(''), 'base64');
  return verifyPdf(buf, state.expect || att.size, '浏览器下载');
}

/** 调用 Python 抽取器把 PDF 转成带页码锚点的纯文本 */
function convertToText(pdfPath, txtPath) {
  const python = process.env.PYTHON || 'python';
  const res = spawnSync(python, [path.join(PATHS.SRC, 'extract_pdf.py'), pdfPath, txtPath], { encoding: 'utf8' });
  if (res.error) throw new Error('未找到 Python（可用环境变量 PYTHON 指定解释器路径）：' + res.error.message);
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || '').trim();
    const hint = /No module named '(pymupdf|fitz)'/.test(detail)
      ? '——缺少 pymupdf，请执行 `pip install pymupdf`；若已装在别的解释器，请用环境变量 PYTHON 指定，例如 `PYTHON=/path/to/python`。'
      : '';
    throw new Error('PDF 转文本失败：' + detail + hint);
  }
  console.log('  ' + (res.stdout || '').trim());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig({ debugPort: 9222, debugHost: '127.0.0.1', handbookPage: OA_PAGE });
  const pageUrl = args.page || config.handbookPage;
  const cookie = args.cookie || '';

  console.log('OA 页面:', pageUrl);
  const attachments = extractAttachments(await fetchPage(pageUrl, cookie));
  console.log(`附件数量: ${attachments.length}`);
  attachments.forEach((a, i) => console.log(`  [${i + 1}] ${a.filename}  ${a.size} 字节  fileId=${a.fileUrl}`));

  if (args.list) {
    console.log('\n附件直链模板（需登录态，v 与会话绑定）：');
    attachments.forEach((a) => console.log('  ' + buildDownloadUrl(a)));
    return;
  }

  const wanted = TARGETS.map((t) => {
    const hit = attachments.find((a) => t.match.test(a.filename));
    if (!hit) throw new Error(`OA 附件中未找到《${t.label}》，请检查手册是否更新`);
    return { ...t, att: hit };
  });

  fs.mkdirSync(PATHS.MANUALS, { recursive: true });
  fs.mkdirSync(PATHS.HANDBOOK_DIR, { recursive: true });

  for (const item of wanted) {
    console.log(`\n下载《${item.label}》: ${item.att.filename}`);
    const buf = cookie
      ? await downloadWithCookie(item.att, cookie)
      : await downloadWithBrowser({ ...item.att, keyword: item.keyword }, pageUrl, Number(args.port || config.debugPort), config.debugHost);
    const pdfPath = path.join(PATHS.MANUALS, `${item.basename}.pdf`);
    fs.writeFileSync(pdfPath, buf);
    console.log(`  已保存 ${pdfPath}（${buf.length} 字节）`);
    convertToText(pdfPath, path.join(PATHS.HANDBOOK_DIR, `${item.basename}.txt`));
  }

  console.log('\n完成。手册纯文本位于 data/handbook/，可用 node src/find_in_handbook.js 检索。');
}

main().catch((err) => {
  console.error('ERROR: ' + err.message);
  process.exitCode = 1;
});
