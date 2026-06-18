import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)

function parseArgs(argv) {
  const options = {
    duration: 20,
    exportReport: '',
    meta: '',
    output: '',
    subtitles: '',
    voiceover: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  node .\\scripts\\generate-v3-scenes.mjs --meta <meta.json> --output <dir> --voiceover <voiceover.txt> --subtitles <subtitles.ass>',
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

    if (arg === '--voiceover') {
      options.voiceover = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg === '--subtitles') {
      options.subtitles = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg === '--duration') {
      options.duration = Number(argv[index + 1])
      index += 1
      continue
    }

    throw new Error(`无法识别参数：${arg}`)
  }

  if (!options.meta) throw new Error('--meta 是必填参数。')
  if (!options.output) throw new Error('--output 是必填参数。')
  if (!options.voiceover) throw new Error('--voiceover 是必填参数。')
  if (!options.subtitles) throw new Error('--subtitles 是必填参数。')

  return options
}

function readJson(filePath, fallback = {}) {
  if (!filePath || !existsSync(filePath)) return fallback
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max)
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

function splitSentences(text) {
  const normalized = String(text ?? '')
    .replace(/\s+/g, '')
    .replace(/([。！？!?])/g, '$1|')
  return normalized
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
}

function wrapSubtitle(text, maxChars = 16) {
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

export function writeSubtitleAss({ durationSeconds, outputPath, voiceoverText }) {
  const sentences = splitSentences(voiceoverText)
  const totalChars = sentences.reduce((sum, item) => sum + [...item].length, 0) || 1
  let cursor = 0.35
  const endLimit = Math.max(durationSeconds - 0.45, 0.5)
  const events = []

  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index]
    const weight = [...sentence].length / totalChars
    const isLast = index === sentences.length - 1
    const rawDuration = isLast ? endLimit - cursor : clamp(durationSeconds * weight, 2.1, 4.8)
    const end = isLast ? endLimit : Math.min(cursor + rawDuration, endLimit)
    if (end > cursor) {
      events.push({
        end,
        start: cursor,
        text: wrapSubtitle(escapeAssText(sentence)),
      })
    }
    cursor = end + 0.08
    if (cursor >= endLimit) break
  }

  const ass = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Microsoft YaHei,56,&H00FFFFFF,&H00FFFFFF,&H00000000,&H9A000000,1,0,0,0,100,100,0,0,3,3,0,2,92,92,178,1',
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
  }
}

function makeSceneSpecs(meta, exportReport, durationSeconds) {
  const baseDurations = [2.7, 3.0, 3.0, 3.4, 2.8, 3.3, 2.1]
  const baseTotal = baseDurations.reduce((sum, value) => sum + value, 0)
  const scale = durationSeconds / baseTotal
  const kickoff = exportReport?.dataSource ? exportReport?.selectedBy : ''
  const totalGoals = String(meta.total_goals ?? '2.5球分界')
  const goalHint = totalGoals.includes('大')
    ? '比分组合支持偏大思路'
    : totalGoals.includes('小')
      ? '节奏偏谨慎，优先防小'
      : '围绕 2.5 球分界复核'

  return [
    {
      accent: 'cyan',
      duration: baseDurations[0] * scale,
      fileName: 'scene_01_hook.png',
      kicker: 'AI 开场',
      lines: ['这场我让本地 AI 系统跑了一遍', meta.match_name],
      title: '赛前模型扫描',
    },
    {
      accent: 'blue',
      duration: baseDurations[1] * scale,
      fileName: 'scene_02_scan.png',
      kicker: '数据扫描',
      lines: [meta.match_name, kickoff ? `数据来源：${kickoff}` : '赛程 / 热度 / 阵容信息扫描中'],
      title: 'AI DATA SCAN',
    },
    {
      accent: 'green',
      duration: baseDurations[2] * scale,
      fileName: 'scene_03_pick.png',
      kicker: '方向判断',
      lines: [`主方向：${meta.main_pick}`, '方向强度：中高', '风险等级：需复核'],
      title: '模型主方向',
    },
    {
      accent: 'gold',
      duration: baseDurations[3] * scale,
      fileName: 'scene_04_score.png',
      kicker: '比分预测',
      lines: [`比分参考`, `${meta.score_1} / ${meta.score_2}`, '不做命中承诺'],
      title: 'SCORE BOARD',
    },
    {
      accent: 'purple',
      duration: baseDurations[4] * scale,
      fileName: 'scene_05_goals.png',
      kicker: '进球判断',
      lines: [`大小球：${meta.total_goals}`, goalHint],
      title: '进球分界',
    },
    {
      accent: 'amber',
      duration: baseDurations[5] * scale,
      fileName: 'scene_06_risk.png',
      kicker: '风险复核',
      lines: [meta.risk_note, '临场阵容 / 节奏 / 轮换需要复核'],
      title: 'RISK CHECK',
    },
    {
      accent: 'white',
      duration: baseDurations[6] * scale,
      fileName: 'scene_07_outro.png',
      kicker: '结尾提示',
      lines: ['每天记录几场', meta.footer_note ?? '仅供娱乐参考'],
      title: '仅做数据记录',
    },
  ].map((scene, index) => ({
    ...scene,
    duration: Number(scene.duration.toFixed(3)),
    index: index + 1,
  }))
}

const PYTHON_RENDERER = String.raw`
import json
import math
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
except ImportError:
    sys.stderr.write("Pillow is required. Please run: pip install pillow\n")
    sys.exit(4)

WIDTH = 1080
HEIGHT = 1920
SAFE = 72
CONTENT = WIDTH - SAFE * 2

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\arial.ttf",
]
BOLD_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\arialbd.ttf",
]

PALETTE = {
    "cyan": ((94, 234, 212), (14, 165, 233)),
    "blue": ((125, 211, 252), (59, 130, 246)),
    "green": ((52, 211, 153), (22, 163, 74)),
    "gold": ((251, 191, 36), (245, 158, 11)),
    "purple": ((216, 180, 254), (139, 92, 246)),
    "amber": ((251, 191, 36), (248, 113, 113)),
    "white": ((226, 232, 240), (94, 234, 212)),
}

def font(size, bold=False):
    for candidate in (BOLD_CANDIDATES if bold else FONT_CANDIDATES):
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()

def text_size(draw, text, draw_font):
    box = draw.textbbox((0, 0), str(text), font=draw_font)
    return box[2] - box[0], box[3] - box[1]

def wrap_chars(draw, text, draw_font, max_width):
    text = str(text or "").strip()
    if not text:
        return []
    lines = []
    current = ""
    for char in text:
        candidate = current + char
        if current and text_size(draw, candidate, draw_font)[0] > max_width:
            lines.append(current)
            current = char
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines

def fit_font(draw, text, max_width, max_lines, max_size, min_size, bold=False):
    for size in range(max_size, min_size - 1, -2):
        f = font(size, bold)
        lines = wrap_chars(draw, text, f, max_width)
        if len(lines) <= max_lines:
            return f, lines[:max_lines], size
    f = font(min_size, bold)
    return f, wrap_chars(draw, text, f, max_width)[:max_lines], min_size

def draw_fitted(draw, text, box, max_size, min_size=28, fill=(255,255,255,255),
                bold=False, align="center", max_lines=2, gap=10):
    x1, y1, x2, y2 = box
    max_width = x2 - x1
    f, lines, size = fit_font(draw, text, max_width, max_lines, max_size, min_size, bold)
    line_h = int(size * 1.22)
    total_h = len(lines) * line_h + max(0, len(lines) - 1) * gap
    y = y1 + max((y2 - y1 - total_h) / 2, 0)
    for line in lines:
        w, _ = text_size(draw, line, f)
        if align == "center":
            x = x1 + (max_width - w) / 2
        elif align == "right":
            x = x2 - w
        else:
            x = x1
        draw.text((x, y), line, font=f, fill=fill)
        y += line_h + gap

def gradient_bg():
    img = Image.new("RGBA", (WIDTH, HEIGHT), (2, 6, 23, 255))
    draw = ImageDraw.Draw(img, "RGBA")
    for y in range(HEIGHT):
        t = y / HEIGHT
        r = int(4 + 5 * (1 - t))
        g = int(10 + 20 * (1 - t))
        b = int(24 + 34 * (1 - t))
        draw.line((0, y, WIDTH, y), fill=(r, g, b, 255))
    return img

def glow_layer(cx, cy, color):
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0,0,0,0))
    draw = ImageDraw.Draw(layer, "RGBA")
    for radius, alpha in [(360, 20), (250, 28), (150, 36)]:
        draw.ellipse((cx-radius, cy-radius, cx+radius, cy+radius), fill=color + (alpha,))
    return layer.filter(ImageFilter.GaussianBlur(42))

def background(accent):
    c1, c2 = PALETTE.get(accent, PALETTE["cyan"])
    img = gradient_bg()
    img.alpha_composite(glow_layer(180, 340, c1))
    img.alpha_composite(glow_layer(930, 1240, c2))
    draw = ImageDraw.Draw(img, "RGBA")
    for x in range(SAFE, WIDTH - SAFE + 1, 72):
        draw.line((x, 0, x, HEIGHT), fill=(94,234,212,20), width=1)
    for y in range(0, HEIGHT, 72):
        draw.line((SAFE, y, WIDTH - SAFE, y), fill=(94,234,212,23), width=1)
    for y in [220, 650, 1190, 1640]:
        draw.line((0, y, WIDTH, y), fill=c1 + (70,), width=5)
    for i in range(18):
        x1 = SAFE + (i * 79) % CONTENT
        y1 = 280 + (i * 131) % 1160
        x2 = SAFE + ((i * 151) + 170) % CONTENT
        y2 = 340 + (i * 191) % 1050
        draw.line((x1, y1, x2, y2), fill=(56,189,248,45), width=2)
        draw.ellipse((x1-5, y1-5, x1+5, y1+5), fill=c1 + (145,))
    return img

def panel(draw, xy, fill=(15,23,42,218), outline=(94,234,212,110), radius=32, width=2):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

def draw_header(draw, scene, colors):
    c1, c2 = colors
    draw.rounded_rectangle((SAFE, 120, WIDTH - SAFE, 245), radius=26,
                           fill=(2,6,23,190), outline=c1 + (105,), width=2)
    draw.text((SAFE + 42, 142), scene["kicker"], font=font(34, True), fill=c1 + (255,))
    draw.text((WIDTH - SAFE - 170, 151), "V3 VOICE", font=font(28, True), fill=(226,232,240,190))
    draw.line((SAFE + 38, 218, WIDTH - SAFE - 38, 218), fill=c1 + (90,), width=3)

def draw_scan_meter(draw, y, colors):
    c1, c2 = colors
    panel(draw, (SAFE, y, WIDTH - SAFE, y + 120), fill=(15,23,42,185), outline=c1 + (80,), radius=24)
    for i in range(9):
        x = SAFE + 68 + i * 96
        h = 26 + (i * 17) % 64
        draw.rounded_rectangle((x, y + 84 - h, x + 34, y + 84), radius=8, fill=c1 + (80 + i * 10,))
    draw.line((SAFE + 54, y + 92, WIDTH - SAFE - 54, y + 92), fill=c2 + (120,), width=4)

def draw_ball(draw, cx, cy, r, colors):
    c1, _ = colors
    draw.ellipse((cx-r, cy-r, cx+r, cy+r), fill=(226,232,240,240), outline=c1 + (230,), width=5)
    pts = []
    for i in range(5):
        a = -math.pi / 2 + i * math.pi * 2 / 5
        pts.append((cx + math.cos(a) * r * .28, cy + math.sin(a) * r * .28))
    draw.polygon(pts, fill=(15,23,42,240))

def render_scene(scene, output_dir):
    colors = PALETTE.get(scene["accent"], PALETTE["cyan"])
    c1, c2 = colors
    img = background(scene["accent"])
    draw = ImageDraw.Draw(img, "RGBA")
    draw_header(draw, scene, colors)

    title_box = (SAFE, 315, WIDTH - SAFE, 430)
    draw_fitted(draw, scene["title"], title_box, 64, 36, fill=(255,255,255,255), bold=True)

    if scene["index"] == 1:
        panel(draw, (SAFE, 520, WIDTH - SAFE, 1045), fill=(6,78,59,155), outline=c1 + (160,), radius=42, width=3)
        draw_ball(draw, WIDTH//2, 650, 58, colors)
        draw_fitted(draw, scene["lines"][0], (SAFE+70, 735, WIDTH-SAFE-70, 860), 58, 34, fill=(255,255,255,255), bold=True)
        draw_fitted(draw, scene["lines"][1], (SAFE+70, 895, WIDTH-SAFE-70, 1000), 58, 34, fill=(253,224,71,255), bold=True)
        draw_scan_meter(draw, 1160, colors)
    elif scene["index"] == 2:
        panel(draw, (SAFE, 500, WIDTH - SAFE, 850), fill=(15,23,42,220), outline=c1 + (135,), radius=34)
        draw_fitted(draw, scene["lines"][0], (SAFE+55, 575, WIDTH-SAFE-55, 680), 56, 32, fill=(253,224,71,255), bold=True)
        draw_fitted(draw, scene["lines"][1], (SAFE+55, 710, WIDTH-SAFE-55, 805), 38, 24, fill=(226,232,240,230), bold=False)
        for y in [1010, 1128, 1246, 1364]:
            panel(draw, (SAFE+40, y, WIDTH-SAFE-40, y+74), fill=(2,6,23,160), outline=c1 + (75,), radius=18)
            draw.line((SAFE+92, y+37, WIDTH-SAFE-100, y+37), fill=c2 + (100,), width=3)
        draw_scan_meter(draw, 1510, colors)
    elif scene["index"] == 3:
        panel(draw, (SAFE, 520, WIDTH - SAFE, 1105), fill=(6,95,70,180), outline=c1 + (180,), radius=42, width=3)
        draw_fitted(draw, scene["lines"][0], (SAFE+64, 650, WIDTH-SAFE-64, 790), 76, 40, fill=(255,255,255,255), bold=True)
        draw_fitted(draw, scene["lines"][1], (SAFE+90, 850, WIDTH-SAFE-90, 930), 46, 28, fill=(167,243,208,255), bold=True)
        draw_fitted(draw, scene["lines"][2], (SAFE+90, 950, WIDTH-SAFE-90, 1030), 42, 26, fill=(253,224,71,255), bold=True)
        draw_scan_meter(draw, 1280, colors)
    elif scene["index"] == 4:
        draw_fitted(draw, scene["lines"][0], (SAFE, 520, WIDTH - SAFE, 610), 48, 28, fill=(203,213,225,240), bold=True)
        left = (SAFE, 700, WIDTH//2 - 22, 1030)
        right = (WIDTH//2 + 22, 700, WIDTH - SAFE, 1030)
        panel(draw, left, fill=(15,23,42,228), outline=c1 + (170,), radius=32, width=3)
        panel(draw, right, fill=(15,23,42,228), outline=c2 + (170,), radius=32, width=3)
        scores = str(scene["lines"][1]).split("/")
        draw_fitted(draw, scores[0].strip(), (left[0]+28, left[1]+80, left[2]-28, left[3]-80), 90, 48, fill=(255,255,255,255), bold=True)
        draw_fitted(draw, scores[-1].strip(), (right[0]+28, right[1]+80, right[2]-28, right[3]-80), 90, 48, fill=(255,255,255,255), bold=True)
        draw_fitted(draw, scene["lines"][2], (SAFE, 1160, WIDTH-SAFE, 1260), 42, 26, fill=(253,224,71,255), bold=True)
        draw_scan_meter(draw, 1420, colors)
    elif scene["index"] == 5:
        panel(draw, (SAFE, 575, WIDTH - SAFE, 1025), fill=(30,27,75,195), outline=c1 + (165,), radius=40, width=3)
        draw_fitted(draw, scene["lines"][0], (SAFE+56, 690, WIDTH-SAFE-56, 820), 74, 40, fill=(255,255,255,255), bold=True)
        draw_fitted(draw, scene["lines"][1], (SAFE+76, 860, WIDTH-SAFE-76, 970), 44, 28, fill=(216,180,254,255), bold=True)
        for x in [SAFE+120, SAFE+310, SAFE+500, SAFE+690]:
            draw.arc((x, 1200, x+170, 1370), 200, 340, fill=c1 + (150,), width=9)
        draw_scan_meter(draw, 1450, colors)
    elif scene["index"] == 6:
        panel(draw, (SAFE, 500, WIDTH - SAFE, 1120), fill=(30,41,59,225), outline=c1 + (160,), radius=36, width=3)
        draw_fitted(draw, scene["lines"][0], (SAFE+60, 610, WIDTH-SAFE-60, 790), 48, 28, fill=(253,224,71,255), bold=True, max_lines=3)
        for idx, label in enumerate(["阵容", "节奏", "轮换", "临场"]):
            x = SAFE + 80 + idx * 220
            panel(draw, (x, 900, x+150, 1010), fill=(2,6,23,165), outline=c2 + (95,), radius=24)
            draw_fitted(draw, label, (x+14, 928, x+136, 984), 38, 24, fill=(255,255,255,245), bold=True)
        draw_fitted(draw, scene["lines"][1], (SAFE+50, 1230, WIDTH-SAFE-50, 1320), 42, 26, fill=(226,232,240,235), bold=True)
        draw_scan_meter(draw, 1480, colors)
    else:
        panel(draw, (SAFE, 560, WIDTH - SAFE, 1100), fill=(2,6,23,205), outline=c1 + (135,), radius=44, width=3)
        draw_fitted(draw, scene["lines"][0], (SAFE+70, 690, WIDTH-SAFE-70, 800), 78, 42, fill=(255,255,255,255), bold=True)
        draw_fitted(draw, scene["lines"][1], (SAFE+70, 860, WIDTH-SAFE-70, 980), 54, 32, fill=(253,224,71,255), bold=True)
        draw_scan_meter(draw, 1280, colors)

    footer = "不承诺命中｜不诱导下注｜仅供娱乐参考"
    panel(draw, (SAFE, HEIGHT - 205, WIDTH - SAFE, HEIGHT - 120), fill=(2,6,23,205), outline=(148,163,184,70), radius=22)
    draw_fitted(draw, footer, (SAFE+40, HEIGHT-192, WIDTH-SAFE-40, HEIGHT-130), 30, 22, fill=(226,232,240,230), bold=False)
    img.convert("RGB").save(os.path.join(output_dir, scene["fileName"]), quality=95)

def main():
    spec = json.load(sys.stdin)
    output_dir = spec["outputDir"]
    os.makedirs(output_dir, exist_ok=True)
    for scene in spec["scenes"]:
        render_scene(scene, output_dir)

if __name__ == "__main__":
    main()
`

function renderSceneImages({ outputDir, scenes }) {
  const input = JSON.stringify({ outputDir, scenes })
  const candidates = [
    { args: ['-c', PYTHON_RENDERER], command: 'python' },
    { args: ['-3', '-c', PYTHON_RENDERER], command: 'py' },
  ]
  const errors = []

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, candidate.args, {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
      },
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (result.status === 0) return

    errors.push([result.error?.message, result.stderr, result.stdout].filter(Boolean).join('\n'))
    if (result.error?.code !== 'ENOENT') break
  }

  throw new Error(`生成 v3 scene 图片失败：${errors.join('\n')}`)
}

export function generateV3Scenes({
  durationSeconds,
  exportReportPath,
  metaPath,
  outputDir,
  subtitlePath,
  voiceoverPath,
}) {
  if (!existsSync(metaPath)) throw new Error(`找不到 meta.json：${metaPath}`)
  if (!existsSync(voiceoverPath)) throw new Error(`找不到 voiceover.txt：${voiceoverPath}`)

  const meta = readJson(metaPath)
  const exportReport = readJson(exportReportPath, {})
  const voiceoverText = readFileSync(voiceoverPath, 'utf8').trim()
  const targetDuration = clamp(durationSeconds, 15, 25)
  const scenes = makeSceneSpecs(meta, exportReport, targetDuration)

  mkdirSync(outputDir, { recursive: true })
  renderSceneImages({ outputDir, scenes })
  const subtitles = writeSubtitleAss({
    durationSeconds: targetDuration,
    outputPath: subtitlePath,
    voiceoverText,
  })
  const manifestPath = path.join(outputDir, 'scenes.json')
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ durationSeconds: targetDuration, scenes, subtitles }, null, 2)}\n`,
    'utf8',
  )

  return {
    durationSeconds: targetDuration,
    manifestPath,
    sceneCount: scenes.length,
    sceneFiles: scenes.map((scene) => path.join(outputDir, scene.fileName)),
    scenes,
    subtitlePath,
  }
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const result = generateV3Scenes({
      durationSeconds: options.duration,
      exportReportPath: options.exportReport,
      metaPath: options.meta,
      outputDir: options.output,
      subtitlePath: options.subtitles,
      voiceoverPath: options.voiceover,
    })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error?.message ?? error)
    process.exit(1)
  }
}
