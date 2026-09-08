const state = {
  mode: 'cet4',
  dataByMode: {},
  words: [],
  groupSize: 375,
  currentGroup: 1,
  questions: [],
  answers: [],
  durationMin: 30,
  sampleCount: 100,
  timerId: null,
  startTime: null,
  submitted: false,
  activeExam: null
};

const el = (id) => document.getElementById(id);
const CLIENT_ID_KEY = 'vocab_quiz_client_id';
const REVIEW_MODES = ['cet4ReviewQxh', 'cet4ReviewWlh'];
const MODES = {
  cet4: {
    title: 'CET-4 词汇测试',
    sub: '每组 375 个单词，随机抽取 100 个，30 分钟计时',
    label: '四级考核',
    dataKey: 'cet4',
    groupSize: 375,
    sampleDefault: 100,
    sampleMax: 100,
    sampleDisabled: false,
    hanToEngRatio: 0,
    sampleHint: '默认 100（若本组不足 100，则全部抽取）',
    rule: '评分规则：你的答案与释义中的任一片段匹配即视为正确（忽略空格与标点）。'
  },
  cet4ReviewQxh: {
    title: 'CET-4 复习考核（齐小涵）',
    sub: '按原四级词表顺序切成 45 组，每组 100 个，组内乱序作答',
    label: '四级复习考核（齐小涵）',
    dataKey: 'cet4',
    groupSize: 100,
    sampleDefault: 100,
    sampleMax: 100,
    sampleDisabled: true,
    hanToEngRatio: 0.3,
    sampleHint: '复习模式固定整组考核；最后一组不足 100 个则全部考',
    rule: '四级复习考核沿用四级考核的单词原始顺序分组，开考后组内乱序；题型为英译汉和汉译英混合，强化拼写与释义掌握。'
  },
  cet4ReviewWlh: {
    title: 'CET-4 复习考核（武琳昊）',
    sub: '按原四级词表顺序切组，每组 60 个，组内乱序作答',
    label: '四级复习考核（武琳昊）',
    dataKey: 'cet4',
    groupSize: 60,
    sampleDefault: 60,
    sampleMax: 60,
    sampleDisabled: true,
    hanToEngRatio: 0.3,
    sampleHint: '武琳昊模式固定整组考核；最后一组不足 60 个则全部考',
    rule: '武琳昊四级复习模式沿用四级考核的单词原始顺序分组，开考后组内乱序；题型为英译汉和汉译英混合，强化拼写与释义掌握。'
  },
  cet6: {
    title: 'CET-6 词汇测试',
    sub: '已去除四级重复词，按乱序版 PDF 顺序每 200 个分组，随机抽取 100 个，30 分钟计时',
    label: '六级考核',
    dataKey: 'cet6',
    groupSize: 200,
    sampleDefault: 100,
    sampleMax: 100,
    sampleDisabled: false,
    hanToEngRatio: 0,
    sampleHint: '默认从本组 200 个词里随机抽 100 个（最后一组不足 100 个则全部抽取）',
    rule: '六级词表来自新版乱序 PDF，已去除四级重复词并补充音标；选择组别按乱序版 PDF 顺序每 200 个词划分，开考后随机抽题并乱序。'
  }
};

function getSupabaseClient() {
  const cfg = window.APP_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || cfg.supabaseUrl.includes('YOUR_')) {
    return null;
  }
  if (!window.supabase || !window.supabase.createClient) {
    return null;
  }
  return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
}

function getSupabaseFunctionUrl(name) {
  const cfg = window.APP_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || cfg.supabaseUrl.includes('YOUR_')) {
    return '';
  }
  return `${cfg.supabaseUrl.replace(/\/+$/, '')}/functions/v1/${name}`;
}

function getOrCreateClientId() {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const id = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : `cid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch (_) {
    return `cid_fallback_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getClientInfo() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const language = navigator.language || '';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const deviceName = `${platform || 'Unknown Platform'} / ${language || 'Unknown Language'}`;
  return {
    client_id: getOrCreateClientId(),
    device_name: deviceName,
    user_agent: ua,
    platform,
    language,
    timezone
  };
}

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatDateTime(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，,。.;；:：!?！？“”"'‘’()（）\[\]{}<>《》\-_/\\|]/g, '');
}

function buildMeaningTokens(meaning) {
  const raw = String(meaning || '');
  const parts = raw.split(/[;；。\.、,，\/\n]+/).map(s => normalize(s)).filter(Boolean);
  return parts.length ? parts : [normalize(raw)];
}

function isInitiallyCorrect(answer, meaning) {
  const a = normalize(answer);
  if (!a) return false;
  const tokens = buildMeaningTokens(meaning);
  return tokens.some(t => t && (t.includes(a) || a.includes(t)));
}

function judgeAnswer(answer, question) {
  if (question.direction === 'zhToEn') {
    return isWordCorrect(answer, question.word) ? 'correct' : 'wrong';
  }
  if (isInitiallyCorrect(answer, question.meaning)) return 'correct';
  return 'wrong';
}

async function reviewAnswersWithAI(detailList) {
  const cfg = window.APP_CONFIG || {};
  const functionUrl = getSupabaseFunctionUrl('review-answers');
  if (!cfg.aiReviewEnabled || !functionUrl || !cfg.supabaseAnonKey) {
    return { aiReviewed: 0, aiCorrect: 0, skipped: true };
  }

  const pending = detailList
    .filter(item => item.direction === 'enToZh' && item.status === 'wrong' && normalize(item.answer).length > 0)
    .map(item => ({
      index: item.index,
      word: item.word,
      answer: item.answer,
      meaning: item.meaning
    }));

  if (!pending.length) {
    return { aiReviewed: 0, aiCorrect: 0, skipped: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'apikey': cfg.supabaseAnonKey,
        'Authorization': `Bearer ${cfg.supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ items: pending }),
      signal: controller.signal
    });

    if (!res.ok) throw new Error(`AI复核接口返回 ${res.status}`);
    const data = await res.json();
    const resultMap = new Map((data.results || []).map(item => [Number(item.index), item]));
    let aiCorrect = 0;

    detailList.forEach(item => {
      const result = resultMap.get(Number(item.index));
      if (!result) return;
      item.ai_reviewed = true;
      item.ai_review_reason = result.reason || '';
      if (result.correct) {
        item.status = 'aiReviewCorrect';
        aiCorrect += 1;
      }
    });

    return { aiReviewed: pending.length, aiCorrect, skipped: false };
  } finally {
    clearTimeout(timer);
  }
}

function isWordCorrect(answer, word) {
  return normalize(answer) === normalize(word);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const left = Math.max(0, state.durationMin * 60 - elapsed);
  el('timer').textContent = formatTime(left);
  if (left === 0) submitExam(true);
}

function stopTimer() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
}

function renderDirectory() {
  const list = el('dirList');
  list.innerHTML = '';
  state.questions.forEach((_, idx) => {
    const item = document.createElement('div');
    item.className = 'dir-item ' + (state.answers[idx] ? 'answered' : 'unanswered');
    item.textContent = idx + 1;
    item.addEventListener('click', () => {
      const target = document.getElementById(`q-${idx}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    list.appendChild(item);
  });
}

function renderQuestions() {
  const container = el('questionList');
  container.innerHTML = '';
  state.questions.forEach((q, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'question';
    wrap.id = `q-${idx}`;
    if (q.direction === 'zhToEn') {
      wrap.innerHTML = `
        <div class="q-head">
          <div class="q-index">${idx + 1}.</div>
          <div class="q-type">汉译英</div>
        </div>
        <div class="q-meaning-prompt">${q.meaning}</div>
        <input class="answer" type="text" placeholder="填写英文单词" data-idx="${idx}" />
      `;
    } else {
      wrap.innerHTML = `
        <div class="q-head">
          <div class="q-index">${idx + 1}.</div>
          <div class="q-type">英译汉</div>
          <div class="q-word">${q.word}</div>
          <div class="q-phonetic">${q.phonetic || ''}</div>
        </div>
        <input class="answer" type="text" placeholder="填写中文意思" data-idx="${idx}" />
      `;
    }
    container.appendChild(wrap);
  });

  container.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.classList.contains('answer')) return;
    const idx = Number(t.dataset.idx);
    state.answers[idx] = t.value;
    renderDirectory();
  });
}

function buildQuestions(groupItems, pickCount, cfg) {
  const picked = shuffle(groupItems).slice(0, pickCount).map(item => ({ ...item, direction: 'enToZh' }));
  const hanToEngCount = Math.round(picked.length * (cfg.hanToEngRatio || 0));
  shuffle(picked.map((_, idx) => idx)).slice(0, hanToEngCount).forEach(idx => {
    picked[idx].direction = 'zhToEn';
  });
  return picked;
}

function getModeConfig() {
  return MODES[state.mode] || MODES.cet4;
}

function getTotalGroups() {
  return Math.ceil(state.words.length / state.groupSize);
}

function populateGroups() {
  const totalGroups = getTotalGroups();
  const select = el('groupSelect');
  select.innerHTML = '';
  for (let i = 1; i <= totalGroups; i++) {
    const start = (i - 1) * state.groupSize + 1;
    const end = Math.min(i * state.groupSize, state.words.length);
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `第 ${i} 组（${start}-${end}）`;
    select.appendChild(opt);
  }
}

function applyMode(mode) {
  state.mode = mode === 'cet4Review' ? 'cet4ReviewQxh' : mode;
  const cfg = getModeConfig();
  const data = state.dataByMode[cfg.dataKey] || { items: [] };
  state.words = data.items || [];
  state.groupSize = cfg.groupSize || data.groupSize || 100;

  el('appTitle').textContent = cfg.title;
  el('appSub').textContent = cfg.sub;
  el('sampleCount').value = String(cfg.sampleDefault);
  el('sampleCount').max = String(cfg.sampleMax);
  el('sampleCount').disabled = Boolean(cfg.sampleDisabled);
  el('sampleHint').textContent = cfg.sampleHint;
  el('modeRule').textContent = cfg.rule;
  populateGroups();
}

async function uploadResult(payload, reviewWarning = '') {
  const statusEl = el('uploadState');
  if (statusEl) {
    statusEl.textContent = '成绩上传状态：上传中...';
    statusEl.className = 'upload-state pending';
  }

  const client = getSupabaseClient();
  if (!client) {
    if (statusEl) {
      statusEl.textContent = '成绩上传状态：未配置 Supabase（请填写 config.js）';
      statusEl.className = 'upload-state warn';
    }
    return false;
  }

  let { error } = await client.from('exam_results').insert(payload);
  if (error && /exam_mode|exam_mode_label|column/i.test(error.message || '')) {
    const { exam_mode, exam_mode_label, ...fallbackPayload } = payload;
    const retry = await client.from('exam_results').insert(fallbackPayload);
    error = retry.error;
  }
  if (error) {
    if (statusEl) {
      statusEl.textContent = `成绩上传状态：失败（${error.message}）`;
      statusEl.className = 'upload-state fail';
    }
    return false;
  }

  if (statusEl) {
    statusEl.textContent = reviewWarning ? `成绩上传状态：已上传；${reviewWarning}` : '成绩上传状态：已上传';
    statusEl.className = 'upload-state ok';
  }
  return true;
}

function getRecordMode(record) {
  if (record.exam_mode) return record.exam_mode;
  const details = Array.isArray(record.details) ? record.details : [];
  const hasHanToEng = details.some(item => item.direction === 'zhToEn');
  if (!hasHanToEng) return '';
  if (Number(record.total_count) === 60) return 'cet4ReviewWlh';
  if (Number(record.total_count) === 100) return 'cet4ReviewQxh';
  return '';
}

function getRecordModeLabel(record) {
  const mode = getRecordMode(record);
  return record.exam_mode_label || (MODES[mode] ? MODES[mode].label : '未知模式');
}

function getReviewedDetails(record) {
  const details = Array.isArray(record.details) ? record.details : [];
  return details.map(item => {
    if (item.status === 'aiReviewCorrect') return item;
    const answer = item.answer || '';
    const answered = normalize(answer).length > 0;
    return {
      ...item,
      status: answered ? judgeAnswer(answer, item) : 'blank'
    };
  });
}

function getRecordCorrectCount(record) {
  const details = getReviewedDetails(record);
  if (!details.length && typeof record.correct_count === 'number') return record.correct_count;
  return details.filter(isDetailCorrect).length;
}

function isDetailCorrect(item) {
  return item.status === 'correct' || item.status === 'aiReviewCorrect';
}

function getStatusLabel(status) {
  if (status === 'correct') return '初判对';
  if (status === 'aiReviewCorrect') return 'AI复核对';
  if (status === 'wrong') return '错';
  return '未答';
}

function getQuestionPrompt(item) {
  return item.direction === 'zhToEn' ? item.meaning : item.word;
}

function getCorrectAnswer(item) {
  return item.direction === 'zhToEn' ? item.word : item.meaning;
}

function getDetailPhoneticHtml(item) {
  return item.direction === 'zhToEn' ? '' : `<span class="q-phonetic">${escapeHtml(item.phonetic || '')}</span>`;
}

function renderHistory(records) {
  const list = el('historyList');
  const summary = el('historySummary');
  list.innerHTML = '';

  if (!records.length) {
    summary.textContent = '暂无四级复习考核记录';
    list.innerHTML = '<div class="hint">完成一次齐小涵或武琳昊四级复习考核并成功上传后，会显示在这里。</div>';
    return;
  }

  const totalExams = records.length;
  const avgScore = Math.round(records.reduce((sum, r) => {
    const total = Number(r.total_count) || 0;
    return sum + (total ? getRecordCorrectCount(r) / total * 100 : 0);
  }, 0) / totalExams);
  const latest = records[0];
  summary.textContent = `共 ${totalExams} 次记录，平均 ${avgScore} 分；最近一次：${getRecordModeLabel(latest)} 第 ${Number(latest.group_no) || '-'} 组`;

  records.forEach(record => {
    const details = getReviewedDetails(record);
    const correct = getRecordCorrectCount(record);
    const total = Number(record.total_count) || details.length || 0;
    const score = total ? Math.round(correct / total * 100) : 0;
    const wrongCount = details.filter(item => !isDetailCorrect(item)).length;
    const aiReviewCorrectCount = details.filter(item => item.status === 'aiReviewCorrect').length;
    const modeLabel = getRecordModeLabel(record);
    const detailHtml = details.map(item => {
      const typeLabel = item.direction === 'zhToEn' ? '汉译英' : '英译汉';
      return `
        <div class="history-detail ${escapeHtml(item.status)}">
          <div class="detail-head">
            <span class="status-tag ${escapeHtml(item.status)}">${getStatusLabel(item.status)}</span>
            <span class="q-type">${typeLabel}</span>
            <strong>${escapeHtml(item.index)}. ${escapeHtml(getQuestionPrompt(item))}</strong>
            ${getDetailPhoneticHtml(item)}
          </div>
          <div>答案：${escapeHtml(item.answer || '（空）')}</div>
          <div>正确：${escapeHtml(getCorrectAnswer(item))}</div>
        </div>
      `;
    }).join('');

    const wrap = document.createElement('details');
    wrap.className = 'history-record';
    wrap.innerHTML = `
      <summary>
        <span class="history-score">${score} 分</span>
        <strong>${escapeHtml(modeLabel)}</strong>
        <span class="meta-split">|</span>
        第 ${Number(record.group_no) || '-'} 组
        <span class="meta-split">|</span>
        ${correct} / ${total}
        <span class="meta-split">|</span>
        AI复核对 ${aiReviewCorrectCount}
        <span class="meta-split">|</span>
        错/未答 ${wrongCount}
        <span class="meta-split">|</span>
        ${escapeHtml(record.submit_time || '')}
        <span class="meta-split">|</span>
        用时 ${escapeHtml(record.used_time || '-')}
      </summary>
      <div class="history-detail-list">
        ${detailHtml || '<div class="hint">该记录没有答题明细</div>'}
      </div>
    `;
    list.appendChild(wrap);
  });
}

async function loadHistory() {
  const statusEl = el('historyState');
  const person = el('historyPersonSelect').value;
  const client = getSupabaseClient();
  if (!client) {
    statusEl.textContent = '未配置 Supabase，无法读取历史记录';
    renderHistory([]);
    return;
  }

  statusEl.textContent = '加载中...';
  let query = 'id, created_at, submit_time, group_no, total_count, correct_count, used_time, details, exam_mode, exam_mode_label';
  let result = await client
    .from('exam_results')
    .select(query)
    .order('created_at', { ascending: false })
    .limit(200);

  if (result.error && /exam_mode|exam_mode_label|column/i.test(result.error.message || '')) {
    result = await client
      .from('exam_results')
      .select('id, created_at, submit_time, group_no, total_count, correct_count, used_time, details')
      .order('created_at', { ascending: false })
      .limit(200);
  }

  if (result.error) {
    statusEl.textContent = `加载失败：${result.error.message}`;
    renderHistory([]);
    return;
  }

  const records = (result.data || [])
    .filter(record => REVIEW_MODES.includes(getRecordMode(record)))
    .filter(record => person === 'all' || getRecordMode(record) === person);
  statusEl.textContent = `已加载 ${records.length} 条`;
  renderHistory(records);
}

function renderResult(detailList, activeExam, total, correct, initialCorrect, aiReviewCorrect, used, endTime, isAuto) {
  el('scoreText').textContent = `得分：${correct} / ${total}（初判正确 ${initialCorrect}，AI复核 ${aiReviewCorrect}）`;
  el('metaText').innerHTML = `<span class="time-strong">交卷时间：${formatDateTime(endTime)}</span> <span class="meta-split">|</span> 模式：${activeExam.label} <span class="meta-split">|</span> 组别：第 ${state.currentGroup} 组 <span class="meta-split">|</span> 用时：${used} <span class="meta-split">|</span> ${isAuto ? '已到时间自动交卷' : '手动交卷'}`;

  const list = el('wrongList');
  list.innerHTML = '';
  detailList.forEach(item => {
    const div = document.createElement('div');
    div.className = `wrong-item ${item.status}`;
    const label = getStatusLabel(item.status);
    const typeLabel = item.direction === 'zhToEn' ? '汉译英' : '英译汉';
    const reviewReason = item.ai_review_reason ? `<div class="review-reason">AI复核：${escapeHtml(item.ai_review_reason)}</div>` : '';
    div.innerHTML = `
      <div class="detail-head">
        <span class="status-tag ${item.status}">${label}</span>
        <span class="q-type">${typeLabel}</span>
        <strong>${escapeHtml(item.index)}. ${escapeHtml(getQuestionPrompt(item))}</strong>
        ${getDetailPhoneticHtml(item)}
      </div>
      <div>你的答案：${escapeHtml(item.answer || '（空）')}</div>
      <div>正确答案：${escapeHtml(getCorrectAnswer(item))}</div>
      ${reviewReason}
    `;
    list.appendChild(div);
  });
}

async function submitExam(isAuto = false) {
  if (state.submitted) return;
  state.submitted = true;
  stopTimer();
  const activeExam = state.activeExam || {
    mode: state.mode,
    label: getModeConfig().label
  };

  const total = state.questions.length;
  let correct = 0;
  let initialCorrect = 0;
  let aiReviewCorrect = 0;
  const detailList = [];

  state.questions.forEach((q, idx) => {
    const ans = state.answers[idx] || '';
    const answered = normalize(ans).length > 0;
    const status = answered ? judgeAnswer(ans, q) : 'blank';
    if (status === 'correct') initialCorrect += 1;
    detailList.push({
      index: idx + 1,
      direction: q.direction,
      word: q.word,
      phonetic: q.phonetic,
      meaning: q.meaning,
      answer: ans,
      status
    });
  });

  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const used = formatTime(elapsed);
  const endTime = new Date();

  el('quiz').classList.add('hidden');
  el('result').classList.remove('hidden');

  const statusEl = el('uploadState');
  if (statusEl) {
    statusEl.textContent = '成绩上传状态：AI复核中...';
    statusEl.className = 'upload-state pending';
  }

  let reviewInfo = null;
  let reviewWarning = '';
  try {
    reviewInfo = await reviewAnswersWithAI(detailList);
  } catch (error) {
    reviewWarning = `AI复核失败，已使用本地复核结果（${error.message}）`;
    if (statusEl) {
      statusEl.textContent = `成绩上传状态：${reviewWarning}`;
      statusEl.className = 'upload-state warn';
    }
  }

  correct = detailList.filter(isDetailCorrect).length;
  initialCorrect = detailList.filter(item => item.status === 'correct').length;
  aiReviewCorrect = detailList.filter(item => item.status === 'aiReviewCorrect').length;

  renderResult(detailList, activeExam, total, correct, initialCorrect, aiReviewCorrect, used, endTime, isAuto);

  if (statusEl && reviewInfo && !reviewInfo.skipped) {
    statusEl.textContent = `成绩上传状态：AI已复核 ${reviewInfo.aiReviewed} 题，上传中...`;
    statusEl.className = 'upload-state pending';
  }

  await uploadResult({
    exam_mode: activeExam.mode,
    exam_mode_label: activeExam.label,
    group_no: state.currentGroup,
    total_count: total,
    correct_count: correct,
    used_time: used,
    is_auto_submit: isAuto,
    submit_time: formatDateTime(endTime),
    details: detailList,
    ...getClientInfo()
  }, reviewWarning);
}

function startExam() {
  state.submitted = false;
  const cfg = getModeConfig();
  const groupNo = Number(el('groupSelect').value);
  state.currentGroup = groupNo;
  state.activeExam = {
    mode: state.mode,
    label: cfg.label
  };
  state.sampleCount = cfg.sampleDisabled
    ? cfg.sampleDefault
    : Math.min(cfg.sampleMax, Math.max(1, Number(el('sampleCount').value) || cfg.sampleDefault));
  state.durationMin = Math.max(1, Number(el('duration').value) || 30);

  const startIdx = (groupNo - 1) * state.groupSize;
  const endIdx = startIdx + state.groupSize;
  const groupItems = state.words.slice(startIdx, endIdx);

  const pickCount = Math.min(groupItems.length, state.sampleCount);
  state.questions = buildQuestions(groupItems, pickCount, cfg);
  state.answers = Array(state.questions.length).fill('');

  el('setup').classList.add('hidden');
  el('result').classList.add('hidden');
  el('quiz').classList.remove('hidden');

  renderQuestions();
  renderDirectory();

  el('timer').textContent = formatTime(state.durationMin * 60);
  state.startTime = Date.now();
  stopTimer();
  state.timerId = setInterval(updateTimer, 500);
}

async function init() {
  let cet4Data = null;
  if (window.WORDS_DATA) {
    cet4Data = window.WORDS_DATA;
  } else {
    const res = await fetch('data/words.json');
    cet4Data = await res.json();
  }
  state.dataByMode = {
    cet4: cet4Data,
    cet6: window.CET6_WORDS_DATA || { items: [], groupSize: 100 }
  };

  applyMode(el('modeSelect').value || 'cet4');

  el('modeSelect').addEventListener('change', (e) => applyMode(e.target.value));
  el('historyRefreshBtn').addEventListener('click', loadHistory);
  el('historyPersonSelect').addEventListener('change', loadHistory);
  loadHistory();
  el('startBtn').addEventListener('click', startExam);
  el('submitBtn').addEventListener('click', () => {
    if (confirm('确定要交卷吗？')) submitExam(false);
  });
  el('restartBtn').addEventListener('click', () => {
    el('result').classList.add('hidden');
    el('setup').classList.remove('hidden');
    el('timer').textContent = formatTime(state.durationMin * 60);
    const statusEl = el('uploadState');
    if (statusEl) {
      statusEl.textContent = '成绩上传状态：未开始';
      statusEl.className = 'upload-state';
    }
  });
}

init();
