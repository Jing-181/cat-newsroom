(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RecordMedia = api;
})(typeof window !== "undefined" ? window : null, function () {
  function svgData(svg) {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function scene({ bg, accent, accent2, frame = "#f4eadb", motif }) {
    return svgData(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" fill="none">
        <rect width="960" height="540" rx="38" fill="${bg}"/>
        <circle cx="798" cy="112" r="116" fill="${accent}" opacity=".16"/>
        <circle cx="188" cy="430" r="132" fill="${accent2}" opacity=".16"/>
        <rect x="54" y="54" width="852" height="432" rx="30" fill="${frame}" opacity=".42"/>
        ${motif}
      </svg>
    `);
  }

  const PRESETS = [
    {
      id: "paper-note",
      label: "纸面便签",
      category: "default",
      description: "适合标准卡片，像手写清单一样干净。",
      src: scene({
        bg: "#f7f0e3",
        accent: "#c47128",
        accent2: "#5c7a3e",
        motif: `
          <rect x="130" y="92" width="700" height="356" rx="28" fill="#fff8ef" stroke="#d8c4a7" stroke-width="8"/>
          <rect x="186" y="150" width="320" height="16" rx="8" fill="#e1c39c"/>
          <rect x="186" y="196" width="378" height="12" rx="6" fill="#d9c8b2"/>
          <rect x="186" y="228" width="278" height="12" rx="6" fill="#d9c8b2"/>
          <rect x="186" y="260" width="336" height="12" rx="6" fill="#d9c8b2"/>
          <circle cx="694" cy="204" r="58" fill="#f4d7b7"/>
          <path d="M665 202c0-18 14-32 32-32s32 14 32 32-14 32-32 32-32-14-32-32Z" stroke="#b86f35" stroke-width="10"/>
          <path d="M677 205h10M693 193h10M709 205h10" stroke="#b86f35" stroke-width="8" stroke-linecap="round"/>
          <path d="M650 318h160" stroke="#c6b39b" stroke-width="8" stroke-linecap="round"/>
          <path d="M650 350h198" stroke="#c6b39b" stroke-width="8" stroke-linecap="round"/>
        `,
      }),
    },
    {
      id: "window-cat",
      label: "窗台小猫",
      category: "default",
      description: "适合打卡、习惯和日常记录。",
      src: scene({
        bg: "#e8f0e6",
        accent: "#5c7a3e",
        accent2: "#c47128",
        motif: `
          <rect x="144" y="86" width="672" height="368" rx="32" fill="#f8f3e8" stroke="#d5c7b2" stroke-width="8"/>
          <rect x="198" y="140" width="564" height="260" rx="18" fill="#dfeae2"/>
          <rect x="198" y="140" width="564" height="260" rx="18" fill="none" stroke="#9db39b" stroke-width="14"/>
          <path d="M480 140v260M198 270h564" stroke="#9db39b" stroke-width="12" stroke-linecap="round"/>
          <path d="M412 334c-6-38 20-70 68-70 44 0 72 28 72 70" stroke="#6e5a44" stroke-width="14" stroke-linecap="round"/>
          <path d="M446 282l-20-28M514 282l20-28" stroke="#6e5a44" stroke-width="14" stroke-linecap="round"/>
          <circle cx="460" cy="304" r="10" fill="#6e5a44"/>
          <circle cx="500" cy="304" r="10" fill="#6e5a44"/>
          <path d="M462 334c10 10 26 10 36 0" stroke="#6e5a44" stroke-width="10" stroke-linecap="round"/>
          <path d="M270 334h120" stroke="#c47128" stroke-width="10" stroke-linecap="round"/>
          <path d="M254 360h156" stroke="#c6b39b" stroke-width="8" stroke-linecap="round"/>
        `,
      }),
    },
    {
      id: "book-pen",
      label: "书页与笔",
      category: "read",
      description: "适合阅读、摘录和灵感类内容。",
      src: scene({
        bg: "#f5ead0",
        accent: "#8a5a44",
        accent2: "#c47128",
        motif: `
          <rect x="150" y="104" width="320" height="332" rx="30" fill="#fff9f0" stroke="#d4c3aa" stroke-width="8"/>
          <rect x="486" y="104" width="324" height="332" rx="30" fill="#fff9f0" stroke="#d4c3aa" stroke-width="8"/>
          <path d="M214 160h190M214 198h226M214 236h180M214 274h210" stroke="#d7c7b2" stroke-width="10" stroke-linecap="round"/>
          <path d="M548 164h180M548 204h210M548 244h170M548 284h220" stroke="#d7c7b2" stroke-width="10" stroke-linecap="round"/>
          <path d="M300 332l150-144 66 66-150 144h-66z" fill="#f4d7b7" stroke="#b86f35" stroke-width="10"/>
          <path d="M452 206l40-40 26 26-40 40" fill="#c47128"/>
          <path d="M520 154l18-18 48 48-18 18z" fill="#8a5a44"/>
          <circle cx="690" cy="336" r="52" fill="#e8efd8"/>
          <path d="M666 336h48" stroke="#5c7a3e" stroke-width="12" stroke-linecap="round"/>
        `,
      }),
    },
    {
      id: "dumbbell-card",
      label: "训练卡片",
      category: "sport",
      description: "适合运动、进度和行动记录。",
      src: scene({
        bg: "#f5ead0",
        accent: "#5c7a3e",
        accent2: "#c47128",
        motif: `
          <rect x="128" y="116" width="704" height="308" rx="32" fill="#fff8ef" stroke="#d8c4a7" stroke-width="8"/>
          <path d="M248 274h464" stroke="#6f5a43" stroke-width="26" stroke-linecap="round"/>
          <rect x="190" y="228" width="40" height="92" rx="14" fill="#c47128"/>
          <rect x="230" y="214" width="42" height="120" rx="14" fill="#f0dccd" stroke="#c47128" stroke-width="8"/>
          <rect x="672" y="214" width="42" height="120" rx="14" fill="#f0dccd" stroke="#c47128" stroke-width="8"/>
          <rect x="716" y="228" width="40" height="92" rx="14" fill="#c47128"/>
          <path d="M290 168h120M290 200h168M290 344h240" stroke="#d7c7b2" stroke-width="10" stroke-linecap="round"/>
          <circle cx="560" cy="172" r="42" fill="#e8efd8"/>
          <path d="M540 172h40M560 152v40" stroke="#5c7a3e" stroke-width="10" stroke-linecap="round"/>
        `,
      }),
    },
    {
      id: "wallet-receipt",
      label: "钱包收据",
      category: "money",
      description: "适合记账和金额记录。",
      src: scene({
        bg: "#f0e6d0",
        accent: "#8a5a44",
        accent2: "#5c7a3e",
        motif: `
          <rect x="156" y="116" width="648" height="300" rx="34" fill="#fff9f0" stroke="#d4c3aa" stroke-width="8"/>
          <rect x="194" y="156" width="296" height="220" rx="24" fill="#f7f0e3" stroke="#d6c0a3" stroke-width="8"/>
          <path d="M244 204h180M244 242h140M244 280h200M244 318h164" stroke="#d8c8b4" stroke-width="10" stroke-linecap="round"/>
          <rect x="528" y="186" width="190" height="128" rx="28" fill="#e8efd8" stroke="#9db39b" stroke-width="8"/>
          <circle cx="604" cy="250" r="38" fill="#c47128" opacity=".18"/>
          <path d="M588 250h32" stroke="#c47128" stroke-width="12" stroke-linecap="round"/>
          <path d="M554 348h156" stroke="#d6c0a3" stroke-width="10" stroke-linecap="round"/>
        `,
      }),
    },
    {
      id: "quote-card",
      label: "引文纸片",
      category: "quote",
      description: "适合引文、大字卡和情绪记录。",
      src: scene({
        bg: "#f7f0e3",
        accent: "#c47128",
        accent2: "#8a5a44",
        motif: `
          <rect x="148" y="98" width="664" height="344" rx="34" fill="#fff8ef" stroke="#d8c4a7" stroke-width="8"/>
          <path d="M248 184c-34 0-56 26-56 58 0 22 10 40 26 54h62c16-16 26-34 26-54 0-32-22-58-58-58Z" fill="#f0dccd"/>
          <path d="M392 184c-34 0-56 26-56 58 0 22 10 40 26 54h62c16-16 26-34 26-54 0-32-22-58-58-58Z" fill="#e8efd8"/>
          <path d="M214 324h532" stroke="#d7c7b2" stroke-width="10" stroke-linecap="round"/>
          <path d="M274 356h412" stroke="#d7c7b2" stroke-width="8" stroke-linecap="round"/>
          <path d="M540 170h118" stroke="#c47128" stroke-width="12" stroke-linecap="round"/>
          <circle cx="672" cy="260" r="54" fill="#f5ead0"/>
          <path d="M650 260h44M672 238v44" stroke="#8a5a44" stroke-width="10" stroke-linecap="round"/>
        `,
      }),
    },
    {
      id: "leaf-journal",
      label: "叶片日记",
      category: "checkin",
      description: "适合习惯、打卡和生活感内容。",
      src: scene({
        bg: "#e8efd8",
        accent: "#5c7a3e",
        accent2: "#c47128",
        motif: `
          <rect x="156" y="106" width="648" height="328" rx="32" fill="#fff9f0" stroke="#d4c3aa" stroke-width="8"/>
          <path d="M360 340c-72 0-130-46-130-116 0-80 66-140 174-140 22 0 40 2 54 6-16 46-20 86-16 132 4 48-14 86-82 118Z" fill="#dfeae2" stroke="#8fb08b" stroke-width="8"/>
          <path d="M308 350c40-58 88-102 160-150" stroke="#5c7a3e" stroke-width="10" stroke-linecap="round"/>
          <path d="M542 158h168M542 196h128M542 234h184M542 272h150" stroke="#d7c7b2" stroke-width="10" stroke-linecap="round"/>
          <circle cx="674" cy="332" r="44" fill="#f0dccd"/>
          <path d="M654 332h40" stroke="#b86f35" stroke-width="10" stroke-linecap="round"/>
        `,
      }),
    },
    {
      id: "coffee-desk",
      label: "咖啡桌面",
      category: "note",
      description: "适合日记、灵感和慢下来的时刻。",
      src: scene({
        bg: "#f5ead0",
        accent: "#8a5a44",
        accent2: "#5c7a3e",
        motif: `
          <rect x="150" y="108" width="660" height="324" rx="32" fill="#fff8ef" stroke="#d8c4a7" stroke-width="8"/>
          <path d="M262 330h220" stroke="#d7c7b2" stroke-width="12" stroke-linecap="round"/>
          <path d="M280 224c0-34 26-60 60-60h74c34 0 60 26 60 60 0 52-38 90-97 90s-97-38-97-90Z" fill="#e8efd8" stroke="#9db39b" stroke-width="8"/>
          <path d="M304 224c0-18 14-32 32-32h66c18 0 32 14 32 32 0 30-22 52-65 52s-65-22-65-52Z" fill="#fff8ef"/>
          <path d="M438 192h34c18 0 32 14 32 32s-14 32-32 32h-16" stroke="#9db39b" stroke-width="8" stroke-linecap="round"/>
          <path d="M556 176h146M556 214h118M556 252h170M556 290h128" stroke="#d7c7b2" stroke-width="10" stroke-linecap="round"/>
          <circle cx="706" cy="330" r="38" fill="#f0dccd"/>
          <path d="M690 330h32" stroke="#c47128" stroke-width="10" stroke-linecap="round"/>
        `,
      }),
    },
  ];

  const PRESET_MAP = Object.fromEntries(PRESETS.map(item => [item.id, item]));
  const FALLBACK_ORDER = {
    todo: ["paper-note", "quote-card", "coffee-desk"],
    checkin: ["window-cat", "leaf-journal", "paper-note"],
    read: ["book-pen", "quote-card", "window-cat"],
    sport: ["dumbbell-card", "leaf-journal", "paper-note"],
    money: ["wallet-receipt", "coffee-desk", "paper-note"],
    note: ["coffee-desk", "quote-card", "paper-note"],
    hot: ["leaf-journal", "quote-card", "window-cat"],
  };

  const LAYOUT_ORDER = {
    default: ["paper-note", "window-cat", "book-pen", "dumbbell-card", "wallet-receipt", "quote-card", "leaf-journal", "coffee-desk"],
    feature: ["window-cat", "book-pen", "dumbbell-card", "wallet-receipt", "coffee-desk", "leaf-journal", "quote-card", "paper-note"],
    quote: ["quote-card", "coffee-desk", "paper-note", "leaf-journal", "window-cat", "book-pen", "wallet-receipt", "dumbbell-card"],
  };

  function uniqueIds(ids) {
    return [...new Set(ids)].filter(Boolean);
  }

  function getChoices(moduleKey, layout = "default") {
    const layoutIds = LAYOUT_ORDER[layout] || LAYOUT_ORDER.default;
    const moduleIds = FALLBACK_ORDER[moduleKey] || FALLBACK_ORDER.note;
    // 引文卡更依赖版式氛围，优先使用引文类配图。
    const ids = layout === "quote" ? [...layoutIds, ...(moduleIds || [])] : [...(moduleIds || []), ...layoutIds];
    return uniqueIds(ids).map(id => PRESET_MAP[id]).filter(Boolean);
  }

  function getPreset(id) {
    return PRESET_MAP[id] || null;
  }

  function defaultPresetId(moduleKey, layout = "default") {
    const choices = getChoices(moduleKey, layout);
    return choices[0]?.id || "paper-note";
  }

  function resolveRecordImage(record, moduleKey, layout = "default") {
    if (record?.image) return record.image;
    const presetId = record?.image_preset || defaultPresetId(moduleKey, record?.layout || layout);
    return PRESET_MAP[presetId]?.src || PRESET_MAP["paper-note"].src;
  }

  return {
    presets: PRESETS,
    getChoices,
    getPreset,
    defaultPresetId,
    resolveRecordImage,
  };
});
