# ScriptsReader — 剧本阅读器 需求文档

> **版本**：v0.1 Draft  
> **日期**：2026-04-12  
> **目标用户**：游戏编剧 / 对白设计师——通过研读经典剧集对白来提升自身写作能力

---

## 1. 产品定位

一款面向**游戏对白创作者**的剧本精读工具。核心价值：

1. **获取** — 在线抓取 + 手动导入，统一管理多部剧的对白脚本  
2. **精读** — 中英双语对照阅读，角色过滤，对白结构一目了然  
3. **标注** — 高亮、笔记、收藏，沉淀个人"对白灵感库"  
4. **分析** — 角色台词统计、节奏分析、高频词云，量化学习  
5. **训练** — 遮词补写、仿写练习，从阅读转化为写作能力  

---

## 2. 数据模型

### 2.1 剧本层级

```
Show（剧集）
  └─ Season（季）
       └─ Episode（集）
            └─ DialogueLine（单条对白）
                 ├─ speaker: str        # 角色名
                 ├─ text: str           # 原文
                 ├─ stage_direction: str # 舞台/场景指示 [SIGHS] 等
                 └─ line_index: int     # 在该集中的序号
```

### 2.2 用户数据

| 实体 | 字段 |
|------|------|
| **Highlight** | episode_id, start_line, end_line, color, created_at |
| **Note** | episode_id, line_index, content, created_at |
| **Collection** | name, tags[], items[{episode_id, start_line, end_line, note}] |
| **ReadingProgress** | episode_id, last_line, updated_at |
| **Translation** | episode_id, line_index, source_lang, target_lang, translated_text, provider |

---

## 3. 功能模块

### 3.1 剧本获取

#### 3.1.1 在线下载（内置爬虫）

- 集成现有 `download_all_scripts.py` 的爬虫逻辑（来源：Springfield! Springfield!）
- UI 交互流程：
  1. 搜索框输入剧名 → 显示匹配结果列表
  2. 选择剧集 → 显示季/集列表，可勾选批量下载
  3. 后台队列下载，显示进度条（已完成 / 总集数）
  4. 下载完成后自动解析入库
- 断点续传：中断后重新下载自动跳过已有集数
- 下载速率控制：可配置请求间隔（默认 1.5–3s），避免被封

#### 3.1.2 手动导入

支持格式：

| 格式 | 说明 |
|------|------|
| `.md` | 直接读取，兼容现有 `poi_scripts_md/` 格式 |
| `.txt` | 纯文本剧本，按空行分段，自动识别 `NAME:` 角色行 |
| `.srt` / `.ass` | 字幕文件，提取时间轴 + 对白文本 |
| `.json` | 结构化导入 `{speaker, text, direction}[]` |
| `.fountain` | 编剧行业标准格式（Fountain markup） |

导入流程：
1. 拖拽文件 / 选择文件夹批量导入
2. 预览解析结果（角色名列表、对白行数）
3. 填写元数据：剧名、季号、集号（可自动从文件名推断）
4. 确认导入

#### 3.1.3 统一存储

- 所有剧本解析后存入 SQLite 数据库（`scriptsreader.db`）
- 原始文件保留在 `scripts/` 目录作为备份
- 数据库内按 Show → Season → Episode → DialogueLine 层级索引

---

### 3.2 阅读器核心

#### 3.2.1 导航

- **左侧边栏**：树状结构 `剧名 > 季 > 集`
  - 显示阅读状态图标（未读 / 阅读中 / 已读）
  - 支持按剧名搜索过滤
- **集内目录**：按场景分段跳转（通过 `[场景指示]` 自动识别章节锚点）
- **阅读进度自动记忆**：关闭后重新打开自动定位到上次位置

#### 3.2.2 对白展示（核心）

默认排版模式——对话流式布局：

```
┌──────────────────────────────────────────────┐
│  [SCENE: LIBRARY - NIGHT]                    │
│                                              │
│  FINCH                                       │
│  ┊ I know exactly everything about you,      │
│  ┊ Mr. Reese.                                │
│                                              │
│  REESE                                       │
│  ┊ You don't know anything about me.         │
│                                              │
│  FINCH                                       │
│  ┊ I know about the work you used to do      │
│  ┊ for the government. I know about the      │
│  ┊ doubts you came to have about that work.  │
└──────────────────────────────────────────────┘
```

- **角色名**突出显示（颜色区分不同角色，可自定义配色）
- **舞台指示**（`[SIGHS]`, `[GUNSHOT]`）用灰色斜体显示
- **场景标题**（`[SCENE: ...]`）作为分隔卡片
- 每行对白可独立 hover 操作（高亮、笔记、收藏、翻译）

#### 3.2.3 角色过滤

- 侧边面板列出当前集所有出场角色
- 勾选角色可高亮 / 只显示该角色台词
- 支持多角色对话追踪：如只看 Finch ↔ Reese 之间的对话
- **跨集角色追踪**：选择一个角色，按时间线浏览其全剧所有台词

---

### 3.3 翻译系统

#### 3.3.1 翻译方式

| 模式 | 说明 |
|------|------|
| **划词翻译** | 选中任意文本，弹出翻译浮窗 |
| **逐行翻译** | 对白行右侧显示翻译结果，鼠标悬停展开 |
| **全集翻译** | 一键翻译整集，结果缓存到数据库，下次直接读取 |
| **双语对照** | 原文/译文上下并排或左右分栏显示 |

#### 3.3.2 翻译引擎（可切换）

| 引擎 | 优先级 | 说明 |
|------|--------|------|
| DeepL Free API | 1 | 每月 50 万字符免费，英译中质量最佳 |
| 有道智云 | 2 | 国内稳定，有免费额度 |
| Google Translate | 3 | 覆盖语种最广 |
| LibreTranslate | 4 | 本地离线部署，无需 API Key |

- 用户在设置页填入 API Key，选择默认引擎
- 翻译结果持久化缓存（同一句话不重复调用 API）
- 支持用户手动修正译文并标记为"人工校对"

#### 3.3.3 对白语境翻译增强

- 翻译请求附带上下文（前后 2-3 句对白），提升翻译准确性
- 对角色名、惯用语等建立术语表，保持翻译一致性
- 例：`"The Machine"` 始终翻译为 `"机器"` 而非 `"那台机器"`

---

### 3.4 对白学习标注系统（重点）

#### 3.4.1 高亮

- 支持多色高亮（至少 5 种颜色）
- 每种颜色自定义含义，推荐预设：
  - 🟡 黄色 — 精彩对白 / 金句
  - 🔴 红色 — 冲突升级 / 转折点
  - 🟢 绿色 — 人物塑造 / 性格表达
  - 🔵 蓝色 — 信息暗示 / 伏笔
  - 🟣 紫色 — 情绪渲染 / 氛围营造

#### 3.4.2 笔记

- 对任意对白行 / 段落添加笔记
- 笔记支持 Markdown 格式
- 笔记内容示例："这里 Finch 用陈述句代替命令句，既表达了请求又保持了尊严感——游戏中NPC委托任务可参考这种语气"

#### 3.4.3 对白收藏库

- 一键收藏对白片段（单行 / 多行 / 整段场景）
- 收藏时附带：
  - 来源信息（剧名、季、集、行号）
  - 标签（多选）
  - 简短批注
- **预设标签体系**（用户可扩展）：

| 分类 | 标签 |
|------|------|
| 写作技巧 | `潜台词` `反问` `沉默` `打断` `独白` `画外音` |
| 叙事功能 | `人物塑造` `冲突升级` `信息暴露` `伏笔` `主题呼应` `悬念制造` |
| 情绪类型 | `幽默` `讽刺` `威胁` `恳求` `告白` `质问` `回忆` |
| 场景类型 | `初次相遇` `对峙` `别离` `审讯` `密谋` `日常闲聊` |
| 游戏适用 | `NPC委托` `Boss对话` `队友闲聊` `剧情过场` `选择分支` `内心独白` |

#### 3.4.4 收藏库浏览与导出

- 按标签 / 剧名 / 角色 筛选收藏
- 列表 / 卡片两种视图
- 导出格式：
  - **Markdown** — 按标签分组的灵感手册
  - **JSON** — 结构化数据，可导入游戏对白编辑器
  - **CSV** — 电子表格分析

---

### 3.5 对白分析（数据驱动学习）

#### 3.5.1 角色台词统计

- 每集各角色台词行数 / 字数柱状图
- 全剧维度：角色戏份随剧集的变化趋势折线图
- 应用：理解编剧如何分配角色存在感

#### 3.5.2 对白节奏分析

- **单轮长度统计**：每句对白的词数分布
  - 短句密集区 = 紧张冲突
  - 长句密集区 = 独白/说教/铺垫
- **对话回合速度**：A→B→A→B 的交替频率
  - 快节奏乒乓对话 vs 单方面长篇输出
- 可视化为热力图/波形图，一眼看出节奏变化

#### 3.5.3 角色语言风格分析

- 高频用词 / 词云（角色级别）
- 平均句长对比
- 口头禅检测（某角色重复出现 ≥3 次的短语）
- 应用："Finch 倾向用完整长句 + 正式措辞，Reese 用短句 + 口语化"——直接可借鉴到游戏角色设计

#### 3.5.4 场景结构分析

- 通过 `[场景指示]` 统计每集场景数量
- 场景平均时长（按对白行数估算）
- 场景切换热力图

---

### 3.6 对白训练模式

#### 3.6.1 补白练习

- 随机抽取一段多角色对话
- 遮住其中一位角色的台词，用户尝试补写
- 完成后与原文对比，用户自评

#### 3.6.2 仿写练习

- 给出一段对白 + 场景描述
- 要求用户用不同角色性格重写同一段对话
- 参考原文对照

#### 3.6.3 对白分析练习

- 随机展示一段对白
- 提问引导：
  - "这段对白的潜台词是什么？"
  - "角色说这句话的真实目的是？"
  - "如果移到游戏场景中，你会怎么改写？"
- 用户写下分析笔记，存入笔记库

---

### 3.7 全文搜索

- 跨**全部剧集**搜索关键词
- 搜索维度：
  - 对白内容全文
  - 角色名
  - 舞台指示
  - 用户笔记 / 收藏
- 支持正则表达式搜索
- 搜索结果显示上下文（前后各 2 行对白），点击跳转到原文位置

---

## 4. 技术架构

```
scriptsreader/
├── backend/                  # FastAPI 后端
│   ├── main.py               # 应用入口
│   ├── models.py             # SQLAlchemy 数据模型
│   ├── database.py           # SQLite 连接 & 初始化
│   ├── routers/
│   │   ├── scripts.py        # 剧本 CRUD & 导航
│   │   ├── download.py       # 在线下载（集成爬虫逻辑）
│   │   ├── import_.py        # 手动导入 & 解析
│   │   ├── translate.py      # 翻译代理
│   │   ├── annotations.py    # 高亮 / 笔记 / 收藏
│   │   ├── analysis.py       # 数据分析接口
│   │   ├── search.py         # 全文搜索
│   │   └── training.py       # 训练模式
│   ├── services/
│   │   ├── parser.py         # 多格式解析器 (md/txt/srt/ass/json/fountain)
│   │   ├── downloader.py     # 爬虫引擎（复用现有逻辑）
│   │   └── translator.py     # 翻译引擎适配器
│   └── scriptsreader.db      # SQLite 数据库
│
├── frontend/                 # Vue 3 + TailwindCSS
│   ├── views/
│   │   ├── ReaderView.vue    # 阅读器主界面
│   │   ├── LibraryView.vue   # 剧本库 / 导航
│   │   ├── CollectionView.vue# 收藏库
│   │   ├── AnalysisView.vue  # 数据分析面板
│   │   ├── TrainingView.vue  # 训练模式
│   │   ├── DownloadView.vue  # 下载管理
│   │   └── SettingsView.vue  # 设置（翻译Key等）
│   └── components/
│       ├── DialogueLine.vue  # 单条对白组件
│       ├── TranslationPopup.vue
│       ├── HighlightToolbar.vue
│       └── CharacterFilter.vue
│
└── data/                     # 原始文件备份
    ├── poi_scripts_md/       # → 软链接或复制
    └── imports/              # 用户手动导入的原始文件
```

### 4.1 技术选型

| 层 | 技术 | 说明 |
|----|------|------|
| 后端 | Python 3.11 + FastAPI | 复用现有爬虫代码，生态统一 |
| 数据库 | SQLite + FTS5 | 单文件部署，FTS5 提供全文搜索 |
| ORM | SQLAlchemy 2.0 | 类型安全的数据模型 |
| 前端 | Vue 3 + Vite | 响应式 UI，组件化开发 |
| 样式 | TailwindCSS | 快速搭建阅读器风格界面 |
| 可视化 | ECharts | 柱状图/词云/热力图 |
| 翻译 | httpx (async) | 异步调用外部翻译 API |

### 4.2 数据库 Schema（核心表）

```sql
-- 剧集
CREATE TABLE shows (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    source TEXT,              -- 'springfield' / 'manual_import'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 季
CREATE TABLE seasons (
    id INTEGER PRIMARY KEY,
    show_id INTEGER REFERENCES shows(id),
    season_number INTEGER NOT NULL
);

-- 集
CREATE TABLE episodes (
    id INTEGER PRIMARY KEY,
    season_id INTEGER REFERENCES seasons(id),
    episode_code TEXT,        -- 'S01E01'
    title TEXT NOT NULL,
    source_url TEXT,
    file_path TEXT,           -- 原始文件路径
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 对白行（核心）
CREATE TABLE dialogue_lines (
    id INTEGER PRIMARY KEY,
    episode_id INTEGER REFERENCES episodes(id),
    line_index INTEGER NOT NULL,
    speaker TEXT,             -- 角色名，NULL 表示旁白/场景指示
    text TEXT NOT NULL,
    is_direction BOOLEAN DEFAULT FALSE,  -- 是否为舞台指示
    UNIQUE(episode_id, line_index)
);

-- FTS5 全文搜索虚拟表
CREATE VIRTUAL TABLE dialogue_fts USING fts5(
    speaker, text, content=dialogue_lines, content_rowid=id
);

-- 翻译缓存
CREATE TABLE translations (
    id INTEGER PRIMARY KEY,
    line_id INTEGER REFERENCES dialogue_lines(id),
    target_lang TEXT DEFAULT 'zh',
    translated_text TEXT NOT NULL,
    provider TEXT,            -- 'deepl' / 'youdao' / 'google' / 'libre'
    is_manual BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(line_id, target_lang)
);

-- 高亮
CREATE TABLE highlights (
    id INTEGER PRIMARY KEY,
    episode_id INTEGER REFERENCES episodes(id),
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    color TEXT NOT NULL,       -- 'yellow' / 'red' / 'green' / 'blue' / 'purple'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 笔记
CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    episode_id INTEGER REFERENCES episodes(id),
    line_index INTEGER,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 收藏
CREATE TABLE collections (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE collection_items (
    id INTEGER PRIMARY KEY,
    collection_id INTEGER REFERENCES collections(id),
    episode_id INTEGER REFERENCES episodes(id),
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tags (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    category TEXT              -- '写作技巧' / '叙事功能' / '情绪类型' / '场景类型' / '游戏适用'
);

CREATE TABLE collection_item_tags (
    item_id INTEGER REFERENCES collection_items(id),
    tag_id INTEGER REFERENCES tags(id),
    PRIMARY KEY (item_id, tag_id)
);

-- 阅读进度
CREATE TABLE reading_progress (
    episode_id INTEGER PRIMARY KEY REFERENCES episodes(id),
    last_line INTEGER NOT NULL,
    status TEXT DEFAULT 'reading', -- 'unread' / 'reading' / 'done'
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. 优先级排期

### P0 — MVP（可用）

- [ ] 剧本导入（md / txt 解析入库）
- [ ] 阅读器基础界面（导航树 + 对白流式展示 + 角色颜色区分）
- [ ] 角色过滤
- [ ] 划词翻译（接入 DeepL）
- [ ] 全文搜索

### P1 — 核心学习功能

- [ ] 在线下载（集成爬虫 + 搜索 + 批量下载 UI）
- [ ] 多色高亮 + 笔记
- [ ] 对白收藏库 + 标签体系
- [ ] 双语对照模式
- [ ] 阅读进度记忆

### P2 — 分析增强

- [ ] 角色台词统计图表
- [ ] 对白节奏分析
- [ ] 角色语言风格 / 词云
- [ ] 收藏导出（MD / JSON / CSV）

### P3 — 训练 & 进阶

- [ ] 补白练习模式
- [ ] 仿写练习
- [ ] srt/ass/fountain 格式导入
- [ ] 翻译术语表
- [ ] 场景结构分析

---

## 6. 非功能需求

| 项目 | 要求 |
|------|------|
| **部署** | 本地单机运行，`python run.py` 一键启动前后端 |
| **性能** | 单集 2000+ 行对白秒级加载；全文搜索 < 500ms |
| **存储** | 5 季 POI（~115 集）数据库预计 < 20MB |
| **离线** | 除翻译 API 外全部功能离线可用 |
| **可扩展** | 支持多剧共存，不限于 Person of Interest |
