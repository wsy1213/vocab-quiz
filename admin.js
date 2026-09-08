function el(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function statusLabel(status) {
  if (status === "correct") return "对";
  if (status === "aiReviewCorrect") return "AI复核对";
  if (status === "wrong") return "错";
  return "未答";
}

const MODES = {
  cet4: "四级考核",
  cet4ReviewQxh: "四级复习考核（齐小涵）",
  cet4ReviewWlh: "四级复习考核（武琳昊）",
  cet6: "六级考核",
};

function getRecordMode(record) {
  if (record.exam_mode) return record.exam_mode;
  const details = Array.isArray(record.details) ? record.details : [];
  const hasHanToEng = details.some(item => item.direction === "zhToEn");
  if (hasHanToEng && Number(record.total_count) === 60) return "cet4ReviewWlh";
  if (hasHanToEng && Number(record.total_count) === 100) return "cet4ReviewQxh";
  const hasCet6Source = details.some(item => Number(item.sourceId) > 0);
  if (hasCet6Source) return "cet6";
  return "cet4";
}

function getRecordModeLabel(record) {
  const mode = getRecordMode(record);
  return record.exam_mode_label || MODES[mode] || "未知模式";
}

function getQuestionPrompt(item) {
  return item.direction === "zhToEn" ? item.meaning : item.word;
}

function getCorrectAnswer(item) {
  return item.direction === "zhToEn" ? item.word : item.meaning;
}

function getDetailPhoneticHtml(item) {
  return item.direction === "zhToEn" ? "" : `<span class="q-phonetic">${escapeHtml(item.phonetic || "")}</span>`;
}

function getClient() {
  const cfg = window.APP_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || cfg.supabaseUrl.includes("YOUR_")) {
    el("loadState").textContent = "请先在 config.js 填好 Supabase 配置";
    return null;
  }
  return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
}

function render(records) {
  const list = el("recordList");
  list.innerHTML = "";

  records.forEach((r) => {
    const details = Array.isArray(r.details) ? r.details : [];
    const correctCount = details.filter((x) => ["correct", "aiReviewCorrect"].includes(x.status)).length;
    const aiReviewCorrectCount = details.filter((x) => x.status === "aiReviewCorrect").length;
    const wrongCount = details.filter((x) => !["correct", "aiReviewCorrect"].includes(x.status)).length;
    const modeLabel = getRecordModeLabel(r);

    const detailHtml = details
      .map(
        (item) => {
          const typeLabel = item.direction === "zhToEn" ? "汉译英" : "英译汉";
          const reviewReason = item.ai_review_reason ? `<div class="review-reason">AI复核：${escapeHtml(item.ai_review_reason)}</div>` : "";
          return `
        <div class="wrong-item ${item.status}">
          <div class="detail-head">
            <span class="status-tag ${item.status}">${statusLabel(item.status)}</span>
            <span class="q-type">${typeLabel}</span>
            <strong>${item.index}. ${escapeHtml(getQuestionPrompt(item))}</strong>
            ${getDetailPhoneticHtml(item)}
          </div>
          <div>你的答案：${escapeHtml(item.answer || "（空）")}</div>
          <div>正确答案：${escapeHtml(getCorrectAnswer(item))}</div>
          ${reviewReason}
        </div>
      `;
        }
      )
      .join("");

    const wrap = document.createElement("details");
    wrap.className = "card admin-record";
    wrap.innerHTML = `
      <summary>
        <strong>${escapeHtml(modeLabel)}</strong>
        <span class="meta-split">|</span>
        ${escapeHtml(r.submit_time || "")}
        <span class="meta-split">|</span>
        第 ${Number(r.group_no) || "-"} 组
        <span class="meta-split">|</span>
        得分：${correctCount} / ${Number(r.total_count) || 0}
        <span class="meta-split">|</span>
        AI复核对：${aiReviewCorrectCount}
        <span class="meta-split">|</span>
        错/未答：${wrongCount}
        <span class="meta-split">|</span>
        用时：${escapeHtml(r.used_time || "-")}
      </summary>
      <div class="admin-detail-wrap">
        <div class="hint">模式：${escapeHtml(modeLabel)} | 设备：${escapeHtml(r.device_name || "未知设备")} | 设备ID：${escapeHtml(r.client_id || "-")}</div>
        <div class="hint">系统：${escapeHtml(r.platform || "-")} | 语言：${escapeHtml(r.language || "-")} | 时区：${escapeHtml(r.timezone || "-")}</div>
        ${detailHtml || "<div class='hint'>该记录没有答题明细</div>"}
      </div>
    `;
    list.appendChild(wrap);
  });

  el("totalCount").textContent = `总记录：${records.length}`;
}

async function loadRecords() {
  const client = getClient();
  if (!client) return;

  el("loadState").textContent = "加载中...";

  try {
    const { data, error } = await client
      .from("exam_results")
      .select("id, submit_time, group_no, total_count, used_time, details, exam_mode, exam_mode_label, client_id, device_name, user_agent, platform, language, timezone")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      if (!/exam_mode|exam_mode_label|column/i.test(error.message || "")) {
        el("loadState").textContent = `加载失败：${error.message}`;
        return;
      }
      const fallback = await client
        .from("exam_results")
        .select("id, submit_time, group_no, total_count, used_time, details, client_id, device_name, user_agent, platform, language, timezone")
        .order("created_at", { ascending: false })
        .limit(200);
      if (fallback.error) {
        el("loadState").textContent = `加载失败：${fallback.error.message}`;
        return;
      }
      render(fallback.data || []);
      el("loadState").textContent = "加载完成";
      return;
    }

    render(data || []);
    el("loadState").textContent = "加载完成";
  } catch (e) {
    el("loadState").textContent = `加载失败：${e.message}（可能 Supabase 项目已暂停，请到 Dashboard 恢复）`;
  }
}

el("refreshBtn").addEventListener("click", loadRecords);
loadRecords();
