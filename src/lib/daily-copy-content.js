// 项目内维护的原创短句；数组下标 + 1 对应本地日历日期。
export const DAILY_COPY_MONTHS = Object.freeze({
  "2026-11": Object.freeze([
    "十一月，先把窗边的位置收拾好，留一点光给自己。",
    "猫把午后睡得很长。手边的事，也可以一件一件来。",
    "今天读到喜欢的一页，就在这里停一会儿。",
    "走过熟悉的街角，才发现树叶又换了一点颜色。",
    "热饭端上桌的时候，今天便有了一处踏实的落点。",
    "运动结束，把水慢慢喝完，也把这段时间留给自己。",
    "猫在书边蜷成一团，替这一页压住了风。",
    "没写完的清单先合上，窗外还有一小片晚霞。",
    "一本书读得慢，也有读得慢才能遇见的句子。",
    "出门走一走，让脚步接过脑子里暂时理不顺的事。",
    "给杯子续上热水。忙碌之间，也容得下一点照顾。",
    "猫伸了个懒腰，阳光刚好落在它空出来的位置。",
    "今天只读几页也好，书签向前挪了一点。",
    "训练有用力的时候，也有收好器械、安心回家的时候。",
    "把洗好的衣服叠起来，日子便整齐了一小块。",
    "猫坐在门口等你，回家的脚步可以轻一点。",
    "读到不懂的地方，留个记号，明天再见。",
    "散步回来，鞋底带着一点尘土，心里多了一段风。",
    "晚饭做简单些，腾出一点时间，把它好好吃完。",
    "猫把爪子搭在你手边，什么也没催。",
    "合上书后，有一句话还陪你走到厨房。",
    "今天的力气用到这里，剩下的路留给休息过后的自己。",
    "桌上留一处空白，放杯水，也放下片刻的心事。",
    "猫追了一会儿光点，又回到毯子上过它的下午。",
    "旧书再翻开，折角处藏着从前停留过的目光。",
    "比起赶远路，今天更想认真走完眼前这一小段。",
    "天黑得早，就把灯开暖一点，把晚饭吃慢一点。",
    "猫睡熟以后，房间里翻书的声音也轻了。",
    "运动后的衣服晾起来，今天认真生活的痕迹还在。",
    "把十一月的最后一页合好，给明天留一张干净的纸。",
  ]),
});

export const DAILY_COPY_FALLBACK = "把手边的小事慢慢做好，也给自己留一点安静的时间。";

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// 纯选择器：只在对应月份内换条；未配置月份始终显示同一句兜底。
export function selectDailyCopy(date = new Date(), offset = 0) {
  const dateKey = localDateKey(date);
  const month = dateKey.slice(0, 7);
  const items = DAILY_COPY_MONTHS[month];
  if (!items?.length) return { dateKey, month, content: DAILY_COPY_FALLBACK, index: 0, count: 1, fallback: true };
  const shift = Number.isSafeInteger(offset) ? offset : 0;
  const index = ((date.getDate() - 1 + shift) % items.length + items.length) % items.length;
  return { dateKey, month, content: items[index], index, count: items.length, fallback: false };
}
