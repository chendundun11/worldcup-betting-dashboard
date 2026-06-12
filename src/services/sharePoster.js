import {
  SHARE_FOOTER_NOTE,
  createShareFileSlug,
  safeShareText,
} from './shareText.js'
import { buildPosterPresentation } from './posterPresentation.js'

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

  const allLines = splitTextByWidth(ctx, text, maxWidth)
  const lines = allLines.slice(0, maxLines)
  if (!lines.length) return y

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight)
  })

  return y + lines.length * lineHeight
}

function drawFitText(ctx, text, x, y, maxWidth, maxSize, minSize, options = {}) {
  let size = maxSize
  const weight = options.weight ?? 900
  while (size > minSize) {
    setFont(ctx, size, weight)
    if (ctx.measureText(text).width <= maxWidth) break
    size -= 2
  }

  return drawWrappedText(ctx, text, x, y, maxWidth, {
    align: options.align ?? 'center',
    color: options.color ?? '#f8fafc',
    fontSize: size,
    fontWeight: weight,
    lineHeight: Math.round(size * 1.08),
    maxLines: options.maxLines ?? 1,
  })
}

function drawCutPanel(ctx, points, fillStyle, strokeStyle) {
  ctx.beginPath()
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fillStyle = fillStyle
  ctx.fill()
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

function drawBackground(ctx) {
  const base = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
  base.addColorStop(0, '#07111f')
  base.addColorStop(0.48, '#0a1524')
  base.addColorStop(1, '#02050d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  const leftLight = ctx.createRadialGradient(130, 90, 10, 130, 90, 760)
  leftLight.addColorStop(0, 'rgba(45, 212, 191, 0.36)')
  leftLight.addColorStop(0.45, 'rgba(45, 212, 191, 0.1)')
  leftLight.addColorStop(1, 'rgba(45, 212, 191, 0)')
  ctx.fillStyle = leftLight
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  const rightLight = ctx.createRadialGradient(950, 130, 12, 950, 130, 740)
  rightLight.addColorStop(0, 'rgba(245, 158, 11, 0.34)')
  rightLight.addColorStop(0.42, 'rgba(245, 158, 11, 0.1)')
  rightLight.addColorStop(1, 'rgba(245, 158, 11, 0)')
  ctx.fillStyle = rightLight
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  ctx.save()
  ctx.globalAlpha = 0.28
  const beam = ctx.createLinearGradient(0, 120, POSTER_WIDTH, 520)
  beam.addColorStop(0, 'rgba(94, 234, 212, 0)')
  beam.addColorStop(0.46, 'rgba(94, 234, 212, 0.16)')
  beam.addColorStop(1, 'rgba(245, 158, 11, 0)')
  drawCutPanel(ctx, [[-80, 230], [POSTER_WIDTH + 60, 60], [POSTER_WIDTH + 120, 210], [-20, 380]], beam)
  const beamTwo = ctx.createLinearGradient(0, 420, POSTER_WIDTH, 720)
  beamTwo.addColorStop(0, 'rgba(245, 158, 11, 0)')
  beamTwo.addColorStop(0.55, 'rgba(245, 158, 11, 0.14)')
  beamTwo.addColorStop(1, 'rgba(94, 234, 212, 0)')
  drawCutPanel(ctx, [[-120, 710], [POSTER_WIDTH + 70, 420], [POSTER_WIDTH + 120, 560], [-40, 840]], beamTwo)
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.075)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(POSTER_WIDTH / 2, 140)
  ctx.lineTo(POSTER_WIDTH / 2, 585)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(POSTER_WIDTH / 2, 346, 148, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(84, 592)
  ctx.lineTo(996, 592)
  ctx.stroke()
  for (let x = 92; x < POSTER_WIDTH; x += 104) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + 300, POSTER_HEIGHT)
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.035)'
    ctx.stroke()
  }
  ctx.restore()

  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
  for (let index = 0; index < 70; index += 1) {
    const x = (index * 149) % POSTER_WIDTH
    const y = 70 + ((index * 211) % 1050)
    const size = 1 + (index % 3)
    ctx.globalAlpha = 0.12 + (index % 5) * 0.035
    ctx.fillRect(x, y, size, size)
  }
  ctx.restore()
}

function drawHeader(ctx, poster) {
  setFont(ctx, 34, 900)
  ctx.fillStyle = '#5eead4'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(poster.posterTitle, 72, 48)

  setFont(ctx, 22, 800)
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText(poster.posterSubtitle, 72, 90)

  setFont(ctx, 24, 900)
  ctx.fillStyle = '#f8fafc'
  ctx.textAlign = 'right'
  ctx.fillText(poster.matchTimeText, 1008, 50, 380)

  setFont(ctx, 20, 900)
  const statusWidth = Math.min(ctx.measureText(poster.statusText).width + 36, 168)
  fillRoundedRect(ctx, 1008 - statusWidth, 88, statusWidth, 38, 19, 'rgba(2, 6, 23, 0.62)')
  ctx.strokeStyle = 'rgba(94, 234, 212, 0.42)'
  ctx.lineWidth = 2
  drawRoundedRect(ctx, 1008 - statusWidth, 88, statusWidth, 38, 19)
  ctx.stroke()
  ctx.fillStyle = '#a7f3d0'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(poster.statusText, 1008 - statusWidth / 2, 107, statusWidth - 24)
}

function drawMatchVisual(ctx, poster) {
  const leftPanel = ctx.createLinearGradient(72, 166, 494, 422)
  leftPanel.addColorStop(0, 'rgba(20, 184, 166, 0.24)')
  leftPanel.addColorStop(1, 'rgba(15, 23, 42, 0.14)')
  drawCutPanel(ctx, [[72, 174], [486, 148], [506, 418], [72, 452]], leftPanel, 'rgba(94, 234, 212, 0.18)')

  const rightPanel = ctx.createLinearGradient(594, 166, 1008, 422)
  rightPanel.addColorStop(0, 'rgba(15, 23, 42, 0.14)')
  rightPanel.addColorStop(1, 'rgba(245, 158, 11, 0.22)')
  drawCutPanel(ctx, [[594, 148], [1008, 174], [1008, 452], [574, 418]], rightPanel, 'rgba(245, 158, 11, 0.18)')

  drawFitText(ctx, poster.homeTeamText, 282, 248, 356, 60, 38, {
    color: '#f8fafc',
    maxLines: 2,
  })
  drawFitText(ctx, poster.awayTeamText, 800, 248, 356, 60, 38, {
    color: '#f8fafc',
    maxLines: 2,
  })

  ctx.save()
  ctx.shadowColor = 'rgba(251, 191, 36, 0.75)'
  ctx.shadowBlur = 28
  setFont(ctx, 102, 900)
  ctx.fillStyle = '#fbbf24'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('VS', POSTER_WIDTH / 2, 318)
  ctx.restore()
}

function drawConclusion(ctx, poster) {
  const banner = ctx.createLinearGradient(82, 486, 998, 606)
  banner.addColorStop(0, 'rgba(20, 184, 166, 0.9)')
  banner.addColorStop(0.46, 'rgba(15, 23, 42, 0.9)')
  banner.addColorStop(1, 'rgba(245, 158, 11, 0.72)')
  drawCutPanel(ctx, [[82, 486], [958, 468], [998, 606], [122, 624]], banner, 'rgba(226, 232, 240, 0.16)')

  setFont(ctx, 24, 900)
  ctx.fillStyle = '#cffafe'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('赛前结论', 126, 506)

  drawWrappedText(ctx, poster.mainConclusion, 126, 540, 790, {
    color: '#ffffff',
    fontSize: 50,
    fontWeight: 900,
    lineHeight: 58,
    maxLines: 1,
  })

  drawWrappedText(ctx, poster.supportConclusion, 126, 596, 800, {
    color: '#e2e8f0',
    fontSize: 24,
    fontWeight: 800,
    lineHeight: 30,
    maxLines: 1,
  })
}

function drawScoreboard(ctx, poster) {
  const y = 658
  ctx.save()
  ctx.globalAlpha = 0.96
  const scoreBand = ctx.createLinearGradient(72, y, 1008, y + 130)
  scoreBand.addColorStop(0, 'rgba(2, 6, 23, 0.7)')
  scoreBand.addColorStop(0.5, 'rgba(15, 23, 42, 0.84)')
  scoreBand.addColorStop(1, 'rgba(2, 6, 23, 0.7)')
  drawCutPanel(ctx, [[72, y + 8], [1008, y], [970, y + 128], [112, y + 138]], scoreBand, 'rgba(148, 163, 184, 0.18)')
  ctx.restore()

  const columns = [
    ['主推比分', poster.primaryScoreValue, 216, '#ffffff'],
    ['备用比分', poster.secondaryScoreValue, 512, '#dbeafe'],
    ['总进球', poster.totalGoalsValue, 812, '#5eead4'],
  ]

  columns.forEach(([label, value, x, color], index) => {
    if (index > 0) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 146, y + 22)
      ctx.lineTo(x - 164, y + 112)
      ctx.stroke()
    }

    setFont(ctx, 22, 900)
    ctx.fillStyle = '#94a3b8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(label, x, y + 24)

    drawFitText(ctx, value, x, y + 66, 260, index === 2 ? 48 : 56, 30, {
      color,
      maxLines: index === 2 ? 1 : 1,
    })
  })
}

function drawInsightBlock(ctx, poster) {
  const y = 830
  const panel = ctx.createLinearGradient(72, y, 1008, y + 380)
  panel.addColorStop(0, 'rgba(2, 6, 23, 0.7)')
  panel.addColorStop(0.55, 'rgba(15, 23, 42, 0.62)')
  panel.addColorStop(1, 'rgba(6, 78, 59, 0.36)')
  drawCutPanel(ctx, [[72, y], [1008, y + 18], [1008, y + 408], [72, y + 388]], panel, 'rgba(94, 234, 212, 0.16)')

  setFont(ctx, 22, 900)
  ctx.fillStyle = '#5eead4'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('模型解读', 108, y + 34)
  drawWrappedText(ctx, poster.modelInsightShort || poster.modelInsight, 108, y + 68, 864, {
    color: '#f8fafc',
    fontSize: 27,
    fontWeight: 800,
    lineHeight: 40,
    maxLines: 3,
  })

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(108, y + 190)
  ctx.lineTo(972, y + 190)
  ctx.stroke()

  setFont(ctx, 22, 900)
  ctx.fillStyle = '#fbbf24'
  ctx.fillText('首发观察', 108, y + 214)
  drawWrappedText(ctx, poster.lineupInsightShort || poster.lineupInsight, 108, y + 248, 864, {
    color: '#dbeafe',
    fontSize: 26,
    fontWeight: 750,
    lineHeight: 38,
    maxLines: 2,
  })

  const summaryY = y + 344
  const summaryFill = ctx.createLinearGradient(108, summaryY, 972, summaryY + 56)
  summaryFill.addColorStop(0, 'rgba(20, 184, 166, 0.2)')
  summaryFill.addColorStop(1, 'rgba(245, 158, 11, 0.16)')
  fillRoundedRect(ctx, 108, summaryY, 864, 58, 18, summaryFill)
  drawWrappedText(ctx, poster.oneLineSummaryShort || poster.oneLineSummary, 130, summaryY + 15, 820, {
    color: '#ffffff',
    fontSize: 23,
    fontWeight: 900,
    lineHeight: 28,
    maxLines: 1,
  })

  drawWrappedText(ctx, poster.footerNote || SHARE_FOOTER_NOTE, POSTER_WIDTH / 2, 1278, 936, {
    align: 'center',
    color: 'rgba(203, 213, 225, 0.78)',
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 26,
    maxLines: 1,
  })
}

function getPosterPresentation(payload) {
  if (payload?.posterPresentation) return payload.posterPresentation

  return buildPosterPresentation({
    awayFormation: payload?.awayFormation,
    awayTeam: payload?.awayTeam,
    displayConfidence: payload?.displayConfidence,
    homeFormation: payload?.homeFormation,
    homeTeam: payload?.homeTeam,
    kickoff: payload?.kickoffText,
    lineupStatusText: payload?.lineupStatusText,
    mainDirection: payload?.mainDirectionText,
    mainPick: payload?.mainPickText,
    presentationRating: payload?.presentationRating,
    rawScore: payload?.rawScore,
    scorePredictions: [payload?.primaryScoreText, payload?.secondaryScoreText],
    statusTags: payload?.statusTags,
    summary: payload?.summaryText,
    totalGoalsDirection: payload?.totalGoalsDirectionText,
  })
}

function drawSharePoster(ctx, payload) {
  const poster = getPosterPresentation(payload)

  drawBackground(ctx)
  drawHeader(ctx, poster)
  drawMatchVisual(ctx, poster)
  drawConclusion(ctx, poster)
  drawScoreboard(ctx, poster)
  drawInsightBlock(ctx, poster)
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
