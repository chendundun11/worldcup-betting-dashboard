import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appSource = readFileSync('src/App.jsx', 'utf8')

assert.match(
  appSource,
  /import\s+\{[^}]*\blazy\b[^}]*\bSuspense\b[^}]*\}\s+from\s+['"]react['"]/s,
  'App must import lazy and Suspense for route-level code splitting.',
)
assert.match(
  appSource,
  /const\s+InternalCommandCenterV4\s*=\s*lazy\(\(\)\s*=>\s*import\(['"]\.\/components\/InternalCommandCenterV4\.jsx['"]\)\)/,
  'Internal V4 console must stay lazy-loaded.',
)
assert.doesNotMatch(
  appSource,
  /import\s+InternalCommandCenterV4\s+from\s+['"]\.\/components\/InternalCommandCenterV4\.jsx['"]/,
  'Internal V4 console must not be statically imported into the public bundle.',
)
assert.match(
  appSource,
  /function\s+loadSharePosterTools\(\)\s*\{\s*return\s+import\(['"]\.\/services\/sharePoster\.js['"]\)/s,
  'Share poster code must stay dynamically loaded.',
)
assert.doesNotMatch(
  appSource,
  /import\s+\{[^}]*createSharePosterPng[^}]*\}\s+from\s+['"]\.\/services\/sharePoster\.js['"]/s,
  'Share poster generator must not be statically imported.',
)
assert.match(
  appSource,
  /<Suspense\s+fallback=/,
  'Internal route must render a fallback while the lazy chunk loads.',
)

console.log('check-bundle-split: ok')
