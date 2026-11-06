// 角落里的几只小猫：极简线条，只做呼吸、摇尾、走过这类小动作。
//
// 它们不是插图，是页面的停顿符号——空状态、深色卡角落这种地方，
// 一句话说完还剩一块空白，放一只猫比留白更像这个应用。
// 全部 currentColor 上色，交给使用处决定深浅；动画都在 CSS（css/critters.css），
// 系统开了「减少动态效果」时自动静止。

// 蜷着打盹的猫：线条稿，不填色。放在深色卡角落当水印时，一块实心形会被误读成污渍，
// 只有线条读得出「这是一只猫」。身体会跟着呼吸轻微起伏，尾巴慢慢卷一下。
export const sleepingCat = `<svg class="critter critter-cat" viewBox="0 0 120 64" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
  <g class="cat-body">
    <path d="M83 47c0-12.5-13.5-21-31-21S21 34.5 21 47c0 3.4 2.6 5.2 6 5.2h50c3.4 0 6-1.8 6-5.2Z"/>
    <circle cx="93" cy="39" r="10.2"/>
    <path d="M85.6 31.2 87.8 21.4l5.2 6.9M92.8 28.2 97 20.6l3.6 8.4"/>
  </g>
  <g class="cat-tail">
    <path d="M22 50.6c-6.6.6-9.6-4-8.2-8.4 1.4-4.2 6.2-5.4 8.8-3"/>
  </g>
  <path class="cat-eye" d="M89.4 39.6c1.6 2 4.2 2 5.8 0" opacity=".85"/>
  <path class="cat-whisker" d="M103 42.4h6.4M103.4 45.6h5.6" stroke-width="1.4" opacity=".55"/>
</svg>`;

// 走过的猫爪：三枚依次落下，用来占住空状态那块地方。
export const pawTrail = `<svg class="critter critter-paws" viewBox="0 0 132 56" aria-hidden="true" focusable="false">
  <g fill="currentColor">
    <g class="paw paw-1"><ellipse cx="34" cy="17" rx="6" ry="5"/><ellipse cx="22" cy="9" rx="2.6" ry="2.2"/><ellipse cx="29" cy="6.5" rx="2.6" ry="2.2"/><ellipse cx="37" cy="6.5" rx="2.6" ry="2.2"/><ellipse cx="44" cy="9.5" rx="2.6" ry="2.2"/><ellipse cx="47" cy="19" rx="5.2" ry="4.2"/></g>
    <g class="paw paw-2"><ellipse cx="10" cy="38" rx="5.2" ry="4.2"/><ellipse cx="20" cy="41" rx="2.6" ry="2.2"/><ellipse cx="22" cy="32" rx="2.6" ry="2.2"/><ellipse cx="14" cy="30" rx="2.6" ry="2.2"/><ellipse cx="7" cy="31" rx="2.6" ry="2.2"/></g>
    <g class="paw paw-3"><ellipse cx="74" cy="38" rx="5.2" ry="4.2"/><ellipse cx="63" cy="40" rx="2.6" ry="2.2"/><ellipse cx="63" cy="31" rx="2.6" ry="2.2"/><ellipse cx="71" cy="29" rx="2.6" ry="2.2"/><ellipse cx="79" cy="30" rx="2.6" ry="2.2"/></g>
  </g>
</svg>`;

// 一小截樱花枝：给页脚这种只有一行小字的地方添个笔触。
export const blossomSprig = `<svg class="critter critter-sprig" viewBox="0 0 88 34" aria-hidden="true" focusable="false">
  <path d="M2 30c16-3 30-11 42-22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
  <g fill="currentColor" opacity=".9">
    <circle cx="58" cy="12" r="5.2"/><circle cx="49" cy="6" r="3.4"/><circle cx="67" cy="6.4" r="3.2"/><circle cx="62" cy="2.6" r="2.6"/>
  </g>
  <circle cx="28" cy="22" r="2.4" fill="currentColor" opacity=".5"/>
</svg>`;

export default { sleepingCat, pawTrail, blossomSprig };
