import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.md'])
const SKIP_DIRS = new Set(['.codex', '.git', 'dist', 'node_modules'])
const SKIP_FILES = new Set([
  'scripts/check-copy-guard.mjs',
  'scripts/check-internal-v4-ui-contract.mjs',
  'scripts/check-internal-v4-ui-guard.mjs',
  'scripts/check-poster-presentation.mjs',
  'scripts/check-public-quant-ui.mjs',
  'scripts/check-share-poster.mjs',
])

const FORBIDDEN_TERMS = [
  '\u4e3b\u63a8\u6bd4\u5206',
  '\u8f85\u63a8\u6bd4\u5206',
  '\u5907\u7528\u6bd4\u5206',
  '\u9996\u9009\u6bd4\u5206',
  '\u4e3b\u63a8\u65b9\u5411',
  '\u4e3b\u63a8\uff1a',
  '\u8f85\u63a8\uff1a',
  '\u4e3b\u63a8\u6ce2\u80c6',
  '\u5907\u7528\u6ce2\u80c6',
  '\u4e3b\u63a8\u6e05\u695a',
  '\u4e3b\u63a8\u3001\u6bd4\u5206',
]

function extensionOf(filePath) {
  const match = filePath.match(/\.[^.]+$/)
  return match ? match[0] : ''
}

function normalizePath(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, '/')
}

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue

    const path = join(dir, entry)
    const stats = statSync(path)

    if (stats.isDirectory()) {
      collectFiles(path, files)
      continue
    }

    const relativePath = normalizePath(path)
    if (SKIP_FILES.has(relativePath)) continue
    if (SCAN_EXTENSIONS.has(extensionOf(relativePath))) files.push(path)
  }

  return files
}

const violations = []

for (const file of collectFiles(ROOT)) {
  const source = readFileSync(file, 'utf8')
  const relativePath = normalizePath(file)

  for (const term of FORBIDDEN_TERMS) {
    if (source.includes(term)) {
      violations.push(`${relativePath}: ${term}`)
    }
  }
}

if (violations.length) {
  throw new Error(`Legacy public/internal copy found:\n${violations.join('\n')}`)
}

console.log('check-copy-guard: ok')
