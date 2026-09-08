const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-regrade-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CORRECT_STATUSES = new Set(["correct", "reviewCorrect", "aiReviewCorrect"]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalize(str: unknown) {
  return String(str || "")
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[，,。.;；:：!?！？“”"'‘’()（）[\]{}<>《》\-_/\\|]/g, "");
}

function buildMeaningTokens(meaning: unknown) {
  const raw = String(meaning || "");
  const parts = raw.split(/[;；。\.、,，/\n]+/).map(normalize).filter(Boolean);
  return parts.length ? parts : [normalize(raw)];
}

function isInitiallyCorrect(answer: unknown, meaning: unknown) {
  const a = normalize(answer);
  if (!a) return false;
  return buildMeaningTokens(meaning).some(t => t && (t.includes(a) || a.includes(t)));
}

const meaningSynonymGroups = [
  ["聪明", "智慧", "智力", "才智", "理智"],
  ["准确", "正确", "精确", "精密"],
  ["重要", "主要", "关键"],
  ["大概", "大约", "可能"],
  ["解释", "说明", "阐明"],
  ["管理", "控制", "支配"],
];

const meaningSynonyms = meaningSynonymGroups.reduce<Record<string, string[]>>((map, group) => {
  group.forEach(term => {
    map[term] = group;
  });
  return map;
}, {});

function extractChineseTerms(text: unknown) {
  return String(text || "")
    .replace(/[a-zA-Z.&]+/g, " ")
    .replace(/[()（）[\]{}<>《》]/g, " ")
    .split(/[\s;；。.,，、/\\|:：!?！？]+/)
    .flatMap(part => part.match(/[\u4e00-\u9fff]+/g) || [])
    .map(term => term.replace(/^的+|的+$/g, ""))
    .filter(term => term.length >= 2);
}

function hasSynonymMatch(answerTerm: string, standardTerm: string) {
  const answerVariants = meaningSynonyms[answerTerm] || [answerTerm];
  const standardVariants = meaningSynonyms[standardTerm] || [standardTerm];
  return answerVariants.some(item => standardVariants.includes(item));
}

function hasCloseChineseOverlap(answerTerm: string, standardTerm: string) {
  const a = [...new Set(answerTerm.split(""))];
  const b = [...new Set(standardTerm.split(""))];
  const common = a.filter(ch => b.includes(ch)).length;
  const minLen = Math.min(a.length, b.length);
  const maxLen = Math.max(a.length, b.length);
  return minLen >= 2 && common / minLen >= 0.75 && common / maxLen >= 0.5;
}

function isReviewCorrect(answer: unknown, meaning: unknown) {
  const answerTerms = extractChineseTerms(answer);
  const standardTerms = extractChineseTerms(meaning);
  if (!answerTerms.length || !standardTerms.length) return false;
  return answerTerms.some(answerTerm => standardTerms.some(standardTerm => (
    answerTerm.includes(standardTerm) ||
    standardTerm.includes(answerTerm) ||
    hasSynonymMatch(answerTerm, standardTerm) ||
    hasCloseChineseOverlap(answerTerm, standardTerm)
  )));
}

function judgeAnswer(answer: unknown, item: any) {
  if (item.direction === "zhToEn") {
    return normalize(answer) === normalize(item.word) ? "correct" : "wrong";
  }
  if (isInitiallyCorrect(answer, item.meaning)) return "correct";
  if (isReviewCorrect(answer, item.meaning)) return "reviewCorrect";
  return "wrong";
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function reviewWithDeepSeek(items: any[], apiKey: string) {
  if (!items.length) return [];
  const prompt = [
    "你是大学英语四六级词汇英译汉答案复核员。",
    "判断学生中文答案是否表达了英文单词在标准释义中的任意一个核心含义。",
    "只要等价、近义或常见说法一致就判 correct=true；不要求写出全部释义或词性标签。",
    "但必须检查答案表达的词性和用法是否与标准释义匹配；标准只有名词/动词时，学生答成形容词等明显词性错位的，不算对。",
    "例如 cripple 的标准释义若为“n.跛子/残废的人；v.使成残废/削弱”，学生只答“残疾的”，应判 correct=false。",
    "必须只返回 JSON：{\"results\":[{\"index\":题号,\"correct\":true或false,\"reason\":\"不超过20字的中文理由\"}]}。",
    JSON.stringify(items, null, 2),
  ].join("\n");

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      temperature: 0,
      max_tokens: 2000,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你只输出合法 JSON，不输出解释性正文。" },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) throw new Error(`DeepSeek request failed: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
  return Array.isArray(parsed?.results) ? parsed.results : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const adminToken = Deno.env.get("REVIEW_ADMIN_TOKEN");
  if (!adminToken || req.headers.get("x-regrade-token") !== adminToken) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const deepSeekKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !deepSeekKey) {
    return jsonResponse({ error: "Missing server configuration" }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const recordId = cleanText(body?.record_id, 80);
  if (!recordId) return jsonResponse({ error: "record_id is required" }, 400);

  const headers = {
    "apikey": serviceRoleKey,
    "Authorization": `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  const selectRes = await fetch(`${supabaseUrl}/rest/v1/exam_results?select=id,details&id=eq.${recordId}`, { headers });
  if (!selectRes.ok) return jsonResponse({ error: await selectRes.text() }, 502);
  const records = await selectRes.json();
  const record = records?.[0];
  if (!record) return jsonResponse({ error: "Record not found" }, 404);

  const details = Array.isArray(record.details) ? record.details.map((item: any) => ({
    ...item,
    status: normalize(item.answer).length ? judgeAnswer(item.answer, item) : "blank",
  })) : [];

  const pending = details
    .filter((item: any) => item.direction === "enToZh" && item.status === "wrong" && normalize(item.answer).length > 0)
    .map((item: any) => ({
      index: item.index,
      word: cleanText(item.word, 80),
      answer: cleanText(item.answer, 120),
      meaning: cleanText(item.meaning, 500),
    }));

  const aiResults = await reviewWithDeepSeek(pending, deepSeekKey);
  const aiMap = new Map(aiResults.map((item: any) => [Number(item.index), item]));

  details.forEach((item: any) => {
    const result = aiMap.get(Number(item.index));
    if (!result) return;
    item.ai_reviewed = true;
    item.ai_review_reason = cleanText(result.reason, 40);
    if (result.correct) item.status = "aiReviewCorrect";
  });

  const correctCount = details.filter((item: any) => CORRECT_STATUSES.has(item.status)).length;
  const updateRes = await fetch(`${supabaseUrl}/rest/v1/exam_results?id=eq.${recordId}`, {
    method: "PATCH",
    headers: { ...headers, "Prefer": "return=minimal" },
    body: JSON.stringify({ correct_count: correctCount, details }),
  });
  if (!updateRes.ok) return jsonResponse({ error: await updateRes.text() }, 502);

  return jsonResponse({
    record_id: recordId,
    correct_count: correctCount,
    initial_correct: details.filter((item: any) => item.status === "correct").length,
    rule_review_correct: details.filter((item: any) => item.status === "reviewCorrect").length,
    ai_review_correct: details.filter((item: any) => item.status === "aiReviewCorrect").length,
    wrong_or_blank: details.filter((item: any) => !CORRECT_STATUSES.has(item.status)).length,
    ai_results: aiResults,
  });
});
