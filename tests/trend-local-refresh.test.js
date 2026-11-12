import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)) };
globalThis.window = { addEventListener() {}, saveMetaCloud() {} };
globalThis.document = { addEventListener() {}, querySelector: () => null };
const { replaceData, getData } = await import('../src/lib/store.js');
const { wireTrendCells, refreshTrendCells, nonTrendSnapshot } = await import('../src/lib/week-state.js');
const { weekStartKey } = await import('../src/lib/utils.js');
const home = readFileSync(new URL('../src/modules/home/HomeView.vue', import.meta.url), 'utf8');
const insight = readFileSync(new URL('../src/modules/insight/InsightView.vue', import.meta.url), 'utf8');
function sourceFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
function cellsFixture() {
  const cells = Array.from({length:7}, (_,i) => {
    const value = { className: 'ws-empty', textContent: '–' };
    return { dataset: { trendDay: String(i) }, value, attributes: {},
      querySelector: () => value,
      setAttribute(k,v) { this.attributes[k] = v; },
      classList: { toggle() {} },
      set innerHTML(_) { throw Error('Button subtree must not be replaced'); },
    };
  });
  return { cells, scrollTop: 137, querySelectorAll: () => cells };
}
test('local clicks retain all button/value nodes, update aria and invoke callback through 1..5..empty', () => {
  replaceData({todo:[], __trend:{week:weekStartKey(),days:Array(7).fill(null)}});
  const scope = cellsFixture(), nodes = scope.cells.slice(), labels = nodes.map(x=>x.value), calls=[];
  const focused = nodes[2];
  wireTrendCells(scope,{onUpdate:(...args)=>calls.push(args)});
  for (const next of [1,2,3,4,5,null]) {
    focused.onclick();
    assert.equal(focused.value.textContent,next == null ? '–' : String(next));
    assert.equal(focused.attributes['aria-label'],`周三状态${next == null ? '未记录' : next+'分'}`);
    scope.cells.forEach((el,i)=>{assert.equal(el,nodes[i]);assert.equal(el.value,labels[i]);});
  }
  assert.equal(scope.scrollTop,137);
  assert.deepEqual(calls.map(x=>x[1]),[1,2,3,4,5,null]);
});
test('remote trend refresh updates existing cells and excludes only top-level trend from snapshot', () => {
  replaceData({todo:[{title:'a',nested:{__trend:1}}],__homeOrder:['trend'],__trend:{week:weekStartKey(),days:Array(7).fill(null)}});
  const before=nonTrendSnapshot(),scope=cellsFixture();
  getData().__trend.days[0]=4; refreshTrendCells(scope);
  assert.equal(scope.cells[0].attributes['aria-label'],'周一状态4分');
  assert.equal(nonTrendSnapshot(),before);
  getData().todo[0].nested.__trend=2;
  assert.notEqual(nonTrendSnapshot(),before);
  const current=nonTrendSnapshot();getData().__homeOrder=['todo','trend'];
  assert.notEqual(nonTrendSnapshot(),current);
});
test('insight subscription callback branch to local refresh only when non-trend snapshot matches', () => {
  for (const source of [insight]) {
    let snapshot='same', local=0, full=0;
    const call=new Function('nonTrendSnapshot','refreshTrend','refreshTrendCells','root','render',`let renderedNonTrend='same';${sourceFunction(source,'onStoreUpdate')};return onStoreUpdate;`)(()=>snapshot,()=>local++,()=>local++,{value:{}},()=>full++);
    call();assert.equal(local,1);assert.equal(full,0);
    snapshot='changed';call();assert.equal(full,1);
    assert.match(source,/subscribe\(onStoreUpdate\)/);
    assert.match(source,/renderedNonTrend = nonTrendSnapshot\(\)/);
  }
});
test('insight updates chart without replacing the scoring cells', () => {
  const chart = { innerHTML: '' }, scope = { querySelector: () => chart };
  let cellRefreshes = 0;
  const call = new Function('root', 'refreshTrendCells', 'readTrend', 'trendSVG', `${sourceFunction(insight,'refreshTrend')};return refreshTrend;`)({ value: scope }, () => cellRefreshes++, () => [2, 4, null], values => values.join(','));
  call(); assert.equal(chart.innerHTML, '2,4,'); assert.equal(cellRefreshes, 1);
});
