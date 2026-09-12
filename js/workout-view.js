(function (root) {
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
  }

  function dayName(dayId) {
    return root.WorkoutCatalog.trainingDays.find(day => day.id === dayId)?.name || "训练";
  }

  function dayButtons(selectedDay) {
    return root.WorkoutCatalog.trainingDays.map(day => `<button type="button" data-day="${day.id}" class="${selectedDay === day.id ? "on" : ""}">${day.name}</button>`).join("");
  }

  function statsHtml(stats) {
    return `<div class="workout-summary">
      <div class="workout-stat"><b data-workout-stat="exerciseCount">${stats.exerciseCount}</b><span>动作</span></div>
      <div class="workout-stat"><b data-workout-stat="setCount">${stats.setCount}</b><span>完成组</span></div>
      <div class="workout-stat"><b data-workout-stat="reps">${stats.reps}</b><span>总次数</span></div>
      <div class="workout-stat"><b data-workout-stat="volume">${Math.round(stats.volume)}</b><span>训练容量 kg</span></div>
    </div>`;
  }

  function quickExerciseHtml(selectedDay, exercises) {
    const added = new Set((exercises || []).map(item => item.exercise_id));
    const items = root.WorkoutCatalog.forDay(selectedDay).filter(item => !added.has(item.id)).slice(0, 5);
    if (!items.length) return "";
    return `<div class="quick-exercises" aria-label="常用动作">${items.map(item => `<button type="button" data-quick-add="${escapeHtml(item.id)}">+ ${escapeHtml(item.name)}</button>`).join("")}<button type="button" class="more" data-open-library>更多动作</button></div>`;
  }

  function historyHtml(records) {
    if (!records.length) return `<div class="session-empty">还没有训练记录，选择训练日开始第一练。</div>`;
    return `<div class="workout-history">${records.map(record => {
      const info = root.Workout.summary(record);
      const meta = info.legacy
        ? `${escapeHtml(record.date || "日期未记录")} · ${escapeHtml(record.current || 0)}/${escapeHtml(record.target || 0)} ${escapeHtml(record.unit || "")}`
        : `${escapeHtml(info.date)} · ${info.exerciseCount} 个动作 · ${info.setCount} 组 · ${info.duration || 0} 分钟`;
      return `<article class="history-card">
        <div class="history-card-copy"><h4>${escapeHtml(info.title)}</h4><p>${meta}</p></div>
        <div class="history-actions">
          <button type="button" class="workout-btn compact" data-history-view="${escapeHtml(record.id)}">详情</button>
          <button type="button" class="workout-btn compact" data-history-edit="${escapeHtml(record.id)}">编辑</button>
          <button type="button" class="icon-action danger" data-history-delete="${escapeHtml(record.id)}" title="删除记录" aria-label="删除记录">×</button>
        </div>
      </article>`;
    }).join("")}</div>`;
  }

  function setRows(exercise, exerciseIndex) {
    // 纵向组卡片在手机上一屏可完整查看，避免横向滚动。
    return exercise.sets.map((set, setIndex) => `<div class="set-row">
      <div class="set-row-head"><strong>第 ${setIndex + 1} 组</strong><button type="button" class="set-done ${set.completed ? "on" : ""}" data-set-done="1" data-exercise="${exerciseIndex}" data-set="${setIndex}" title="完成本组" aria-label="完成第 ${setIndex + 1} 组">✓</button><button type="button" class="icon-action" data-set-delete="1" data-exercise="${exerciseIndex}" data-set="${setIndex}" title="删除本组" aria-label="删除第 ${setIndex + 1} 组">×</button></div>
      <div class="set-fields">
        <label><span>重量 kg</span><input type="number" min="0" step="2.5" value="${escapeHtml(set.weight_kg)}" data-set-field="weight_kg" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="重量"></label>
        <label><span>次数</span><input type="number" min="1" step="1" value="${escapeHtml(set.reps)}" data-set-field="reps" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="次数"></label>
        <label><span>RPE</span><input type="number" min="1" max="10" step="1" value="${escapeHtml(set.rpe)}" data-set-field="rpe" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="RPE"></label>
      </div>
    </div>`).join("");
  }

  function editorHtml(session, selectedDay, history = []) {
    const stats = root.Workout.calculateStats(session);
    const editing = Boolean(session._editing_record_id);
    return `<section class="workout-app">
      <div class="workout-head"><div><h2>${editing ? "编辑" : "记录"}${escapeHtml(session.title)}</h2><p>${escapeHtml(session.date)} · 草稿会自动保存在本机</p></div><div class="workout-spacer"></div><button type="button" class="workout-btn danger" id="workout-cancel">${editing ? "退出编辑" : "放弃"}</button></div>
      <div class="workout-days">${dayButtons(selectedDay)}</div>
      ${statsHtml(stats)}
      <div class="workout-layout">
        <main class="workout-panel"><div class="workout-panel-title"><span>当前训练</span><button type="button" class="workout-btn compact" id="workout-add-exercise">+ 添加动作</button></div><p class="workout-hint">动作会带入最近一次完成组；新组默认已完成，不练可直接删掉或取消勾选。</p>${quickExerciseHtml(selectedDay, session.exercises)}<div class="session-list">${session.exercises.length ? session.exercises.map((exercise, exerciseIndex) => {
          const previous = root.Workout.previousPerformance(history, exercise.exercise_id);
          const last = previous ? `上次 ${escapeHtml(previous.date)} · ${escapeHtml(previous.set.weight_kg)} kg × ${escapeHtml(previous.set.reps)}` : "首次记录此动作";
          return `<article class="session-exercise"><div class="session-exercise-head"><div><strong>${escapeHtml(exercise.name)}</strong><span>${escapeHtml(exercise.body_part)} · ${last}</span></div><button type="button" class="icon-action" data-exercise-delete="${exerciseIndex}" title="移除动作" aria-label="移除${escapeHtml(exercise.name)}">×</button></div><div class="set-list">${setRows(exercise, exerciseIndex)}</div><div class="session-exercise-foot"><button type="button" data-set-add="${exerciseIndex}">+ 加一组</button><button type="button" data-set-copy="${exerciseIndex}">复制上一组</button></div></article>`;
        }).join("") : `<div class="session-empty">点击“添加动作”安排本次训练。</div>`}</div></main>
      </div>
      <section class="workout-completion" aria-label="完成训练">
        <div class="workout-fields">
          <div class="workout-field"><label for="workout-date">训练日期</label><input id="workout-date" type="date" value="${escapeHtml(session.date)}"></div>
          <div class="workout-field"><label for="workout-duration">训练时长（分钟）</label><input id="workout-duration" type="number" min="1" value="${escapeHtml(session.duration_min)}"></div>
          <div class="workout-field note"><label for="workout-note">备注</label><input id="workout-note" value="${escapeHtml(session.note)}" placeholder="今天的状态"></div>
        </div>
        <div class="workout-submitbar"><div class="workout-submit-summary"><b data-submit-date>${escapeHtml(session.date)}</b><span><i data-submit-duration>${escapeHtml(session.duration_min)}</i> 分钟</span></div><button type="button" class="workout-btn primary" id="workout-finish">${editing ? "保存修改" : "完成训练"}</button></div>
      </section>
      ${dialogShell()}
    </section>`;
  }

  function idleHtml(selectedDay, records) {
    return `<section class="workout-app"><div class="workout-head"><div><h2>运动健身</h2><p>按训练日快速安排动作，记录每一组重量与次数。</p></div></div>
      <div class="workout-days">${dayButtons(selectedDay)}</div>
      <div><button type="button" class="workout-btn primary" id="workout-start">开始${dayName(selectedDay)}</button></div>
      <section><div class="workout-panel-title">训练历史</div>${historyHtml(records)}</section>
      ${dialogShell()}
    </section>`;
  }

  function dialogShell() {
    return `<dialog class="workout-dialog" id="workout-dialog"><div id="workout-dialog-content"></div></dialog>`;
  }

  function detailHtml(record) {
    const info = root.Workout.summary(record);
    if (info.legacy) {
      return `<div class="dialog-head"><div><span class="dialog-kicker">历史记录</span><h3>${escapeHtml(info.title)}</h3></div><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
        <dl class="record-facts"><div><dt>日期</dt><dd>${escapeHtml(record.date || "未记录")}</dd></div><div><dt>当前</dt><dd>${escapeHtml(record.current || 0)} ${escapeHtml(record.unit || "")}</dd></div><div><dt>目标</dt><dd>${escapeHtml(record.target || 0)} ${escapeHtml(record.unit || "")}</dd></div></dl>
        ${record.note ? `<p class="record-note">${escapeHtml(record.note)}</p>` : ""}`;
    }
    return `<div class="dialog-head"><div><span class="dialog-kicker">${escapeHtml(dayName(record.training_day))}</span><h3>${escapeHtml(record.title)}</h3></div><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
      <dl class="record-facts"><div><dt>日期</dt><dd>${escapeHtml(record.date)}</dd></div><div><dt>时长</dt><dd>${escapeHtml(record.duration_min || 0)} 分钟</dd></div><div><dt>完成</dt><dd>${info.setCount} 组</dd></div><div><dt>容量</dt><dd>${Math.round(info.volume)} kg</dd></div></dl>
      <div class="record-exercises">${(record.exercises || []).map(exercise => `<section><h4>${escapeHtml(exercise.name)}</h4>${(exercise.sets || []).map((set, index) => `<div class="record-set"><span>第 ${index + 1} 组</span><b>${escapeHtml(set.weight_kg || 0)} kg × ${escapeHtml(set.reps || 0)}</b><em>${set.completed ? "已完成" : "未完成"}${set.rpe ? ` · RPE ${escapeHtml(set.rpe)}` : ""}</em></div>`).join("")}</section>`).join("") || `<div class="session-empty">本次训练没有动作记录。</div>`}</div>
      ${record.note ? `<p class="record-note">${escapeHtml(record.note)}</p>` : ""}`;
  }

  function exerciseLibraryHtml(selectedDay, selectedExercises) {
    const selectedIds = new Set((selectedExercises || []).map(item => item.exercise_id));
    const library = root.WorkoutCatalog.forDay(selectedDay);
    return `<div class="dialog-head"><div><span class="dialog-kicker">${escapeHtml(dayName(selectedDay))}</span><h3>添加训练动作</h3></div><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
      <div class="exercise-library dialog-library">${library.map(item => {
        const added = selectedIds.has(item.id);
        return `<button type="button" class="exercise-option ${added ? "is-added" : ""}" data-add-exercise="${item.id}" ${added ? "disabled" : ""}><span class="info"><span class="name">${escapeHtml(item.name)}</span><span class="meta">${escapeHtml(item.bodyPart)} · ${escapeHtml(item.equipment)}</span></span><span class="exercise-state">${added ? "已添加" : "+ 添加"}</span></button>`;
      }).join("")}</div>`;
  }

  function legacyEditHtml(record) {
    return `<form id="legacy-edit-form"><div class="dialog-head"><div><span class="dialog-kicker">编辑旧版记录</span><h3>${escapeHtml(record.title || "运动记录")}</h3></div><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
      <div class="legacy-fields"><div class="workout-field"><label for="legacy-title">名称</label><input id="legacy-title" name="title" required value="${escapeHtml(record.title || "")}"></div><div class="workout-field"><label for="legacy-date">日期</label><input id="legacy-date" name="date" type="date" value="${escapeHtml(record.date || "")}"></div><div class="workout-field"><label for="legacy-current">当前</label><input id="legacy-current" name="current" type="number" min="0" value="${escapeHtml(record.current || 0)}"></div><div class="workout-field"><label for="legacy-target">目标</label><input id="legacy-target" name="target" type="number" min="0" value="${escapeHtml(record.target || 0)}"></div><div class="workout-field"><label for="legacy-unit">单位</label><input id="legacy-unit" name="unit" value="${escapeHtml(record.unit || "")}"></div><div class="workout-field note"><label for="legacy-note">备注</label><input id="legacy-note" name="note" value="${escapeHtml(record.note || "")}"></div></div>
      <div class="dialog-actions"><button type="button" class="workout-btn" data-dialog-close>取消</button><button type="submit" class="workout-btn primary">保存修改</button></div></form>`;
  }

  root.WorkoutView = { editorHtml, idleHtml, detailHtml, exerciseLibraryHtml, legacyEditHtml };
})(typeof window !== "undefined" ? window : null);
