# 运动记录指标（第一批）

## 范围与兼容约定

本次按用户授权，允许在 set 上添加必要的可选指标，作为原“不改模型”约束的受控例外。保持 kind、schema_version、原字段含义、localStorage 键、同步协议不变，不迁移历史。定义集中在 `src/lib/workout-metrics.js`。

新组数值留空，不补 0。力量新组的重量/次数也改用空字符串作为未填哨兵；旧记录/旧草稿的零无法分辨是否来自旧哨兵，保守视作显式值，不迁移。采用上次、自动带重量与逐组建议展示仅将 null/undefined/空字符串视作未填，显式零（包括自重）绝不覆盖。录入数值须有限且非负，总步数须整数；设备楼层允许小数。步进按钮的步长只是输入便利，不限制录入精度。未知 JSON 字段在创建继承、采用上次、草稿序列化、历史编辑和保存中保留；新组不继承备注/RPE/RIR。继承另排除已知组身份与生命周期字段：id/set_id/uuid/status/completed/is_completed/done/created_at/updated_at/completed_at/started_at/deleted_at；历史编辑保存原样保留这些字段。未知业务指标深拷贝保留，无法自动识别未知厂商自定义的身份键，后续出现需显式登记，不能靠猜测删除。

## 项目与单位

| exercise_id | 录入指标 | 语义 |
| --- | --- | --- |
| treadmill / outdoor_run / trail_run | duration_min 分、distance_km km | 两者有限且正时派生 min:ss/km，采用记录时长，非移动时间；只展示不持久化 |
| stair_climber | duration_min 分、floors 层、steps 步；可选 machine_level 档、avg_step_rate_spm 步/分 | floors 为设备显示楼层，steps 为总步数；平均步频明确为平均值；档位为本机设置，不是速度，不能跨机比较 |
| bike / elliptical / rowing_machine / incline_walk | duration_min 分、distance_km km | 只记录时长、距离，不显示跑步派生配速 |
| swimming | duration_min 分、距离输入显示米 | 唯一持久化来源仍为 distance_km，500 米输入转换为 0.5km 保存；不新增 distance_m，不计算跑步或100米配速 |
| stretch / badminton | duration_min 分 | 当前最小记录字段 |
| jump_rope | duration_min 分、jump_count 次 | jump_count 为非负整数跳绳次数，区别于力量 reps 与 steps；仅次数正数即有效；旧时长/距离保留 |
| 未知/自定义有氧或恢复 | duration_min 分、distance_km km | 兼容原始记录，不猜测运动语义、不派生配速 |

战绳在现目录的 equipment 是“器械”，原来使用重量/次数形态。本批保持原形态，后续确认单独时间指标方案，避免静默改变历史记录语义。

爬楼楼层、步数、距离相互不换算。历史 distance_km 保留并提供编辑字段，爬楼等非距离项目的输入标签和历史摘要明确为“旧记录距离”；原 pace 原样保留，展示为“原记录配速”，不会被新计算覆盖。其他项目历史距离也不会隐藏或删除。新动作字段由 exercise_id 决定。

爬楼有效组：duration_min / floors / steps 任一正数；历史 distance-only 仍有效。档位或平均步频 alone 不算完成。其他有氧沿用时长或距离判定。空组保存时剔除。

参考：https://www.corehandf.com/products/stairmaster-8gx-1 。官方型号的档位与 SPM 分别定义；不采用其型号范围作为全局约束，不假设用户设备型号。

## 趋势与显示

有氧趋势以最新记录中第一个有效主指标确定整条序列的单位，汇总每次训练已记录组中该指标；缺少该指标的历史点跳过，不补零。每次汇总可能只覆盖已填写的组，不推断漏填部分。禁止分钟与公里混合，距离不再乘 6。时长增加只称“记录变化”，不等同能力提升。没有有氧通用强度 PR、连续能力进步判断或力量容量。历史详情仍列出各组各自指标。

逐组模式与完整编辑页共享定义。字段组合变化时重建；同组合切换更新现有节点，输入时只更新数据、派生文案与草稿，不重建输入节点。

## 验证与入口

新增 `tests/workout-metrics.test.js`：覆盖数值边界、配速秒进位、无爬楼/游泳配速、旧字段/未知字段往返、创建/继承/采用上次/清空判定字段、草稿 JSON、保存过滤、单位隔离、无有氧 PR/容量、按运动字段组合的模板生成。

本地入口：http://localhost:5176/ → 运动健身 → 有氧恢复 → 开始 → 添加跑步机/爬楼机。历史记录详情可编辑、查看动作进展。测试只使用本地模拟对象，不读取或改写真用户数据，不请求云端。

首轮执行结果：`npm run check` 342/342 通过，`npm run build` 通过，`git diff --check` 通过。检查基于当前共享工作树；早先另一代理 motion-candidates 测试失败在最终重跑时已消失，本代理未修改 motion 文件。

## 第二轮质量回归

新增 `tests/workout-metrics-regression.test.js` 覆盖显式零、自重、身份过滤与编辑保存保留、旧距离标签、跨次缺时长但有距离的趋势。当前序列仍采用最新记录选出的单个指标：最新有时长则只比时长，缺时长的点跳过；明确填写时长 0 的点保留为 0；若最新仅有距离则整条改以 km 比较，不在序列内部切换单位。

隔离浏览器入口：`http://localhost:5176/preview/workout-metrics.html`，构建产物同路径。四个合成场景可切换，复用实际 `setRowActive` HTML 表单、`parseSetInput`、`fillPrevious`、`upsertSession`，保存后从内存 JSON 重新读取。输入更新不重建节点；采用上次与重读按钮会重绘，便于检验重读值。这个页面不挂载 WorkoutUI，事件由测试适配器绑定，不冒充实际训练页完整交互验收。只访问独立页面，不需要进入主站。

Vite 新增此入口，并将纯领域/表单依赖独立为 metrics-core chunk，避免原 shared chunk 把 store/sync/auth 副作用带入预览。构建产物静态核查：预览只导入 polyfill 与 core，二者业务文件未含 localStorage/sessionStorage/Supabase/auth 标记。未触碰 motion 文件。

本轮检查：中途全量 351/351 通过；最终共享工作树重跑为 350/351，唯一失败位于另一代理正在修改的 tests/motion-demos.test.js（all 104 catalog identities resolve explicitly, seven calibrated samples enabled），未越界修改。指标相关 tests/workout*.test.js 最终 96/96 通过；build 与 diff-check 通过。开发服务脚本报告 5176 运行中；当前执行通道 curl localhost 返回连接失败，浏览器实际打开需由主线程验证，不能据此称浏览器已通过。

待验收：真实浏览器逐组/总览切换、连续输入焦点、手机五字段可读性、保存后重开及旧历史编辑。本批自动化涵盖领域函数和 HTML 模板，不等于完整浏览器端到端验收。

同步客户端传完整 JSON，理论上可携带新增可选字段；未连接 Supabase、未实测云端策略/往返，不能声称端到端通过。旧客户端可能按 duration/distance 过滤掉仅含 floors/steps 的组，因此不要用旧版本编辑此类记录。

## 第二批最小扩展

本批执行结果：`node --test tests/workout*.test.js` 100/100 通过；构建后 `npm run check` 362/362 通过；`npm run build` 与 `git diff --check` 通过。共享 motion 工作树仍可能继续变化，此结果对应本次执行时点。

游泳输入、逐组步进、上次建议、继承展示、历史摘要、距离趋势统一显示米。所有写入适配回 distance_km，避免双重来源；历史和未知字段不迁移。逐组在同样 duration/distance 字段的跑步与游泳间切换时也更新单位、步长与显示数值；继承只拷贝持久化 km，不重复转换。未增加100米配速，避免本批额外口径。

跳绳新增唯一可选 jump_count（整数次数）。创建、采用上次、继承、清空新组完成判定、草稿 JSON、保存过滤、摘要和同指标趋势共用该定义。显式零保留，次数正数可独立成组，不参与力量容量和通用 PR。旧 distance-only 依然可保存且标“旧记录距离”。旧客户端可能删除仅 jump_count 的组，与 floors/steps 风险相同。

### 第二批时的跑步机阻塞（第三批已补齐）

当前 set 在 UI 中统一称“第 N 组”，仅记录时长和距离；没有恒定设置记录段契约，也没有变速/变坡后拆段入口提示。已有组可能是整场，也可能是片段，无法推断。第二批因此暂缓速度或坡度字段；第三批已在授权下实现以下最小记录段契约。

未来实现前须明确：每一记录段的速度/坡度恒定；变速或变坡拆段或将设置留空；名称使用“本段设定速度 km/h”“本段设定坡度 %”；坡度支持有限负数，不设跨设备统一上下限；设置值不能单独完成记录、不补距离、不用于跨机排名。保持旧记录无设置时的含义，不迁移。

### 战绳兼容方案（未实施）

目录 equipment 仍是“器械”，旧 reps 含义不得重解释成波数或时长。未来可引入明确的时长录入模式，新记录走 duration_min，旧含 reps 的记录继续原样展示编辑；旧记录如果补时间需明确保留两种原值，完成判定与趋势按记录形态分开，不能把次数折成时间或把计时误算力量容量。需要先设计混合形态的编辑/继承/保存规则，不能仅修改 isCardio 分类。

隔离页新增“游泳米输入/km持久化”“跳绳仅次数”场景，仍只复用真实表单和保存纯函数，不代表完整 WorkoutUI 浏览器验证。主线程浏览器 snapshot 仍受 host layout 错误影响，视觉与真实交互待验。

## 第三批：跑步机记录段

最终验证：全部 workout 测试 104/104 通过，构建后全量 check 369/369 通过，build 和 diff-check 通过。新增设置字段对应的旧测试断言已更新。

沿用原 set 存储，不变 kind/schema_version/同步协议。跑步机编辑、逐组完成/新增、总览行、历史行和文本复制称“段”；这个名称只是记录单位，不能据此推断旧记录恒定。混合训练的全局统计仍采用原组计数。

可选字段：
- `treadmill_speed_kmh`：本段设定速度，km/h，有限非负数。
- `treadmill_incline_pct`：本段设定坡度，%，有限数，允许负值表示下坡；不设置跨机器统一上下限。

只有填写设置字段（包含显式零）才表示该字段是本段恒定设置。变速/变坡可以通过“加一段”分开记录，或将相关设置留空。它们不等于全程平均值，不反推距离、平均速度或配速。旧记录无设置字段时，时长/距离/原配速原义保留；不迁移、不补设置。历史文本与复制带“恒定段设置，非全程平均”说明，仅在实际有设置值时显示。

设置-only 不算完成；duration/distance 有效条件不变。新增段可继承上一段设置但清空时长和距离完成字段；显式零不被上次值覆盖。负坡度输入、步进和展示均支持，无 min=0 限制。趋势只选时长/距离等主记录指标，禁止设置指标求和、通用 PR 或跨机排名。

隔离页新增“跑步机恒定记录段/下坡”和“跑步机仅设置（保存剔除）”，同时保留旧跑步记录无设置场景。使用合成数据、真实表单和保存纯函数；未操作真实训练数据，未尝试绕过 browser host layout not ready。完整 WorkoutUI 与视觉仍待验。

战绳本批仅核查：catalog 的 equipment 为器械，现有 createSet、setHasRecord、格式化仍遵循 weight_kg/reps；若直接改为有氧会影响旧组编辑和有效判定，仍按上节双形态兼容方案待设计，未实施。

## 独立质量审查（第三批后）

最终执行结果：workout 相关测试106/106通过；构建后全量check 377/377通过；build与diff-check通过。

隔离页事件审查：select.onchange 同步调用 reset；save 同步调用 upsertSession → JSON 序列化重读 → render，不调用 reset；无 timer、Promise 或异步 reset。reset 仅在脚本初始化、手动重置和场景切换触发。主线程观察到游泳 500 米且保存提示成功，后续读取却回到跑步机初始数据且 saved 为空，这与整页重载相符，但未证实 HMR 为根因，不能直接认定数据错误。

仅隔离页加入诊断 pre：version、loadedAt、随机 pageInstance、scenario/scenarioName、operation、action、exerciseId。复测时先记录 pageInstance/loadedAt，再选 swim 保存，读 saved 和诊断；若实例或加载时间改变，说明期间页面重新执行初始化。诊断不写任何存储；代码稳定后再做浏览器复测。

既有测试已覆盖游泳保存 swimming/0.5km、跳绳 count-only、爬楼 floors-only、跑步机 settings-only 剔除、显式零采用上次保留；未重复堆叠同类测试。新增两项针对审查空白：真实备份 createSnapshot/parse/dataForRestore 与同步 applyPending/applyRealtime 纯函数的完整扩展 JSON 往返；游泳历史详情、文本复制、总览、动作趋势、历史列表、折叠/展开表单上下文传递。楼层不计力量容量亦验证。

只读源码事实：supabase-sync.js 的 syncRecord 对整个 record structuredClone，executeOperation 将完整 operation.record 放入 data；sync-core 接收 row.data 保留嵌套 sets；data-backup 对整份业务模块 JSON 克隆，恢复只选择模块，不过滤 set 字段。未改同步/备份代码，未访问云端，此结论不是服务端/账号端到端验证。

### 最终浏览器隔离复测证据（主线程提供）

功能冻结后，主线程在真实 browser 原 tab 对隔离页完成以下复测，状态均为 **browser-isolated-pass**：

1. **游泳米输入与保存重读**：select swim → 保存 → 读取 DOM `#saved` JSON。确认 `exercise_id: "swimming"`、`duration_min: 12`、`distance_km: 0.5`，且 `unknown_metric.source: "synthetic swimming"` 保留；界面显示 500 米。
2. **爬楼楼层-only 保存**：select stairs，初始空组保存被剔除，符合预期；重新选择 stairs → 在“设备楼层”输入 12.5 → 保存 → 读取 DOM JSON。确认 `exercise_id: "stair_climber"`，sets 为 `[{"duration_min":"","floors":12.5,"steps":"","machine_level":"","avg_step_rate_spm":""}]`，楼层-only 组没有被删除，未填指标仍为空字符串。

以上验证使用内存合成数据、实际表单和保存纯函数，属于浏览器隔离页通过，**不代表完整 WorkoutUI 或云端端到端通过**。此前回到初始数据的现象仍未确证是 HMR，不作为已确认业务 bug。

剩余验收：真实训练页持续输入焦点与键盘稳定性、手机布局和触控、多动作切换（含字段组合与单位变化）、真实训练页草稿/历史编辑完整交互，以及云端同步往返和旧客户端兼容。没有访问或修改真实训练数据。

本次最终交接只更新本文档，不新增实现、不重复运行测试；上方自动测试结果保留原执行时点。文档 stage 由主线程负责，功能保持冻结。

## 图鉴与首页定向展示修复

本轮仅改 ExerciseAtlasView.vue、HomeView.vue、对应测试与本文档，不改 motion、preview、Vite、进度表或数据同步。

- 图鉴 staticHold 显示“静态保持示范”，不显示播放/停止按钮；切换选择清空 playing，静态选项的渲染监听也清空播放状态。
- 参考链接统一为中性“动作参考”，不再将 StrengthLog 链接误标 ACE。
- 图鉴展示层将通用 calibrated 文案映射为“已接入示范 · 待视觉验收”，保留 registry 状态键和统计规则；实力推等专用待复查标签保留。
- 首页本周训练使用 summary.hasStrength，纯有氧只显示训练次数与记录组数，不显示 kg 容量、不混合时长/距离/楼层；自重零负重仍属力量，混合训练标注“力量容量”，只使用既有力量容量计算。不新增样式或 token。

新增 tests/workout-home-atlas-presentation.test.js：执行实际首页 HTML 生成函数，覆盖纯有氧、自重、混合；SSR 渲染实际图鉴模板，验证静态/动态按钮、来源文案与切换状态。3/3 通过，build 与 diff-check 通过；本次共享工作树全量 check 为411/412，唯一失败是 motion-render-contract.test.js 的旧92断言与正在开发的98接入数不一致，本代理未修改该文件。以上为源码/模板自动化验证，非真实浏览器交互验收。未提交、推送或部署。

待办：战绳双形态兼容、设备差异下可比性。
