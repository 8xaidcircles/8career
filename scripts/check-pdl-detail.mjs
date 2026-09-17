// PDL の「プラン上限」と「1レコードに実際に入っているフィールド」を確認する
// 実行: node --env-file=.env.local scripts/check-pdl-detail.mjs

const query = { bool: { must: [{ term: { job_title: "data scientist" } }] } };
const url =
  "https://api.peopledatalabs.com/v5/person/search?" +
  new URLSearchParams({ query: JSON.stringify(query), size: "1" });

const res = await fetch(url, { headers: { "X-Api-Key": process.env.PDL_API_KEY } });

console.log("=== レート制限 / 残クレジット系ヘッダー ===");
for (const [k, v] of res.headers.entries()) {
  if (/limit|credit|quota|ratelimit/i.test(k)) console.log(`  ${k}: ${v}`);
}

const json = await res.json();
if (!res.ok) {
  console.log("error:", JSON.stringify(json).slice(0, 800));
  process.exit(0);
}

const p = json.data[0];
const nonNull = Object.entries(p).filter(([, v]) =>
  Array.isArray(v) ? v.length > 0 : v != null && v !== ""
);
console.log(`\n=== 1レコードの全フィールド数: ${Object.keys(p).length} / 値が入っている: ${nonNull.length} ===`);
console.log("\n--- 値が入っているフィールド ---");
console.log(nonNull.map(([k]) => k).join(", "));

console.log("\n--- 資格・年数まわりの該当フィールド ---");
Object.keys(p)
  .filter((k) => /cert|licen|award|qualif|year|exp/i.test(k))
  .forEach((k) => console.log(`  ${k}: ${JSON.stringify(p[k])?.slice(0, 160)}`));

console.log(`\n--- skills 件数: ${p.skills?.length ?? 0} ---`);
console.log(`--- experience 件数: ${p.experience?.length ?? 0} ---`);
console.log(`--- education 件数: ${p.education?.length ?? 0} ---`);
