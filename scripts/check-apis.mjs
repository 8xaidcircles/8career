// Day1 PoC: PDL と Nebius(Nemotron) の実レスポンス構造を確認する疎通スクリプト
// 実行: node --env-file=.env.local scripts/check-apis.mjs

const line = (t) => console.log(`\n========== ${t} ==========`);

async function checkNebiusBaseUrl() {
  const candidates = [
    "https://api.studio.nebius.com/v1",
    "https://api.studio.nebius.ai/v1",
  ];
  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${process.env.NEBIUS_API_KEY}` },
      });
      console.log(`${base}/models -> ${res.status}`);
      if (res.ok) {
        const json = await res.json();
        const ids = (json.data ?? []).map((m) => m.id);
        const nemotron = ids.filter((id) => /nemotron/i.test(id));
        console.log(`  総モデル数: ${ids.length}`);
        console.log(`  Nemotron系: ${nemotron.length}件`);
        nemotron.forEach((id) => console.log(`    - ${id}`));
        return base;
      }
      console.log(`  body: ${(await res.text()).slice(0, 300)}`);
    } catch (e) {
      console.log(`${base} -> 接続失敗: ${e.message}`);
    }
  }
  return null;
}

async function checkNemotronResponseShape(base, model) {
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NEBIUS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content:
            'Normalize this skill name to its canonical form. Reply with JSON only: {"canonical":"..."}. Input: "Python 3"',
        },
      ],
    }),
  });
  console.log(`POST ${base}/chat/completions (${model}) -> ${res.status}`);
  if (!res.ok) {
    console.log(`  body: ${(await res.text()).slice(0, 500)}`);
    return;
  }
  const json = await res.json();
  const msg = json.choices?.[0]?.message ?? {};
  console.log(`  message のキー: ${JSON.stringify(Object.keys(msg))}`);
  console.log(`  content: ${JSON.stringify(msg.content)}`);
  console.log(`  reasoning_content: ${JSON.stringify(msg.reasoning_content)?.slice(0, 300)}`);
  console.log(`  usage: ${JSON.stringify(json.usage)}`);
}

// PDL のフィールド充足率（要件定義書 4.3 の前提検証）
async function checkPdl() {
  const query = {
    bool: {
      must: [{ term: { job_title_role: "engineering" } }, { term: { job_title: "data scientist" } }],
    },
  };
  const url =
    "https://api.peopledatalabs.com/v5/person/search?" +
    new URLSearchParams({ query: JSON.stringify(query), size: "3", titlecase: "true" });

  const res = await fetch(url, { headers: { "X-Api-Key": process.env.PDL_API_KEY } });
  console.log(`GET /v5/person/search -> ${res.status}`);
  const json = await res.json();
  if (!res.ok) {
    console.log(`  error: ${JSON.stringify(json).slice(0, 600)}`);
    return;
  }
  console.log(`  total(母数N候補): ${json.total}`);
  console.log(`  取得件数: ${json.data?.length}`);

  const people = json.data ?? [];
  const fill = (name, fn) => {
    const n = people.filter((p) => {
      const v = fn(p);
      return Array.isArray(v) ? v.length > 0 : v != null && v !== "";
    }).length;
    console.log(`  ${name.padEnd(22)}: ${n}/${people.length}`);
  };
  console.log("  --- フィールド充足状況 ---");
  fill("job_title", (p) => p.job_title);
  fill("skills", (p) => p.skills);
  fill("experience[]", (p) => p.experience);
  fill("education[]", (p) => p.education);
  fill("certifications[]", (p) => p.certifications);
  fill("inferred_years_exp", (p) => p.inferred_years_experience);

  const sample = people[0];
  if (sample) {
    console.log("  --- 1件目のサンプル（抜粋） ---");
    console.log(`  job_title: ${sample.job_title}`);
    console.log(`  skills(先頭8): ${JSON.stringify((sample.skills ?? []).slice(0, 8))}`);
    console.log(
      `  experience[0]: ${JSON.stringify({
        title: sample.experience?.[0]?.title?.name,
        company: sample.experience?.[0]?.company?.name,
        start_date: sample.experience?.[0]?.start_date,
        end_date: sample.experience?.[0]?.end_date,
      })}`
    );
    console.log(
      `  education[0]: ${JSON.stringify({
        school: sample.education?.[0]?.school?.name,
        majors: sample.education?.[0]?.majors,
        degrees: sample.education?.[0]?.degrees,
      })}`
    );
    console.log(`  certifications: ${JSON.stringify(sample.certifications?.slice(0, 3))}`);
  }
}

line("1. Nebius: 利用可能モデル一覧");
const base = await checkNebiusBaseUrl();

if (base) {
  line("2. Nebius: Nemotron のレスポンス構造（content か reasoning_content か）");
  const model = process.env.CHECK_MODEL ?? "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";
  await checkNemotronResponseShape(base, model);
}

line("3. PDL: Person Search のフィールド充足率");
await checkPdl();
