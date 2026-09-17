// 保存済み生データの構造を調べる（APIは呼ばない = クレジット消費ゼロ）
import { readFile } from "node:fs/promises";

const raw = JSON.parse(await readFile("data/raw/data-scientist.json", "utf8"));
const people = raw.data;

console.log("=== experience[].title に入っているサブフィールド ===");
const titleKeys = new Set();
people.forEach((p) => (p.experience ?? []).forEach((e) => Object.keys(e.title ?? {}).forEach((k) => titleKeys.add(k))));
console.log([...titleKeys].join(", "));

console.log("\n=== サンプル: 1人目の職歴 ===");
(people[0].experience ?? []).forEach((e) =>
  console.log(`  name="${e.title?.name}" role="${e.title?.role}" sub_role="${e.title?.sub_role}" levels=${JSON.stringify(e.title?.levels)}`)
);

console.log("\n=== 職歴の件数分布 ===");
const expCounts = people.map((p) => (p.experience ?? []).length);
console.log(`  平均 ${(expCounts.reduce((a, b) => a + b, 0) / people.length).toFixed(1)} 件 / 最小 ${Math.min(...expCounts)} / 最大 ${Math.max(...expCounts)}`);
console.log(`  職歴が1件以下の人: ${expCounts.filter((c) => c <= 1).length}/${people.length}人`);

// role / sub_role で集計した場合の出現率
const countBy = (extract) => {
  const m = new Map();
  for (const p of people) {
    const seen = new Set();
    for (const v of extract(p)) {
      const k = String(v ?? "").trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
};

const N = people.length;
const show = (label, rows) => {
  console.log(`\n=== ${label} ===`);
  rows.forEach(([k, c]) => console.log(`  ${k.padEnd(30)} ${((c / N) * 100).toFixed(1)}%  (${c}/${N})`));
};

show(
  "title.role で正規化した場合",
  countBy((p) => (p.experience ?? []).map((e) => e.title?.role))
);
show(
  "title.sub_role で正規化した場合",
  countBy((p) => (p.experience ?? []).map((e) => e.title?.sub_role))
);

console.log("\n=== スキルのノイズ確認: 上位20件 ===");
const skillRows = countBy((p) => p.skills ?? []).slice(0, 8);
show("skills 上位", countBy((p) => p.skills ?? []));
