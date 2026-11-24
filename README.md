# GDUT 学生手册考试助手

> 把《广东工业大学学生手册》和《2026 广东工业大学研究生手册》里的**原文条款**，变成一份**可检索、可回查、可自动勾选**的题库工具。

**所有答案逐条取自两份手册原文**，每题都带 `出处`（PDF 页码）与 `原文引用`，可随时复核、可自行修订。

| | |
| --- | --- |
| 手册原文可检索 | `node src/find_in_handbook.js "外借期限"` → 直接输出 `[手册 p279] 原文句` |
| 答案可复核 | `data/answers.json` 每题含 `answer` / `answerTexts` / `quote` / `src` 四个字段 |
| 答案可扩展 | 新答案按 `{q, answer, quote, src}` 放进 `data/answers_src/`，跑一次 `build_answers` 即自动汇总并刷新速查表 |
| 作答可核验 | `verify_final` 读取页面作答缓存与答案文件逐题比对，输出不一致清单 |
| 全程不交卷 | 所有脚本只点选项与「下一题」，代码里没有任何一处会点「交卷」；机器人还内置了三重交卷拦截 |

> **用途建议**：把本工具当作**手册精读与考前自测**助手 —— 先看 [答案速查表](docs/答案速查表.md) 里的原文引用，再回到手册通读对应章节。
> **请遵守学校的考试纪律与学术规范**；本项目仅用于自主学习，详见 [免责声明](#六免责声明)。

> [!IMPORTANT]
> **你的卷子大概率和这里的不一样。** `data/answers.json` 只是某一届某一套卷子的答案，题号不对应。
> 想用自己的题目跑一遍，请把 [docs/给别人用的提示词.md](docs/给别人用的提示词.md) 里的提示词整段交给你的 AI 助手，
> 让它按同样流程重新从手册原文推导答案（**不要**直接套用仓库里的答案）。

---

## 一、快速开始

```bash
# 0) 依赖：Node 18+（使用内置 WebSocket，无需 npm install）、Python 3.8+（仅解析手册 PDF 时需要）
node -v && python --version
pip install -r requirements.txt      # 仅需要解析 PDF 时才装

# 1) 启动带调试端口的 Chrome（独立用户目录，不影响日常浏览器）
node src/start_chrome.js
#    → 在弹出的窗口里登录平台账号，打开「在线考试」页面

# 2) 抓取试卷（复用页面自己的接口参数，无需手工抄 token）
node src/fetch_paper.js          # → data/paper.json
node src/dump_questions.js       # → data/questions.txt

# 3) 按答案自动勾选（默认第 1~100 题）
node src/run_exam.js             # 可加 --from 1 --to 100 --batch 25

# 4) 核验作答结果（逐题比对页面缓存与答案文件）
node src/verify_final.js         # → data/verify_report.json

# 5) 跳到最后一题（仍然不交卷，交卷由你自己手动决定）
node src/goto_last.js
```

### 手册原文怎么来

仓库**不包含**两份手册 PDF（版权属于学校）。用下面的脚本一键抓取并转成可检索文本：

```bash
# 方式 A：浏览器模式 —— 先用 start_chrome.js 打开 OA 页面并登录，再执行
node src/fetch_handbooks.js

# 方式 B：Cookie 模式 —— 把浏览器里 oas.gdut.edu.cn 的 Cookie 贴进去
node src/fetch_handbooks.js --cookie "JSESSIONID=...; ..."

# 只看附件清单与直链（不需要登录）
node src/fetch_handbooks.js --list
```

抓取结果：`manuals/*.pdf`（原件）+ `data/handbook/*.txt`（带 `===== [PAGE n] =====` 页码锚点的纯文本）。
附件来源与 `v` 参数原理见 [docs/手册来源与抓取.md](docs/手册来源与抓取.md)。

---

## 二、目录结构

```
gdut-handbook-exam-helper/
├── README.md                  本文件：总览与快速开始
├── LICENSE                    MIT 许可
├── CONTRIBUTING.md            贡献指南（如何补题、如何加手册）
├── config.example.json        可选配置（调试端口、考试页匹配串等）示例
├── package.json               仅用于 npm scripts 快捷命令，无运行时依赖
├── requirements.txt           Python 依赖（仅解析 PDF 需要）
├── docs/
│   ├── 使用指南.md             分步操作手册（含首次配置与排错）
│   ├── 答案速查表.md           100 题答案 + 手册原文引用 + 出处页码
│   ├── 实现原理.md             页面机制、接口、数据结构与踩坑记录
│   ├── 手册来源与抓取.md        手册附件下载机制与一键抓取说明
│   └── 法规导航索引.txt         法规名 → PDF 页码对照表
├── src/
│   ├── start_chrome.js        启动带调试端口的 Chrome
│   ├── fetch_handbooks.js     抓取两份手册 PDF → 转纯文本
│   ├── fetch_paper.js         抓取试卷 → data/paper.json
│   ├── dump_questions.js      导出题面 → data/questions.txt
│   ├── build_answers.js       汇总答案源 → data/answers.json + 速查表
│   ├── run_exam.js            自动作答驱动（逐题勾选 + 点「下一题」）
│   ├── exam_bot.js            注入页面的作答机器人
│   ├── verify_final.js        逐题核验作答结果
│   ├── goto_last.js           跳到最后一题
│   ├── find_in_handbook.js    手册全文检索（带页码）
│   ├── extract_pdf.py         PDF → 带页码锚点的纯文本
│   └── lib/
│       ├── cdp.js             CDP 客户端（连接/执行/查找页面/开标签页）
│       └── paths.js           路径解析与配置读取
├── data/
│   ├── answers.json           100 题答案（含答案文本、原文引用、出处）
│   ├── answers_src/           答案原始条目（可自行增补后重新汇总）
│   └── questions.txt          题面全文
├── manuals/                   手册 PDF 原件（运行 fetch_handbooks 后生成，不入库）
└── logs/                      修改记录
```

---

## 三、快捷命令

安装依赖后可使用 `npm run <脚本>`（等价于直接 `node src/<脚本>`）：

| 命令 | 作用 |
| --- | --- |
| `npm start` | 启动带调试端口的 Chrome |
| `npm run manuals` | 抓取手册 PDF 并转文本 |
| `npm run fetch` | 抓取试卷 |
| `npm run questions` | 导出题面 |
| `npm run answers` | 汇总答案并刷新速查表 |
| `npm run exam` | 自动作答 |
| `npm run verify` | 核验作答结果 |
| `npm run last` | 跳到最后一题 |
| `npm run search -- "关键词"` | 检索手册原文 |

---

## 四、常见问题

**Q：脚本报"无法连接调试端口 9222"？**
A：Chrome 没有带调试端口启动。执行 `node src/start_chrome.js`（或手动加 `--remote-debugging-port=9222`），并确认访问 `http://127.0.0.1:9222/json/list` 能返回列表。

**Q：`fetch_paper.js` 提示"页面尚未发起过 setting/get 请求"？**
A：考试页面刚打开还没加载完，在该页面按一次 F5 刷新后重试。

**Q：抓手册报"返回的不是 PDF"？**
A：OA 附件下载需要登录态，且直链里的 `v` 参数与会话绑定。请用浏览器模式（先在该 Chrome 窗口登录 OA）或传入有效 Cookie。详见 [手册来源与抓取](docs/手册来源与抓取.md)。

**Q：选项点了没反应？**
A：先确认页面选项已被选中（选中时该行 class 会多出 `_c`）；`run_exam.js` 输出里的 `status` 会显示 `ok` / `fail` / `nomatch`，`nomatch` 表示答案文本与页面显示不一致（多为题面更新导致）。

**Q：能跨题型定位吗？**
A：可以。试卷是多选题时，页面顶部计数器仍是全局题号（`n / 100`），机器人以它为准，多选题节内的 `h3` 编号只是节内序号。

**Q：会帮我交卷吗？**
A：不会。代码里没有任何点击「交卷」的逻辑；机器人还会在作答期间拦截指向「交卷 / 提交」的点击，最后一题也不再点「下一题」，避免平台弹出「确认交卷」。

---

## 五、更多文档

- [**给别人用的提示词**](docs/给别人用的提示词.md)：把你的题目交给 AI 助手照此流程跑一遍（推荐先读这个）
- [使用指南](docs/使用指南.md)：首次配置、完整流程、故障排查
- [答案速查表](docs/答案速查表.md)：100 题答案与手册出处
- [实现原理](docs/实现原理.md)：页面结构、接口与数据结构的逆向记录
- [手册来源与抓取](docs/手册来源与抓取.md)：OA 附件下载机制与一键抓取脚本

---

## 六、免责声明

1. 本项目仅用于**自主学习与手册精读**，帮助同学更快地定位到手册原文条款；不构成任何考试作弊建议。
2. 仓库内的**答案**整理自《广东工业大学学生手册》《2026 广东工业大学研究生手册》公开条款，**版权归广东工业大学所有**；手册 PDF 原件不随仓库分发，需自行从学校 OA 获取。仓库内的**题面**来自考试平台公开的试卷数据，同样归属学校与平台，请勿用于任何违规用途。
3. 考试平台（`exam.yooc.me`）为第三方服务，与本项目无隶属关系；请遵守平台条款与学校考试纪律。
4. 使用者需自行确保行为符合学校规定、平台条款与当地法律法规；因不当使用产生的一切后果由使用者自行承担。
5. 仓库采用 [MIT](LICENSE) 许可开源。

---

## 七、致谢

- 感谢广东工业大学发布的两份学生手册 —— 本项目所有答案的源头。
- 感谢每一位提出勘误、补充出处、改进脚本的同学，欢迎通过 [CONTRIBUTING.md](CONTRIBUTING.md) 参与。
