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
    return `<div class="workout-summary" aria-label="训练统计">
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
    return `<div class="quick-exercises" aria-label="常用动作">${items.map(item => `<button type="button" data-quick-add="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>`).join("")}<button type="button" class="more" data-open-library>更多动作</button></div>`;
  }

  function historyHtml(records) {
    if (!records.length) return `<div class="session-empty">还没有训练记录，选择训练日开始第一练。</div>`;
    const ordered = [...records];
    root.Workout.sortRecords(ordered);
    // 按月份分组展示；旧版无日期记录归入「日期未记录」
    const groups = [];
    let month = null;
    ordered.forEach(record => {
      const info = root.Workout.summary(record);
      const key = (info.date || record.date || "").slice(0, 7);
      if (key !== month) { month = key; groups.push({ month: key, items: [] }); }
      groups[groups.length - 1].items.push({ record, info });
    });
    return `<div class="workout-history">${groups.map(group => {
      const label = group.month ? group.month.replace(/-0?(\d)$/, " 年 $1 月") : "日期未记录";
      const cards = group.items.map(({ record, info }) => {
        const meta = info.legacy
          ? `<span>${escapeHtml(record.date || "日期未记录")}</span><span>${escapeHtml(record.current || 0)}/${escapeHtml(record.target || 0)} ${escapeHtml(record.unit || "")}</span>`
          : `<span>${escapeHtml(info.date)}</span><span>${info.exerciseCount} 个动作</span><span>${info.setCount} 组</span><span>${info.duration || 0} 分钟</span>`;
        return `<article class="history-card">
        <div class="history-card-copy"><h4>${escapeHtml(info.title)}</h4><div class="history-meta">${meta}</div></div>
        <div class="history-actions">
          <button type="button" class="workout-btn compact" data-history-view="${escapeHtml(record.id)}">详情</button>
          <button type="button" class="workout-btn compact" data-history-edit="${escapeHtml(record.id)}">编辑</button>
          <button type="button" class="icon-action danger" data-history-delete="${escapeHtml(record.id)}" title="删除记录" aria-label="删除记录">×</button>
        </div>
      </article>`;
      }).join("");
      return `<section class="history-group-block"><h5 class="history-month">${label}</h5><div class="history-group">${cards}</div></section>`;
    }).join("")}</div>`;
  }

  function setRows(exercise, exerciseIndex) {
    // 纵向组卡片在手机上一屏可完整查看，避免横向滚动。
    return exercise.sets.map((set, setIndex) => `<div class="set-row ${set.completed ? "completed" : ""}">
      <div class="set-row-head"><strong>第 ${setIndex + 1} 组</strong><button type="button" class="set-done ${set.completed ? "on" : ""}" data-set-done="1" data-exercise="${exerciseIndex}" data-set="${setIndex}" title="完成本组" aria-label="完成第 ${setIndex + 1} 组">✓</button><button type="button" class="icon-action" data-set-delete="1" data-exercise="${exerciseIndex}" data-set="${setIndex}" title="删除本组" aria-label="删除第 ${setIndex + 1} 组">×</button></div>
      <div class="set-fields${exercise.equipment === "有氧" || exercise.equipment === "恢复" ? " cardio-fields" : ""}">
        ${exercise.equipment === "有氧" || exercise.equipment === "恢复" ? `<label><span>时长（分）</span><input type="number" min="1" value="${escapeHtml(set.duration_min)}" data-set-field="duration_min" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="时长"></label><label><span>距离 km</span><input type="number" min="0" step="0.1" value="${escapeHtml(set.distance_km)}" data-set-field="distance_km" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="距离"></label><label><span>配速</span><input value="${escapeHtml(set.pace)}" data-set-field="pace" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="配速"></label>` : [
          ["重量 kg", "weight_kg", "-2.5", "2.5", "0"], ["次数", "reps", "-1", "1", "1"]
        ].map(([label, field, down, up, min]) => `<label><span>${label}</span><div class="stepper"><button type="button" class="stepper-btn" data-set-adjust="${field}" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-step="${down}" aria-label="减少${label}">−</button><input type="number" min="${min}" step="${field === "weight_kg" ? "2.5" : "1"}" value="${escapeHtml(set[field])}" data-set-field="${field}" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="${label}"><button type="button" class="stepper-btn" data-set-adjust="${field}" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-step="${up}" aria-label="增加${label}">+</button></div></label>`).join("")}<label><span>RPE</span><input type="number" min="1" max="10" step="1" value="${escapeHtml(set.rpe)}" data-set-field="rpe" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="RPE"></label>
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
        <main class="workout-panel"><div class="workout-panel-title"><span>当前训练</span><button type="button" class="workout-btn compact" id="workout-add-exercise">+ 添加动作</button></div><p class="workout-hint">动作会带入最近一次完成组；新组默认已完成，不练可直接删掉或取消勾选。</p><div class="session-list">${session.exercises.length ? session.exercises.map((exercise, exerciseIndex) => {
          const previous = root.Workout.previousPerformance(history, exercise.exercise_id);
          const lastText = previous ? (exercise.equipment === "有氧" || exercise.equipment === "恢复" ? `上次 ${escapeHtml(previous.date)} · ${escapeHtml(previous.set.duration_min || 0)} 分钟` : `上次 ${escapeHtml(previous.date)} · ${escapeHtml(previous.set.weight_kg)} kg × ${escapeHtml(previous.set.reps)}`) : "首次记录此动作";
          const completedSets = exercise.sets.filter(set => set.completed).length;
          return `<article class="session-exercise"><div class="session-exercise-head"><div><strong>${escapeHtml(exercise.name)}</strong><span>${escapeHtml(exercise.body_part)} · ${lastText}</span><em class="set-progress ${completedSets === exercise.sets.length ? "all-done" : ""}">${completedSets}/${exercise.sets.length} 组</em></div><button type="button" class="icon-action" data-exercise-delete="${exerciseIndex}" title="移除动作" aria-label="移除${escapeHtml(exercise.name)}">×</button></div><div class="set-list">${setRows(exercise, exerciseIndex)}</div><div class="session-exercise-foot"><button type="button" data-set-add="${exerciseIndex}">+ 加一组</button><button type="button" data-exercise-info="${exerciseIndex}">动作说明</button></div></article>`;
        }).join("") : `<div class="session-empty">点击“添加动作”安排本次训练。</div>`}</div><div class="workout-add-floating"><button type="button" class="workout-btn primary" id="workout-add-floating">+ 添加动作</button></div></main>
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
    return `<section class="workout-app"><div class="workout-head"><div><h2>运动健身</h2><p>按训练日快速安排动作，记录每一组重量与次数。</p></div>
      <div class="workout-head-actions"><button type="button" class="workout-btn plan-menu-icon" id="workout-plan-menu" aria-label="训练计划" title="训练计划" aria-expanded="false">☰</button><div class="workout-plan-actions" hidden><button type="button" class="workout-btn" id="workout-preferences">编辑运动偏好</button><button type="button" class="workout-btn primary" id="workout-plan">生成六天计划</button><button type="button" class="workout-btn" id="workout-plan-view">查看计划</button></div></div>
      </div>
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
