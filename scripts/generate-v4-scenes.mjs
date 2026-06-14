import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeSubtitleAss } from './generate-v3-scenes.mjs'

const __filename = fileURLToPath(import.meta.url)
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov'])

function parseArgs(argv) {
  const options = {
    duration: 22,
    exportReport: '',
    materialsRoot: '',
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
          '  node .\\scripts\\generate-v4-scenes.mjs --meta <meta.json> --output <dir> --voiceover <voiceover.txt> --subtitles <subtitles.ass> --materials-root <dir>',
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

    if (arg === '--materials-root') {
      options.materialsRoot = String(argv[index + 1] ?? '').trim()
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

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    throw new Error(`${command} ${args.join(' ')} failed: ${detail || `exit ${result.status}`}`)
  }
  return result
}

function walkFiles(root) {
  if (!root || !existsSync(root)) return []
  const files = []
  const stack = [root]

  while (stack.length) {
    const current = stack.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else {
        files.push(fullPath)
      }
    }
  }

  return files
}

function inferUsage(filePath) {
  const lower = filePath.toLowerCase()
  const usage = new Set()
  if (/stadium|crowd|football|ball|training|背景|球场/.test(lower)) {
    usage.add('intro')
    usage.add('transition')
  }
  if (/ai|dashboard|scan|data|line|tech|abstract/.test(lower)) {
    usage.add('analysis')
    usage.add('score')
  }
  if (/risk|dark|gradient/.test(lower)) usage.add('risk')
  if (!usage.size) {
    usage.add('intro')
    usage.add('analysis')
  }
  return [...usage]
}

function inferTags(filePath) {
  const lower = filePath.toLowerCase()
  return [
    ['stadium', /stadium|球场/],
    ['football', /football|soccer|ball|足球/],
    ['crowd', /crowd|观众/],
    ['training', /training|训练/],
    ['ai', /ai|dashboard|scan|data|tech/],
    ['background', /background|gradient|dark/],
  ]
    .filter(([, pattern]) => pattern.test(lower))
    .map(([tag]) => tag)
}

export function scanMaterials(materialsRoot) {
  const files = walkFiles(materialsRoot)
  const materials = files
    .map((filePath) => {
      const ext = path.extname(filePath).toLowerCase()
      const type = VIDEO_EXTENSIONS.has(ext)
        ? 'video'
        : IMAGE_EXTENSIONS.has(ext)
          ? 'image'
          : null
      if (!type) return null
      return {
        path: filePath,
        sizeBytes: statSync(filePath).size,
        tags: inferTags(filePath),
        type,
        usage: inferUsage(filePath),
      }
    })
    .filter(Boolean)

  return {
    materials,
    materialsFoundCount: materials.length,
  }
}

function selectMaterial(materials, usage, index) {
  if (!materials.length) return null
  const candidates = materials.filter((item) => item.usage.includes(usage))
  const pool = candidates.length ? candidates : materials
  return pool[index % pool.length]
}

function prepareMaterialBackground({ material, outputDir, sceneIndex }) {
  if (!material) return null
  if (material.type === 'image') return material.path

  const outputPath = path.join(outputDir, `material_bg_${String(sceneIndex).padStart(2, '0')}.jpg`)
  runCommand('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    '0.8',
    '-i',
    material.path,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    outputPath,
  ])
  return outputPath
}

function makeSceneSpecs(meta, exportReport, materials, outputDir, durationSeconds) {
  const baseDurations = [3.0, 3.1, 3.2, 3.5, 3.1, 3.6, 2.5]
  const baseTotal = baseDurations.reduce((sum, value) => sum + value, 0)
  const scale = durationSeconds / baseTotal
  const totalGoals = String(meta.total_goals ?? '2.5球分界')
  const goalHint = totalGoals.includes('大')
    ? '比分分布支持偏大观察'
    : totalGoals.includes('小')
      ? '节奏偏谨慎，优先防小'
      : '围绕 2.5 球分界复核'
  const sceneSeeds = [
    {
      accent: 'grass',
      fileName: 'scene_01_hook.png',
      kicker: '开场钩子',
      lines: ['模型方向挺明确', meta.match_name],
      materialUsage: 'intro',
      title: '这场先别急着说稳',
    },
    {
      accent: 'cyan',
      fileName: 'scene_02_scan.png',
      kicker: 'AI 扫描',
      lines: [meta.match_name, exportReport?.selectedBy ? `数据入口：${exportReport.selectedBy}` : '赛程 / 热度 / 阵容扫描'],
      materialUsage: 'analysis',
      title: '本地 AI 系统扫描中',
    },
    {
      accent: 'green',
      fileName: 'scene_03_pick.png',
      kicker: '主推方向',
      lines: [`主推：${meta.main_pick}`, '方向强度：中高', '临场仍需复核'],
      materialUsage: 'analysis',
      title: '核心方向',
    },
    {
      accent: 'gold',
      fileName: 'scene_04_score.png',
      kicker: '比分卡片',
      lines: ['比分参考', `${meta.score_1} / ${meta.score_2}`, '不做命中承诺'],
      materialUsage: 'score',
      title: 'SCORE PREDICTION',
    },
    {
      accent: 'purple',
      fileName: 'scene_05_goals.png',
      kicker: '进球逻辑',
      lines: [`大小球：${meta.total_goals}`, goalHint],
      materialUsage: 'score',
      title: 'GOALS LINE',
    },
    {
      accent: 'amber',
      fileName: 'scene_06_risk.png',
      kicker: '风险复核',
      lines: [meta.risk_note, '阵容 / 节奏 / 轮换 / 临场变化'],
      materialUsage: 'risk',
      title: 'RISK CHECK',
    },
    {
      accent: 'white',
      fileName: 'scene_07_outro.png',
      kicker: '结尾提示',
      lines: ['每天记录几场', meta.footer_note ?? '仅做数据记录与娱乐参考'],
      materialUsage: 'transition',
      title: '只做数据记录',
    },
  ]

  return sceneSeeds.map((scene, index) => {
    const material = selectMaterial(materials, scene.materialUsage, index)
    return {
      ...scene,
      backgroundPath: prepareMaterialBackground({
        material,
        outputDir,
        sceneIndex: index + 1,
      }),
      duration: Number((baseDurations[index] * scale).toFixed(3)),
      index: index + 1,
      material,
    }
  })
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
    "grass": ((74, 222, 128), (250, 204, 21)),
    "cyan": ((94, 234, 212), (14, 165, 233)),
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
        x = x1 + (max_width - w) / 2 if align == "center" else x1
        draw.text((x, y), line, font=f, fill=fill)
        y += line_h + gap

def cover_image(path):
    img = Image.open(path).convert("RGBA")
    scale = max(WIDTH / img.width, HEIGHT / img.height)
    nw = int(img.width * scale)
    nh = int(img.height * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - WIDTH) // 2
    top = (nh - HEIGHT) // 2
    return img.crop((left, top, left + WIDTH, top + HEIGHT))

def generated_background(accent):
    c1, c2 = PALETTE.get(accent, PALETTE["cyan"])
    img = Image.new("RGBA", (WIDTH, HEIGHT), (3, 10, 24, 255))
    draw = ImageDraw.Draw(img, "RGBA")
    for y in range(HEIGHT):
        t = y / HEIGHT
        draw.line((0, y, WIDTH, y), fill=(int(5 + 4*t), int(18 + 22*(1-t)), int(34 + 28*(1-t)), 255))

    for i in range(0, HEIGHT, 96):
        draw.line((0, i, WIDTH, i), fill=c1 + (20,), width=1)
    for i in range(SAFE, WIDTH-SAFE+1, 96):
        draw.line((i, 0, i, HEIGHT), fill=c1 + (18,), width=1)

    # Stylized pitch arcs and stadium light atmosphere.
    draw.arc((-180, 360, 460, 1000), 280, 80, fill=(74,222,128,55), width=6)
    draw.arc((620, 340, 1260, 980), 100, 260, fill=(74,222,128,55), width=6)
    draw.ellipse((WIDTH//2-115, 735, WIDTH//2+115, 965), outline=(74,222,128,50), width=5)
    draw.line((SAFE, 850, WIDTH-SAFE, 850), fill=(74,222,128,38), width=4)
    for x in [120, 250, 395, 690, 850, 990]:
        draw.polygon([(x, 0), (x+60, 0), (WIDTH//2, 760)], fill=(255,255,255,10))

    for i in range(26):
        x1 = SAFE + (i * 67) % CONTENT
        y1 = 270 + (i * 127) % 1160
        x2 = SAFE + ((i * 149) + 210) % CONTENT
        y2 = 330 + (i * 181) % 1050
        draw.line((x1, y1, x2, y2), fill=(56,189,248,38), width=2)
        draw.ellipse((x1-5, y1-5, x1+5, y1+5), fill=c1 + (115,))
    return img

def background(scene):
    c1, c2 = PALETTE.get(scene["accent"], PALETTE["cyan"])
    bg_path = scene.get("backgroundPath")
    if bg_path and os.path.exists(bg_path):
        img = cover_image(bg_path).filter(ImageFilter.GaussianBlur(1.1))
        overlay = Image.new("RGBA", (WIDTH, HEIGHT), (2, 6, 23, 132))
        img.alpha_composite(overlay)
        return img
    return generated_background(scene["accent"])

def panel(draw, xy, fill=(15,23,42,218), outline=(94,234,212,120), radius=32, width=2):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

def draw_header(draw, scene, colors):
    c1, c2 = colors
    panel(draw, (SAFE, 105, WIDTH-SAFE, 236), fill=(2,6,23,205), outline=c1 + (110,), radius=28)
    draw.text((SAFE + 42, 132), scene["kicker"], font=font(34, True), fill=c1 + (255,))
    draw.text((WIDTH - SAFE - 170, 141), "V4 VOICE", font=font(28, True), fill=(226,232,240,210))
    draw.line((SAFE + 42, 206, WIDTH - SAFE - 42, 206), fill=c1 + (100,), width=3)

def draw_meter(draw, y, colors):
    c1, c2 = colors
    panel(draw, (SAFE, y, WIDTH-SAFE, y+116), fill=(2,6,23,165), outline=c1 + (78,), radius=24)
    for i in range(10):
        x = SAFE + 62 + i * 88
        h = 24 + (i * 19) % 64
        draw.rounded_rectangle((x, y + 82 - h, x + 32, y + 82), radius=8, fill=c1 + (92 + i * 9,))
    draw.line((SAFE + 52, y + 91, WIDTH - SAFE - 52, y + 91), fill=c2 + (140,), width=4)

def draw_scene(scene, output_dir, material_mode):
    colors = PALETTE.get(scene["accent"], PALETTE["cyan"])
    c1, c2 = colors
    img = background(scene)
    draw = ImageDraw.Draw(img, "RGBA")
    draw_header(draw, scene, colors)
    draw_fitted(draw, scene["title"], (SAFE, 300, WIDTH-SAFE, 430), 66, 36, fill=(255,255,255,255), bold=True)

    if scene["index"] == 1:
        panel(draw, (SAFE, 510, WIDTH-SAFE, 1030), fill=(4,65,47,182), outline=c1 + (165,), radius=46, width=3)
        draw_fitted(draw, scene["lines"][0], (SAFE+60, 650, WIDTH-SAFE-60, 785), 66, 38, fill=(255,255,255,255), bold=True)
        draw_fitted(draw, scene["lines"][1], (SAFE+60, 835, WIDTH-SAFE-60, 950), 58, 34, fill=(253,224,71,255), bold=True)
        draw_meter(draw, 1190, colors)
    elif scene["index"] == 2:
        panel(draw, (SAFE, 500, WIDTH-SAFE, 880), fill=(15,23,42,218), outline=c1 + (145,), radius=36)
        draw_fitted(draw, scene["lines"][0], (SAFE+58, 585, WIDTH-SAFE-58, 700), 60, 34, fill=(253,224,71,255), bold=True)
        draw_fitted(draw, scene["lines"][1], (SAFE+58, 735, WIDTH-SAFE-58, 820), 38, 24, fill=(226,232,240,235), bold=False)
        for y in [1020, 1136, 1252, 1368]:
            panel(draw, (SAFE+40, y, WIDTH-SAFE-40, y+72), fill=(2,6,23,158), outline=c1 + (78,), radius=18)
            draw.line((SAFE+100, y+36, WIDTH-SAFE-106, y+36), fill=c2 + (115,), width=3)
        draw_meter(draw, 1535, colors)
    elif scene["index"] == 3:
        panel(draw, (SAFE, 510, WIDTH-SAFE, 1125), fill=(6,95,70,198), outline=c1 + (180,), radius=44, width=3)
        draw_fitted(draw, scene["lines"][0], (SAFE+56, 635, WIDTH-SAFE-56, 785), 78, 40, fill=(255,255,255,255), bold=True)
        draw_fitted(draw, scene["lines"][1], (SAFE+80, 840, WIDTH-SAFE-80, 920), 46, 28, fill=(167,243,208,255), bold=True)
        draw_fitted(draw, scene["lines"][2], (SAFE+80, 955, WIDTH-SAFE-80, 1038), 42, 26, fill=(253,224,71,255), bold=True)
        draw_meter(draw, 1300, colors)
    elif scene["index"] == 4:
        draw_fitted(draw, scene["lines"][0], (SAFE, 515, WIDTH-SAFE, 605), 46, 28, fill=(203,213,225,240), bold=True)
        left = (SAFE, 690, WIDTH//2 - 22, 1035)
        right = (WIDTH//2 + 22, 690, WIDTH-SAFE, 1035)
        panel(draw, left, fill=(15,23,42,226), outline=c1 + (170,), radius=32, width=3)
        panel(draw, right, fill=(15,23,42,226), outline=c2 + (170,), radius=32, width=3)
        scores = str(scene["lines"][1]).split("/")
        draw_fitted(draw, scores[0].strip(), (left[0]+30, left[1]+80, left[2]-30, left[3]-80), 92, 48, fill=(255,255,255,255), bold=True)
        draw_fitted(draw, scores[-1].strip(), (right[0]+30, right[1]+80, right[2]-30, right[3]-80), 92, 48, fill=(255,255,255,255), bold=True)
        draw_fitted(draw, scene["lines"][2], (SAFE, 1170, WIDTH-SAFE, 1270), 42, 26, fill=(253,224,71,255), bold=True)
        draw_meter(draw, 1435, colors)
    elif scene["index"] == 5:
        panel(draw, (SAFE, 555, WIDTH-SAFE, 1045), fill=(30,27,75,205), outline=c1 + (165,), radius=40, width=3)
        draw_fitted(draw, scene["lines"][0], (SAFE+60, 680, WIDTH-SAFE-60, 820), 74, 40, fill=(255,255,255,255), bold=True)
        draw_fitted(draw, scene["lines"][1], (SAFE+70, 858, WIDTH-SAFE-70, 970), 44, 28, fill=(216,180,254,255), bold=True)
        for x in [SAFE+120, SAFE+310, SAFE+500, SAFE+690]:
            draw.arc((x, 1220, x+170, 1390), 200, 340, fill=c1 + (145,), width=9)
        draw_meter(draw, 1475, colors)
    elif scene["index"] == 6:
        panel(draw, (SAFE, 490, WIDTH-SAFE, 1135), fill=(30,41,59,225), outline=c1 + (160,), radius=36, width=3)
        draw_fitted(draw, scene["lines"][0], (SAFE+56, 610, WIDTH-SAFE-56, 805), 48, 28, fill=(253,224,71,255), bold=True, max_lines=3)
        for idx, label in enumerate(["阵容", "节奏", "轮换", "临场"]):
            x = SAFE + 80 + idx * 220
            panel(draw, (x, 910, x+150, 1020), fill=(2,6,23,168), outline=c2 + (95,), radius=24)
            draw_fitted(draw, label, (x+14, 938, x+136, 994), 38, 24, fill=(255,255,255,245), bold=True)
        draw_fitted(draw, scene["lines"][1], (SAFE+50, 1245, WIDTH-SAFE-50, 1340), 42, 26, fill=(226,232,240,235), bold=True)
        draw_meter(draw, 1500, colors)
    else:
        panel(draw, (SAFE, 555, WIDTH-SAFE, 1100), fill=(2,6,23,210), outline=c1 + (135,), radius=44, width=3)
        draw_fitted(draw, scene["lines"][0], (SAFE+70, 690, WIDTH-SAFE-70, 805), 78, 42, fill=(255,255,255,255), bold=True)
        draw_fitted(draw, scene["lines"][1], (SAFE+70, 870, WIDTH-SAFE-70, 985), 54, 32, fill=(253,224,71,255), bold=True)
        draw_meter(draw, 1285, colors)

    footer = "不承诺命中｜不诱导下注｜仅供娱乐参考"
    panel(draw, (SAFE, HEIGHT - 205, WIDTH - SAFE, HEIGHT - 120), fill=(2,6,23,215), outline=(148,163,184,70), radius=22)
    draw_fitted(draw, footer, (SAFE+40, HEIGHT-192, WIDTH-SAFE-40, HEIGHT-130), 30, 22, fill=(226,232,240,230), bold=False)
    if material_mode == "materials":
        draw.text((SAFE, HEIGHT-92), "local materials background", font=font(18), fill=(148,163,184,135))
    base = Image.new("RGBA", (WIDTH, HEIGHT), (3, 10, 24, 255))
    base.alpha_composite(img)
    base.convert("RGB").save(os.path.join(output_dir, scene["fileName"]), quality=95)

def main():
    spec = json.load(sys.stdin)
    output_dir = spec["outputDir"]
    os.makedirs(output_dir, exist_ok=True)
    for scene in spec["scenes"]:
        draw_scene(scene, output_dir, spec.get("materialMode", "fallback-v3"))

if __name__ == "__main__":
    main()
`

function renderSceneImages({ materialMode, outputDir, scenes }) {
  const input = JSON.stringify({ materialMode, outputDir, scenes })
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

  throw new Error(`生成 v4 scene 图片失败：${errors.join('\n')}`)
}

export function generateV4Scenes({
  durationSeconds,
  exportReportPath,
  materialsRoot,
  metaPath,
  outputDir,
  subtitlePath,
  voiceoverPath,
}) {
  if (!existsSync(metaPath)) throw new Error(`找不到 meta.json：${metaPath}`)
  if (!existsSync(voiceoverPath)) throw new Error(`找不到 voiceover.txt：${voiceoverPath}`)

  mkdirSync(outputDir, { recursive: true })
  const meta = readJson(metaPath)
  const exportReport = readJson(exportReportPath, {})
  const voiceoverText = readFileSync(voiceoverPath, 'utf8').trim()
  const targetDuration = clamp(durationSeconds, 18, 30)
  const scan = scanMaterials(materialsRoot)
  const materialMode = scan.materialsFoundCount > 0 ? 'materials' : 'fallback-v3'
  const missingMaterialWarnings =
    materialMode === 'fallback-v3'
      ? [`素材库为空或没有可用素材，已使用 v4 fallback 数据看板：${materialsRoot}`]
      : []
  const scenes = makeSceneSpecs(meta, exportReport, scan.materials, outputDir, targetDuration)

  renderSceneImages({ materialMode, outputDir, scenes })
  const subtitles = writeSubtitleAss({
    durationSeconds: targetDuration,
    outputPath: subtitlePath,
    voiceoverText,
  })
  const manifestPath = path.join(outputDir, 'scenes.json')
  const materialsUsed = scenes
    .filter((scene) => scene.material)
    .map((scene) => ({
      sceneIndex: scene.index,
      sceneFileName: scene.fileName,
      ...scene.material,
    }))

  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        durationSeconds: targetDuration,
        materialMode,
        materialsFoundCount: scan.materialsFoundCount,
        materialsRoot,
        materialsUsed,
        missingMaterialWarnings,
        scenes,
        subtitles,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  return {
    durationSeconds: targetDuration,
    manifestPath,
    materialMode,
    materialsFoundCount: scan.materialsFoundCount,
    materialsRoot,
    materialsUsed,
    missingMaterialWarnings,
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
    const result = generateV4Scenes({
      durationSeconds: options.duration,
      exportReportPath: options.exportReport,
      materialsRoot: options.materialsRoot,
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
