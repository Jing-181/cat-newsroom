# 2.20.0 发布摘要

用户明确授权发布feat/app-router。需求提交在需求分支完成，fetch核对远端后合并main并由现有GitHub Pages workflow执行check/build/deploy；不force、不迁移数据、不扩大依赖升级。

## 范围

- Vue Router4.6.4，hash history适配GitHub Pages子路径；11个命名懒加载栏目，URL作为导航唯一事实源。
- 图鉴动作ID直达、query筛选与未知ID提示；浏览器回退前进、页面meta标题，旧入口保留search/hash。
- Supabase回调窄识别与完整清理清单分开；普通query不触发认证。回调认证准备与业务同步激活分离，超时/迟到结果不启动业务监听或Realtime。
- 手机focus-setbar分行避免进度点被挤没，操作最小触控高44px，短视口允许滚动。
- 导航链接各状态无下划线，保留focus-visible；正文参考链接不受影响。

## 安全/兼容

不改变localStorage数据键、workout_session模型、同步数据协议。SDK自身可能保存认证session，区别于业务记录；实际回调消费成功且门控接受、URL清理后才启用业务同步。未知路由不伪装成首页。旧视图记忆不覆盖显式深链接。

仅显式白名单提交本轮源代码、测试、文档、依赖锁和prebuild自动副本。原.artifacts/与assets/workout/squat-optimized.svg不纳入不改。现有vite/source-map-js审计high项不在本轮升级范围。

## 已知未验

真实手机320/375/390/414/820布局、软键盘/持续输入、真实浏览器深链接刷新/回退、服务端implicit/PKCE认证与同步端到端仍未验；宿主browser曾layout not ready。路由memory history、模拟认证门和模板/CSS测试不能冒充这些验收。

线上HTTP200与资产/版本哈希核验仅证明发布产物就绪，不等于浏览器完成导航。原104动作视觉仍有未验边界，未改为全部完成。

回退可按原main提交做revert后沿同一CI发布，不重写历史。
