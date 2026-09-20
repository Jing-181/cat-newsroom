# 训练计划 v1 实现设计（力训三分化 · 本地规则引擎）

> 状态：已实施（2026-09-20），实施计划见 [workout-plan-v1-implementation](./workout-plan-v1-implementation.md)  
> 日期：2026-09-20  
> 关联文档：[训练计划生成原理 v1](./workout-plan-generation-principles.md)

## 1. 背景与目标

现有"生成六天计划"走 AI Edge Function，输出结构不固定、渐进重量由模型估算，无法满足用户对**内容准确性**的要求。本轮改为**本地确定性规则引擎**：生成原理文档与代码一一对应、可审计、可离线、零成本；后续用户反馈规则问题，改文档 + 改代码即可。

目标：

1. 计划 = 2 轮 × 3 天 PPL，6 天，不绑定日期。
2. 点某计划日 → 创建训练草稿（预填动作/组次/建议重量）→ 进入现有编辑器微调 → 保存为正式记录 → 该计划日标记完成。
3. 生成原理文档落盘并版本化。
4. 规则引擎纯函数化，配测试。

## 2. 范围边界

### 2.1 包含

- `js/workout-plan.js` 新增本地规则引擎 `generatePlan(preferences, records)`（纯函数）。
- 计划日完成状态管理（本地存储，绑定计划版本）。
- 计划视图 UI：6 张日卡（轮次、动作列表、建议重量、完成标记）。
- 点日卡建草稿、进编辑器的交互。
- 训练日映射：推日 → `chest`、拉日 → `back`、腿日 → `legs`（复用现有枚举，不动历史统计；计划内标题仍显示"推日·第 1 轮"等）。
- 测试：`tests/workout-plan.test.js`。

### 2.2 不包含

- 不再调用 AI Edge Function 生成计划（函数保留但不用于此入口）。
- 不新增 push/pull/legs 训练日枚举（v1 映射到现有枚举）。
- 不做公斤/磅换算、视频教学、姿态识别。
- 不做休息日智能排期（间隔由用户自定）。

## 3. 数据模型

### 3.1 计划（沿用 `cat-newsroom-workout-plan-v1`）

沿用现有归一化结构，补充：

```js
{
  schema_version: 1,
  kind: "workout_plan",
  generated_at: "ISO",
  source: "local_rules",        // 标识本地规则引擎
  goal: "hypertrophy",
  split: "ppl_3day",
  rounds: 2,
  days: [
    {
      day_index: 1,
      round: 1,
      split_day: "push",        // push | pull | legs
      training_day: "chest",    // 记录映射
      title: "推日 · 第 1 轮",
      focus: "胸 + 前束 + 三头",
      exercises: [
        { exercise_id: "barbell_bench_press", name: "杠铃卧推", order: 1, sets: 4, reps: "8-12", rest_seconds: 120, weight_kg: 55, intensity_hint: "RPE 7-8", rationale: "" }
      ],
      notes: ""
    }
  ]
}
```

- `weight_kg`：渐进超负荷计算出的建议值；无历史时为 `null`（用户现场填）。

### 3.2 完成进度（新存储键 `cat-newsroom-workout-plan-progress-v1`）

```js
{
  plan_generated_at: "与计划的 generated_at 一致",
  days: { "1": { session_id: "workout-xxx", date: "2026-09-20", saved_at: "ISO" }, /* ... */ }
}
```

- 计划重新生成后，`plan_generated_at` 不匹配时进度视为无效，不展示。
- 点击已完成日卡：弹窗提供"查看记录 / 重新练一次"。

## 4. 规则引擎设计（`WorkoutPlan.generatePlan`）

```js
generatePlan({ preferences, records }) -> plan
```

步骤：

1. **建结构**：生成 6 个日模板（2 轮 × PPL），确定 title/focus/training_day 映射。
2. **建部位池**：从 `WorkoutCatalog.exercises` 按规则筛出推/拉/腿三池（复合列表 + 孤立列表，各自有序）。
3. **选动作**：每天 4 复合 + 2 孤立；第 2 轮复合沿用第 1 轮选择，孤立从同池选 1~2 个不同动作（循环取下一个，避开第 1 轮已选）。
4. **算重量**：对每个动作调用渐进超负荷查询（见原理文档第 4 节），基于 `records` 中该动作最近一次已完成训练。
5. **组次填充**：按复合/孤立套用组次规则。

关键点：`generatePlan` 不依赖 DOM / localStorage，可单测。

## 5. 交互流程

1. 运动页 idle 态：有已保存且进度有效的计划时，展示计划概览入口（"查看计划"按钮高亮或卡片提示）。
2. 点"生成六天计划"：改调本地 `WorkoutPlan.generatePlan`（不再请求网络）；已有计划时仍先确认覆盖；覆盖后清除旧进度。
3. 点"查看计划"：弹窗/内嵌展示 6 张日卡：
   - 轮次 + 名称（推日 · 第 1 轮）、动作列表（名称、组×次、建议重量、RPE、休息）。
   - 已完成日卡显示"✓ 已完成 09-20"，提供"查看记录"。
4. 点未完成日卡 → 创建草稿：
   - `Workout.createSession(mappedDay, today)` 后，把该日计划动作逐个 `addExercise` 加入，组数/次数/建议重量（或上次参数）带入。
   - 直接进入现有编辑器（`session` 状态），用户微调后"完成训练"保存为 `workout_session`。
   - 保存成功后写入进度 `days[day_index] = { session_id, date, saved_at }`。
5. 点已完成日卡 → 弹窗"查看记录 / 重新练一次"（重新练则新建草稿并允许覆盖进度）。

## 6. 文件落点

| 文件 | 变更 |
| --- | --- |
| `js/workout-plan.js` | 新增 `generatePlan`、动作池、渐进超负荷、进度读写（`loadProgress/saveProgress`） |
| `js/workout-view.js` | 新增计划日卡视图 `planViewHtml(plan, progress)` |
| `js/workout-ui.js` | "生成计划"改本地引擎；"查看计划"渲染日卡；点日卡建草稿/查看记录/重练事件 |
| `js/workout.js` | 若需要：暴露按计划日生成草稿的辅助函数（或由 workout-ui 组合现有 API） |
| `tests/workout-plan.test.js` | 结构（6 天 / PPL / 2 轮）、动作数量与替换、渐进超负荷三分支、进度读写、无历史留空 |
| `docs/workout-plan-generation-principles.md` | 已产出（v1） |

## 7. 验收标准

- 生成计划无需网络，结果确定：同输入必同输出。
- 6 天 = 2 轮 ×（推/拉/腿），第 2 轮复合动作与第 1 轮相同、孤立动作有替换。
- 建议重量规则三态正确（完成且 RPE≤8 → +2.5kg；未完成/RPE≥9 → 维持；无历史 → 空）。
- 点日卡建草稿：动作/组次/建议重量正确带入，日期默认今天，可进编辑器微调并保存。
- 保存后日卡标记完成，重新生成计划后旧进度不再显示。
- `npm test` 通过（新增用例不破坏既有测试）。

## 8. 待确认假设

- 动作池顺序与"孤立替换取下一个"采用目录中定义顺序的循环取法，先按此实现。
- 下肢动作同样 2.5kg 步进（与重量步进器一致）。
- 点日卡建草稿后，草稿保存在现有草稿键（`cat-newsroom-workout-draft-v1`），与手动"开始训练"草稿互斥。
