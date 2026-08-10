import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  annotationFingerprint,
  discoverResults,
  loadConjectureCatalog,
  readJsonl,
} from "../scripts/lib/result-utils.mjs";

const run = promisify(execFile);
const root = process.cwd();
const site = JSON.parse(await readFile(path.join(root, "src/data/site.json"), "utf8"));
const generatedNews = JSON.parse(await readFile(path.join(root, "src/data/frontier-news.json"), "utf8"));
const { conjectures } = await loadConjectureCatalog(root);

assert.deepEqual(
  conjectures.map((item) => item.id),
  [
    "jacobian_conjecture",
    "number_theory_001_beal_conjecture",
    "number_theory_002_odd_perfect_number",
  ],
  "conjectures/index.json must control the three-item display order",
);
assert.deepEqual(
  site.conjectures.map((item) => item.id),
  conjectures.map((item) => item.id),
  "generated site order must follow the standalone index",
);
assert(!JSON.stringify(site).includes("/mnt/"), "generated page data must not expose absolute workspace paths");

const expected = new Map([
  ["jacobian_conjecture", { tasks: 5, records: 50, hints: ["nohint", "hint"] }],
  ["number_theory_001_beal_conjecture", { tasks: 2, records: 1, hints: ["nohint"] }],
  ["number_theory_002_odd_perfect_number", { tasks: 1, records: 1, hints: ["nohint"] }],
]);
let totalRecords = 0;
for (const config of conjectures) {
  const generated = site.conjectures.find((item) => item.id === config.id);
  const contract = expected.get(config.id);
  assert(generated && contract, `${config.id} must be generated`);
  assert.equal(generated.benchmarkData.dataset.taskCount, contract.tasks, `${config.id} task count`);
  assert.equal(generated.benchmarkData.dataset.resultCount, contract.records, `${config.id} result count`);
  assert.deepEqual(generated.benchmarkData.dataset.hintModes, contract.hints, `${config.id} hint policy`);
  assert.equal(generated.problemSource, config.problemSource);
  assert.equal(generated.resultsPath, config.resultsPath);
  assert(generated.atlas.events.every((event) => event.links.every((link) => link.url.startsWith("https://"))), `${config.id} atlas needs web sources`);
  assert(generated.visualization.codePath.startsWith("src/components/"));
  assert(generated.symbolicLab.verifierPath.startsWith("eval/"));
  await access(path.join(root, generated.symbolicLab.verifierPath));

  const discovered = await discoverResults(root, config);
  assert.equal(discovered.length, contract.records, `${config.id} source discovery count`);
  const bundle = JSON.parse(
    await readFile(path.join(root, "public/data/evaluations", `${config.id}.json`), "utf8"),
  );
  assert.equal(Object.keys(bundle.records).length, contract.records, `${config.id} bundle count`);
  for (const { file, record } of discovered) {
    totalRecords += 1;
    assert(record.opbench_annotation, `${path.relative(root, file)} must carry its source-aligned annotation`);
    assert.equal(record.opbench_annotation.conjecture_id, config.id);
    assert.equal(record.opbench_annotation.input_fingerprint, annotationFingerprint(record));
    const summary = generated.benchmarkData.records.find(
      (item) => item.sourcePath === path.relative(root, file).split(path.sep).join("/"),
    );
    assert(summary, `${path.relative(root, file)} needs a generated summary`);
    const full = bundle.records[summary.bundleKey];
    assert(full, `${summary.bundleKey} needs a bundled full record`);
    assert(!path.isAbsolute(full.source.file), `${summary.bundleKey} source path must stay relative`);
    const sourceText = await readFile(file, "utf8");
    assert.equal(full.source.sha256, createHash("sha256").update(sourceText).digest("hex"));
    assert.deepEqual(full.opbench_annotation.outcome, summary.analysis);
  }
}
assert.equal(totalRecords, 52, "all current evaluation files must be covered");

const numberTheory = await readJsonl(path.join(root, "problems/number_theory.jsonl"));
assert.equal(numberTheory.length, 2, "the pretty-printed concatenated JSONL source must remain readable");
assert(String(numberTheory[0].optimization.problem).trim(), "Beal has a real optimization task");
assert.equal(String(numberTheory[1].optimization.problem).trim(), "", "odd perfect number has no optimization task");

const newsLines = await readJsonl(path.join(root, "news/frontier_news.jsonl"));
assert.deepEqual(generatedNews, newsLines, "generated news must follow the standalone source exactly");
assert(newsLines.some((item) => item.id === "openai-first-proof-2026" && item.link === "https://openai.com/index/first-proof-submissions/"), "the ten-problem OpenAI First Proof release must be included");
assert.deepEqual(newsLines.map((item) => item.date), newsLines.map((item) => item.date).sort().reverse(), "news must be newest first");
assert.equal(new Set(newsLines.map((item) => item.id)).size, newsLines.length, "news ids must be unique");

for (const model of await readdir(path.join(root, "results/jacobian_conjecture"))) {
  const runConfig = JSON.parse(await readFile(path.join(root, "results/jacobian_conjecture", model, "run_config.json"), "utf8"));
  assert.equal(runConfig.parameters.max_tokens, model.toLowerCase().startsWith("gemini") ? 65_536 : 128_000, `${model} max_tokens policy`);
}

await assert.rejects(access(path.join(root, "public/data/records")), undefined, "legacy per-record public copies must stay removed");

const temporary = await mkdtemp(path.join(os.tmpdir(), "opbench-init-"));
try {
  const source = path.join(root, "problems/number_theory.jsonl");
  const before = createHash("sha256").update(await readFile(source)).digest("hex");
  await run(process.execPath, [
    path.join(root, "scripts/init-conjectures-from-jsonl.mjs"),
    source,
    "--output-dir",
    temporary,
  ], { cwd: root });
  const initializedFiles = (await readdir(temporary)).sort();
  assert.deepEqual(initializedFiles, [
    "number_theory_001_beal_conjecture.json",
    "number_theory_002_odd_perfect_number.json",
  ]);
  const initialized = await Promise.all(
    initializedFiles.map(async (file) => JSON.parse(await readFile(path.join(temporary, file), "utf8"))),
  );
  assert.deepEqual(initialized.map((item) => item.benchmark.tasks.length), [2, 1], "initializer must derive optimization task counts");
  const after = createHash("sha256").update(await readFile(source)).digest("hex");
  assert.equal(after, before, "initializer must never modify the JSONL source");
  await assert.rejects(
    run(process.execPath, [path.join(root, "scripts/init-conjectures-from-jsonl.mjs"), source, "--output-dir", temporary], { cwd: root }),
    /Refusing to overwrite existing file/,
    "initializer must refuse to overwrite existing conjecture files",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log(`OPBench data audit passed: 3 conjectures, 8 tasks, ${totalRecords} source-aligned records, ${newsLines.length} news items.`);
