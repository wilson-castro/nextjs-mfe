import { spawn } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const pid = join(raiz, '.verdaccio', 'verdaccio.pid')
const acao = process.argv[2]

if (acao === 'up') {
  const p = spawn('pnpm', ['dlx', 'verdaccio', '--config', join(raiz, '.verdaccio', 'config.yaml'),
                            '--listen', '4873'],
                  { detached: true, stdio: 'ignore', cwd: raiz })
  p.unref()
  writeFileSync(pid, String(p.pid))
  console.log(`verdaccio subindo, pid ${p.pid}, http://localhost:4873`)
} else if (acao === 'down') {
  if (!existsSync(pid)) { console.log('nada rodando'); process.exit(0) }
  // Negative PID kills the process group; detached: true makes spawn() its own group leader.
  // Without the negative sign, only the pnpm wrapper dies, leaving the actual Verdaccio running.
  try { process.kill(-Number(readFileSync(pid, 'utf8')), 'SIGTERM') } catch {}
  unlinkSync(pid)
  console.log('verdaccio derrubado')
} else {
  console.error('uso: node repos/scripts/registry.mjs up|down')
  process.exit(1)
}
