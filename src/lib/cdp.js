/**
 * CDP 极简客户端：连接 Chrome 调试端口上的 page target，执行 JS 并取回结果。
 * 依赖：Node 18+（内置全局 WebSocket）。
 */
const http = require('http');

/** 列出调试端口上的所有 target */
function listTargets(port = 9222, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    http
      .get({ host, port, path: '/json/list', timeout: 5000 }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error('无法解析 /json/list: ' + err.message));
          }
        });
      })
      .on('error', (err) => reject(new Error('无法连接调试端口 ' + host + ':' + port + ' — ' + err.message)));
  });
}

/** 找到考试页面 target，返回其 webSocketDebuggerUrl */
async function findExamPage(port = 9222, host = '127.0.0.1', urlMatch = 'exam.yooc.me') {
  const targets = await listTargets(port, host);
  const page = targets.find((t) => t.type === 'page' && String(t.url).includes(urlMatch));
  if (!page) {
    throw new Error(`未找到打开 ${urlMatch} 的页面；请先在该 Chrome 中打开考试页面`);
  }
  return page.webSocketDebuggerUrl;
}

/** 打开新标签页并返回该 target（新版 Chrome 的 /json/new 只接受 PUT） */
function openTab(url, port = 9222, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port, path: '/json/new?' + encodeURIComponent(url), method: 'PUT', timeout: 8000 },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error('无法解析 /json/new 响应: ' + err.message));
          }
        });
      }
    );
    req.on('error', (err) => reject(new Error('无法连接调试端口 ' + host + ':' + port + ' — ' + err.message)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('打开新标签页超时'));
    });
    req.end();
  });
}

/**
 * 在目标页面执行表达式并返回可序列化结果。
 * @param {string} wsUrl page target 的 WebSocket 地址
 * @param {string} expression 在页面上下文执行的表达式（支持 Promise）
 */
function evaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let seq = 0;
    const pending = new Map();

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    });

    const send = (method, params) =>
      new Promise((resolveMsg) => {
        const id = ++seq;
        pending.set(id, resolveMsg);
        ws.send(JSON.stringify({ id, method, params }));
      });

    ws.addEventListener('open', async () => {
      try {
        const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (res.result?.exceptionDetails) {
          reject(new Error('页面脚本异常: ' + JSON.stringify(res.result.exceptionDetails)));
        } else {
          resolve(res.result?.result?.value);
        }
      } catch (err) {
        reject(err);
      } finally {
        ws.close();
      }
    });

    ws.addEventListener('error', (e) => reject(new Error('WebSocket 错误: ' + (e.message || 'unknown'))));
  });
}

module.exports = { listTargets, findExamPage, openTab, evaluate };
