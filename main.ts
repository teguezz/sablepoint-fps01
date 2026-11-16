// SABLEPOINT — the entrypoint program (make.fun program/v1, Node 22).
// It copies game/ and screenshots/ from this repository into the output
// directory and writes /output/dossier.json with the kit's buildDossier.
// Standard library only; no network; deterministic: the same repository
// always writes the same bytes.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// The output directory starts empty so a stale file can never leak into a
// later run. cpSync copies symlinks as links; the gate forbids them, and
// this repository holds none, so a plain recursive copy is exact.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`SABLEPOINT dossier written: ${dossier.length} bytes -> ${join(outDir, 'dossier.json')}`);
