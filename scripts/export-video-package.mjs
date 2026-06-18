import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildInternalV4Analysis } from '../src/internal/v4/internalEngineV4.js'
import { formatKickoffV4 } from '../src/internal/v4/internalSelectorsV4.js'
import buildBetPlan from '../src/services/betEngine.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(projectRoot, '..')
const videoFactoryRoot = path.join(workspaceRoot, 'video-factory')
const packageDir = path.join(videoFactoryRoot, 'input', 'package')
const reportPath = path.join(__dirname, 'video-package-export-report.json')

const TITLE = '世界杯大模型预测'
const SUBTITLE = '本地 AI 分析系统 · 每日更新'
const FOOTER_NOTE = '仅做数据记录与娱乐参考'
const DATA_SOURCE = {
  dataFiles: ['src/data/matches.json', 'src/data/teams.json'],
  engine: 'src/internal/v4/internalEngineV4.js',
  publicPlan: 'src/services/betEngine.js',
  note: '本地脚本读取 dashboard 现有赛程与球队评分，补齐 App 同源模型概率后调用内部分析与 BetEngine。',
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(projectRoot, relativePath), 'utf8'))
}

function assertProjectReady() {
  if (!existsSync(videoFactoryRoot)) {
    throw new Error(`找不到 video-factory 目录：${videoFactoryRoot}`)
  }
}

function parseArgs(argv) {
  const options = {
    index: null,
    match: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  node .\\scripts\\export-video-package.mjs',
          '  node .\\scripts\\export-video-package.mjs --match "德国"',
          '  node .\\scripts\\export-video-package.mjs --index 0',
        ].join('\n'),
      )
      process.exit(0)
    }

    if (arg === '--match') {
      options.match = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg.startsWith('--match=')) {
      options.match = arg.slice('--match='.length).trim()
      continue
    }

    if (arg === '--index') {
      const value = Number(argv[index + 1])
      if (!Number.isInteger(value)) throw new Error('--index 必须是整数。')
      options.index = value
      index += 1
      continue
    }

    if (arg.startsWith('--index=')) {
      const value = Number(arg.slice('--index='.length))
      if (!Number.isInteger(value)) throw new Error('--index 必须是整数。')
      options.index = value
      continue
    }

    throw new Error(`无法识别参数：${arg}`)
  }

  return options
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max)
}

function calculateTeamPower(team, isHome) {
  const positiveScore =
    team.teamStrength * 0.24 +
    team.recentForm * 0.14 +
    team.attackRating * 0.16 +
    team.defenseRating * 0.14 +
    team.starPlayerForm * 0.14 +
    team.morale * 0.1
  const pressurePenalty = team.injuryRisk * 0.05 + team.fatigue * 0.03

  return positiveScore - pressurePenalty + (isHome ? 2.5 : 0)
}

function calculateModelProbabilities(homeTeam, awayTeam) {
  const homePower = calculateTeamPower(homeTeam, true)
  const awayPower = calculateTeamPower(awayTeam, false)
  const powerDiff = homePower - awayPower
  const tightness = Math.max(0, 1 - Math.min(Math.abs(powerDiff), 18) / 18)
  const fatigueDrawBoost = ((homeTeam.fatigue + awayTeam.fatigue) / 2 / 100) * 0.03
  const attackPressure =
    (homeTeam.attackRating +
      awayTeam.attackRating -
      homeTeam.defenseRating -
      awayTeam.defenseRating) /
    200
  const draw = clamp(
    0.18 + tightness * 0.1 + fatigueDrawBoost - Math.max(attackPressure, 0) * 0.04,
    0.17,
    0.31,
  )
  const homeRaw = Math.exp(powerDiff / 17)
  const awayRaw = Math.exp(-powerDiff / 17)
  const winPool = 1 - draw
  const home = winPool * (homeRaw / (homeRaw + awayRaw))
  const away = winPool - home

  return { home, draw, away, homePower, awayPower, powerDiff }
}

function calculateTotalGoalsModel(homeTeam, awayTeam) {
  const attackAverage = (homeTeam.attackRating + awayTeam.attackRating) / 2
  const defenseAverage = (homeTeam.defenseRating + awayTeam.defenseRating) / 2
  const formAverage = (homeTeam.recentForm + awayTeam.recentForm) / 2
  const fatigueAverage = (homeTeam.fatigue + awayTeam.fatigue) / 2
  const attackVsDefense = clamp(50 + attackAverage - defenseAverage, 0, 100)
  const totalGoalLean = clamp(
    attackVsDefense * 0.38 +
      attackAverage * 0.22 +
      formAverage * 0.22 +
      fatigueAverage * 0.18,
    0,
    100,
  )
  const over25Probability = clamp(0.5 + (totalGoalLean - 55) * 0.006, 0.3, 0.72)

  return {
    totalGoalLean,
    over25Probability,
    under25Probability: 1 - over25Probability,
  }
}

function normalizeSearchText(value) {
  return String(value ?? '').trim().toLowerCase()
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

function selectExportMatch(matches, teamMap, options = {}) {
  if (options.index !== null) {
    if (options.index < 0 || options.index >= matches.length) {
      throw new Error(`--index 超出范围：${options.index}，当前共有 ${matches.length} 场。`)
    }
    return {
      match: matches[options.index],
      selectedBy: `index:${options.index}`,
    }
  }

  if (options.match) {
    const match = matches.find((candidate) =>
      rawMatchMatchesQuery(candidate, teamMap, options.match),
    )
    if (!match) {
      throw new Error(`没有找到匹配 "${options.match}" 的比赛。`)
    }
    return {
      match,
      selectedBy: `match:${options.match}`,
    }
  }

  return (
    {
      match:
        matches.find((match) => String(match.status).toLowerCase() === 'scheduled') ??
        matches.find((match) => String(match.status).toLowerCase() !== 'finished') ??
        matches[0],
      selectedBy: 'default:first-scheduled',
    }
  )
}

function enrichMatch(rawMatch, teamMap) {
  const homeTeam = teamMap.get(rawMatch.homeTeamId)
  const awayTeam = teamMap.get(rawMatch.awayTeamId)

  if (!homeTeam || !awayTeam) {
    throw new Error(`比赛 ${rawMatch.id} 缺少球队资料，无法导出素材包。`)
  }

  return {
    ...rawMatch,
    awayTeam,
    homeTeam,
    kickoffTime: rawMatch.kickoff,
    model: calculateModelProbabilities(homeTeam, awayTeam),
    totalGoals: {
      model: calculateTotalGoalsModel(homeTeam, awayTeam),
    },
  }
}

function formatMainPick(mainPick, match) {
  if (mainPick === '主队胜') return `${match.homeTeam.name}胜`
  if (mainPick === '客队胜') return `${match.awayTeam.name}胜`
  if (mainPick === '主队不败') return `${match.homeTeam.name}不败`
  if (mainPick === '客队不败') return `${match.awayTeam.name}不败`
  if (mainPick === '平局') return '平局防范'
  return mainPick || '临场复核'
}

function formatOverUnder(value) {
  const text = String(value ?? '').trim()
  if (text === '大2.5') return '大 2.5'
  if (text === '小2.5') return '小 2.5'
  return text || '2.5球分界'
}

function firstUsefulCandidate(candidates) {
  return candidates
    .map((item) => ({
      fallback: item?.fallback === true,
      source: item?.source ?? 'unknown',
      text: String(item?.text ?? item ?? '').trim(),
    }))
    .find(
      (item) =>
        item.text &&
        !item.text.includes('undefined') &&
        !item.text.includes('null') &&
        !/资金|下注|投注|金额|stake|bankroll/i.test(item.text),
    )
}

function buildExportPayload(match) {
  const internal = buildInternalV4Analysis(match, { bankroll: 0 })
  const publicPlan = buildBetPlan(match, {
    bankroll: 0,
    maxStakePerMatch: 0,
  })
  const matchName = `${match.homeTeam.name} vs ${match.awayTeam.name}`
  const fallbackFields = []
  const internalMainPick = internal.decision?.mainPick
  if (!internalMainPick) fallbackFields.push('main_pick')
  const mainPick = formatMainPick(internalMainPick, match)
  const score1 =
    internal.predictions?.primaryScore ?? publicPlan.scorePicks?.[0]?.score ?? '1-1'
  const score2 =
    internal.predictions?.secondaryScore ?? publicPlan.scorePicks?.[1]?.score ?? '0-0'
  if (!internal.predictions?.primaryScore && !publicPlan.scorePicks?.[0]?.score) {
    fallbackFields.push('score_1')
  }
  if (!internal.predictions?.secondaryScore && !publicPlan.scorePicks?.[1]?.score) {
    fallbackFields.push('score_2')
  }

  if (!internal.predictions?.overUnder) fallbackFields.push('total_goals')
  const totalGoals = formatOverUnder(internal.predictions?.overUnder)
  const riskCandidate = firstUsefulCandidate([
    {
      source: 'internal.consistency.scoreStrategyNotice',
      text: internal.consistency?.scoreStrategyNotice,
    },
    {
      source: 'src/data/matches.json:headline',
      text: match.headline ? `${match.headline}，临场阵容与轮换需复核` : '',
    },
    {
      source: 'BetEngine.heatWarning.message',
      text: publicPlan.heatWarning?.message,
    },
    {
      source: 'internal.reasons.cautionReasons[0]',
      text: internal.reasons?.cautionReasons?.[0],
    },
    {
      fallback: true,
      source: 'fallback.defaultRiskNote',
      text: '临场阵容、轮换强度与盘口变化需复核',
    },
  ])
  if (riskCandidate?.fallback) fallbackFields.push('risk_note')
  const riskNote = riskCandidate?.text ?? '临场阵容、轮换强度与盘口变化需复核'

  return {
    exportInfo: {
      grade: internal.decision.grade,
      headline: internal.reasons?.headline ?? '',
      kickoffText: formatKickoffV4(match.kickoff),
      matchId: match.id,
      riskNoteSource: riskCandidate?.source ?? 'fallback.defaultRiskNote',
      source: 'worldcup-betting-dashboard',
    },
    fallbackFields,
    meta: {
      footer_note: FOOTER_NOTE,
      main_pick: mainPick,
      match_name: matchName,
      risk_note: riskNote,
      score_1: score1,
      score_2: score2,
      subtitle: SUBTITLE,
      title: TITLE,
      total_goals: totalGoals,
    },
  }
}

const PYTHON_RENDERER = String.raw`
import json
import math
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.stderr.write("Pillow is required. Please run: pip install pillow\n")
    sys.exit(4)

WIDTH = 1080
HEIGHT = 1920
SAFE = 72
CONTENT_WIDTH = WIDTH - SAFE * 2

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\arial.ttf",
]

BOLD_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\arialbd.ttf",
]

def font(size, bold=False):
    candidates = BOLD_FONT_CANDIDATES if bold else FONT_CANDIDATES
    for candidate in candidates:
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()

def text_width(draw, text, draw_font):
    box = draw.textbbox((0, 0), str(text), font=draw_font)
    return box[2] - box[0]

def wrap_text(draw, text, draw_font, max_width):
    text = str(text or "").strip()
    if not text:
        return []
    lines = []
    current = ""
    for char in text:
        next_text = current + char
        if current and text_width(draw, next_text, draw_font) > max_width:
            lines.append(current)
            current = char
        else:
            current = next_text
    if current:
        lines.append(current)
    return lines

def fit_lines(draw, text, max_width, max_lines, max_size, min_size, bold=False):
    for size in range(max_size, min_size - 1, -2):
        draw_font = font(size, bold)
        lines = wrap_text(draw, text, draw_font, max_width)
        if len(lines) <= max_lines:
            return draw_font, lines, size
    draw_font = font(min_size, bold)
    return draw_font, wrap_text(draw, text, draw_font, max_width)[:max_lines], min_size

def draw_text(draw, text, x, y, max_width, max_lines=1, max_size=44, min_size=24,
              fill=(248, 250, 252, 255), bold=False, align="left", line_gap=8):
    draw_font, lines, size = fit_lines(draw, text, max_width, max_lines, max_size, min_size, bold)
    line_height = int(size * 1.2)
    for index, line in enumerate(lines):
        tx = x
        if align == "center":
            tx = x + (max_width - text_width(draw, line, draw_font)) / 2
        elif align == "right":
            tx = x + max_width - text_width(draw, line, draw_font)
        draw.text((tx, y + index * (line_height + line_gap)), line, font=draw_font, fill=fill)
    return y + len(lines) * (line_height + line_gap)

def lerp(a, b, t):
    return int(a + (b - a) * t)

def draw_background(image):
    draw = ImageDraw.Draw(image, "RGBA")
    for y in range(HEIGHT):
        t = y / HEIGHT
        r = lerp(5, 2, t)
        g = lerp(18, 6, t)
        b = lerp(35, 22, t)
        draw.line((0, y, WIDTH, y), fill=(r, g, b, 255))

    for step in range(0, HEIGHT, 72):
        alpha = 34 if step % 216 == 0 else 18
        draw.line((SAFE, step, WIDTH - SAFE, step), fill=(45, 212, 191, alpha), width=1)
    for step in range(SAFE, WIDTH - SAFE + 1, 72):
        draw.line((step, 0, step, HEIGHT), fill=(45, 212, 191, 18), width=1)

    for i in range(14):
        x1 = SAFE + (i * 67) % CONTENT_WIDTH
        y1 = 250 + (i * 119) % 1180
        x2 = SAFE + ((i * 137) + 260) % CONTENT_WIDTH
        y2 = 330 + (i * 173) % 1120
        draw.line((x1, y1, x2, y2), fill=(56, 189, 248, 40), width=2)
        draw.ellipse((x1 - 5, y1 - 5, x1 + 5, y1 + 5), fill=(94, 234, 212, 110))
        draw.ellipse((x2 - 4, y2 - 4, x2 + 4, y2 + 4), fill=(251, 191, 36, 105))

    for y in range(110, HEIGHT, 180):
        draw.rectangle((0, y, WIDTH, y + 4), fill=(94, 234, 212, 18))

    draw.rounded_rectangle((SAFE, 156, WIDTH - SAFE, HEIGHT - 132), radius=32,
                           outline=(148, 163, 184, 44), width=2)

def panel(draw, xy, fill=(15, 23, 42, 210), outline=(94, 234, 212, 95), radius=24):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=2)

def draw_soccer_icon(draw, cx, cy, radius):
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius),
                 fill=(226, 232, 240, 230), outline=(94, 234, 212, 210), width=4)
    points = []
    for i in range(5):
        angle = -math.pi / 2 + i * math.pi * 2 / 5
        points.append((cx + math.cos(angle) * radius * 0.28, cy + math.sin(angle) * radius * 0.28))
    draw.polygon(points, fill=(15, 23, 42, 230))
    for px, py in points:
        draw.line((cx, cy, px, py), fill=(15, 23, 42, 140), width=3)

def draw_header(draw, meta, export_info):
    draw.line((SAFE, 116, WIDTH - SAFE, 116), fill=(94, 234, 212, 110), width=4)
    draw.line((SAFE, 222, WIDTH - SAFE, 222), fill=(125, 211, 252, 50), width=2)
    for index in range(9):
        x = SAFE + index * 104
        draw.rounded_rectangle((x, 256, x + 52, 262), radius=3, fill=(94, 234, 212, 70))

def draw_footer(draw, meta):
    panel(draw, (SAFE, HEIGHT - 190, WIDTH - SAFE, HEIGHT - 112),
          fill=(2, 6, 23, 190), outline=(148, 163, 184, 58), radius=20)
    draw.line((SAFE + 54, HEIGHT - 151, WIDTH - SAFE - 54, HEIGHT - 151),
              fill=(148, 163, 184, 62), width=2)

def draw_match_block(draw, meta, y):
    panel(draw, (SAFE, y, WIDTH - SAFE, y + 310), fill=(6, 78, 59, 128),
          outline=(45, 212, 191, 120), radius=34)
    draw_soccer_icon(draw, WIDTH // 2, y + 82, 48)
    for index in range(5):
        x = SAFE + 130 + index * 160
        draw.rounded_rectangle((x, y + 205, x + 92, y + 216), radius=5,
                               fill=(167, 243, 208, 54))

def draw_prediction_cards(draw, meta, y):
    card_w = (CONTENT_WIDTH - 32) // 2
    cards = [
        ("主方向", meta["main_pick"], SAFE, (94, 234, 212, 240)),
        ("大小球", meta["total_goals"], SAFE + card_w + 32, (251, 191, 36, 240)),
        ("比分一", meta["score_1"], SAFE, (216, 180, 254, 240)),
        ("比分二", meta["score_2"], SAFE + card_w + 32, (147, 197, 253, 240)),
    ]
    for index, (label, value, x, color) in enumerate(cards):
        yy = y + (index // 2) * 202
        panel(draw, (x, yy, x + card_w, yy + 170), fill=(15, 23, 42, 218),
              outline=color[:3] + (100,), radius=24)
        draw.line((x + 32, yy + 58, x + card_w - 32, yy + 58),
                  fill=color[:3] + (72,), width=3)
        draw.ellipse((x + card_w // 2 - 8, yy + 94, x + card_w // 2 + 8, yy + 110),
                     fill=color[:3] + (130,))

def draw_risk_block(draw, meta, y):
    panel(draw, (SAFE, y, WIDTH - SAFE, y + 318), fill=(30, 41, 59, 218),
          outline=(251, 191, 36, 100), radius=28)
    draw.line((SAFE + 42, y + 76, WIDTH - SAFE - 42, y + 76),
              fill=(251, 191, 36, 76), width=3)
    for i in range(3):
        x = SAFE + 42 + i * 300
        yy = y + 244
        draw.rounded_rectangle((x, yy, x + 238, yy + 44), radius=22,
                               fill=(2, 6, 23, 190), outline=(94, 234, 212, 80), width=2)
        draw.ellipse((x + 104, yy + 16, x + 120, yy + 32), fill=(94, 234, 212, 105))

def render_poster(meta, export_info):
    img = Image.new("RGBA", (WIDTH, HEIGHT), (2, 6, 23, 255))
    draw_background(img)
    draw = ImageDraw.Draw(img, "RGBA")
    draw_header(draw, meta, export_info)
    draw_match_block(draw, meta, 360)
    draw_prediction_cards(draw, meta, 760)
    draw_risk_block(draw, meta, 1230)
    draw_footer(draw, meta)
    return img

def render_shot_01(meta, export_info):
    img = Image.new("RGBA", (WIDTH, HEIGHT), (2, 6, 23, 255))
    draw_background(img)
    draw = ImageDraw.Draw(img, "RGBA")
    draw_header(draw, meta, export_info)
    draw_match_block(draw, meta, 470)
    panel(draw, (SAFE, 890, WIDTH - SAFE, 1220), fill=(15, 23, 42, 226),
          outline=(94, 234, 212, 120), radius=30)
    for index in range(6):
        x = SAFE + 96 + index * 132
        draw.rounded_rectangle((x, 1018, x + 76, 1030), radius=6,
                               fill=(251, 191, 36, 70))
    draw_risk_block(draw, meta, 1330)
    draw_footer(draw, meta)
    return img

def render_shot_02(meta, export_info):
    img = Image.new("RGBA", (WIDTH, HEIGHT), (2, 6, 23, 255))
    draw_background(img)
    draw = ImageDraw.Draw(img, "RGBA")
    draw_header(draw, meta, export_info)
    panel(draw, (SAFE, 475, WIDTH - SAFE, 1255), fill=(15, 23, 42, 226),
          outline=(125, 211, 252, 120), radius=34)
    draw.line((SAFE + 120, 620, WIDTH - SAFE - 120, 620), fill=(125, 211, 252, 70), width=5)
    draw.line((SAFE + 160, 790, WIDTH - SAFE - 160, 790), fill=(191, 219, 254, 58), width=5)
    panel(draw, (SAFE + 96, 1010, WIDTH - SAFE - 96, 1160), fill=(6, 78, 59, 160),
          outline=(251, 191, 36, 130), radius=30)
    draw.line((SAFE + 170, 1088, WIDTH - SAFE - 170, 1088), fill=(251, 191, 36, 76), width=5)
    draw_risk_block(draw, meta, 1330)
    draw_footer(draw, meta)
    return img

def render_shot_03(meta, export_info):
    img = Image.new("RGBA", (WIDTH, HEIGHT), (2, 6, 23, 255))
    draw_background(img)
    draw = ImageDraw.Draw(img, "RGBA")
    draw_header(draw, meta, export_info)
    draw_risk_block(draw, meta, 470)
    y = 880
    for index in range(4):
        panel(draw, (SAFE, y, WIDTH - SAFE, y + 136), fill=(15, 23, 42, 218),
              outline=(94, 234, 212, 85), radius=24)
        draw.ellipse((SAFE + 70, y + 54, SAFE + 98, y + 82), fill=(94, 234, 212, 120))
        draw.line((SAFE + 150, y + 68, WIDTH - SAFE - 110, y + 68),
                  fill=(148, 163, 184, 56), width=4)
        y += 168
    draw_footer(draw, meta)
    return img

def main():
    spec = json.load(sys.stdin)
    output_dir = spec["outputDir"]
    os.makedirs(output_dir, exist_ok=True)
    meta = spec["meta"]
    export_info = spec.get("exportInfo", {})
    renders = {
        "poster.png": render_poster(meta, export_info),
        "shot_01.png": render_shot_01(meta, export_info),
        "shot_02.png": render_shot_02(meta, export_info),
        "shot_03.png": render_shot_03(meta, export_info),
    }
    for file_name, image in renders.items():
        image.convert("RGB").save(os.path.join(output_dir, file_name))

if __name__ == "__main__":
    main()
`

function renderPackageImages(spec) {
  const input = JSON.stringify(spec)
  const candidates = [
    { command: 'python', args: ['-c', PYTHON_RENDERER] },
    { command: 'py', args: ['-3', '-c', PYTHON_RENDERER] },
  ]
  const errors = []

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, candidate.args, {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
      },
      input,
    })

    if (result.status === 0) return

    const message = [result.error?.message, result.stderr, result.stdout]
      .filter(Boolean)
      .join('\n')
      .trim()
    errors.push(`${candidate.command}: ${message || `exit ${result.status}`}`)

    if (result.error?.code !== 'ENOENT') break
  }

  throw new Error(`生成 PNG 失败：\n${errors.join('\n')}`)
}

function getFileInfo(filePath) {
  if (!existsSync(filePath)) {
    return {
      exists: false,
      path: filePath,
      size: 0,
    }
  }

  const stats = readFileSync(filePath)
  return {
    exists: true,
    path: filePath,
    size: stats.byteLength,
  }
}

function collectOutputFiles(requiredFiles) {
  const packageFiles = Object.fromEntries(
    requiredFiles.map((fileName) => [
      fileName,
      getFileInfo(path.join(packageDir, fileName)),
    ]),
  )

  return {
    ...packageFiles,
    'video-package-export-report.json': getFileInfo(reportPath),
  }
}

function buildExportReport({ match, payload, requiredFiles, selectedBy }) {
  const warnings = []
  if (payload.fallbackFields.length) {
    warnings.push(`已启用 fallback 字段：${payload.fallbackFields.join(', ')}`)
  }

  return {
    exportedAt: new Date().toISOString(),
    sourceProject: 'worldcup-betting-dashboard',
    targetPackageDir: packageDir,
    selectedMatchName: payload.meta.match_name,
    selectedMatchId: match.id,
    matchKey: `${match.homeTeamId}__${match.awayTeamId}`,
    selectedBy,
    dataSource: {
      ...DATA_SOURCE,
      matchData: 'src/data/matches.json',
      teamData: 'src/data/teams.json',
      recommendationSource: 'buildInternalV4Analysis(match) + buildBetPlan(match)',
      riskNoteSource: payload.exportInfo.riskNoteSource,
    },
    usedFallback: payload.fallbackFields.length > 0,
    fallbackFields: payload.fallbackFields,
    fieldsExported: Object.keys(payload.meta),
    outputFiles: collectOutputFiles(requiredFiles),
    warnings,
  }
}

function writeExportReport(report, requiredFiles) {
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  report.outputFiles = collectOutputFiles(requiredFiles)
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

function main() {
  assertProjectReady()
  const options = parseArgs(process.argv.slice(2))
  const matchesData = readJson('src/data/matches.json')
  const teamsData = readJson('src/data/teams.json')
  const teamMap = new Map(teamsData.teams.map((team) => [team.id, team]))
  const { match: rawMatch, selectedBy } = selectExportMatch(
    matchesData.matches,
    teamMap,
    options,
  )
  const match = enrichMatch(rawMatch, teamMap)
  const payload = buildExportPayload(match)

  mkdirSync(packageDir, { recursive: true })
  writeFileSync(
    path.join(packageDir, 'meta.json'),
    `${JSON.stringify(payload.meta, null, 2)}\n`,
    'utf8',
  )
  renderPackageImages({
    exportInfo: payload.exportInfo,
    meta: payload.meta,
    outputDir: packageDir,
  })

  const requiredFiles = ['poster.png', 'shot_01.png', 'shot_02.png', 'shot_03.png', 'meta.json']
  const missing = requiredFiles.filter((fileName) => !existsSync(path.join(packageDir, fileName)))
  if (missing.length) {
    throw new Error(`素材包导出不完整，缺少：${missing.join(', ')}`)
  }

  const report = buildExportReport({
    match,
    payload,
    requiredFiles,
    selectedBy,
  })
  writeExportReport(report, requiredFiles)

  console.log(
    JSON.stringify(
      {
        fallbackFields: payload.fallbackFields,
        match: payload.meta.match_name,
        mode: 'package',
        outputDir: packageDir,
        report: reportPath,
        requiredFiles,
        selectedBy,
        usedFallback: payload.fallbackFields.length > 0,
      },
      null,
      2,
    ),
  )
}

try {
  main()
} catch (error) {
  console.error(error?.message ?? error)
  process.exit(1)
}
