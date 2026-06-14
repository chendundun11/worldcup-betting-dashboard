import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const STYLES = new Set(['record', 'sharp', 'explain'])

function parseArgs(argv) {
  const options = {
    exportReport: '',
    meta: '',
    output: '',
    style: 'sharp',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  node .\\scripts\\generate-v5-storyboard.mjs --meta <meta.json> --output <storyboard.json> --style sharp',
          '  node .\\scripts\\generate-v5-storyboard.mjs --meta <meta.json> --export-report <report.json> --output <storyboard.json>',
        ].join('\n'),
      )
      process.exit(0)
    }

    if (arg === '--meta') {
      options.meta = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg === '--export-report') {
      options.exportReport = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg === '--output') {
      options.output = String(argv[index + 1] ?? '').trim()
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

function readJson(filePath, fallback = {}) {
  if (!filePath || !existsSync(filePath)) return fallback
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/\s+/g, ' ')
    .replace(/稳赚|必中|包中|下注|梭哈|重仓/gi, '')
    .replace(/已实时读取天气/g, '天气因子待复核')
    .replace(/已实时读取阵容/g, '阵容因子待复核')
    .trim()
}

function scoreForSpeech(value) {
  return cleanText(value, '待复核').replace(/-/g, ' 比 ')
}

function matchForSpeech(matchName) {
  return cleanText(matchName, '这场比赛').replace(/\s+vs\s+/i, '打')
}

function directionForSpeech(mainPick) {
  const text = cleanText(mainPick, '临场复核')
  if (/胜$/.test(text)) return text.replace(/胜$/, '')
  return text
}

function totalGoalsForSpeech(value) {
  const text = cleanText(value, '2.5球分界').replace(/\s+/g, '')
  if (text.includes('小')) return `${text}，整体偏谨慎小`
  if (text.includes('大')) return `${text}，整体偏谨慎大`
  return `${text}，整体偏谨慎大`
}

function shortRisk(value) {
  const text = cleanText(value, '临场阵容、比赛节奏和盘口变化还要二次确认。')
  return text.length > 48 ? `${text.slice(0, 48)}。` : text
}

function scene(index, key, title, duration, screenFocus, voiceoverText, card = {}) {
  return {
    card,
    duration,
    key,
    sceneIndex: index,
    screenFocus,
    title,
    voiceoverText,
  }
}

function withTimeline(scenes) {
  let cursor = 0
  return scenes.map((item) => {
    const startTime = Number(cursor.toFixed(2))
    cursor += item.duration
    return {
      ...item,
      endTime: Number(cursor.toFixed(2)),
      startTime,
    }
  })
}

export function buildV5Storyboard({ exportReport = {}, meta, style = 'sharp' }) {
  const normalizedStyle = normalizeStyle(style)
  const matchName = cleanText(meta.match_name, exportReport.selectedMatchName ?? '本场比赛')
  const mainPick = cleanText(meta.main_pick, '临场复核')
  const score1 = cleanText(meta.score_1, '2-0')
  const score2 = cleanText(meta.score_2, '2-1')
  const totalGoals = cleanText(meta.total_goals, '2.5球分界')
  const riskNote = shortRisk(meta.risk_note)
  const speechMatch = matchForSpeech(matchName)
  const directionSpeech = directionForSpeech(mainPick)
  const scoreSpeech1 = scoreForSpeech(score1)
  const scoreSpeech2 = scoreForSpeech(score2)
  const confidenceLabel = '模型置信度'

  const scenes = withTimeline([
    scene(
      1,
      'hook',
      '开头钩子',
      3,
      ['本地 AI 世界杯分析系统', matchName, '本地 AI 模型分析中'],
      `这场${speechMatch}，我让本地 AI 模型重新跑了一遍。`,
      { label: '本地 AI 模型分析中', value: matchName },
    ),
    scene(
      2,
      'scan',
      '模型扫描',
      5,
      ['球队状态扫描', '盘口变化追踪', '市场热度识别', '比分分布计算'],
      '它不是只看胜负，而是把球队状态、盘口变化、市场热度和比分分布一起扫。',
      { label: '模型扫描范围', value: '4 项核心因子' },
    ),
    scene(
      3,
      'pick',
      '主推方向',
      5,
      ['主推方向', '方向强度', confidenceLabel],
      `模型方向暂时更偏${directionSpeech}，但不是说一定稳。`,
      { label: '主推方向', value: mainPick },
    ),
    scene(
      4,
      'scores',
      '比分预测',
      5,
      [`比分参考 ${score1}`, `比分参考 ${score2}`],
      `比分参考先看 ${scoreSpeech1} 或 ${scoreSpeech2}。`,
      { label: '比分参考', value: `${score1} / ${score2}` },
    ),
    scene(
      5,
      'goals',
      '大小球',
      4,
      [`大小球 ${totalGoals}`, '进球区间'],
      `大小球按 ${totalGoalsForSpeech(totalGoals)}。`,
      { label: '大小球方向', value: totalGoals },
    ),
    scene(
      6,
      'risk',
      '风险复核',
      5,
      ['临场阵容复核', '节奏变化', '盘口临场变化', '天气与场地因子：待复核'],
      '临场阵容、比赛节奏和盘口变化还要二次确认。',
      { label: '风险提示', value: riskNote },
    ),
    scene(
      7,
      'ending',
      '结尾',
      3,
      ['每天记录几场', cleanText(meta.footer_note, '仅供娱乐参考')],
      '这条只做数据记录和娱乐参考，每天继续跑几场。',
      { label: '输出说明', value: cleanText(meta.footer_note, '仅供娱乐参考') },
    ),
  ])

  const totalDurationSeconds = scenes.reduce((sum, item) => sum + item.duration, 0)

  return {
    createdAt: new Date().toISOString(),
    export: {
      matchKey: exportReport.matchKey ?? null,
      selectedMatchId: exportReport.selectedMatchId ?? null,
      usedFallback: exportReport.usedFallback ?? null,
    },
    matchName,
    meta: {
      footer_note: cleanText(meta.footer_note, '仅供娱乐参考'),
      main_pick: mainPick,
      risk_note: riskNote,
      score_1: score1,
      score_2: score2,
      subtitle: cleanText(meta.subtitle, '本地 AI 分析系统 · 每日更新'),
      title: cleanText(meta.title, '世界杯大模型预测'),
      total_goals: totalGoals,
    },
    sceneTimeline: scenes.map((item) => ({
      endTime: item.endTime,
      sceneIndex: item.sceneIndex,
      screenFocus: item.screenFocus,
      startTime: item.startTime,
      title: item.title,
      voiceoverText: item.voiceoverText,
    })),
    scenes,
    source: 'storyboard',
    style: normalizedStyle,
    totalDurationSeconds,
    version: 'v5.1-storyboard',
  }
}

export function encodeStoryboardForUrl(storyboard) {
  return Buffer.from(JSON.stringify(storyboard), 'utf8').toString('base64url')
}

export function writeV5StoryboardFile({
  exportReportPath = '',
  metaPath,
  outputPath,
  style = 'sharp',
}) {
  if (!existsSync(metaPath)) throw new Error(`找不到 meta.json：${metaPath}`)
  const meta = readJson(metaPath)
  const exportReport = readJson(exportReportPath, {})
  const storyboard = buildV5Storyboard({ exportReport, meta, style })

  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(storyboard, null, 2)}\n`, 'utf8')
  return {
    outputPath,
    storyboard,
  }
}

function formatAssTime(seconds) {
  const value = Math.max(Number(seconds) || 0, 0)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const wholeSeconds = Math.floor(value % 60)
  const centiseconds = Math.floor((value - Math.floor(value)) * 100)
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(
    centiseconds,
  ).padStart(2, '0')}`
}

function wrapSubtitle(text, maxChars = 17) {
  const chars = [...String(text ?? '')]
  const lines = []
  for (let index = 0; index < chars.length; index += maxChars) {
    lines.push(chars.slice(index, index + maxChars).join(''))
  }
  if (lines.length > 1 && [...lines.at(-1)].length <= 2) {
    lines[lines.length - 2] = `${lines.at(-2)}${lines.at(-1)}`
    lines.pop()
  }
  return lines.slice(0, 2).join('\\N')
}

function escapeAssText(text) {
  return String(text ?? '')
    .replace(/[{}]/g, '')
    .replace(/,/g, '，')
}

export function writeStoryboardSubtitleAss({ outputPath, storyboard }) {
  const scenes = Array.isArray(storyboard?.scenes) ? storyboard.scenes : []
  const events = scenes
    .map((item) => {
      const start = Math.max(Number(item.startTime ?? 0) + 0.18, 0)
      const end = Math.max(Number(item.endTime ?? start + 2) - 0.2, start + 1)
      return {
        end,
        sceneIndex: item.sceneIndex,
        start,
        text: wrapSubtitle(escapeAssText(item.voiceoverText)),
      }
    })
    .filter((item) => item.end > item.start)

  const ass = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Microsoft YaHei,52,&H00FFFFFF,&H00FFFFFF,&H00000000,&H9C000000,1,0,0,0,100,100,0,0,3,2,0,2,94,94,260,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events.map(
      (item) =>
        `Dialogue: 0,${formatAssTime(item.start)},${formatAssTime(item.end)},Default,,0,0,0,,${item.text}`,
    ),
    '',
  ].join('\n')

  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, ass, 'utf8')

  return {
    events,
    outputPath,
    subtitleSceneAligned: events.length === scenes.length && scenes.length >= 6,
  }
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const result = writeV5StoryboardFile({
      exportReportPath: options.exportReport,
      metaPath: options.meta,
      outputPath: options.output,
      style: options.style,
    })
    console.log(JSON.stringify(result.storyboard, null, 2))
  } catch (error) {
    console.error(error?.message ?? error)
    process.exit(1)
  }
}
