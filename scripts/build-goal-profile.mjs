// 保存済みの PDL 生データから Goal Profile（出現率）を集計する
// このスクリプトは外部APIを一切呼ばない = 何度実行してもクレジットを消費しない
//
// 実行例:
//   node scripts/build-goal-profile.mjs --title "data scientist"
//
// 要件定義書 §4.3:
//   R_k = Round((C_k ÷ N) × 100, 1)   ※ C_k は「その要素を持つ人数」（1人1カウント）
//   表示上限: Skills 6件 / Experiences 5件 / Educations 3件

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const title = (flag("title") ?? "data scientist").toLowerCase();
const slug = title.replace(/\s+/g, "-");
const inPath = path.join("data", "raw", `${slug}.json`);
const outPath = path.join("data", "profiles", `${slug}.json`);

const TOP_SKILLS = 6;
const TOP_EXPERIENCES = 5;
const TOP_EDUCATIONS = 3;

// 汎用的すぎて「次に学ぶべきスキル」として成立しないものは除外する。
// これらを上位に出すと提案の信頼性を損なうため（例: microsoft office 56.7%）。
const GENERIC_SKILLS = new Set([
  "microsoft office",
  "microsoft excel",
  "microsoft word",
  "microsoft powerpoint",
  "powerpoint",
  "excel",
  "word",
  "outlook",
  "communication",
  "teamwork",
  "leadership",
  "time management",
  "problem solving",
  "critical thinking",
  "customer service",
  "research",
  "teaching",
  "management",
]);

const raw = JSON.parse(await readFile(inPath, "utf8"));
const people = raw.data;
const N = people.length;

// 1人1カウントで出現人数を数える（同じ人が同じスキルを複数回持っていても1回）
function countUniquePerPerson(extract) {
  const counts = new Map();
  for (const person of people) {
    const seen = new Set();
    for (const value of extract(person) ?? []) {
      const key = String(value ?? "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function toDistribution(counts, topX) {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, rate: Math.round((count / N) * 1000) / 10 }))
    .sort((a, b) => b.rate - a.rate || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, topX);
}

const skillCounts = countUniquePerPerson((p) =>
  (p.skills ?? []).filter((s) => !GENERIC_SKILLS.has(String(s).trim().toLowerCase()))
);

// 過去の職種は PDL が正規化済みの title.sub_role で集計する。
// 生の title.name は表記が細かく割れてしまい（最頻でも10%）、出現率として機能しないため。
// 目標職種そのもの（到達後のポジション）に当たる sub_role は除外する。
const goalSubRoles = new Set();
for (const p of people) {
  for (const e of p.experience ?? []) {
    if (e.title?.name?.toLowerCase() === title && e.title?.sub_role) {
      goalSubRoles.add(e.title.sub_role.toLowerCase());
    }
  }
}

const experienceCounts = countUniquePerPerson((p) =>
  (p.experience ?? [])
    .map((e) => e.title?.sub_role)
    .filter((r) => r && !goalSubRoles.has(String(r).toLowerCase()))
);

const educationCounts = countUniquePerPerson((p) =>
  (p.education ?? []).flatMap((e) => e.majors ?? [])
);

const profile = {
  goal_title: title,
  sample_size: N,
  total_matches: raw.total_matches,
  source: "People Data Labs",
  built_at: new Date().toISOString(),
  skill_distributions: toDistribution(skillCounts, TOP_SKILLS),
  experience_distributions: toDistribution(experienceCounts, TOP_EXPERIENCES),
  education_distributions: toDistribution(educationCounts, TOP_EDUCATIONS),
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(profile, null, 2), "utf8");

// --- 確認用の表示 ---
const show = (label, rows) => {
  console.log(`\n【${label}】`);
  rows.forEach((r, i) =>
    console.log(`  ${i + 1}. ${r.name.padEnd(34)} ${String(r.rate).padStart(5)}%  (${r.count}/${N}人)`)
  );
};

console.log(`目標職種: ${title}`);
console.log(`母数 N = ${N}（母集団ヒット数 ${raw.total_matches?.toLocaleString()} 件からのサンプル）`);
console.log(`ユニークスキル数: ${skillCounts.size}`);

show(`Top ${TOP_SKILLS} Skills`, profile.skill_distributions);
show(`Top ${TOP_EXPERIENCES} Experiences（目標職種を除く過去の職種）`, profile.experience_distributions);
show(`Top ${TOP_EDUCATIONS} Educations（専攻）`, profile.education_distributions);

const skillTotal = profile.skill_distributions.reduce((s, r) => s + r.rate, 0);
const expTotal = profile.experience_distributions.reduce((s, r) => s + r.rate, 0);
console.log(`\nSkill Fit の分母（上位${TOP_SKILLS}スキルの出現率合計）     = ${skillTotal.toFixed(1)}`);
console.log(`Experience Fit の分母（上位${TOP_EXPERIENCES}職種の出現率合計） = ${expTotal.toFixed(1)}`);

// 各スキルを1つ追加したときの Goal Match 変化量（§4.4.4、Skill Fit の重み 55%）
console.log(`\n【Impact Preview：そのスキルを1つ追加した場合の Δ Goal Match】`);
profile.skill_distributions.forEach((r) => {
  const delta = (r.rate / skillTotal) * 100 * 0.55;
  console.log(`  ${r.name.padEnd(24)} +${delta.toFixed(1)}pt`);
});

console.log(`\n保存しました: ${outPath}`);
