# dsh-tech-stack-survey

[English](README.md) | 中文

DSH（DeepSeek Harness）技术选型问卷插件。

当用户要求「设计 / 搭建 / 开发一个项目」但没有给出完整技术栈时，本插件会让模型调用 `design_stack_survey` 工具，根据**项目复杂度**和**提示词详细度**自动生成 **2–5 个**技术选型问题（每题恰好 **3 个**技术栈选项，每个选项都标注适用场景），以交互式卡片呈现：

- 将鼠标**悬停在选项**上，即可查看该技术栈的详细介绍（适用场景、优缺点、替代方案）；
- 用户**提交全部问题**后，模型才基于所选技术栈继续设计。

## 特性

- 🧠 **自适应题量**：题目数量 = `clamp(2..5, round((complexity + (5 − promptDetail)) / 2))`。项目越复杂、提示词越含糊，问题越多；反之越少。
- 🗂️ **内置知识库**：8 个技术维度（前端、后端、数据库、部署、移动/桌面端、AI、状态管理、测试），每个维度恰好 3 个主流技术栈选项。
- 🖱️ **悬停即详解**：每个选项下方显示“适用场景”一句话；鼠标悬停（或键盘聚焦）弹出该技术栈的详细介绍弹层。
- ✅ **逐题提问**：一次只显示一题，选择后自动进入下一题（可「上一题」回退修改），最后一题答完统一提交，提交后模型在同一轮内继续设计。
- 🔌 **零侵入**：仅在 `conversation.composer` 链上以 `priority: -1` 认领本插件的问卷交互（通过题目 `id` 的 `dss_stack_` 前缀识别——传输层 zod schema 会剥离未知字段，因此标记必须放在 schema 允许的字段里），普通 `ask_user_question` 流程仍走内置 UI。

## 工作原理

```
用户: “帮我设计一个项目管理平台”
  │
  ▼
模型（agent）调用 design_stack_survey 工具
  │  project_description / project_type / complexity / prompt_detail
  ▼
Host 半部: 由知识库生成 2-5 道题 × 每题 3 个选项（label + description，其中 description = “场景一句话\n\n详细介绍”）
  │  调用 ctx.userQuestions.ask({ questions, agent, signal }) —— 阻塞等待
  ▼
Client 半部: 认领交互 → 逐题渲染问卷（悬停弹层、选择后自动下一题、可回退、最后一题提交）
  │  用户提交 → wait.respond({ ok: true, value: { sessionId, answer } })
  ▼
Host: ask() promise resolve → 工具返回所选技术栈 → 模型继续设计
```

- **Host 半部**（`lib/index.js`）：注册动态工具 `design_stack_survey`；内含知识库 `BANK`、维度路由 `ORDER_BY_TYPE`、题量计算 `questionCount`、问卷构建 `buildSurvey`，并调用 `ctx.userQuestions.ask()`。
- **Client 半部**（`lib/client.js`）：注册 `conversation.composer` 链条目（`priority: -1` + `dss_stack_` id 前缀选择器），渲染 `SurveyComposer` 组件：**逐题提问**（选择自动进入下一题、可回退）、悬停弹层（`.dss-tip`，内容来自 `option.description` 完整文本）、`问题 n / N` 进度、`提交并开始设计` 按钮；提交与取消均复用内置的 `wait.respond()` 载体协议。

## 安装与使用

### 方式一：动态插件（推荐试用）

在 DSH 的 **创造模式（cordis）** 会话中，让模型执行：

1. `cordis_define` —— 新建插件：
   - `code.host` 填入本仓库 [`host.js`](./host.js) 的全部内容；
   - `code.client` 填入本仓库 [`client.js`](./client.js) 的全部内容；
   - 语义前缀建议 `dsts`。
2. `cordis_run` 激活；在浏览器 UI 中**批准** Client 半部（单勾即授权当前 Package）。
3. 之后直接说：**“帮我设计一个 XX 项目”**（不指定技术栈），模型就会调用 `design_stack_survey`，问卷卡片出现后悬停查看选项详情、作答并提交，随后基于所选技术栈给出设计。

> 动态插件仅存在于定义它的会话进程内（重启后失效）。需要长期安装请看方式二。

### 方式二：永久安装（需要部署层操作）

仓库已按**官方双面规范**打包（`package.json` + `lib/`），可直接安装到本地 DSH（web profile）——本机实测通过：

1. **打包**：仓库即安装包。Host 半部 = `lib/index.js`（静态 ESM，注入 `tools`/`userQuestions`，通过 `ctx.tools.register(defineTool(...))` 注册 `design_stack_survey`）；Client 半部 = `lib/client.js`（`window.__ModuleLoader__.load({ id, factory })` 惰性 CJS bundle，导出 `{ inject: ['slots','locale'], apply }`）。`package.json` 声明 `dsh.client: { platform: 'web', inject: [...] }` 与 `exports['./client']`。
2. **安装包**：把 `package.json` + `lib/` 复制到 profile 的 hoisted node_modules 根（本机为 `C:\Users\guozi\.dsh\profiles\node_modules\dsh-tech-stack-survey`，可从 profile 目录直接 `require.resolve`）。
3. **组合**：在 profile 的 `cordis.patch.yml`（本机为 `C:\Users\guozi\.dsh\profiles\web\cordis.patch.yml`）追加一行 insert：
   ```yaml
   - insert:
       - id: tech-stack-survey
         name: 'dsh-tech-stack-survey'
   ```
4. **重启**：重启 `dsh web`（无需重建 Web 产物——client-modules 节点半部在运行时扫描 Loader 条目并动态服务 `/plugins/<id>/client.js`，浏览器经 `window.__DSH_BOOT__` 拉取）。
5. **验证**：`GET /plugins/dsh-tech-stack-survey/client.js` 应返回 200；通过 `/api/pluginInventory/list` RPC 可看到 `include:tech-stack-survey` 条目 `fiberPhase: active`。

> 注意：Host 半部以 host 平面 ctx 注册工具，落入 tools registry 的 **global 层**，所有 agent preset 默认继承（预设未做 allow/deny 限制），因此**新建会话**即可看到 `design_stack_survey` 工具；本插件安装前已创建的会话工具目录固定，需新开会话。
> 若日后在 profile 目录执行 `pnpm install`，请同时把本包加入 profile `package.json` 的 `dependencies`，以免被 pnpm 修剪。

## 工具参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `project_description` | string | ✅ | 项目描述（展示在问卷开头，超过 240 字符自动截断） |
| `project_type` | string | – | `web / fullstack / mobile / desktop / ai / cli / other`，决定提问维度 |
| `complexity` | integer | – | 复杂程度 1–5，默认 3 |
| `prompt_detail` | integer | – | 提示词详细度 1–3，默认 2 |

**题量规则**

| complexity \ promptDetail | 1（含糊） | 2（一般） | 3（较详细） |
| --- | --- | --- | --- |
| 1（简单） | 3 | 2 | 2 |
| 3（中等） | 4 | 3 | 3 |
| 5（复杂） | 5 | 4 | 4 |

**知识库维度**（每维 3 个选项）

| 维度 | 题面 | 选项示例 |
| --- | --- | --- |
| `frontend` 前端框架 | Web 前端采用什么技术栈？ | React 18 + Vite · Vue 3 + Vite · Svelte 5 + Vite |
| `backend` 后端框架 | 后端采用什么技术栈？ | Node.js (NestJS/Fastify) · Python (FastAPI/Django) · Go (Gin/Echo) |
| `database` 数据存储 | 数据存储采用什么方案？ | PostgreSQL + Redis · MongoDB · SQLite + Prisma |
| `deployment` 部署与托管 | 项目如何部署与托管？ | Docker + PaaS · Kubernetes + 云厂商 · 传统 VPS/裸机 |
| `mobile` 移动/桌面端 | 移动端/桌面端采用什么技术栈？ | React Native (Expo) · Flutter · Tauri |
| `ai` AI 能力 | AI 能力如何集成？ | LLM API + LangChain · 本地模型 (Ollama) · 微调开源模型 (HF + LoRA) |
| `state` 状态管理 | 前端状态管理与数据获取采用什么方案？ | TanStack Query + Zustand · Pinia · Redux Toolkit |
| `testing` 测试与质量 | 测试与质量保障采用什么方案？ | Vitest + Playwright · Pytest · Jest + RTL |

维度路由（`ORDER_BY_TYPE`）：`web/fullstack → frontend, backend, database, deployment, state`；`mobile/desktop → mobile, backend, database, deployment`；`ai → ai, backend, database, deployment`；`cli → backend, testing, deployment`；未知类型回退 `other`。

## 项目结构

```
dsh-tech-stack-survey/
├── package.json         # 双面安装包：dsh.client + exports["./client"]
├── lib/
│   ├── index.js         # Host 半部 —— 工具 + 知识库（静态 ESM）
│   ├── client.js        # Client 半部 —— 问卷卡片 UI（__ModuleLoader__ bundle）
│   └── types/           # .d.ts 类型面
├── host.js              # 动态安装（cordis_define）用的 code.host
├── client.js            # 动态安装用的 code.client
├── tests/
│   ├── host.test.cjs        # 动态 Host 代码体的 VM 单元测试
│   ├── static-host.test.js  # lib/index.js 对真实 defineTool 的测试
│   └── client.test.js       # 客户端 bundle 的 VM 结构测试
└── README.md / README.zh.md
```

## 测试

```bash
npm test        # node --test tests/
npm run check   # 语法检查 lib/index.js 与 lib/client.js
```

覆盖：题量边界（2–5）、维度路由与回退、每题恰好 3 个选项（`label` + `description` 内含“场景 + 空行 + 详情”）、`dss_stack_` id 前缀标记、题目仅含 schema 允许的字段、工具定义（参数/输出 schema/render）、`execute` 全流程（含 `ask()` 调用、agent/signal 透传、custom 答案透传）。

## 许可

[MIT](./LICENSE)
