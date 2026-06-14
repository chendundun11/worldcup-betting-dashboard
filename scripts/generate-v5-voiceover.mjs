import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const STYLES = new Set(['record', 'sharp', 'explain'])

function parseArgs(argv) {
  const options = {
    copy: '',
    meta: '',
    output: '',
    script: '',
    style: 'sharp',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  node .\\scripts\\generate-v5-voiceover.mjs --meta <meta.json> --output <voiceover.txt> --copy <copy.txt> --style sharp',
          '  node .\\scripts\\generate-v5-voiceover.mjs --meta <meta.json> --output <voiceover.txt> --script <custom.txt>',
        ].join('\n'),
      )
      process.exit(0)
    }

    if (arg === '--meta') {
      options.meta = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg === '--output') {
      options.output = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg === '--copy') {
      options.copy = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg === '--script') {
      options.script = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg === '--style') {
      options.style = normalizeStyle(argv[index + 1])
      index += 1
      continue
    }

    throw new Error(`无法识别参数：${arg}`)
  }

  if (!options.meta) throw new Error('--meta 是必填参数。')
  if (!options.output) throw new Error('--output 是必填参数。')
  return options
}

function normalizeStyle(value) {
  const style = String(value ?? '').trim().toLowerCase()
  if (!style) return 'sharp'
  if (!STYLES.has(style)) {
    throw new Error(`--style 只支持：${[...STYLES].join(', ')}`)
  }
  return style
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function cleanCustomScript(text) {
  return String(text ?? '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

function normalizeScoreForSpeech(value) {
  return String(value ?? '待复核')
    .trim()
    .replace(/-/g, ' 比 ')
    .replace(/\s+/g, ' ')
}

function normalizeTotalGoalsForSpeech(value) {
  const text = String(value ?? '2.5球分界').replace(/\s+/g, '')
  if (text.includes('大')) return `${text}，进球方向偏谨慎大`
  if (text.includes('小')) return `${text}，节奏方向偏谨慎小`
  return `${text}，结合比分分布复核`
}

function trimRisk(value) {
  return String(value ?? '临场阵容、节奏和盘口变化还要复核')
    .trim()
    .replace(/稳赚|必中|包中|下注/gi, '')
    .replace(/已实时读取天气/g, '天气因子待复核')
    .replace(/已实时读取阵容/g, '阵容因子待复核')
    .slice(0, 54)
}

function estimateVoiceoverSeconds(text) {
  const charCount = [...String(text ?? '').replace(/\s+/g, '')].length
  return Number(Math.max(charCount / 6.7, 1).toFixed(1))
}

function buildGeneratedVoiceover(meta, style) {
  const matchName = meta.match_name ?? '这场比赛'
  const speechMatchName = matchName.replace(/\s+vs\s+/i, '打')
  const mainPick = meta.main_pick ?? '临场复核'
  const score1 = normalizeScoreForSpeech(meta.score_1)
  const score2 = normalizeScoreForSpeech(meta.score_2)
  const totalGoals = normalizeTotalGoalsForSpeech(meta.total_goals)
  const riskNote = trimRisk(meta.risk_note)

  if (style === 'record') {
    return [
      `本地网站模型开始录屏跑分析，${speechMatchName}，这场先做一条记录。`,
      '页面会把球队状态、盘口变化、市场热度和比分分布一起扫一遍。',
      `当前方向偏 ${mainPick}，比分参考 ${score1} 或 ${score2}。`,
      `大小球按 ${totalGoals}。`,
      `风险点是${riskNote}，赛前还要二次确认。`,
      '这条只做数据记录和娱乐参考。',
    ].join('\n')
  }

  if (style === 'explain') {
    return [
      `这场${speechMatchName}，我用本地 AI 页面重新跑了一遍分析流程。`,
      '它不是只看胜负，而是把状态、热度、比分分布和风险复核拆开看。',
      `模型方向暂时偏 ${mainPick}，比分先看 ${score1} 和 ${score2}。`,
      `大小球按 ${totalGoals}。`,
      `但${riskNote}，临场阵容和节奏不能当成已确认信息。`,
      '最终只做数据记录与娱乐参考。',
    ].join('\n')
  }

  return [
    `这场${speechMatchName}，我让本地 AI 模型重新跑了一遍。`,
    '它不是只看胜负，而是把球队状态、盘口变化、市场热度、比分分布和风险复核点一起扫。',
    `模型方向暂时更偏 ${mainPick}，比分先看 ${score1} 或 ${score2}。`,
    `大小球按 ${totalGoals}。`,
    `临场阵容和节奏还要二次确认，风险点是${riskNote}。`,
    '这条只做数据记录和娱乐参考。',
  ].join('\n')
}

function buildCopyText(meta, style) {
  const matchName = meta.match_name ?? '本场比赛'
  const mainPick = meta.main_pick ?? '临场复核'
  const score1 = meta.score_1 ?? '待复核'
  const score2 = meta.score_2 ?? '待复核'
  const totalGoals = meta.total_goals ?? '2.5球分界'
  const riskNote = meta.risk_note ?? '临场阵容、节奏和盘口变化还要复核'

  return [
    '【短版】',
    `用本地 AI 分析页面录了一条 ${matchName}。主推 ${mainPick}，比分 ${score1} / ${score2}，大小球 ${totalGoals}。仅供娱乐参考。`,
    '',
    '【正常版】',
    `今天用 v5 网站录屏模式跑 ${matchName}。风格：${style}。页面会扫球队状态、盘口变化、市场热度、比分分布和风险复核点。当前方向偏 ${mainPick}，比分参考 ${score1} / ${score2}，大小球 ${totalGoals}。风险点：${riskNote}。不承诺命中，不诱导下注，只做数据记录与娱乐参考。`,
    '',
    '【口语版】',
    `这场 ${matchName} 我直接让本地 AI 页面跑了一遍。先看 ${mainPick}，比分盯 ${score1} 和 ${score2}，大小球看 ${totalGoals}。但风险还得复核，尤其临场阵容和节奏，娱乐参考就好。`,
    '',
  ].join('\n')
}

export function writeV5VoiceoverFiles({
  copyPath,
  customScriptPath,
  metaPath,
  outputPath,
  style = 'sharp',
}) {
  if (!existsSync(metaPath)) throw new Error(`找不到 meta.json：${metaPath}`)
  const meta = readJson(metaPath)
  const normalizedStyle = normalizeStyle(style)
  const warnings = []
  let voiceoverSource = 'generated'
  let voiceoverText = buildGeneratedVoiceover(meta, normalizedStyle)

  if (customScriptPath) {
    if (existsSync(customScriptPath)) {
      const customText = cleanCustomScript(readFileSync(customScriptPath, 'utf8'))
      if (customText) {
        voiceoverText = customText
        voiceoverSource = 'custom'
      } else {
        voiceoverSource = 'fallback'
        warnings.push('自定义口播为空，已 fallback 到自动生成口播。')
      }
    } else {
      voiceoverSource = 'fallback'
      warnings.push(`找不到自定义口播文件，已 fallback 到自动生成口播：${customScriptPath}`)
    }
  }

  const voiceoverCharCount = [...voiceoverText.replace(/\s+/g, '')].length
  const estimatedVoiceoverSeconds = estimateVoiceoverSeconds(voiceoverText)
  if (voiceoverCharCount > 260) {
    warnings.push(`口播较长：${voiceoverCharCount} 字，可能超过 35 秒。`)
  }

  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${voiceoverText.trim()}\n`, 'utf8')

  if (copyPath) {
    mkdirSync(path.dirname(copyPath), { recursive: true })
    writeFileSync(copyPath, buildCopyText(meta, normalizedStyle), 'utf8')
  }

  return {
    copyPath: copyPath || null,
    customScriptPath: customScriptPath || null,
    estimatedVoiceoverSeconds,
    meta,
    style: normalizedStyle,
    voiceoverCharCount,
    voiceoverPath: outputPath,
    voiceoverSource,
    voiceoverText,
    warnings,
  }
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const result = writeV5VoiceoverFiles({
      copyPath: options.copy,
      customScriptPath: options.script,
      metaPath: options.meta,
      outputPath: options.output,
      style: options.style,
    })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error?.message ?? error)
    process.exit(1)
  }
}
