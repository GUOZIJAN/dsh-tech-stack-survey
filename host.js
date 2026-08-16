// ============================================================================
// dsh-tech-stack-survey — Host half
// ----------------------------------------------------------------------------
// A dynamic Cordis plugin for DeepSeek Harness (DSH).
//
// This file is the exact body of `code.host` in `cordis_define`:
//   cordis_define(plugin, name, purpose, { host: <this body>, client: <client.js body> })
//
// What it does
//   Registers one dynamic model Tool, `design_stack_survey`. The model calls it
//   when the user asks to design/build a project without specifying a complete
//   tech stack. The tool:
//     1. decides how many questions to ask (2-5) from project complexity and
//        prompt detail;
//     2. picks the relevant technology dimensions from a built-in knowledge
//        bank and builds one question per dimension with exactly 3 options
//        (each option = one tech stack, with the scenario it fits in
//        `description` and detailed info for the hover popup in `details`);
//     3. calls `ctx.userQuestions.ask()` which blocks until the human answers
//        every question in the browser UI;
//     4. returns the chosen stacks so the model can proceed with the design.
//
// The knowledge bank is written in Chinese (stack names are universal); the
// structure makes adding more locales straightforward.
// ============================================================================

// Marker that lets the Client half claim these interactions in the
// `conversation.composer` chain (the built-in composer ignores them).
const SURVEY_MARKER = 'tech-stack';
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

// ---------------------------------------------------------------------------
// Knowledge bank: technology dimensions. Every dimension has exactly 3 options.
//   label       — the tech stack name (user-facing).
//   description — one line: which scenario this stack fits.
//   details     — extended info shown in the hover popup.
// ---------------------------------------------------------------------------
const BANK = {
  frontend: {
    id: 'frontend',
    header: '前端框架',
    question: 'Web 前端采用什么技术栈？',
    options: [
      {
        label: 'React 18 + Vite',
        description: '生态最丰富，适合组件复杂、需要大量第三方库的中大型项目',
        details:
          'React 拥有最大的社区和第三方生态（Ant Design、MUI、TanStack 等），函数组件 + Hooks 模型成熟，配合 Vite 的开发体验极佳。\n' +
          '适合中大型 Web 应用、需要灵活组合各种库、团队容易招人的项目。\n' +
          '对 SSR/SEO 有要求时可无缝升级到 Next.js。',
      },
      {
        label: 'Vue 3 + Vite',
        description: '上手平缓、模板直观，适合快速迭代的中小型项目与团队协作',
        details:
          'Vue 3 组合式 API + <script setup> 语法简洁，官方生态（Pinia、Vue Router、Vite）一体化程度高，中文文档完善。\n' +
          '适合中小型项目、内部系统、需要快速上手的团队。\n' +
          '对 SEO 有要求时可搭配 Nuxt 3。',
      },
      {
        label: 'Svelte 5 + Vite',
        description: '编译期框架，包体小、运行时开销低，适合对性能敏感的轻量项目',
        details:
          'Svelte 把组件编译为原生 JavaScript，没有虚拟 DOM，打包体积和运行时开销都最小。\n' +
          '适合小型应用、嵌入式页面、对性能与包体有硬性要求的场景。\n' +
          '全栈可用 SvelteKit。注意生态相对前两者较小，复杂组件方案需要自己拼装。',
      },
    ],
  },

  backend: {
    id: 'backend',
    header: '后端框架',
    question: '后端采用什么技术栈？',
    options: [
      {
        label: 'Node.js (NestJS / Fastify)',
        description: '前后端同语言，适合全栈团队快速交付 API 服务',
        details:
          'Node.js 事件驱动，I/O 密集场景表现出色。\n' +
          'NestJS 提供企业级模块化架构与依赖注入，适合中大型项目；Fastify 更轻量、性能更高。\n' +
          '前后端统一使用 TypeScript 可共享类型定义，减少上下文切换，适合中小规模 API、实时应用、微服务。',
      },
      {
        label: 'Python (FastAPI / Django)',
        description: '开发效率高、数据与 AI 生态强，适合数据分析 / AI 类后端',
        details:
          'FastAPI 基于类型提示自动生成 OpenAPI 文档，异步性能好，开发效率极高；Django 自带 ORM、Admin、认证等全家桶，适合内容型与管理型应用。\n' +
          '与 NumPy / PyTorch / pandas 等数据生态无缝衔接，非常适合 AI、数据处理、爬虫类后端。',
      },
      {
        label: 'Go (Gin / Echo)',
        description: '高并发、低资源占用，适合对性能与稳定性要求高的服务',
        details:
          'Go 编译为单一静态二进制，部署简单；goroutine 天然支持高并发，内存占用低。\n' +
          '适合网关、高 QPS API、云原生微服务、命令行工具链。\n' +
          '类型系统严格，开发速度略慢于脚本语言，但运行期问题极少。',
      },
    ],
  },

  database: {
    id: 'database',
    header: '数据存储',
    question: '数据存储采用什么方案？',
    options: [
      {
        label: 'PostgreSQL + Redis',
        description: '关系型为主、兼顾缓存，适合绝大多数业务应用',
        details:
          'PostgreSQL 功能全面：事务、JSON、全文检索、丰富扩展（PostGIS 等）；Redis 提供缓存、队列与计数服务。\n' +
          '这是通用性最强的组合，适合大多数 Web / 业务应用，可平滑演进到更复杂的架构，几乎没有天花板。',
      },
      {
        label: 'MongoDB',
        description: '文档模型灵活，适合结构变化快、无强关联的业务',
        details:
          'MongoDB 文档模型无需预定义 schema，迭代期改字段零迁移成本，水平扩展容易。\n' +
          '适合内容管理、用户行为数据、物联网、快速原型等场景。\n' +
          '当业务对强事务与复杂多表关联查询需求弱时非常合适；反之请选择关系型数据库。',
      },
      {
        label: 'SQLite + Prisma',
        description: '零部署、单文件，适合工具类、个人项目与原型',
        details:
          'SQLite 单文件即数据库，无需独立服务进程；配合 Prisma ORM 获得类型安全的现代开发体验。\n' +
          '适合个人工具、桌面应用、原型验证、低流量内部系统。\n' +
          '高并发写入或分布式部署场景不适合，此时应升级到 PostgreSQL。',
      },
    ],
  },

  deployment: {
    id: 'deployment',
    header: '部署与托管',
    question: '项目如何部署与托管？',
    options: [
      {
        label: 'Docker + PaaS (Vercel/Railway/Fly)',
        description: '容器化 + 平台托管，适合快速上线、自动扩缩容',
        details:
          'Docker 统一开发与生产环境；Vercel 托管前端、Railway / Fly.io 托管后端，提交即部署，自动 HTTPS 与扩缩容。\n' +
          '运维成本最低，适合中小型项目快速交付与持续迭代。\n' +
          '注意 PaaS 账单随流量增长，超大规模后需考虑自托管。',
      },
      {
        label: 'Kubernetes + 云厂商',
        description: '容器编排标准，适合大规模、多服务、需弹性伸缩的架构',
        details:
          'Kubernetes 提供服务发现、自动伸缩、滚动发布、自愈等能力，适合多服务微服务架构与企业级生产环境。\n' +
          '建议使用托管集群（EKS / GKE / ACK）降低运维负担。\n' +
          '学习与运维成本高，团队需要专门的容器与云原生能力。',
      },
      {
        label: '传统 VPS / 裸机 (Nginx + systemd)',
        description: '完全掌控、成本可控，适合固定流量与私有化部署',
        details:
          '一台 VPS + Nginx 反向代理 + systemd 守护进程即可承载中等流量应用，成本最低、可控性最强。\n' +
          '适合固定流量业务、私有化 / 内网部署、对数据主权敏感的场景。\n' +
          '需要自己处理备份、HTTPS 证书、监控与故障恢复。',
      },
    ],
  },

  mobile: {
    id: 'mobile',
    header: '移动端 / 桌面端',
    question: '移动端 / 桌面端采用什么技术栈？',
    options: [
      {
        label: 'React Native (Expo)',
        description: '一套 JS 代码同时发布 iOS / Android，适合快速跨端',
        details:
          'Expo 提供托管工作流、OTA 热更新与成熟组件库，React 开发者上手极快。\n' +
          '适合以 JavaScript 生态为主、需要快速覆盖双端的团队。\n' +
          '复杂原生能力（蓝牙、定制相机等）仍需原生模块或预构建。',
      },
      {
        label: 'Flutter',
        description: '自绘渲染、双端 UI 一致性强，适合对视觉与流畅度要求高的应用',
        details:
          'Flutter 使用 Dart，Skia 自绘引擎保证双端像素级一致与高帧率，Material 3 组件丰富。\n' +
          '适合设计驱动、动画多、要求原生级流畅度的应用。\n' +
          '团队需要学习 Dart，且包体相对较大。',
      },
      {
        label: 'Tauri (桌面端)',
        description: 'Web 技术 + 极小包体，适合轻量桌面应用',
        details:
          'Tauri 用系统 WebView 渲染 + Rust 后端，安装包仅几 MB（对比 Electron 的 100MB+），内存占用低。\n' +
          '适合想用 Web 技术栈又在意资源占用的桌面工具类应用。\n' +
          '若需要最大生态兼容与成熟度，可选 Electron。',
      },
    ],
  },

  ai: {
    id: 'ai',
    header: 'AI 能力',
    question: 'AI 能力如何集成？',
    options: [
      {
        label: 'LLM API + 编排框架 (LangChain)',
        description: '快速接入大模型能力，适合 AI 应用快速原型与落地',
        details:
          '直接调用 OpenAI / DeepSeek / Claude 等 LLM API，配合 LangChain / LlamaIndex 提供 RAG、Agent 编排、工具调用等脚手架。\n' +
          '是 AI 功能集成的最快路径，按量计费、无需自备算力。\n' +
          '适合聊天助手、内容生成、知识库问答等应用。',
      },
      {
        label: '本地模型 (Ollama + llama.cpp)',
        description: '数据不出本地，适合隐私敏感或离线场景',
        details:
          'Ollama 一条命令即可运行 Llama / Qwen / DeepSeek 等开源模型，llama.cpp 提供高效推理。\n' +
          '数据完全本地，无按量费用，隐私可控。\n' +
          '需要一定算力（建议 NVIDIA GPU 或 Apple Silicon），效果取决于模型大小与量化。',
      },
      {
        label: '微调开源模型 (HF + LoRA)',
        description: '深度定制模型行为，适合领域专用模型',
        details:
          '使用 Hugging Face Transformers + PEFT / LoRA 在领域数据上微调开源模型，可获得任务专用效果。\n' +
          '适合法律、医疗、代码等垂直领域的高精度需求。\n' +
          '训练与推理成本较高，需要数据清洗与评估流程。',
      },
    ],
  },

  state: {
    id: 'state',
    header: '状态管理与数据获取',
    question: '前端状态管理与数据获取采用什么方案？',
    options: [
      {
        label: 'TanStack Query + Zustand',
        description: '服务端与客户端状态分离管理，适合中大型 React 应用',
        details:
          'TanStack Query 管理服务端缓存、加载与失效；Zustand 以极简 API 管理全局 UI 状态。\n' +
          '二者配合是当前 React 社区的主流实践，样板代码少、可扩展性强。\n' +
          '适合数据交互频繁的中大型应用。',
      },
      {
        label: 'Pinia (Vue 官方)',
        description: 'Vue 官方状态库，API 简洁，适合所有 Vue 项目',
        details:
          'Pinia 是 Vue 官方推荐的状态管理库：类型友好、模块化天然、DevTools 集成完善、支持组合式写法。\n' +
          '与 Vue 3 生态深度整合，适合任何规模的 Vue 项目，尤其是中小型。',
      },
      {
        label: 'Redux Toolkit',
        description: '规范严格、可预测性强的老牌方案，适合大型复杂状态',
        details:
          'Redux Toolkit 提供 createSlice、RTK Query 等现代 API，单向数据流与时间旅行调试成熟。\n' +
          '适合团队已有 Redux 经验，或状态极其复杂、需要强约束的大型项目。\n' +
          '样板代码相对较多，学习曲线偏陡。',
      },
    ],
  },

  testing: {
    id: 'testing',
    header: '测试与质量',
    question: '测试与质量保障采用什么方案？',
    options: [
      {
        label: 'Vitest + Playwright',
        description: '现代 Vite 生态测试组合，适合 JS / TS 项目',
        details:
          'Vitest 与 Vite 配置零成本复用、速度极快；Playwright 提供跨浏览器 E2E 测试、截图与自动化。\n' +
          '从单元测试到端到端测试全链路覆盖，是当前前端项目的主流选择。',
      },
      {
        label: 'Pytest',
        description: 'Python 事实标准测试框架，适合 Python 后端与数据项目',
        details:
          'Pytest 断言简洁、fixture 强大、插件生态丰富（覆盖率、参数化、mock 等）。\n' +
          '与 FastAPI / Django / 数据管线配合良好，是 Python 生态的事实标准。',
      },
      {
        label: 'Jest + React Testing Library',
        description: '经典 React 测试组合，社区资料最多',
        details:
          'Jest 是久经考验的测试运行器，React Testing Library 倡导以用户视角测试组件行为。\n' +
          '适合已有 Jest 经验或大型存量 React 项目的团队，迁移成本低。',
      },
    ],
  },
};

// Dimension routing per project type (question count picks the first N).
const ORDER_BY_TYPE = {
  web: ['frontend', 'backend', 'database', 'deployment', 'state'],
  fullstack: ['frontend', 'backend', 'database', 'deployment', 'state'],
  mobile: ['mobile', 'backend', 'database', 'deployment'],
  desktop: ['mobile', 'backend', 'database', 'deployment'],
  ai: ['ai', 'backend', 'database', 'deployment'],
  cli: ['backend', 'testing', 'deployment'],
  other: ['frontend', 'backend', 'database', 'deployment'],
};

/**
 * Decide how many questions to ask: 2..5.
 *   - more complex project      -> more questions
 *   - more detailed prompt      -> fewer questions (the user already told us more)
 */
function questionCount(complexity, promptDetail) {
  return clamp(Math.round((complexity + (5 - promptDetail)) / 2), 2, 5);
}

/**
 * Build the survey question batch for `userQuestions.ask()`.
 * @returns {Array<{id: string, header: string, question: string, survey: string, options: Array}>}
 */
function buildSurvey(projectDescription, projectType, complexity, promptDetail) {
  const order = ORDER_BY_TYPE[projectType] || ORDER_BY_TYPE.other;
  const count = questionCount(complexity, promptDetail);
  const questions = order
    .slice(0, count)
    .map((key) => BANK[key])
    .filter(Boolean)
    .map((dim) => ({
      id: `stack_${dim.id}`,
      header: dim.header,
      question: dim.question,
      survey: SURVEY_MARKER,
      options: dim.options.map((option) => ({
        label: option.label,
        description: option.description,
        details: option.details,
      })),
    }));
  if (questions.length > 0) {
    questions[0].surveyTitle = '项目技术选型';
    const summary = String(projectDescription || '').trim();
    if (summary.length > 0) {
      questions[0].detail = summary.length > 240 ? `${summary.slice(0, 240)}…` : summary;
    }
  }
  return questions;
}

// Test hook (harmless in production): exposes internals when the sandbox
// defines __DSH_TECH_STACK_TEST__. Kept BEFORE the return so it is reachable.
if (typeof __DSH_TECH_STACK_TEST__ !== 'undefined') {
  globalThis.__dssTest = { BANK, ORDER_BY_TYPE, buildSurvey, questionCount };
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------
return {
  inject: ['userQuestions'],
  apply(ctx) {
    const tool = harness.defineTool({
      name: 'design_stack_survey',
      description:
        '当用户要求「设计 / 搭建 / 开发 / 实现一个项目」且没有给出完整的技术栈时调用。' +
        '本工具会结合项目复杂度和提示词详细度自动生成 2-5 个技术选型问题（每题恰好 3 个技术栈选项，' +
        '选项包含适用场景，悬停可查看每个技术栈的详细介绍），在界面中呈现给用户，' +
        '等待用户提交全部答案后返回所选技术栈，供你继续完成设计。' +
        '若用户已经明确指定了完整技术栈，则不要调用本工具。',
      parameters: {
        project_description: {
          type: 'string',
          required: true,
          description: '用户想要设计的项目的描述（原样转述或精简概括，将展示在问卷开头）。',
        },
        project_type: {
          type: 'string',
          enum: ['web', 'fullstack', 'mobile', 'desktop', 'ai', 'cli', 'other'],
          required: false,
          description: '项目类型，决定提问哪些技术维度。默认 other（由模型自行判断）。',
        },
        complexity: {
          type: 'integer',
          required: false,
          description: '项目复杂程度：1（很简单）到 5（非常复杂），默认 3。影响问题数量。',
        },
        prompt_detail: {
          type: 'integer',
          required: false,
          description: '用户提示词的详细程度：1（只有一句话）到 3（细节较多但缺技术栈），默认 2。影响问题数量。',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            answers: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  question: { type: 'string', required: true },
                  selected: { type: 'array', required: true, items: { type: 'string' } },
                  custom: { type: 'string' },
                },
              },
            },
          },
        },
        render: (args, value) => {
          const lines = ['技术选型结果（用户已提交）：'];
          for (const answer of value.answers || []) {
            const label = Array.isArray(answer.selected) && answer.selected.length > 0
              ? answer.selected.join('、')
              : (answer.custom || '（未选择）');
            lines.push(`- ${answer.question || answer.id} → ${label}`);
          }
          return [{ type: 'text', text: lines.join('\n') }];
        },
      },
      async execute(args, exec) {
        const questions = buildSurvey(
          String(args.project_description || ''),
          args.project_type || 'other',
          clamp(Number(args.complexity) || 3, 1, 5),
          clamp(Number(args.prompt_detail) || 2, 1, 3),
        );
        const result = await ctx.userQuestions.ask({
          questions,
          ...(exec && exec.agent ? { agent: exec.agent } : {}),
          signal: exec && exec.signal,
        });
        const byId = {};
        for (const question of questions) byId[question.id] = question;
        return {
          answers: result.answers.map((answer) => ({
            id: answer.id,
            question: (byId[answer.id] || {}).question || answer.id,
            selected: Array.isArray(answer.selected) ? answer.selected.slice() : [],
            ...(answer.custom !== undefined && answer.custom !== '' ? { custom: answer.custom } : {}),
          })),
        };
      },
    });
    ctx.effect(() => harness.registerTool(ctx, tool), 'tech-stack-survey: register design_stack_survey tool');
  },
};
