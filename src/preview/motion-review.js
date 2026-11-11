import { reviewPage, createReviewMounts } from '../lib/motion/review.js';
export function startReview() {
  const preview = document.querySelector('#preview'), grid = document.querySelector('#grid');
  const params = new URLSearchParams(location.search);
  let page = reviewPage(params.get('page'),params.get('phases')),  compact = params.get('size') !== '240';
  const mounts = createReviewMounts();
  preview.classList.add('review-mode'); preview.classList.toggle('compact', compact);
  document.querySelector('h1').textContent = '动作视觉验收 · 静帧分页';
  document.querySelector('#speed').hidden = true;
  const nav = document.createElement('div'); nav.className = 'controls review-nav';
  const previous = document.createElement('button'), next = document.createElement('button'), summary = document.createElement('output');
  for (const button of [previous,next]) { button.type = 'button'; button.className = 'shared-btn'; }
  previous.textContent = '上一页'; next.textContent = '下一页';
  summary.setAttribute('aria-live','polite'); const phaseSelect=document.createElement('select'); phaseSelect.setAttribute('aria-label','验收相位组');
  for(const [value,label] of [['default','0 / 25 / 50%'],['first','前半：0 / 12.5 / 25 / 37.5%'],['second','后半：50 / 62.5 / 75 / 87.5%']]){const option=document.createElement('option');option.value=value;option.textContent=label;phaseSelect.append(option);}phaseSelect.value=page.phaseGroup;
  nav.append(previous,summary,next,phaseSelect); grid.before(nav);
  const ids = document.createElement('p'); ids.className = 'review-ids'; grid.before(ids);
  const state = document.createElement('script'); state.id = 'motion-review-state'; state.type = 'application/json'; preview.append(state);
  function publish() {
    const snapshot = { mode:'review', phaseGroup:page.phaseGroup, page:page.page, pageCount:page.pageCount, total:page.total, size:compact?96:240,
      theme:document.documentElement.dataset.motionTheme, ids:page.items.map(i=>i.exercise.id),
      items:page.items.map(i=>({id:i.exercise.id,name:i.exercise.name,clipId:i.demo.clip?.id||null,duration:i.demo.clip?.duration||0,frames:i.frames})),
      note:'Only sampled phases; no visual acceptance recorded', activePlayers:0 };
    state.textContent = JSON.stringify(snapshot);
    grid.dataset.reviewPage = String(page.page);
    grid.dataset.reviewIds = snapshot.ids.join(',');
    document.querySelector('#size-note').textContent = `${compact?96:240} CSS px 高 · 每项${page.items[0].frames.map(f=>f.phase*100+'%').join(' / ')}周期 · 不代表中段或目标位 · 全页静帧，无播放器`;
    document.querySelector('#size').textContent = compact?'切换大图 240px':'切换真实 96px';
    document.querySelector('#size').setAttribute('aria-pressed',String(compact));
    document.querySelector('#dark').setAttribute('aria-pressed',String(snapshot.theme==='dark'));
  }
  function render(updateUrl = true) {
    mounts.destroy(); grid.replaceChildren();
    previous.disabled = page.page === 0; next.disabled = page.page === page.pageCount-1;
    summary.textContent = `第 ${page.page+1} / ${page.pageCount} 页 · ${page.items.length} / ${page.total} 项 · page=${page.page}`;
    ids.textContent = `当前 IDs：${page.items.map(i=>i.exercise.id).join(' · ')}`;
    const rows = new Map();
    for (const item of page.items) {
      const wrap = document.createElement('div'); wrap.className = 'review-scroll';
      const row = document.createElement('article'); row.className = 'shared-card review-row'; row.dataset.exerciseId = item.exercise.id;row.style.gridTemplateColumns=`minmax(170px,1fr) repeat(${item.frames.length},minmax(112px,1fr))`;row.style.minWidth=item.frames.length===4?'690px':'';
      const label = document.createElement('div'); label.className = 'review-label';
      const title = document.createElement('h3'); title.textContent = item.exercise.name;
      const code = document.createElement('code'); code.textContent = item.exercise.id;
      const link = document.createElement('a'); link.textContent = '完整相位／播放 →';
      const url = new URL(location.href); url.searchParams.delete('review'); url.searchParams.delete('page'); url.searchParams.delete('phases'); url.searchParams.set('exercise',item.exercise.id); url.searchParams.set('size',compact?'96':'240'); link.href = url.href;
      const status = document.createElement('small'); status.textContent = item.demo.clip?.staticHold?'静态保持 · 各相位同姿势':'动态动作 · 这里只显示取样帧';
      label.append(title,code,status,link); row.append(label); wrap.append(row); grid.append(wrap); rows.set(item.exercise.id,row);
    }
    mounts.mount(page,(item,frame)=>{
      const cell=document.createElement('div'); cell.className='review-frame'; cell.dataset.phase=String(frame.phase); cell.dataset.seconds=String(frame.seconds);
      const caption=document.createElement('span'); caption.textContent=`${frame.phase*100}% · ${frame.seconds.toFixed(2)}s${frame.staticHold?' · 保持':''}`;
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.dataset.exerciseId=item.exercise.id; svg.dataset.phase=String(frame.phase); svg.dataset.seconds=String(frame.seconds);
      cell.append(caption,svg); rows.get(item.exercise.id).append(cell); return svg;
    });
    publish();
    if(updateUrl){const url=new URL(location.href);url.searchParams.set('page',String(page.page));url.searchParams.set('phases',page.phaseGroup);url.searchParams.set('size',compact?'96':'240');url.searchParams.set('dark',document.documentElement.dataset.motionTheme==='dark'?'1':'0');history.replaceState(null,'',url);}
  }
  phaseSelect.onchange=()=>{page=reviewPage(page.page,phaseSelect.value);render();};
  previous.onclick=()=>{page=reviewPage(page.page-1,page.phaseGroup);render();window.scrollTo({top:0});};
  next.onclick=()=>{page=reviewPage(page.page+1,page.phaseGroup);render();window.scrollTo({top:0});};
  document.querySelector('#size').onclick=()=>{compact=!compact;preview.classList.toggle('compact',compact);render();};
  document.querySelector('#dark').onclick=()=>{document.documentElement.dataset.motionTheme=document.documentElement.dataset.motionTheme==='dark'?'light':'dark';render();};
  window.addEventListener('pagehide',mounts.destroy);
  window.addEventListener('pageshow',event=>{if(event.persisted)render(false);});
  render();
}
