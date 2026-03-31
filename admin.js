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
  if (status === "wrong") return "错";
  return "未答";
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
    const correctCount = details.filter((x) => x.status === "correct").length;

    const detailHtml = details
      .map(
        (item) => `
        <div class="wrong-item ${item.status}">
          <div class="detail-head">
            <span class="status-tag ${item.status}">${statusLabel(item.status)}</span>
            <strong>${item.index}. ${escapeHtml(item.word)}</strong>
            <span class="q-phonetic">${escapeHtml(item.phonetic || "")}</span>
          </div>
          <div>你的答案：${escapeHtml(item.answer || "（空）")}</div>
          <div>正确释义：${escapeHtml(item.meaning || "")}</div>
        </div>
      `
      )
      .join("");

    const wrap = document.createElement("details");
    wrap.className = "card admin-record";
    wrap.innerHTML = `
      <summary>
        <strong>${escapeHtml(r.submit_time || "")}</strong>
        <span class="meta-split">|</span>
        第 ${Number(r.group_no) || "-"} 组
        <span class="meta-split">|</span>
        得分：${correctCount} / ${Number(r.total_count) || 0}
        <span class="meta-split">|</span>
        用时：${escapeHtml(r.used_time || "-")}
      </summary>
      <div class="admin-detail-wrap">
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

  const { data, error } = await client
    .from("exam_results")
    .select("id, submit_time, group_no, total_count, used_time, details")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    el("loadState").textContent = `加载失败：${error.message}`;
    return;
  }

  render(data || []);
  el("loadState").textContent = "加载完成";
}

el("refreshBtn").addEventListener("click", loadRecords);
loadRecords();
