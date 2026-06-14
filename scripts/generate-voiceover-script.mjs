import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)

function parseArgs(argv) {
  const options = {
    copy: '',
    meta: '',
    output: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  node .\\scripts\\generate-voiceover-script.mjs --meta <meta.json> --output <voiceover.txt> --copy <copy.txt>',
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

    throw new Error(`无法识别参数：${arg}`)
  }

  if (!options.meta) throw new Error('--meta 是必填参数。')
  if (!options.output) throw new Error('--output 是必填参数。')

  return options
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function normalizeScoreForSpeech(value) {
  return String(value ?? '待复核')
    .trim()
    .replace(/-/g, ' 比 ')
    .replace(/\s+/g, ' ')
}

function totalGoalsSpeech(value) {
  const text = String(value ?? '2.5球分界').trim()
  if (text.includes('大')) return `${text.replace(/\s+/g, '')}，整体偏谨慎大`
  if (text.includes('小')) return `${text.replace(/\s+/g, '')}，整体偏谨慎小`
  return `${text.replace(/\s+/g, '')}，结合比分谨慎复核`
}

function compactRisk(value) {
  const text = String(value ?? '临场阵容和节奏还要复核').trim()
  if (text.length <= 30) return text
  return text
    .replace(/临场阵容与轮换需复核/g, '临场阵容还要复核')
    .replace(/临场阵容、比赛节奏和轮换强度/g, '阵容、节奏和轮换')
    .replace(/节奏强度偏高/g, '节奏偏快')
    .replace(/盘口变化仍需二次复核/g, '变化还要复核')
    .replace(/需二次复核/g, '还要复核')
    .slice(0, 34)
}

export function buildVoiceoverText(meta) {
  const matchName = meta.match_name ?? '这场比赛'
  const mainPick = meta.main_pick ?? '临场复核'
  const score1 = normalizeScoreForSpeech(meta.score_1)
  const score2 = normalizeScoreForSpeech(meta.score_2)
  const totalGoals = totalGoalsSpeech(meta.total_goals)
  const riskNote = compactRisk(meta.risk_note)

  return [
    `这场${matchName.replace(/\s+vs\s+/i, '打')}，我让本地 AI 系统先跑了一遍。`,
    `方向暂时看 ${mainPick}，比分参考 ${score1} 或者 ${score2}。`,
    `大小球按 ${totalGoals}。`,
    `${riskNote}。`,
    '每天记录几场，只做数据和娱乐参考。',
  ].join('')
}

export function buildCopyText(meta) {
  const matchName = meta.match_name ?? '本场比赛'
  const mainPick = meta.main_pick ?? '临场复核'
  const score1 = meta.score_1 ?? '待复核'
  const score2 = meta.score_2 ?? '待复核'
  const totalGoals = meta.total_goals ?? '2.5球分界'
  const riskNote = meta.risk_note ?? '临场阵容、节奏和轮换强度还要复核'

  return [
    '【短版】',
    `本地搭了个 AI 世界杯预测系统，每天记录几场。今天看 ${matchName}：主推 ${mainPick}，比分参考 ${score1} / ${score2}，大小球 ${totalGoals}。仅供娱乐参考。`,
    '',
    '【正常版】',
    `今天继续用本地 AI 系统跑世界杯预测，记录一场 ${matchName}。模型方向暂时偏 ${mainPick}，比分先看 ${score1} / ${score2}，大小球按 ${totalGoals}。风险点：${riskNote}。不承诺命中，不诱导下注，只做数据记录与娱乐参考。`,
    '',
    '【口语版】',
    `这场 ${matchName} 我先让本地 AI 跑了一遍。方向看 ${mainPick}，比分盯 ${score1} 和 ${score2}，大小球看 ${totalGoals}。但 ${riskNote}，所以只当赛前观察样本，每天记录几场，娱乐参考就好。`,
    '',
  ].join('\n')
}

export function writeVoiceoverFiles({ copyPath, metaPath, outputPath }) {
  if (!existsSync(metaPath)) throw new Error(`找不到 meta.json：${metaPath}`)
  const meta = readJson(metaPath)
  const voiceoverText = buildVoiceoverText(meta)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${voiceoverText}\n`, 'utf8')

  if (copyPath) {
    mkdirSync(path.dirname(copyPath), { recursive: true })
    writeFileSync(copyPath, buildCopyText(meta), 'utf8')
  }

  return {
    copyPath: copyPath || null,
    meta,
    voiceoverPath: outputPath,
    voiceoverText,
  }
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const result = writeVoiceoverFiles({
      copyPath: options.copy,
      metaPath: options.meta,
      outputPath: options.output,
    })
    console.log(
      JSON.stringify(
        {
          copyPath: result.copyPath,
          voiceoverPath: result.voiceoverPath,
          voiceoverText: result.voiceoverText,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    console.error(error?.message ?? error)
    process.exit(1)
  }
}
