# pi-st-preset 开发总结

## 已完成功能

### P0 核心装配 ✅
- 类型定义和 schema 验证
- 预设文件加载和缓存
- 会话状态管理
- 核心装配算法：
  - 宏展开（支持 {{user}}, {{model}}, {{date}}, {{time}}, {{getvar}}, {{setvar}}, {{random}} 等）
  - 深度注入（带工具调用配对规则）
  - 系统消息处理（squash 合并、mid-convo system fallback）
  - 标记块支持（chatHistory, piPrompt, section）
- 命令实现：
  - `/preset` - 交互式选择
  - `/preset <name>` - 激活预设
  - `/preset off` - 关闭预设
  - `/preset list` - 列出所有预设
  - `/preset reload` - 重新加载
  - `/preset preview` - 预览装配结果
- 采样参数支持（temperature, top_p, top_k, frequency_penalty, presence_penalty）
- 启动参数：`pi --st-preset <name>`

### P1 ST 预设导入 ✅
- `/preset import <path> [name]` - 从 SillyTavern JSON 导入
- 自动转换：
  - prompt_order 100001（Chat Completion 实际使用的顺序）
  - 块类型转换（text/marker）
  - 位置转换（relative/depth）
  - 角色转换（model → assistant）
  - 采样参数转换
  - assistant_prefill 处理
  - function_calling 标志处理

## 目录结构

```
pi-st-preset/
├── src/
│   ├── index.ts           (89行)   - 扩展入口
│   ├── types.ts           (119行)  - 类型定义
│   ├── schema.ts          (124行)  - 运行时校验
│   ├── store.ts           (172行)  - 状态管理
│   ├── assemble.ts        (248行)  - 核心装配
│   ├── depth.ts           (125行)  - 深度注入
│   ├── macros.ts          (110行)  - 宏展开
│   ├── sampling.ts        (128行)  - 采样参数
│   ├── commands.ts        (239行)  - 命令实现
│   └── import-st.ts       (224行)  - ST 导入
├── presets/
│   └── coder-cn.json                - 示例预设
├── test/
│   └── assemble.test.ts             - 单元测试
├── package.json
├── README.md
└── .gitignore

总计：约 1578 行核心代码
```

## 预设文件位置

- **全局**：`~/.pi/agent/st-presets/<name>.json`
- **项目**：`<cwd>/.pi/st-presets/<name>.json`（需要项目被信任）

## 安装方式

```bash
# 方式 1：本地安装
pi install ./pi-st-preset

# 方式 2：开发模式
pi -e ./pi-st-preset/src/index.ts

# 方式 3：启动时激活预设
pi --st-preset coder-cn
```

## 示例预设

已包含 `presets/coder-cn.json`：
- 保留 pi 原提示词
- 添加中文回复风格
- 在历史末尾注入深度提醒
- 设置 temperature = 0.3
- 启用 system 消息合并

## 核心设计

### 请求级视图
- 每次请求前重新装配消息列表
- transcript 和 session 文件永远不改
- 切换/关闭预设立即生效且可完全回退

### 装配流程
1. 从 transcript 提取当前系统消息和历史
2. 判断 trigger 类型（user-turn / tool-turn）
3. 过滤启用的块（按 triggers 字段）
4. 展开宏（支持 setvar/getvar 在块之间传值）
5. 分组（before/after/depth）
6. 深度注入（保持工具调用配对）
7. 构建 head 系统消息（合并 system 块，带工具声明）
8. 处理中途 system 消息（转 user 或保持）
9. 返回最终消息列表

### 工具配对规则
深度注入时，如果注入点落在 `assistant.toolCall` 和 `toolResult` 之间，
自动将注入点前移，保证配对完整，避免 provider 拒绝请求。

## 已知限制

1. 与 pi 示例扩展 `examples/extensions/preset.ts` 冲突（会自动警告）
2. compaction 摘要请求不套预设（符合设计）
3. `{{random}}` 宏会破坏前缀缓存（preview 时会提示）
4. 预设内容每次请求都重新发送，不会被 compaction 压缩
5. 深度注入会让注入点之后的缓存失效

## 未实现功能（P2/P3）

### P2 增强
- `/preset toggle <block-id>` - 临时启停某个块
- ST 正则脚本支持（`promptOnly` 类型）
- 旧工具结果改写为占位文字
- 按预算截断历史（只在用户消息边界切）

### P3 TUI 面板
- Prompt Manager 界面
- 块列表、启停、移动、编辑
- 实时预览

## 测试

```bash
# 运行单元测试
npm test

# 或
npx vitest --run
```

## 文档参考

完整设计和实现细节见 [pi/docs/10-预设扩展实现方案.md](../pi/docs/10-预设扩展实现方案.md)

## 验收标准（按文档 §12）

### 单元测试
- [x] 预设关闭时返回 undefined
- [x] 只有 relative 块时正确排序
- [x] chatHistory 在中间时分组正确
- [x] 没有 chatHistory 时历史排在所有块之后
- [x] 深度注入位置正确
- [x] 工具调用配对不被拆开
- [x] 同深度多块按 order、role 排序合并
- [x] 模型不支持中途 system 时转为 user
- [x] 宏展开正确（setvar/getvar 顺序敏感）
- [x] keepTools: false 时不带工具声明

### 端到端（需要 API key）
1. 加载 provider-payload.ts 扩展
2. 激活 coder-cn 预设并对话
3. `/preset preview` 与 `.pi/provider-payload.log` 对照
4. `/tree` 跳转后预设状态回退
5. `/preset off` 后请求体回到原始状态
6. 导入 ST 预设并对话

## 贡献

本扩展严格按照 [pi/docs/10-预设扩展实现方案.md](../pi/docs/10-预设扩展实现方案.md) 实现，
该文档基于 pi 源码 1.5.2 版本逐条核对，所有结论都标注了 `文件:行号`。
