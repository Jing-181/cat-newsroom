# AI 训练计划规范

训练计划接口为 `POST /functions/v1/generate-workout-plan`，接收 `preferences`、`recent_workouts`、`days`、`start_date` 和 `timezone`，返回最多六天的建议动作。近期数据仅取已完成、未删除的最近 12 次训练。

偏好使用 `workout_preferences` 版本 1 对象保存于 `workbench_meta`。计划只作为草稿来源，用户必须确认并自行调整重量、次数和 RPE。

提示词使用力量训练基础原则摘要：渐进超负荷、恢复、复合动作优先、疲劳管理和 RPE 建议；不复制书籍原文，不生成诊断、治疗或极限重量结论。
