import { SHARE_RISK_NOTE, createShareFileSlug, safeShareText } from './shareText.js'

export const POSTER_WIDTH = 1080
export const POSTER_HEIGHT = 1350

const PNG_MIME_TYPE = 'image/png'
const POSTER_FONT =
  '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif'

function setFont(ctx, size, weight = 700) {
  ctx.font = `${weight} ${size}px ${POSTER_FONT}`
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + safeRadius, y)
  ctx.lineTo(x + width - safeRadius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  ctx.lineTo(x + width, y + height - safeRadius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  ctx.lineTo(x + safeRadius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  ctx.lineTo(x, y + safeRadius)
  ctx.quadraticCurveTo(x, y, x + safeRadius, y)
  ctx.closePath()
}

function fillRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
  drawRoundedRect(ctx, x, y, width, height, radius)
  ctx.fillStyle = fillStyle
  ctx.fill()
}

function strokeRoundedRect(ctx, x, y, width, height, radius, strokeStyle) {
  drawRoundedRect(ctx, x, y, width, height, radius)
  ctx.strokeStyle = strokeStyle
  ctx.stroke()
}

function splitTextByWidth(ctx, text, maxWidth) {
  const lines = []
  let currentLine = ''

  for (const char of Array.from(safeShareText(text, ''))) {
    const nextLine = `${currentLine}${char}`
    if (currentLine && ctx.measureText(nextLine).width > maxWidth) {
      lines.push(currentLine)
      currentLine = char
    } else {
      currentLine = nextLine
    }
  }

  if (currentLine) lines.push(currentLine)
  return lines
}

function drawWrappedText(
  ctx,
  text,
  x,
  y,
  maxWidth,
  {
    align = 'left',
    color = '#f8fafc',
    fontSize = 32,
    fontWeight = 700,
    lineHeight = 44,
    maxLines = 2,
  } = {},
) {
  setFont(ctx, fontSize, fontWeight)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'top'

  const lines = splitTextByWidth(ctx, text, maxWidth).slice(0, maxLines)
  if (!lines.length) return y

  if (lines.length === maxLines && splitTextByWidth(ctx, text, maxWidth).length > maxLines) {
    const lastIndex = lines.length - 1
    let lastLine = lines[lastIndex]
    while (lastLine && ctx.measureText(`${lastLine}...`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1)
    }
    lines[lastIndex] = `${lastLine}...`
  }

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight)
  })

  return y + lines.length * lineHeight
}

function drawBackground(ctx) {
  const background = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
  background.addColorStop(0, '#081323')
  background.addColorStop(0.55, '#07111f')
  background.addColorStop(1, '#020713')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  const topGlow = ctx.createRadialGradient(210, 120, 20, 210, 120, 520)
  topGlow.addColorStop(0, 'rgba(45, 212, 191, 0.32)')
  topGlow.addColorStop(1, 'rgba(45, 212, 191, 0)')
  ctx.fillStyle = topGlow
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  const accentGlow = ctx.createRadialGradient(900, 180, 20, 900, 180, 500)
  accentGlow.addColorStop(0, 'rgba(147, 197, 253, 0.28)')
  accentGlow.addColorStop(1, 'rgba(147, 197, 253, 0)')
  ctx.fillStyle = accentGlow
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  ctx.lineWidth = 2
  strokeRoundedRect(ctx, 36, 36, POSTER_WIDTH - 72, POSTER_HEIGHT - 72, 42, 'rgba(255,255,255,0.1)')
}

function drawStatusPills(ctx, tags) {
  let x = 72
  const y = 170

  setFont(ctx, 25, 800)
  for (const tag of tags.slice(0, 3)) {
    const text = safeShareText(tag, '当前重点')
    const width = Math.min(ctx.measureText(text).width + 44, 250)
    fillRoundedRect(ctx, x, y, width, 46, 23, 'rgba(45, 212, 191, 0.12)')
    strokeRoundedRect(ctx, x, y, width, 46, 23, 'rgba(45, 212, 191, 0.32)')
    ctx.fillStyle = '#7dd3fc'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + width / 2, y + 23, width - 28)
    x += width + 14
  }
}

function drawMetricCard(ctx, x, y, width, label, value, color) {
  fillRoundedRect(ctx, x, y, width, 148, 28, 'rgba(15, 23, 42, 0.72)')
  strokeRoundedRect(ctx, x, y, width, 148, 28, 'rgba(148, 163, 184, 0.16)')
  setFont(ctx, 25, 900)
  ctx.fillStyle = '#94a3b8'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(label, x + 28, y + 26)
  drawWrappedText(ctx, value, x + 28, y + 72, width - 56, {
    color,
    fontSize: 38,
    fontWeight: 900,
    lineHeight: 42,
    maxLines: 1,
  })
}

function drawSharePoster(ctx, payload) {
  const matchName = safeShareText(payload.matchName, '当前重点比赛')
  const kickoffText = safeShareText(payload.kickoffText, '赛前分析')
  const mainPickText = safeShareText(payload.mainPickText, '临场复核')
  const confidenceText = safeShareText(payload.displayConfidenceText, '--/100')
  const recommendLevelText = safeShareText(payload.recommendLevelText, '赛前参考')
  const scoreText = safeShareText(payload.scorePredictionsText, '比分待复核')
  const totalGoalsText = safeShareText(payload.totalGoalsDirectionText, '大小球待复核')
  const lineupStatusText = safeShareText(payload.lineupStatusText, '首发待确认')
  const summaryText = safeShareText(
    payload.summaryText,
    '系统综合盘口水位、阵容状态、球队节奏与历史表现，本场倾向更集中，建议结合临场复核。',
  )

  drawBackground(ctx)

  setFont(ctx, 32, 900)
  ctx.fillStyle = '#5eead4'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('AI 赛前分析', 72, 82)

  setFont(ctx, 26, 800)
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText(kickoffText, 72, 126)
  drawStatusPills(ctx, payload.statusTags ?? ['当前重点'])

  drawWrappedText(ctx, matchName, POSTER_WIDTH / 2, 266, 900, {
    align: 'center',
    color: '#f8fafc',
    fontSize: 68,
    fontWeight: 900,
    lineHeight: 78,
    maxLines: 2,
  })

  const coreY = 438
  fillRoundedRect(ctx, 72, coreY, 936, 276, 36, 'rgba(15, 23, 42, 0.72)')
  strokeRoundedRect(ctx, 72, coreY, 936, 276, 36, 'rgba(45, 212, 191, 0.28)')

  setFont(ctx, 27, 900)
  ctx.fillStyle = '#94a3b8'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('本场倾向', 116, coreY + 40)
  drawWrappedText(ctx, mainPickText, 116, coreY + 88, 500, {
    color: '#4ade80',
    fontSize: 58,
    fontWeight: 900,
    lineHeight: 66,
    maxLines: 2,
  })

  setFont(ctx, 27, 900)
  ctx.fillStyle = '#94a3b8'
  ctx.textAlign = 'right'
  ctx.fillText('信心指数', 932, coreY + 40)

  const confidenceGradient = ctx.createLinearGradient(710, coreY + 84, 960, coreY + 170)
  confidenceGradient.addColorStop(0, '#fbbf24')
  confidenceGradient.addColorStop(1, '#fde68a')
  setFont(ctx, 82, 900)
  ctx.fillStyle = confidenceGradient
  ctx.textAlign = 'right'
  ctx.fillText(confidenceText, 932, coreY + 88)

  setFont(ctx, 28, 900)
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText(`推荐等级：${recommendLevelText}`, 932, coreY + 194)

  drawMetricCard(ctx, 72, 752, 456, '比分参考', scoreText, '#f8fafc')
  drawMetricCard(ctx, 552, 752, 456, '大小球方向', totalGoalsText, '#7dd3fc')

  fillRoundedRect(ctx, 72, 938, 936, 96, 28, 'rgba(2, 6, 23, 0.52)')
  strokeRoundedRect(ctx, 72, 938, 936, 96, 28, 'rgba(148, 163, 184, 0.16)')
  setFont(ctx, 28, 900)
  ctx.fillStyle = '#cbd5e1'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const formationText = safeShareText(payload.formationText, '')
  const lineupText = formationText
    ? `首发状态：${lineupStatusText}｜阵型：${formationText}`
    : `首发状态：${lineupStatusText}`
  ctx.fillText(lineupText, 110, 986, 860)

  fillRoundedRect(ctx, 72, 1072, 936, 152, 30, 'rgba(45, 212, 191, 0.08)')
  strokeRoundedRect(ctx, 72, 1072, 936, 152, 30, 'rgba(45, 212, 191, 0.18)')
  setFont(ctx, 25, 900)
  ctx.fillStyle = '#5eead4'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('简要分析', 110, 1102)
  drawWrappedText(ctx, summaryText, 110, 1142, 860, {
    color: '#e2e8f0',
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 42,
    maxLines: 2,
  })

  ctx.globalAlpha = 0.88
  drawWrappedText(ctx, `风险提示：${SHARE_RISK_NOTE}`, 72, 1262, 936, {
    color: '#94a3b8',
    fontSize: 23,
    fontWeight: 700,
    lineHeight: 32,
    maxLines: 2,
  })
  ctx.globalAlpha = 1
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG_BLOB_CREATE_FAILED'))
    }, PNG_MIME_TYPE)
  })
}

export function createSharePosterFileName(payload) {
  const home = safeShareText(payload?.homeTeam, '')
  const away = safeShareText(payload?.awayTeam, '')
  const matchSlug = home && away ? `${home}-${away}` : safeShareText(payload?.matchName, 'match')

  return `match-focus-${createShareFileSlug(matchSlug)}.png`
}

export async function createSharePosterPng(payload) {
  const canvas = document.createElement('canvas')
  canvas.width = POSTER_WIDTH
  canvas.height = POSTER_HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('CANVAS_CONTEXT_UNAVAILABLE')

  drawSharePoster(ctx, payload)

  const blob = await canvasToBlob(canvas)
  const dataUrl = canvas.toDataURL(PNG_MIME_TYPE)

  return {
    blob,
    dataUrl,
    fileName: createSharePosterFileName(payload),
    height: POSTER_HEIGHT,
    width: POSTER_WIDTH,
  }
}

export function downloadSharePoster(poster, payload) {
  const link = document.createElement('a')
  link.href = poster.dataUrl
  link.download = poster.fileName || createSharePosterFileName(payload)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export async function copyPosterImage(poster) {
  if (!navigator.clipboard?.write || typeof globalThis.ClipboardItem === 'undefined') {
    return {
      ok: false,
      reason: 'unsupported',
      message: '当前浏览器不支持直接复制图片，请下载后分享。',
    }
  }

  try {
    const blob =
      poster.blob ??
      (await fetch(poster.dataUrl).then((response) => response.blob()))
    await navigator.clipboard.write([
      new globalThis.ClipboardItem({
        [PNG_MIME_TYPE]: blob,
      }),
    ])

    return {
      ok: true,
      reason: 'copied',
      message: '已复制海报图片',
    }
  } catch {
    return {
      ok: false,
      reason: 'failed',
      message: '复制图片失败，请下载后分享。',
    }
  }
}
