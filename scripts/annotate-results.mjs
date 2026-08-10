import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  annotationFingerprint,
  createAnnotation,
  discoverResults,
  loadConjectureCatalog,
} from "./lib/result-utils.mjs";

const root = process.cwd();
const requested = process.argv.includes("--conjecture")
  ? process.argv[process.argv.indexOf("--conjecture") + 1]
  : null;
const { conjectures } = await loadConjectureCatalog(root);
let changed = 0;
let checked = 0;

for (const config of conjectures) {
  if (requested && config.id !== requested) continue;
  for (const { file, record } of await discoverResults(root, config)) {
    checked += 1;
    const next = createAnnotation(config, record);
    const current = record.opbench_annotation;
    if (
      current?.input_fingerprint === annotationFingerprint(record) &&
      JSON.stringify(current) === JSON.stringify(next)
    ) {
      continue;
    }
    record.opbench_annotation = next;
    await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
    changed += 1;
    console.log(`Annotated ${path.relative(root, file)}`);
  }
}

if (requested && !conjectures.some((config) => config.id === requested)) {
  throw new Error(`Unknown conjecture id: ${requested}`);
}

console.log(`OPBench annotation audit: ${checked} checked, ${changed} updated.`);
