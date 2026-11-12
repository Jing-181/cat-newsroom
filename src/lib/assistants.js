// 角色原设定来自 workspace；模块推荐仅是生活报里的快捷入口。
export const ASSISTANTS = [
  { id: 'hanako', name: 'Hanako', role: '统筹 · 陪伴 · 判断', short: '陪你慢慢来', quote: '和你一起，把想法变成现实。', description: '先听你说，再一起理清想法。温柔，也保留自己的判断。', links: [{ route: 'note', label: '写一笔日记' }, { route: 'timeline', label: '翻翻生活时间线' }] },
  { id: 'yuan', name: '源', role: '开发 · 执行 · 工程判断', short: '一件一件做好', quote: '把复杂拆到最简，再做对。', description: '理性、克制，喜欢把复杂的事情拆清楚，再找到可以落地的下一步。', links: [{ route: 'todo', label: '理理待办事项' }, { route: 'insight', label: '看看本周复盘' }] },
  { id: 'yuu', name: '悠', role: '产品 · 体验 · 灵感', short: '发现一点新鲜', quote: '先玩一遍，才知道该改哪里。', description: '先试一试，留意小卡点，再把新鲜想法记下来。热情，也在意每一次反馈。', links: [{ route: 'hot', label: '收集一个发现' }, { route: 'read', label: '继续读一本书' }] },
];

export function assistantForModule(module) {
  const id = ['todo', 'money', 'settings', 'insight'].includes(module) ? 'yuan'
    : ['hot', 'checkin', 'sport', 'exerciseAtlas'].includes(module) ? 'yuu' : 'hanako';
  return ASSISTANTS.find(person => person.id === id);
}

// 三张原画构成一次短表情演出，结束后停在笑脸。
export function expressionFrame(seconds) {
  return seconds < 0.8 ? 0 : seconds < 1.6 ? 1 : 2;
}
