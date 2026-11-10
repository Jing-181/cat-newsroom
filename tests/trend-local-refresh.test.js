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
test('both subscription callbacks branch to local refresh only when non-trend snapshot matches', () => {
  for (const source of [home,insight]) {
    let snapshot='same', local=0, full=0;
    const call=new Function('nonTrendSnapshot','refreshTrend','refreshTrendCells','root','render',`let renderedNonTrend='same';${sourceFunction(source,'onStoreUpdate')};return onStoreUpdate;`)(()=>snapshot,()=>local++,()=>local++,{value:{}},()=>full++);
    call();assert.equal(local,1);assert.equal(full,0);
    snapshot='changed';call();assert.equal(full,1);
    assert.match(source,/subscribe\(onStoreUpdate\)/);
    assert.match(source,/renderedNonTrend = nonTrendSnapshot\(\)/);
  }
});
test('home updates chart, average and empty state without touching grid or outer tree', () => {
  let series=Array(7).fill(null), cellUpdates=0, chartWrites=0;
  const chart={html:'', get innerHTML(){return this.html;},set innerHTML(v){chartWrites++;this.html=v;}};
  const average={textContent:''},axis={style:{}};
  const tile={querySelector:s=>({'[data-trend-chart]':chart,'[data-trend-average]':average,'[data-trend-axis]':axis}[s])};
  const root={value:{querySelector:()=>tile,set innerHTML(_){throw Error('Root replaced');}}};
  const refresh=new Function('root','refreshTrendCells','CONFIG','data','trendSVG','icon',`${sourceFunction(home,'trendPresentation')}\n${sourceFunction(home,'refreshTrend')}\nreturn refreshTrend;`)(root,()=>cellUpdates++,{trend:{series:()=>series,unit:'分'}},()=>({}),v=>`<svg>${v.join(',')}</svg>`,()=> '');
  refresh();assert.match(chart.html,/trend-empty/);assert.equal(average.textContent,'');assert.equal(axis.style.visibility,'hidden');
  series=[2,4,null,null,null,null,null];refresh();assert.match(chart.html,/<svg>/);assert.equal(average.textContent,'均 3分');assert.equal(axis.style.visibility,'visible');
  const writes=chartWrites;refresh();assert.equal(chartWrites,writes);
  series=Array(7).fill(null);refresh();assert.match(chart.html,/trend-empty/);assert.equal(average.textContent,'');
  assert.equal(cellUpdates,4);
  assert.match(home,/wireTrendCells\(scope, \{ onUpdate: refreshTrend \}\)/);
});
test('home quick recording opens non-sport editor without navigating, sport still navigates', () => {
  const buttons=['todo','note','sport'].map(quick=>({dataset:{quick}})),nav=[],edit=[];
  const scope={querySelectorAll:s=>s==='[data-quick]'?buttons:[],querySelector:()=>null};
  new Function('root','Trace','go','openEditor','wireTrendCells','refreshTrend',`${sourceFunction(home,'wireHome')};wireHome();`)({value:scope},{track(){}},key=>nav.push(key),(...args)=>edit.push(args),()=>{},()=>{});
  buttons.forEach(b=>b.onclick());
  assert.deepEqual(nav,['sport']);assert.deepEqual(edit,[['todo',null],['note',null]]);
});
