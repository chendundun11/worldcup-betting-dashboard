import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(projectRoot, '..')
const desktopOutputRoot = path.join(path.resolve(workspaceRoot, '..'), '世界杯短视频输出')
const buildVideoScript = path.join(__dirname, 'build-douyin-video.mjs')
const buildReportPath = path.join(__dirname, 'douyin-video-build-report.json')
const batchReportPath = path.join(__dirname, 'douyin-batch-report.json')
const desktopIndexPath = path.join(desktopOutputRoot, 'index.md')
const matchesPath = path.join(projectRoot, 'src', 'data', 'matches.json')
const teamsPath = path.join(projectRoot, 'src', 'data', 'teams.json')

function parseArgs(argv) {
  const options = {
    indexList: null,
    limit: null,
    matches: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  node .\\scripts\\build-douyin-batch.mjs --matches "葡萄牙,德国,西班牙"',
          '  node .\\scripts\\build-douyin-batch.mjs --limit 3',
          '  node .\\scripts\\build-douyin-batch.mjs --index 0,1,2',
        ].join('\n'),
      )
      process.exit(0)
    }

    if (arg === '--matches') {
      options.matches = splitList(argv[index + 1])
      index += 1
      continue
    }

    if (arg.startsWith('--matches=')) {
      options.matches = splitList(arg.slice('--matches='.length))
      continue
    }

    if (arg === '--limit') {
      options.limit = parsePositiveInteger(argv[index + 1], '--limit')
      index += 1
      continue
    }

    if (arg.startsWith('--limit=')) {
      options.limit = parsePositiveInteger(arg.slice('--limit='.length), '--limit')
      continue
    }

    if (arg === '--index') {
      options.indexList = splitList(argv[index + 1]).map((item) =>
        parseNonNegativeInteger(item, '--index'),
      )
      index += 1
      continue
    }

    if (arg.startsWith('--index=')) {
      options.indexList = splitList(arg.slice('--index='.length)).map((item) =>
        parseNonNegativeInteger(item, '--index'),
      )
      continue
    }

    throw new Error(`无法识别参数：${arg}`)
  }

  return options
}

function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} 必须是正整数。`)
  }
  return parsed
}

function parseNonNegativeInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} 必须是非负整数。`)
  }
  return parsed
}

function quoteArg(value) {
  return /\s|"/.test(value) ? `"${String(value).replace(/"/g, '\\"')}"` : String(value)
}

function commandText(argv) {
  return argv.map(quoteArg).join(' ')
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function fileExists(filePath) {
  return Boolean(filePath) && existsSync(filePath)
}

function normalizeSearchText(value) {
  return String(value ?? '').trim().toLowerCase()
}

function loadMatchContext() {
  const matchesData = readJson(matchesPath, { matches: [] })
  const teamsData = readJson(teamsPath, { teams: [] })
  const teamMap = new Map(teamsData.teams.map((team) => [team.id, team]))

  return {
    matches: matchesData.matches ?? [],
    teamMap,
  }
}

function getRawMatchName(match, teamMap) {
  const homeTeam = teamMap.get(match.homeTeamId)
  const awayTeam = teamMap.get(match.awayTeamId)
  const home = homeTeam?.name ?? match.homeTeamName ?? match.homeTeamId ?? '主队'
  const away = awayTeam?.name ?? match.awayTeamName ?? match.awayTeamId ?? '客队'
  return `${home} vs ${away}`
}

function rawMatchMatchesQuery(match, teamMap, query) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return false

  const homeTeam = teamMap.get(match.homeTeamId)
  const awayTeam = teamMap.get(match.awayTeamId)
  const haystack = [
    match.id,
    match.homeTeamId,
    match.awayTeamId,
    homeTeam?.name,
    homeTeam?.shortName,
    awayTeam?.name,
    awayTeam?.shortName,
    getRawMatchName(match, teamMap),
    match.stage,
    match.venue,
    match.headline,
  ]
    .map(normalizeSearchText)
    .filter(Boolean)
    .join(' | ')

  return haystack.includes(normalizedQuery)
}

function matchDescriptor(match, index, teamMap) {
  const selectedMatchName = getRawMatchName(match, teamMap)
  const matchKey = `${match.homeTeamId}__${match.awayTeamId}`

  return {
    index,
    matchKey,
    selectedMatchId: match.id,
    selectedMatchName,
    uniqueKey: match.id || matchKey || selectedMatchName,
  }
}

function makeResolvedJob({ descriptor, label, requested, type }) {
  return {
    args: ['--index', String(descriptor.index)],
    label,
    requested,
    resolvedMatch: descriptor,
    type,
  }
}

function resolveMatchTerm(term, context, usedKeys) {
  const candidates = context.matches
    .map((match, index) => ({ descriptor: matchDescriptor(match, index, context.teamMap), match }))
    .filter(({ match }) => rawMatchMatchesQuery(match, context.teamMap, term))

  const firstUnused = candidates.find(({ descriptor }) => !usedKeys.has(descriptor.uniqueKey))

  return {
    candidates: candidates.map(({ descriptor }) => descriptor),
    selected: firstUnused?.descriptor ?? null,
  }
}

function buildJobs(options) {
  const context = loadMatchContext()
  const duplicateMatches = []
  const jobs = []
  const requestedTerms = []
  const resolvedMatches = []
  const skippedTerms = []
  const usedKeys = new Map()

  function addResolvedJob({ descriptor, label, requested, type }) {
    usedKeys.set(descriptor.uniqueKey, {
      label,
      requested,
      ...descriptor,
    })
    requestedTerms.push(requested)
    resolvedMatches.push({
      label,
      requested,
      type,
      ...descriptor,
    })
    jobs.push(makeResolvedJob({ descriptor, label, requested, type }))
  }

  function skipTerm({ duplicate, label, reason, requested, type }) {
    requestedTerms.push(requested)
    const skipped = {
      duplicateMatchTerm: duplicate?.duplicateMatchTerm ?? null,
      duplicateOf: duplicate?.duplicateOf ?? null,
      label,
      reason,
      requested,
      type,
    }
    skippedTerms.push(skipped)
    if (duplicate) duplicateMatches.push(duplicate)
  }

  if (options.matches?.length) {
    for (const match of options.matches) {
      const label = `match:${match}`
      const resolved = resolveMatchTerm(match, context, usedKeys)
      if (!resolved.candidates.length) {
        skipTerm({
          label,
          reason: 'not_found',
          requested: match,
          type: 'match',
        })
        continue
      }

      if (!resolved.selected) {
        const duplicateCandidate = resolved.candidates[0]
        const duplicateOf = usedKeys.get(duplicateCandidate.uniqueKey)
        skipTerm({
          duplicate: {
            action: 'skipped',
            duplicateMatchTerm: match,
            duplicateOf,
            matchedCandidates: resolved.candidates,
            matchKey: duplicateCandidate.matchKey,
            selectedMatchId: duplicateCandidate.selectedMatchId,
            selectedMatchName: duplicateCandidate.selectedMatchName,
          },
          label,
          reason: 'duplicate_match',
          requested: match,
          type: 'match',
        })
        continue
      }

      if (resolved.candidates[0].uniqueKey !== resolved.selected.uniqueKey) {
        duplicateMatches.push({
          action: 'resolved_to_next_unused_match',
          duplicateMatchTerm: match,
          duplicateOf: usedKeys.get(resolved.candidates[0].uniqueKey),
          matchedCandidates: resolved.candidates,
          matchKey: resolved.candidates[0].matchKey,
          selectedMatchId: resolved.candidates[0].selectedMatchId,
          selectedMatchName: resolved.candidates[0].selectedMatchName,
        })
      }

      addResolvedJob({
        descriptor: resolved.selected,
        label,
        requested: match,
        type: 'match',
      })
    }

    return {
      duplicateMatches,
      jobs,
      requestedTerms,
      resolvedMatches,
      skippedTerms,
    }
  }

  if (options.indexList?.length) {
    for (const index of options.indexList) {
      const label = `index:${index}`
      const match = context.matches[index]
      if (!match) {
        skipTerm({
          label,
          reason: 'index_out_of_range',
          requested: index,
          type: 'index',
        })
        continue
      }

      const descriptor = matchDescriptor(match, index, context.teamMap)
      if (usedKeys.has(descriptor.uniqueKey)) {
        skipTerm({
          duplicate: {
            action: 'skipped',
            duplicateMatchTerm: String(index),
            duplicateOf: usedKeys.get(descriptor.uniqueKey),
            matchedCandidates: [descriptor],
            matchKey: descriptor.matchKey,
            selectedMatchId: descriptor.selectedMatchId,
            selectedMatchName: descriptor.selectedMatchName,
          },
          label,
          reason: 'duplicate_match',
          requested: index,
          type: 'index',
        })
        continue
      }

      addResolvedJob({
        descriptor,
        label,
        requested: index,
        type: 'index',
      })
    }

    return {
      duplicateMatches,
      jobs,
      requestedTerms,
      resolvedMatches,
      skippedTerms,
    }
  }

  const limit = options.limit ?? 3
  for (let index = 0; index < context.matches.length && jobs.length < limit; index += 1) {
    const descriptor = matchDescriptor(context.matches[index], index, context.teamMap)
    if (usedKeys.has(descriptor.uniqueKey)) continue
    addResolvedJob({
      descriptor,
      label: `index:${index}`,
      requested: index,
      type: 'limit',
    })
  }

  if (jobs.length < limit) {
    skipTerm({
      label: `limit:${limit}`,
      reason: 'not_enough_unique_matches',
      requested: limit,
      type: 'limit',
    })
  }

  return {
    duplicateMatches,
    jobs,
    requestedTerms,
    resolvedMatches,
    skippedTerms,
  }
}

function runSingleJob(job) {
  const args = [buildVideoScript, ...job.args]
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  const report = readJson(buildReportPath, {})
  const desktopDir = report?.desktopOutputDir ?? null
  const copyTextPath = desktopDir ? path.join(desktopDir, 'copy.txt') : null
  const requiredDesktopFiles = [
    report?.desktopVideoPath,
    desktopDir ? path.join(desktopDir, 'preview_01.jpg') : null,
    desktopDir ? path.join(desktopDir, 'preview_03.jpg') : null,
    desktopDir ? path.join(desktopDir, 'preview_mid.jpg') : null,
    desktopDir ? path.join(desktopDir, 'preview_end.jpg') : null,
    desktopDir ? path.join(desktopDir, 'quality_report.txt') : null,
    desktopDir ? path.join(desktopDir, 'douyin-video-build-report.json') : null,
    copyTextPath,
  ]
  const missingDesktopFiles = requiredDesktopFiles.filter((filePath) => !fileExists(filePath))
  const ok =
    result.status === 0 &&
    report?.ok === true &&
    report?.usedFallback === false &&
    report?.copiedToDesktop === true &&
    missingDesktopFiles.length === 0 &&
    report?.publishReadiness !== 'blocked'

  return {
    command: commandText(['node', '.\\scripts\\build-douyin-video.mjs', ...job.args]),
    copyTextPath,
    desktopOutputDir: desktopDir,
    desktopVideoPath: report?.desktopVideoPath ?? null,
    error: result.status === 0 ? null : `exit ${result.status}`,
    job,
    missingDesktopFiles,
    ok,
    report,
    status: result.status,
  }
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

function writeDesktopIndex({ builtAt, results, skippedTerms }) {
  mkdirSync(desktopOutputRoot, { recursive: true })
  const sorted = [...results].sort((left, right) =>
    String(right.report?.builtAt ?? '').localeCompare(String(left.report?.builtAt ?? '')),
  )
  const lines = [
    '# 世界杯短视频输出索引',
    '',
    `最新一次批量生成时间：${builtAt}`,
    '',
    '| 比赛名 | mp4 路径 | copy.txt 路径 | quality_report.txt 路径 | ok | usedFallback | copiedToDesktop | 内容评分 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...sorted.map((item) => {
      const qualityReportPath = item.desktopOutputDir
        ? path.join(item.desktopOutputDir, 'quality_report.txt')
        : ''
      const cells = [
        markdownCell(item.report?.selectedMatchName ?? item.job.label),
        markdownCell(item.desktopVideoPath),
        markdownCell(item.copyTextPath),
        markdownCell(qualityReportPath),
        markdownCell(item.report?.ok),
        markdownCell(item.report?.usedFallback),
        markdownCell(item.report?.copiedToDesktop),
        markdownCell(item.report?.contentScore),
      ]
      return `| ${cells.join(' | ')} |`
    }),
    '',
  ]

  if (skippedTerms.length) {
    lines.push('## 本次跳过', '')
    for (const item of skippedTerms) {
      lines.push(
        `- ${item.label}: ${item.reason}${
          item.duplicateOf?.selectedMatchName
            ? `，重复命中 ${item.duplicateOf.selectedMatchName}，已跳过。`
            : ''
        }`,
      )
    }
    lines.push('')
  }

  writeFileSync(desktopIndexPath, lines.join('\n'), 'utf8')
}

function summarizeDuplicateWarnings(results, duplicateMatches, skippedTerms) {
  const warnings = []
  const seen = new Map()

  for (const item of results) {
    const matchName = item.report?.selectedMatchName
    if (!matchName) continue
    if (seen.has(matchName)) {
      warnings.push(
        `重复命中比赛：${matchName}，来源 ${seen.get(matchName)} 与 ${item.job.label} 都指向同一场。`,
      )
    } else {
      seen.set(matchName, item.job.label)
    }
  }

  for (const duplicate of duplicateMatches) {
    warnings.push(
      `duplicateMatchTerm=${duplicate.duplicateMatchTerm}: 命中已使用比赛 ${duplicate.selectedMatchName}，action=${duplicate.action}。`,
    )
  }

  for (const skipped of skippedTerms) {
    if (skipped.reason === 'duplicate_match') {
      warnings.push(
        `duplicateMatchTerm=${skipped.requested}: 已跳过重复比赛 ${
          skipped.duplicateOf?.selectedMatchName ?? 'unknown'
        }。`,
      )
    } else {
      warnings.push(`skippedTerm=${skipped.requested}: ${skipped.reason}。`)
    }
  }

  return warnings
}

function buildBatchReport({
  builtAt,
  command,
  duplicateMatches,
  requestedTerms,
  resolvedMatches,
  results,
  skippedTerms,
}) {
  const succeeded = results.filter((item) => item.ok)
  const failed = results.filter((item) => !item.ok)
  const warnings = [
    ...summarizeDuplicateWarnings(succeeded, duplicateMatches, skippedTerms),
    ...results.flatMap((item) => item.report?.warnings ?? []),
  ]
  const averageContentScore = succeeded.length
    ? Number(
        (
          succeeded.reduce((sum, item) => sum + Number(item.report?.contentScore ?? 0), 0) /
          succeeded.length
        ).toFixed(2),
      )
    : 0
  const bestVideo =
    succeeded
      .slice()
      .sort((left, right) => Number(right.report?.contentScore ?? 0) - Number(left.report?.contentScore ?? 0))[0] ?? null
  const needsReview = succeeded
    .filter((item) => item.report?.publishReadiness !== 'ready')
    .map((item) => ({
      contentScore: item.report?.contentScore ?? 0,
      desktopVideoPath: item.desktopVideoPath,
      matchName: item.report?.selectedMatchName ?? null,
      publishReadiness: item.report?.publishReadiness ?? 'blocked',
      warnings: item.report?.warnings ?? [],
    }))

  return {
    averageContentScore,
    bestVideo: bestVideo
      ? {
          contentScore: bestVideo.report?.contentScore ?? 0,
          desktopVideoPath: bestVideo.desktopVideoPath,
          matchName: bestVideo.report?.selectedMatchName ?? null,
          publishReadiness: bestVideo.report?.publishReadiness ?? null,
        }
      : null,
    builtAt,
    command,
    copiedVideos: succeeded.map((item) => item.desktopVideoPath),
    desktopIndexPath,
    desktopOutputRoot,
    duplicateMatches,
    failedMatches: failed.map((item) => ({
      error: item.error,
      label: item.job.label,
      missingDesktopFiles: item.missingDesktopFiles,
      requested: item.job.requested,
      selectedMatchName: item.report?.selectedMatchName ?? null,
      status: item.status,
      warnings: item.report?.warnings ?? [],
    })),
    needsReview,
    ok:
      succeeded.length > 0 &&
      failed.length === 0 &&
      succeeded.every((item) => item.report?.publishReadiness !== 'blocked'),
    outputDirs: succeeded.map((item) => item.desktopOutputDir),
    requestedTerms,
    resolvedMatches,
    skippedTerms,
    succeededMatches: succeeded.map((item) => ({
      contentScore: item.report?.contentScore ?? 0,
      copiedToDesktop: item.report?.copiedToDesktop ?? false,
      copyTextPath: item.copyTextPath,
      desktopOutputDir: item.desktopOutputDir,
      desktopVideoPath: item.desktopVideoPath,
      label: item.job.label,
      publishReadiness: item.report?.publishReadiness ?? 'blocked',
      requested: item.job.requested,
      selectedMatchName: item.report?.selectedMatchName ?? null,
      usedFallback: item.report?.usedFallback ?? null,
    })),
    totalFailed: failed.length,
    totalRequested: requestedTerms.length,
    totalSkipped: skippedTerms.length,
    totalSucceeded: succeeded.length,
    uniqueMatchCount: new Set(
      succeeded.map((item) => item.report?.selectedMatchId ?? item.report?.matchKey ?? item.report?.selectedMatchName),
    ).size,
    warnings,
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const resolution = buildJobs(options)
  const jobs = resolution.jobs
  const builtAt = new Date().toISOString()
  const command = commandText(['node', '.\\scripts\\build-douyin-batch.mjs', ...process.argv.slice(2)])
  const results = []

  for (const job of jobs) {
    console.log(`\n=== 开始生成：${job.label} ===`)
    try {
      results.push(runSingleJob(job))
    } catch (error) {
      results.push({
        command: commandText(['node', '.\\scripts\\build-douyin-video.mjs', ...job.args]),
        copyTextPath: null,
        desktopOutputDir: null,
        desktopVideoPath: null,
        error: error?.message ?? String(error),
        job,
        missingDesktopFiles: [],
        ok: false,
        report: {},
        status: 1,
      })
      console.error(error?.message ?? error)
    }
  }

  const report = buildBatchReport({
    builtAt,
    command,
    duplicateMatches: resolution.duplicateMatches,
    requestedTerms: resolution.requestedTerms,
    resolvedMatches: resolution.resolvedMatches,
    results,
    skippedTerms: resolution.skippedTerms,
  })
  writeDesktopIndex({
    builtAt,
    results: results.filter((item) => item.ok),
    skippedTerms: resolution.skippedTerms,
  })
  writeFileSync(batchReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    [
      '',
      '批量生成完成：',
      `成功：${report.totalSucceeded}`,
      `失败：${report.totalFailed}`,
      `跳过：${report.totalSkipped}`,
      `最佳视频：${report.bestVideo?.matchName ?? '无'} (${report.bestVideo?.contentScore ?? 0})`,
      `桌面 index.md：${desktopIndexPath}`,
    ].join('\n'),
  )

  if (!report.ok) process.exit(1)
}

try {
  main()
} catch (error) {
  const fallbackReport = {
    builtAt: new Date().toISOString(),
    command: commandText(['node', '.\\scripts\\build-douyin-batch.mjs', ...process.argv.slice(2)]),
    desktopOutputRoot,
    duplicateMatches: [],
    failedMatches: [],
    ok: false,
    requestedTerms: [],
    resolvedMatches: [],
    skippedTerms: [],
    totalFailed: 0,
    totalRequested: 0,
    totalSkipped: 0,
    totalSucceeded: 0,
    uniqueMatchCount: 0,
    warnings: [error?.message ?? String(error)],
  }
  writeFileSync(batchReportPath, `${JSON.stringify(fallbackReport, null, 2)}\n`, 'utf8')
  console.error(error?.message ?? error)
  process.exit(1)
}
