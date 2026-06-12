import {
  SHARE_FOOTER_NOTE,
  createShareFileSlug,
  safeShareText,
} from './shareText.js'
import {
  buildPosterPresentation,
  deriveOverUnderValue,
  resolveTeamFlagStyle,
} from './posterPresentation.js'

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

function clipCutPanel(ctx, points) {
  ctx.beginPath()
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.clip()
}

function drawStar(ctx, x, y, radius, fillStyle) {
  ctx.beginPath()
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5
    const currentRadius = index % 2 === 0 ? radius : radius * 0.42
    const px = x + Math.cos(angle) * currentRadius
    const py = y + Math.sin(angle) * currentRadius
    if (index === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = fillStyle
  ctx.fill()
}

function drawFallbackFlagBackdrop(ctx, x, y, width, height, style, side) {
  const colors = style?.fallbackColors ?? [
    'rgba(20, 184, 166, 0.22)',
    'rgba(245, 158, 11, 0.16)',
  ]
  const gradient =
    side === 'right'
      ? ctx.createLinearGradient(x + width, y, x, y + height)
      : ctx.createLinearGradient(x, y, x + width, y + height)
  gradient.addColorStop(0, colors[0])
  gradient.addColorStop(1, colors[1])
  ctx.fillStyle = gradient
  ctx.fillRect(x, y, width, height)
}

function drawTeamFlagBackdrop(ctx, teamName, x, y, width, height, side, flagStyle) {
  const style = flagStyle?.type ? flagStyle : resolveTeamFlagStyle(teamName)
  const stripe = (color, rx, ry, rw, rh) => {
    ctx.fillStyle = color
    ctx.fillRect(x + rx * width, y + ry * height, rw * width, rh * height)
  }

  ctx.save()
  ctx.globalAlpha = style.fallback ? 0.16 : 0.32

  switch (style.type) {
    case 'argentina':
      stripe('#74acdf', 0, 0, 1, 1 / 3)
      stripe('#ffffff', 0, 1 / 3, 1, 1 / 3)
      stripe('#74acdf', 0, 2 / 3, 1, 1 / 3)
      stripe('#f6b40e', 0.47, 0.43, 0.06, 0.14)
      break
    case 'bosnia':
      stripe('#002f6c', 0, 0, 1, 1)
      ctx.fillStyle = '#f7d117'
      ctx.beginPath()
      ctx.moveTo(x + width * 0.58, y)
      ctx.lineTo(x + width, y)
      ctx.lineTo(x + width, y + height)
      ctx.closePath()
      ctx.fill()
      for (let index = 0; index < 7; index += 1) {
        drawStar(ctx, x + width * (0.54 + index * 0.055), y + height * (0.16 + index * 0.1), 9, '#ffffff')
      }
      break
    case 'brazil':
      stripe('#009b3a', 0, 0, 1, 1)
      ctx.fillStyle = '#ffdf00'
      ctx.beginPath()
      ctx.moveTo(x + width * 0.5, y + height * 0.16)
      ctx.lineTo(x + width * 0.86, y + height * 0.5)
      ctx.lineTo(x + width * 0.5, y + height * 0.84)
      ctx.lineTo(x + width * 0.14, y + height * 0.5)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#002776'
      ctx.beginPath()
      ctx.arc(x + width * 0.5, y + height * 0.5, height * 0.17, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'canada':
      stripe('#d52b1e', 0, 0, 0.26, 1)
      stripe('#ffffff', 0.26, 0, 0.48, 1)
      stripe('#d52b1e', 0.74, 0, 0.26, 1)
      stripe('#d52b1e', 0.46, 0.35, 0.08, 0.3)
      break
    case 'capeVerde':
      stripe('#003893', 0, 0, 1, 1)
      stripe('#ffffff', 0, 0.54, 1, 0.08)
      stripe('#cf2027', 0, 0.62, 1, 0.05)
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2
        drawStar(ctx, x + width * 0.28 + Math.cos(angle) * 34, y + height * 0.55 + Math.sin(angle) * 26, 6, '#ffce00')
      }
      break
    case 'croatia':
      stripe('#ff0000', 0, 0, 1, 1 / 3)
      stripe('#ffffff', 0, 1 / 3, 1, 1 / 3)
      stripe('#171796', 0, 2 / 3, 1, 1 / 3)
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          stripe((row + col) % 2 === 0 ? '#ff0000' : '#ffffff', 0.44 + col * 0.04, 0.38 + row * 0.07, 0.04, 0.07)
        }
      }
      break
    case 'czechia':
      stripe('#ffffff', 0, 0, 1, 0.5)
      stripe('#d7141a', 0, 0.5, 1, 0.5)
      ctx.fillStyle = '#11457e'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + width * 0.48, y + height * 0.5)
      ctx.lineTo(x, y + height)
      ctx.closePath()
      ctx.fill()
      break
    case 'england':
      stripe('#ffffff', 0, 0, 1, 1)
      stripe('#cf142b', 0.44, 0, 0.12, 1)
      stripe('#cf142b', 0, 0.42, 1, 0.16)
      break
    case 'france':
      stripe('#0055a4', 0, 0, 1 / 3, 1)
      stripe('#ffffff', 1 / 3, 0, 1 / 3, 1)
      stripe('#ef4135', 2 / 3, 0, 1 / 3, 1)
      break
    case 'germany':
      stripe('#000000', 0, 0, 1, 1 / 3)
      stripe('#dd0000', 0, 1 / 3, 1, 1 / 3)
      stripe('#ffce00', 0, 2 / 3, 1, 1 / 3)
      break
    case 'japan':
      stripe('#ffffff', 0, 0, 1, 1)
      ctx.fillStyle = '#bc002d'
      ctx.beginPath()
      ctx.arc(x + width * 0.5, y + height * 0.5, height * 0.24, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'mexico':
      stripe('#006847', 0, 0, 1 / 3, 1)
      stripe('#ffffff', 1 / 3, 0, 1 / 3, 1)
      stripe('#ce1126', 2 / 3, 0, 1 / 3, 1)
      stripe('#c09300', 0.48, 0.42, 0.04, 0.16)
      break
    case 'morocco':
      stripe('#c1272d', 0, 0, 1, 1)
      drawStar(ctx, x + width * 0.5, y + height * 0.5, 35, '#006233')
      break
    case 'netherlands':
      stripe('#ae1c28', 0, 0, 1, 1 / 3)
      stripe('#ffffff', 0, 1 / 3, 1, 1 / 3)
      stripe('#21468b', 0, 2 / 3, 1, 1 / 3)
      break
    case 'portugal':
      stripe('#006600', 0, 0, 0.42, 1)
      stripe('#ff0000', 0.42, 0, 0.58, 1)
      ctx.fillStyle = '#ffcc00'
      ctx.beginPath()
      ctx.arc(x + width * 0.42, y + height * 0.5, height * 0.13, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'senegal':
      stripe('#00853f', 0, 0, 1 / 3, 1)
      stripe('#fdef42', 1 / 3, 0, 1 / 3, 1)
      stripe('#e31b23', 2 / 3, 0, 1 / 3, 1)
      drawStar(ctx, x + width * 0.5, y + height * 0.5, 20, '#00853f')
      break
    case 'southAfrica':
      stripe('#de3831', 0, 0, 1, 0.5)
      stripe('#002395', 0, 0.5, 1, 0.5)
      ctx.fillStyle = '#007a4d'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + width * 0.48, y + height * 0.5)
      ctx.lineTo(x, y + height)
      ctx.closePath()
      ctx.fill()
      stripe('#ffb612', 0, 0.43, 0.48, 0.14)
      break
    case 'southKorea':
      stripe('#ffffff', 0, 0, 1, 1)
      ctx.fillStyle = '#c60c30'
      ctx.beginPath()
      ctx.arc(x + width * 0.5, y + height * 0.46, height * 0.15, Math.PI, 0)
      ctx.fill()
      ctx.fillStyle = '#003478'
      ctx.beginPath()
      ctx.arc(x + width * 0.5, y + height * 0.54, height * 0.15, 0, Math.PI)
      ctx.fill()
      break
    case 'spain':
      stripe('#aa151b', 0, 0, 1, 0.25)
      stripe('#f1bf00', 0, 0.25, 1, 0.5)
      stripe('#aa151b', 0, 0.75, 1, 0.25)
      break
    case 'switzerland':
      stripe('#d52b1e', 0, 0, 1, 1)
      stripe('#ffffff', 0.43, 0.25, 0.14, 0.5)
      stripe('#ffffff', 0.32, 0.43, 0.36, 0.14)
      break
    case 'usa':
      for (let index = 0; index < 7; index += 1) {
        stripe(index % 2 === 0 ? '#b22234' : '#ffffff', 0, index / 7, 1, 1 / 7)
      }
      stripe('#3c3b6e', 0, 0, 0.42, 0.55)
      for (let index = 0; index < 8; index += 1) {
        drawStar(ctx, x + width * (0.08 + (index % 4) * 0.08), y + height * (0.12 + Math.floor(index / 4) * 0.18), 5, '#ffffff')
      }
      break
    default:
      drawFallbackFlagBackdrop(ctx, x, y, width, height, style, side)
  }

  ctx.globalAlpha = 1
  const shade = ctx.createLinearGradient(x, y, x + width, y + height)
  shade.addColorStop(0, side === 'left' ? 'rgba(2, 6, 23, 0.22)' : 'rgba(2, 6, 23, 0.4)')
  shade.addColorStop(1, side === 'left' ? 'rgba(2, 6, 23, 0.4)' : 'rgba(2, 6, 23, 0.22)')
  ctx.fillStyle = shade
  ctx.fillRect(x, y, width, height)
  ctx.restore()
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
  const leftPoints = [[72, 174], [486, 148], [506, 418], [72, 452]]
  const rightPoints = [[594, 148], [1008, 174], [1008, 452], [574, 418]]
  const leftPanel = ctx.createLinearGradient(72, 166, 494, 422)
  leftPanel.addColorStop(0, 'rgba(20, 184, 166, 0.24)')
  leftPanel.addColorStop(1, 'rgba(15, 23, 42, 0.14)')
  drawCutPanel(ctx, leftPoints, leftPanel, 'rgba(94, 234, 212, 0.18)')

  const rightPanel = ctx.createLinearGradient(594, 166, 1008, 422)
  rightPanel.addColorStop(0, 'rgba(15, 23, 42, 0.14)')
  rightPanel.addColorStop(1, 'rgba(245, 158, 11, 0.22)')
  drawCutPanel(ctx, rightPoints, rightPanel, 'rgba(245, 158, 11, 0.18)')

  ctx.save()
  clipCutPanel(ctx, leftPoints)
  drawTeamFlagBackdrop(ctx, poster.homeTeamText, 72, 148, 434, 304, 'left', poster.homeFlagStyle)
  ctx.restore()

  ctx.save()
  clipCutPanel(ctx, rightPoints)
  drawTeamFlagBackdrop(ctx, poster.awayTeamText, 574, 148, 434, 304, 'right', poster.awayFlagStyle)
  ctx.restore()

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

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(540, y + 16)
  ctx.lineTo(540, y + 122)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(126, y + 72)
  ctx.lineTo(954, y + 66)
  ctx.stroke()

  const cells = [
    ['主推比分', poster.primaryScoreValue, 306, y + 20, '#ffffff', 38],
    ['备用比分', poster.secondaryScoreValue, 774, y + 20, '#dbeafe', 38],
    ['总进球', poster.totalGoalsValue, 306, y + 82, '#5eead4', 34],
    ['大小球', poster.overUnderValue, 774, y + 82, '#fbbf24', 34],
  ]

  cells.forEach(([label, value, x, cellY, color, valueSize]) => {
    setFont(ctx, 18, 900)
    ctx.fillStyle = '#94a3b8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(label, x, cellY)

    drawFitText(ctx, value, x, cellY + 24, 350, valueSize, 24, {
      color,
      maxLines: 1,
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

function getScoreValue(value) {
  return safeShareText(value, '').match(/\b\d{1,2}-\d{1,2}\b/)?.[0] ?? ''
}

function completePosterPresentation(poster) {
  const primaryScore = getScoreValue(poster?.primaryScoreValue ?? poster?.primaryScoreText)
  const secondaryScore = getScoreValue(poster?.secondaryScoreValue ?? poster?.secondaryScoreText)
  const overUnderValue = safeShareText(
    poster?.overUnderValue,
    deriveOverUnderValue(primaryScore, secondaryScore),
  )

  return {
    ...poster,
    awayFlagStyle:
      poster?.awayFlagStyle ?? resolveTeamFlagStyle(poster?.awayTeamText),
    footerNote: safeShareText(poster?.footerNote, SHARE_FOOTER_NOTE),
    homeFlagStyle:
      poster?.homeFlagStyle ?? resolveTeamFlagStyle(poster?.homeTeamText),
    overUnderText: safeShareText(poster?.overUnderText, `大小球：${overUnderValue}`),
    overUnderValue,
  }
}

function getPosterPresentation(payload) {
  if (payload?.posterPresentation) return completePosterPresentation(payload.posterPresentation)

  return completePosterPresentation(buildPosterPresentation({
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
  }))
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
