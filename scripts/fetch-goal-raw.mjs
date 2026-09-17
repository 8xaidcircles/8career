// PDL から到達者データを取得し、生JSONのまま保存する（1レコード = 1クレジット）
//
// このスクリプトは「取得」だけを担当する。出現率の集計は build-goal-profile.mjs が
// 保存済みファイルに対して行うため、集計ロジックを何度作り直してもクレジットは減らない。
//
// 実行例:
//   node --env-file=.env.local scripts/fetch-goal-raw.mjs --title "data scientist" --size 30 --confirm
//
// 安全装置:
//   --confirm がないと取得しない（消費クレジット数を表示して終了する）
//   保存先ファイルが既にある場合は --force がないと上書きしない

import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const title = (flag("title") ?? "data scientist").toLowerCase();
const size = Number(flag("size", "30"));
const outPath = path.join("data", "raw", `${title.replace(/\s+/g, "-")}.json`);

if (!Number.isInteger(size) || size < 1 || size > 100) {
  console.error("--size は 1〜100 の整数で指定してください（PDLの1リクエスト上限は100件）");
  process.exit(1);
}

console.log(`目標職種 : ${title}`);
console.log(`取得件数 : ${size} 件`);
console.log(`消費予定 : ${size} クレジット`);
console.log(`保存先   : ${outPath}`);

const exists = await access(outPath).then(() => true, () => false);
if (exists && !has("force")) {
  console.error(`\n中止: ${outPath} は既に存在します。`);
  console.error("再取得するとクレジットを再消費します。意図的なら --force を付けてください。");
  process.exit(1);
}

if (!has("confirm")) {
  console.error("\n中止: クレジットを消費する操作です。実行するには --confirm を付けてください。");
  process.exit(1);
}

// 現職が目標職種の人物を検索する
const query = { bool: { must: [{ term: { job_title: title } }] } };
const url =
  "https://api.peopledatalabs.com/v5/person/search?" +
  new URLSearchParams({ query: JSON.stringify(query), size: String(size) });

const res = await fetch(url, { headers: { "X-Api-Key": process.env.PDL_API_KEY } });
const json = await res.json();

if (!res.ok) {
  console.error(`\n取得失敗 (${res.status}): ${JSON.stringify(json).slice(0, 500)}`);
  process.exit(1);
}

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(
  outPath,
  JSON.stringify(
    {
      goal_title: title,
      fetched_at: new Date().toISOString(),
      requested_size: size,
      total_matches: json.total, // 母集団全体のヒット数（Nではない）
      sample_size: json.data.length, // 実際に取得できた件数 = 母数 N
      data: json.data,
    },
    null,
    2
  ),
  "utf8"
);

console.log(`\n保存しました: ${outPath}`);
console.log(`  母集団ヒット数 : ${json.total.toLocaleString()} 件`);
console.log(`  取得できた母数N : ${json.data.length} 件`);
console.log(`  消費クレジット  : ${res.headers.get("x-call-credits-spent")}`);
console.log(`  残クレジット    : ${res.headers.get("x-totallimit-remaining")}`);
console.log(`\n次: node scripts/build-goal-profile.mjs --title "${title}"`);
