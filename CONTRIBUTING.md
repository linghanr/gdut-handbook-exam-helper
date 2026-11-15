# 贡献指南

感谢你愿意参与这个项目。下面是几条约定，照着做就能把改动合进去。

## 一、环境

```bash
node -v        # 需要 18+（脚本使用内置 WebSocket，无第三方依赖）
python --version
pip install -r requirements.txt   # 仅在需要解析手册 PDF 时安装
```

克隆后无需 `npm install`（无运行时依赖），`package.json` 只用来提供 `npm run` 快捷命令。

## 二、常见贡献类型

### 1. 补充 / 修正答案

答案的**唯一事实来源是两份手册原文**，不接受凭印象或网络搜索得到的答案。

1. 先把手册文本准备好：

   ```bash
   node src/fetch_handbooks.js        # → data/handbook/*.txt
   node src/find_in_handbook.js "外借期限"   # 定位原文与页码
   ```

2. 在 `data/answers_src/` 下新增或修改一个 JSON 文件，条目格式：

   ```json
   [
     {
       "q": 2,
       "answer": ["C"],
       "quote": "学生借阅的图书……校外借出期限为30天。",
       "src": "本科学生手册 p279"
     }
   ]
   ```

   - `q`：题号（1 起）
   - `answer`：单选为字符串数组（如 `["C"]`），多选为多个字母（如 `["A","B","C"]`）
   - `quote`：手册原文片段（尽量逐字）
   - `src`：出处，格式 `文件名 p页码`

3. 汇总并刷新速查表：

   ```bash
   node src/build_answers.js
   ```

   若同一题号在不同文件里答案不一致，脚本会直接报错并指出冲突，方便排查。

### 2. 修正题面 / 选项文字

题面与选项来自试卷数据（`data/paper.json`，不入库）。若平台题面有更新：

```bash
node src/fetch_paper.js
node src/dump_questions.js
node src/build_answers.js
```

若答案文本与页面显示对不上，`run_exam.js` 的 `status` 会显示 `nomatch`，此时按新的选项文字更新 `data/answers_src/` 里的对应条目即可。

### 3. 改进脚本

- 单文件不超过 400 行；一个函数只做一件事；避免重复代码。
- 注释、提示信息与文档统一用中文，与代码上下文保持一致。
- 硬编码的路径、端口、页码等一律走 `src/lib/paths.js` 的 `PATHS` 或 `config.json`。
- Node 脚本不得引入第三方依赖（保持"克隆即用"）。
- **绝不添加点击「交卷」「提交」的逻辑**，也绝不允许绕过 `exam_bot.js` 里的交卷防护。
- 修改后至少跑一次：`node src/build_answers.js`、`node src/fetch_handbooks.js --list`、`node src/find_in_handbook.js 手册`，确认无报错。

## 三、提交信息

用中文或英文都可以，建议格式：

```
fix: 修正第 27 题答案为「怀孕3～5个月」（研究生手册 p128）
feat: fetch_handbooks 增加浏览器模式
docs: 补充宿舍管理规定第二十九条出处
```

## 四、涉及手册原文的注意事项

- 仓库**不放**手册 PDF 与 `data/handbook/` 纯文本（版权属学校），需要的话自己跑 `fetch_handbooks.js`。
- 引用原文时保持逐字，不要自行改写后当作原文。
- 若手册更新，请在 PR 描述里写明更新了哪几条法规、对应页码。

## 五、行为准则

请遵守学校的考试纪律与学术规范，项目仅用于自主学习与手册精读。任何用于违规作弊的改动都不会被合并。
