const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReviewItem = {
  index: number;
  word: string;
  answer: string;
  meaning: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeItems(input: unknown): ReviewItem[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 60).map((item: any) => ({
    index: Number(item?.index) || 0,
    word: cleanText(item?.word, 80),
    answer: cleanText(item?.answer, 120),
    meaning: cleanText(item?.meaning, 500),
  })).filter(item => item.index > 0 && item.word && item.answer && item.meaning);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "DEEPSEEK_API_KEY is not configured" }, 500);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch (_) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const items = normalizeItems(payload?.items);
  if (!items.length) {
    return jsonResponse({ results: [] });
  }

  const prompt = [
    "你是大学英语四六级词汇英译汉答案复核员。",
    "任务：判断学生中文答案是否表达了英文单词在标准释义中的任意一个核心含义。",
    "规则：",
    "1. 只要学生答案与标准释义中的一个核心中文意思等价、近义或常见说法一致，就判 correct=true。",
    "2. 不要求学生写出全部词性标签、全部释义或完整标准答案。",
    "3. 必须检查答案表达的词性和用法是否与标准释义匹配；标准只有名词/动词时，学生答成形容词等明显词性错位的，不算对。",
    "4. 例如 cripple 的标准释义若为“n.跛子/残废的人；v.使成残废/削弱”，学生只答“残疾的”，应判 correct=false，因为这是形容词而非名词或动词。",
    "5. 如果学生答案过宽、过窄到明显不是该词含义，或只是相关但不等价，判 correct=false。",
    "6. 汉译英拼写不在本函数复核范围内；输入给你的均为英译汉。",
    "必须只返回 JSON，格式为：{\"results\":[{\"index\":题号,\"correct\":true或false,\"reason\":\"不超过20字的中文理由\"}]}。",
    "",
    "待复核项目：",
    JSON.stringify(items, null, 2),
  ].join("\n");

  try {
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
          {
            role: "system",
            content: "你只输出合法 JSON，不输出解释性正文。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return jsonResponse({ error: `DeepSeek request failed: ${text.slice(0, 200)}` }, 502);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const results = Array.isArray(parsed?.results) ? parsed.results : [];

    return jsonResponse({
      results: results.map((item: any) => ({
        index: Number(item?.index) || 0,
        correct: Boolean(item?.correct),
        reason: cleanText(item?.reason, 40),
      })).filter((item: any) => item.index > 0),
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown review error" }, 500);
  }
});
