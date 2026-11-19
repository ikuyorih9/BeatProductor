// Verifica a sintaxe de todos os módulos do frontend (node --check) e
// confirma que todo import relativo aponta para um arquivo existente.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

function listJs(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listJs(path);
    return name.endsWith('.js') ? [path] : [];
  });
}

let failures = 0;
for (const file of listJs(root)) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failures += 1;
    console.error(`ERRO de sintaxe em ${file}\n${error.stderr}`);
  }
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
    const target = resolve(dirname(file), match[1]);
    if (!existsSync(target)) {
      failures += 1;
      console.error(`Import quebrado em ${file}: ${match[1]}`);
    }
  }
}

if (failures > 0) {
  console.error(`${failures} problema(s) encontrado(s).`);
  process.exit(1);
}
console.log('Sintaxe e imports OK.');
