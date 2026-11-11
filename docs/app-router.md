# 应用路由与移动训练状态栏 · 2.20.0

实现分支feat/app-router，基线main 13fdd6e；用户已明确授权作为2.20.0提交合并main并部署，发布执行结果以CI与线上核验记录为准。仅新增vue-router4.6.4，保留Vue3/Vite结构。保护.artifacts和独立SVG未纳入。

## 地址与导航

URL为单一导航事实源；旧sessionStorage视图键仍写作兼容记忆，但不读取覆盖显式URL。根路径#/重定向#/home，未知路径显示“页面不存在”并提供首页入口，不静默伪装成首页。

命名路由home/insight/todo/checkin/read/sport/money/note/hot/settings/exerciseAtlas，对应#/home、#/insight、#/todo、#/checkin、#/read、#/sport、#/money、#/note、#/hot、#/settings、#/exercises/:exerciseId?。

例：
- http://localhost:5176/#/sport
- http://localhost:5176/#/exercises/pull_up
- http://localhost:5176/#/exercises?q=肩&equipment=哑铃
- 发布地址 https://jing-181.github.io/cat-newsroom/#/exercises/barbell_squat

所有视图采用动态import懒加载，meta标题及document.title跟随页面，详情标题使用实际catalog名称。图鉴未知ID保留原地址并展示不存在提示，不换成其他动作；关闭详情保留筛选query。筛选使用replace避免每次键入生成后退记录，选择详情使用push，返回可恢复列表与筛选。q/equipment/status不写localStorage。

App的view只由route.meta.module派生；侧栏、移动底栏与业务@navigate事件均router.push，侧栏href支持复制/新标签。路由fullPath变化统一关闭抽屉、撤销训练全屏、写兼容记忆，回退前进同样执行。模块key用于卸载，图鉴内部query/ID变化保持组件而watch清理旧播放器；训练离开仍SportView.onBeforeUnmount→WorkoutUI.destroy，草稿沿原存储恢复。未给编辑弹窗增加路由，未改变业务模型或同步数据协议。

## GitHub Pages

使用createWebHashHistory，Vite BASE_URL当前为./，先根据实际文档URL解析成pathname再交history，支持/cat-newsroom/和开发根目录。hash不会发给服务器，不需要404跳转hack。旧workbench与根跳转壳保留search+hash，防止旧书签或认证参数丢失。

以后改createWebHistory的条件：托管服务器能为未知非资产路径返回同一index.html、部署base明确、验证直达/刷新/资源路径及认证redirect allowlist。当前Pages不满足服务器rewrite控制，不做history模式。

## 认证安全顺序

现有Supabase SDK2.49.8 createClient默认detectSessionInUrl；原main先挂载UI再initSupabase。现在只有URL含原始access_token/refresh_token/error或code参数才进入回调门；普通#/sport不等待认证网络，正常router ready后挂载再启动原同步。

回调期间调用initSupabase({authCallback:true,signal,callbackKeys})只准备认证：SDK initialize消费结果，再getSession确认非匿名会话；这时不注册业务认证监听、不赋业务currentUser、不markRealAccount、不setupRealtime。PKCE code必须被SDK消耗；implicit query中的token可能被SDK保留，不能把其残留误判为失败。门控在超时前接受准备结果后，先清理URL，再调用同步activate完成业务监听/账号归属/Realtime激活，最后安装router。code回调使用PKCE flowType；缺本设备verifier不会拿旧会话冒充成功。默认应用仍是现有密码/匿名认证，未加入OAuth发起或凭据设置。SDK处理隐式和PKCE支持按其initialize源码核对；真实服务回调未测试。

15秒超时/失败：不安装router、不清除回调URL、不显示或打印原始回调，只显示通用重试按钮。AbortSignal与初始化代次使准备结果失去激活资格，迟到SDK成功也不注册业务监听/Realtime、不写业务记录或账号归属；回调异常不进入普通存储修复逻辑。SDK自己的认证session持久化可能仍发生，不能可靠取消SDK内部请求，提示已明确区分“业务记录未同步”和“登录会话可能已保存”。普通登录恢复/匿名访客/重连仍走原业务初始化，并增加代次检查避免旧初始化覆盖新结果。错误回调可重新发起登录，不宣称刷新能修复过期链接。回调返回默认首页，暂不支持自定义returnTo（避免未校验跳转）。恢复密码专用UI不是本任务新增内容。

完整清理清单AUTH_CALLBACK_KEYS仅用于成功消费后的query清理与激活残留检查，包含code/access_token/refresh_token/provider_token/provider_refresh_token/token_type/expires_in/expires_at/type/error/error_description/error_code；不作为逐键回调检测条件。窄识别条件是query或非路由原始fragment中的code及各类token；原始fragment中的error/error_description沿Supabase implicit错误约定识别。普通query的error只有在值为标准OAuth错误且同时携带error_description或error_code时才视为结构化回调。单独type/expires_at/expires_in/token_type/error_code/error_description，以及普通?error或#/sport?error不会触发认证等待或清理。成功清理保留lang等无关query，原始回调hash全部替换为#/；不记录任何实际凭据。回调允许缺失设备PKCE verifier失败而不把旧会话算成功。

路由加载失败显示通用刷新/重试消息，不记录完整URL；SDK回调状态不进入route meta/trace。真实implicit/PKCE、provider allowlist和失效链接需隔离账号验收。

## 手机focus-setbar

根因：菜单flex-shrink0（固定10ch组序+标签）与计时min13ch均不可缩，进度flex1/min0/overflow hidden被挤没。≤820及粗指针≤1024改为两行grid：第一行组操作+计时，第二行全宽进度、点允许换行且不挤成零宽，菜单44px最小点击高。长标签可合理分行，不缩字号。移动训练容器允许纵向滚动，字段行/主按钮不压扁，输入scroll-margin帮助键盘场景。未改数值和指标模型。

设计demo加12段/123:59样例，使用真实CSS。待浏览器320/375/390/414/820及键盘弹出验收，组合含力量显式0、跑步机、爬楼五指标、游泳与长计时。本轮没有真实移动视口截图，不将CSS结构测试称为布局通过。

## 验证与限制

认证独立审核第二轮修复后：回调识别与清理范围分离；新增普通?type=report#/sport及单独expires/token_type/error的离线保持测试。最新 `npm run check` **461/461通过，0失败/0跳过**；`npm run build` **通过，841ms**。此前460/460与905ms为上一轮结果；`git diff --check`通过。构建保留既有Vite CJS API弃用提示。`src/public/js/supabase-sync.js`及两个workbench副本为prebuild从根源码自动拷贝生成，未手改。

新增tests/route-auth-gate.test.js执行真实经典脚本的initSupabase/业务认证监听/setupRealtime函数（SDK与业务写入边界用合成桩）：覆盖query implicit消费后全清理且无关query保留；超时后SDK成功并触发认证事件，业务监听数/Realtime channel/业务写入均为0；未清理URL或已abort准备结果不得activate；门后成功正常订阅并接收模拟Realtime业务事件；普通已有会话初始化仍激活。测试不是云端真实认证验收。

自动测试：Vue Router真实memory history执行11命名路由/直达/未知/详情/回退前进/query保留、相对base解析；回调普通离线不调用初始化/成功失败超时/参数清理；旧入口保留回调，图鉴清理；原视图测试改为URL派生与懒加载契约。状态栏测试覆盖真实模板与CSS规则，不替代浏览器排版。

浏览器工具：本会话start成功，navigate localhost后报Browser view layout did not become ready；未循环重试、未绕路用其他浏览器。直达刷新/实际点击/移动导航/真实回退/登录回调和键盘仍未验证，交主线程独立审查。

npm audit当前2个high：既有vite6.4.3和source-map-js（构建链），非vue-router通报；未自动audit fix扩大升级。开发服务不宜暴露不可信网络，建议另批处理构建工具升级。

官方依据：https://router.vuejs.org/guide/essentials/history-mode.html 、https://router.vuejs.org/guide/advanced/lazy-loading.html 、https://router.vuejs.org/api/functions/createWebHashHistory.html 。
