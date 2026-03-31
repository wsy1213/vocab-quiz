const state = {
  words: [],
  groupSize: 375,
  currentGroup: 1,
  questions: [],
  answers: [],
  durationMin: 30,
  sampleCount: 100,
  timerId: null,
  startTime: null,
  submitted: false
};

const el = (id) => document.getElementById(id);

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

function isCorrect(answer, meaning) {
  const a = normalize(answer);
  if (!a) return false;
  const tokens = buildMeaningTokens(meaning);
  return tokens.some(t => t && (t.includes(a) || a.includes(t)));
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
    wrap.innerHTML = `
      <div class="q-head">
        <div class="q-index">${idx + 1}.</div>
        <div class="q-word">${q.word}</div>
        <div class="q-phonetic">${q.phonetic || ''}</div>
      </div>
      <input class="answer" type="text" placeholder="填写中文意思" data-idx="${idx}" />
    `;
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

function submitExam(isAuto = false) {
  if (state.submitted) return;
  state.submitted = true;
  stopTimer();

  const total = state.questions.length;
  let correct = 0;
  const detailList = [];

  state.questions.forEach((q, idx) => {
    const ans = state.answers[idx] || '';
    const ok = isCorrect(ans, q.meaning);
    const answered = normalize(ans).length > 0;
    if (ok) correct += 1;
    detailList.push({
      index: idx + 1,
      word: q.word,
      phonetic: q.phonetic,
      meaning: q.meaning,
      answer: ans,
      status: answered ? (ok ? 'correct' : 'wrong') : 'blank'
    });
  });

  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const used = formatTime(elapsed);
  const endTime = new Date();

  el('scoreText').textContent = `得分：${correct} / ${total}`;
  el('metaText').innerHTML = `<span class="time-strong">交卷时间：${formatDateTime(endTime)}</span> <span class="meta-split">|</span> 组别：第 ${state.currentGroup} 组 <span class="meta-split">|</span> 用时：${used} <span class="meta-split">|</span> ${isAuto ? '已到时间自动交卷' : '手动交卷'}`;

  const list = el('wrongList');
  list.innerHTML = '';
  detailList.forEach(item => {
    const div = document.createElement('div');
    div.className = `wrong-item ${item.status}`;
    const label = item.status === 'correct' ? '对' : item.status === 'wrong' ? '错' : '未答';
    div.innerHTML = `
      <div class="detail-head">
        <span class="status-tag ${item.status}">${label}</span>
        <strong>${item.index}. ${item.word}</strong>
        <span class="q-phonetic">${item.phonetic || ''}</span>
      </div>
      <div>你的答案：${item.answer || '（空）'}</div>
      <div>正确释义：${item.meaning}</div>
    `;
    list.appendChild(div);
  });

  el('quiz').classList.add('hidden');
  el('result').classList.remove('hidden');
}

function startExam() {
  state.submitted = false;
  const groupNo = Number(el('groupSelect').value);
  state.currentGroup = groupNo;
  state.sampleCount = Math.max(1, Number(el('sampleCount').value) || 100);
  state.durationMin = Math.max(1, Number(el('duration').value) || 30);

  const startIdx = (groupNo - 1) * state.groupSize;
  const endIdx = startIdx + state.groupSize;
  const groupItems = state.words.slice(startIdx, endIdx);

  const pickCount = Math.min(groupItems.length, state.sampleCount);
  state.questions = shuffle(groupItems).slice(0, pickCount);
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
  let data = null;
  if (window.WORDS_DATA) {
    data = window.WORDS_DATA;
  } else {
    const res = await fetch('data/words.json');
    data = await res.json();
  }
  state.words = data.items || [];
  state.groupSize = data.groupSize || 375;

  const totalGroups = Math.ceil(state.words.length / state.groupSize);
  const select = el('groupSelect');
  select.innerHTML = '';
  for (let i = 1; i <= totalGroups; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `第 ${i} 组`;
    select.appendChild(opt);
  }

  el('startBtn').addEventListener('click', startExam);
  el('submitBtn').addEventListener('click', () => {
    if (confirm('确定要交卷吗？')) submitExam(false);
  });
  el('restartBtn').addEventListener('click', () => {
    el('result').classList.add('hidden');
    el('setup').classList.remove('hidden');
    el('timer').textContent = formatTime(state.durationMin * 60);
  });
}

init();
