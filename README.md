# dsh-tech-stack-survey

DSH（DeepSeek Harness）技术选型问卷插件 · Tech-Stack Survey Plugin for DeepSeek Harness

当用户要求「设计 / 搭建 / 开发一个项目」但没有给出完整技术栈时，本插件会让模型调用 `design_stack_survey` 工具，根据**项目复杂度**和**提示词详细度**自动生成 **2–5 个**技术选型问题（每题恰好 **3 个**技术栈选项，每个选项都标注适用场景），以交互式卡片呈现：

- 将鼠标**悬停在选项**上，即可查看该技术栈的详细介绍（适用场景、优缺点、替代方案）；
- 用户**提交全部问题**后，模型才基于所选技术栈继续设计。

> When the user asks to *design / build / implement a project* without a complete tech stack, this plugin makes the model call the `design_stack_survey` tool, which asks **2–5** adaptive multiple-choice questions (exactly **3** stack options each, each annotated with the scenario it fits) in an interactive card:
> hover an option to read that stack's detailed info; only after the user submits **all** answers does the model continue the design with the chosen stack.

---

## 特性 · Features

- 🧠 **自适应题量**：题目数量 = `clamp(2..5, round((complexity + (5 − promptDetail)) / 2))`。项目越复杂、提示词越含糊，问题越多；反之越少。
- 🗂️ **内置知识库**：8 个技术维度（前端、后端、数据库、部署、移动/桌面端、AI、状态管理、测试），每个维度恰好 3 个主流技术栈选项。
- 🖱️ **悬停即详解**：每个选项下方显示“适用场景”一句话；鼠标悬停（或键盘聚焦）弹出该技术栈的详细介绍弹层。
- ✅ **一次提交**：所有问题在同一张卡片内，全部作答后统一提交，提交后模型在同一轮内继续设计。
- 🔌 **零侵入**：仅在 `conversation.composer` 链上以 `priority: -1` 认领本插件的问卷交互（通过 `survey: 'tech-stack'` 标记识别），普通 `ask_user_question` 流程仍走内置 UI。

## 工作原理 · How it works

```
用户: “帮我设计一个项目管理平台”
  │
  ▼
模型（agent）调用 design_stack_survey 工具
  │  project_description / project_type / complexity / prompt_detail
  ▼
Host 半部: 由知识库生成 2-5 道题 × 每题 3 个选项（label + description + details）
  │  调用 ctx.userQuestions.ask({ questions, agent, signal }) —— 阻塞等待
  ▼
Client 半部: 认领交互 → 渲染问卷卡片（悬停弹层、单题单选、统一提交）
  │  用户提交 → wait.respond({ ok: true, value: { sessionId, answer } })
  ▼
Host: ask() promise resolve → 工具返回所选技术栈 → 模型继续设计
```

- **Host 半部**（`host.js`）：注册动态工具 `design_stack_survey`；内含知识库 `BANK`、维度路由 `ORDER_BY_TYPE`、题量计算 `questionCount`、问卷构建 `buildSurvey`，并调用 `ctx.userQuestions.ask()`。
- **Client 半部**（`client.js`）：注册 `conversation.composer` 链条目（`priority: -1` + 标记校验选择器），渲染 `SurveyComposer` 组件：悬停弹层（`.dss-tip`）、选项单选、`已选择 n / N` 进度、`提交并开始设计` 按钮；提交与取消均复用内置的 `wait.respond()` 载体协议。

## 安装与使用 · Installation & Usage

### 方式一：动态插件（推荐试用 · Dynamic, recommended）

在 DSH 的 **创造模式（cordis）** 会话中，让模型执行：

1. `cordis_define` —— 新建插件：
   - `code.host` 填入本仓库 [`host.js`](./host.js) 的全部内容；
   - `code.client` 填入本仓库 [`client.js`](./client.js) 的全部内容；
   - 语义前缀建议 `dsts`。
2. `cordis_run` 激活；在浏览器 UI 中**批准** Client 半部（单勾即授权当前 Package）。
3. 之后直接说：**“帮我设计一个 XX 项目”**（不指定技术栈），模型就会调用 `design_stack_survey`，问卷卡片出现后悬停查看选项详情、作答并提交，随后基于所选技术栈给出设计。

> 动态插件仅存在于定义它的会话进程内（重启后失效）。需要长期安装请看方式二。

### 方式二：永久安装（需要部署层操作 · Permanent, deployment-level）

本插件是标准 Cordis 插件：Host 半部导出 `{ name, inject: ['userQuestions'], apply }`。可将其包装为 npm 包，并在部署的 `cordis.yml`（宿主组合或某个 agent preset）中加一行引用；Client 半部需要注册到部署的 **web 插件表**（`dsh.client` 扫描管线，参考 `@deepseek-ai/dsh-client-ui-*` 包的结构），并重建 Web 产物。此路径依赖具体部署拓扑，建议参考 DSH 部署文档操作。

## 工具参数 · Tool parameters

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `project_description` | string | ✅ | 项目描述（展示在问卷开头，超过 240 字符自动截断） |
| `project_type` | string | – | `web / fullstack / mobile / desktop / ai / cli / other`，决定提问维度 |
| `complexity` | integer | – | 复杂程度 1–5，默认 3 |
| `prompt_detail` | integer | – | 提示词详细度 1–3，默认 2 |

**题量规则 · Question count**

| complexity \ promptDetail | 1（含糊） | 2（一般） | 3（较详细） |
| --- | --- | --- | --- |
| 1（简单） | 3 | 2 | 2 |
| 3（中等） | 4 | 3 | 3 |
| 5（复杂） | 5 | 4 | 4 |

**知识库维度 · Knowledge bank dimensions**（每维 3 个选项）

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

## 项目结构 · Structure

```
dsh-tech-stack-survey/
├── host.js              # code.host —— 工具 + 知识库 + 题量/问卷构建
├── client.js            # code.client —— 问卷卡片 UI（悬停弹层、统一提交）
├── tests/
│   └── host.test.js     # 基于 Node VM 的 Host 半部单元测试（44 项断言）
└── README.md
```

## 测试 · Test

```bash
node tests/host.test.js
```

覆盖：题量边界（2–5）、维度路由与回退、每题恰好 3 个选项且含 `label/description/details`、`survey: 'tech-stack'` 标记、工具定义（参数/输出 schema/render）、`execute` 全流程（含 `ask()` 调用、agent/signal 透传、custom 答案透传）。

## 许可 · License

[MIT](./LICENSE)
