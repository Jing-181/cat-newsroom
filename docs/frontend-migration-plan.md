# 前端整理计划

运动模块采用无框架共享组件方案：`js/workout.js` 负责数据模型，`js/workout-view.js` 负责可复用视图模板，`js/workout-ui.js` 负责事件与状态，`css/workout-ui.css` 负责样式。桌面和移动页面只提供容器并加载同一套模块，保持 `index.html` 原有入口与 file:// 兼容性。
