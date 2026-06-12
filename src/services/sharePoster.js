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
const SAFE_X = 72
const SAFE_RIGHT = POSTER_WIDTH - SAFE_X
const CONTENT_WIDTH = SAFE_RIGHT - SAFE_X
const CENTER_X = POSTER_WIDTH / 2

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

function clipRoundedRect(ctx, x, y, width, height, radius) {
  drawRoundedRect(ctx, x, y, width, height, radius)
  ctx.clip()
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
  ctx.globalAlpha = style.fallback ? 0.16 : style.type === 'paraguay' ? 0.42 : 0.32

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
    case 'paraguay':
      stripe('#d52b1e', 0, 0, 1, 1 / 3)
      stripe('#ffffff', 0, 1 / 3, 1, 1 / 3)
      stripe('#0038a8', 0, 2 / 3, 1, 1 / 3)
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
  const shadeStart =
    style.type === 'paraguay'
      ? 'rgba(2, 6, 23, 0.24)'
      : side === 'left'
        ? 'rgba(2, 6, 23, 0.22)'
        : 'rgba(2, 6, 23, 0.4)'
  const shadeEnd =
    style.type === 'paraguay'
      ? 'rgba(2, 6, 23, 0.18)'
      : side === 'left'
        ? 'rgba(2, 6, 23, 0.4)'
        : 'rgba(2, 6, 23, 0.22)'
  shade.addColorStop(0, shadeStart)
  shade.addColorStop(1, shadeEnd)
  ctx.fillStyle = shade
  ctx.fillRect(x, y, width, height)
  ctx.restore()
}

function drawFootballBackdrop(ctx) {
  const base = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
  base.addColorStop(0, '#081711')
  base.addColorStop(0.38, '#0b241b')
  base.addColorStop(0.72, '#071525')
  base.addColorStop(1, '#02050d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  const standShadow = ctx.createLinearGradient(0, 0, 0, 220)
  standShadow.addColorStop(0, 'rgba(2, 6, 23, 0.68)')
  standShadow.addColorStop(0.55, 'rgba(15, 23, 42, 0.28)')
  standShadow.addColorStop(1, 'rgba(15, 23, 42, 0)')
  ctx.fillStyle = standShadow
  ctx.fillRect(0, 0, POSTER_WIDTH, 240)

  ctx.save()
  ctx.globalAlpha = 0.18
  for (let index = -2; index < 9; index += 1) {
    ctx.fillStyle = index % 2 === 0 ? '#123d2f' : '#0d2f24'
    ctx.beginPath()
    ctx.moveTo(index * 154 - 120, 0)
    ctx.lineTo(index * 154 + 56, 0)
    ctx.lineTo(index * 154 + 420, POSTER_HEIGHT)
    ctx.lineTo(index * 154 + 244, POSTER_HEIGHT)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = 'rgba(209, 250, 229, 0.07)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.rect(SAFE_X, 136, CONTENT_WIDTH, 1080)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(CENTER_X, 136)
  ctx.lineTo(CENTER_X, 1216)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(CENTER_X, 412, 150, 0, Math.PI * 2)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(CENTER_X, 412, 8, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(209, 250, 229, 0.07)'
  ctx.fill()

  ctx.strokeStyle = 'rgba(209, 250, 229, 0.055)'
  ctx.lineWidth = 2
  ctx.strokeRect(SAFE_X, 282, 150, 420)
  ctx.strokeRect(SAFE_RIGHT - 150, 282, 150, 420)
  ctx.strokeRect(SAFE_X, 390, 58, 204)
  ctx.strokeRect(SAFE_RIGHT - 58, 390, 58, 204)

  ctx.beginPath()
  ctx.arc(SAFE_X + 150, 492, 72, -Math.PI / 2, Math.PI / 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(SAFE_RIGHT - 150, 492, 72, Math.PI / 2, -Math.PI / 2)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  const leftLight = ctx.createRadialGradient(160, 54, 12, 160, 54, 760)
  leftLight.addColorStop(0, 'rgba(94, 234, 212, 0.34)')
  leftLight.addColorStop(0.34, 'rgba(94, 234, 212, 0.11)')
  leftLight.addColorStop(1, 'rgba(94, 234, 212, 0)')
  ctx.fillStyle = leftLight
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  const rightLight = ctx.createRadialGradient(940, 64, 12, 940, 64, 760)
  rightLight.addColorStop(0, 'rgba(245, 158, 11, 0.28)')
  rightLight.addColorStop(0.36, 'rgba(245, 158, 11, 0.1)')
  rightLight.addColorStop(1, 'rgba(245, 158, 11, 0)')
  ctx.fillStyle = rightLight
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  const beam = ctx.createLinearGradient(0, 88, POSTER_WIDTH, 560)
  beam.addColorStop(0, 'rgba(94, 234, 212, 0)')
  beam.addColorStop(0.44, 'rgba(94, 234, 212, 0.1)')
  beam.addColorStop(1, 'rgba(245, 158, 11, 0)')
  drawCutPanel(ctx, [[-80, 210], [POSTER_WIDTH + 50, 92], [POSTER_WIDTH + 80, 230], [-40, 380]], beam)
  ctx.restore()

  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
  for (let index = 0; index < 64; index += 1) {
    const x = (index * 149) % POSTER_WIDTH
    const y = 80 + ((index * 211) % 1060)
    const size = 1 + (index % 3)
    ctx.globalAlpha = 0.08 + (index % 5) * 0.025
    ctx.fillRect(x, y, size, size)
  }
  ctx.restore()

  const vignette = ctx.createRadialGradient(CENTER_X, 560, 160, CENTER_X, 560, 820)
  vignette.addColorStop(0, 'rgba(2, 6, 23, 0)')
  vignette.addColorStop(0.72, 'rgba(2, 6, 23, 0.18)')
  vignette.addColorStop(1, 'rgba(2, 6, 23, 0.68)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
}

function drawHeader(ctx, poster) {
  setFont(ctx, 38, 900)
  ctx.fillStyle = '#5eead4'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(poster.posterTitle, SAFE_X, 46)

  setFont(ctx, 24, 800)
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText(poster.posterSubtitle, SAFE_X, 90)

  setFont(ctx, 26, 900)
  ctx.fillStyle = '#f8fafc'
  ctx.textAlign = 'right'
  ctx.fillText(poster.matchTimeText, SAFE_RIGHT, 50, 380)

  setFont(ctx, 20, 900)
  const statusWidth = Math.min(ctx.measureText(poster.statusText).width + 36, 168)
  fillRoundedRect(ctx, SAFE_RIGHT - statusWidth, 88, statusWidth, 38, 19, 'rgba(2, 6, 23, 0.62)')
  ctx.strokeStyle = 'rgba(94, 234, 212, 0.42)'
  ctx.lineWidth = 2
  drawRoundedRect(ctx, SAFE_RIGHT - statusWidth, 88, statusWidth, 38, 19)
  ctx.stroke()
  ctx.fillStyle = '#a7f3d0'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(poster.statusText, SAFE_RIGHT - statusWidth / 2, 107, statusWidth - 24)
}

function drawMatchVisual(ctx, poster) {
  const panelTop = 154
  const panelHeight = 300
  const panelGap = 68
  const panelWidth = (CONTENT_WIDTH - panelGap) / 2
  const leftX = SAFE_X
  const rightX = CENTER_X + panelGap / 2

  const leftPanel = ctx.createLinearGradient(leftX, panelTop, leftX + panelWidth, panelTop + panelHeight)
  leftPanel.addColorStop(0, 'rgba(20, 184, 166, 0.24)')
  leftPanel.addColorStop(1, 'rgba(15, 23, 42, 0.14)')
  fillRoundedRect(ctx, leftX, panelTop, panelWidth, panelHeight, 10, leftPanel)
  ctx.strokeStyle = 'rgba(94, 234, 212, 0.2)'
  ctx.lineWidth = 2
  drawRoundedRect(ctx, leftX, panelTop, panelWidth, panelHeight, 10)
  ctx.stroke()

  const rightPanel = ctx.createLinearGradient(rightX, panelTop, SAFE_RIGHT, panelTop + panelHeight)
  rightPanel.addColorStop(0, 'rgba(15, 23, 42, 0.14)')
  rightPanel.addColorStop(1, 'rgba(245, 158, 11, 0.22)')
  fillRoundedRect(ctx, rightX, panelTop, panelWidth, panelHeight, 10, rightPanel)
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.2)'
  ctx.lineWidth = 2
  drawRoundedRect(ctx, rightX, panelTop, panelWidth, panelHeight, 10)
  ctx.stroke()

  ctx.save()
  clipRoundedRect(ctx, leftX, panelTop, panelWidth, panelHeight, 10)
  drawTeamFlagBackdrop(ctx, poster.homeTeamText, leftX, panelTop, panelWidth, panelHeight, 'left', poster.homeFlagStyle)
  ctx.restore()

  ctx.save()
  clipRoundedRect(ctx, rightX, panelTop, panelWidth, panelHeight, 10)
  drawTeamFlagBackdrop(ctx, poster.awayTeamText, rightX, panelTop, panelWidth, panelHeight, 'right', poster.awayFlagStyle)
  ctx.restore()

  drawFitText(ctx, poster.homeTeamText, leftX + panelWidth / 2, panelTop + 92, 356, 64, 42, {
    color: '#f8fafc',
    maxLines: 2,
  })
  drawFitText(ctx, poster.awayTeamText, rightX + panelWidth / 2, panelTop + 92, 356, 64, 42, {
    color: '#f8fafc',
    maxLines: 2,
  })

  ctx.save()
  ctx.shadowColor = 'rgba(251, 191, 36, 0.75)'
  ctx.shadowBlur = 28
  setFont(ctx, 92, 900)
  ctx.fillStyle = '#fbbf24'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('VS', CENTER_X, panelTop + panelHeight / 2)
  ctx.restore()
}

function drawConclusion(ctx, poster) {
  const textX = SAFE_X + 48
  const banner = ctx.createLinearGradient(SAFE_X, 486, SAFE_RIGHT, 606)
  banner.addColorStop(0, 'rgba(20, 184, 166, 0.9)')
  banner.addColorStop(0.46, 'rgba(15, 23, 42, 0.9)')
  banner.addColorStop(1, 'rgba(245, 158, 11, 0.72)')
  drawCutPanel(ctx, [[SAFE_X, 486], [SAFE_RIGHT - 42, 468], [SAFE_RIGHT, 606], [SAFE_X + 42, 624]], banner, 'rgba(226, 232, 240, 0.16)')

  setFont(ctx, 24, 900)
  ctx.fillStyle = '#cffafe'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('赛前结论', textX, 506)

  drawWrappedText(ctx, poster.mainConclusion, textX, 540, CONTENT_WIDTH - 96, {
    color: '#ffffff',
    fontSize: 50,
    fontWeight: 900,
    lineHeight: 58,
    maxLines: 1,
  })

  drawWrappedText(ctx, poster.supportConclusion, textX, 596, CONTENT_WIDTH - 96, {
    color: '#e2e8f0',
    fontSize: 24,
    fontWeight: 800,
    lineHeight: 30,
    maxLines: 1,
  })
}

function drawScoreboard(ctx, poster) {
  const y = 658
  const height = 138
  ctx.save()
  ctx.globalAlpha = 0.96
  const scoreBand = ctx.createLinearGradient(SAFE_X, y, SAFE_RIGHT, y + height)
  scoreBand.addColorStop(0, 'rgba(2, 6, 23, 0.7)')
  scoreBand.addColorStop(0.5, 'rgba(15, 23, 42, 0.84)')
  scoreBand.addColorStop(1, 'rgba(2, 6, 23, 0.7)')
  fillRoundedRect(ctx, SAFE_X, y, CONTENT_WIDTH, height, 8, scoreBand)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
  ctx.lineWidth = 2
  drawRoundedRect(ctx, SAFE_X, y, CONTENT_WIDTH, height, 8)
  ctx.stroke()
  ctx.restore()

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(CENTER_X, y + 16)
  ctx.lineTo(CENTER_X, y + height - 16)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(SAFE_X + 54, y + height / 2)
  ctx.lineTo(SAFE_RIGHT - 54, y + height / 2)
  ctx.stroke()

  const cells = [
    ['主推比分', poster.primaryScoreValue, SAFE_X + CONTENT_WIDTH / 4, y + 16, '#ffffff', 42],
    ['备用比分', poster.secondaryScoreValue, SAFE_X + (CONTENT_WIDTH * 3) / 4, y + 16, '#dbeafe', 42],
    ['总进球', poster.totalGoalsValue, SAFE_X + CONTENT_WIDTH / 4, y + 84, '#5eead4', 40],
    ['大小球', poster.overUnderValue, SAFE_X + (CONTENT_WIDTH * 3) / 4, y + 84, '#fbbf24', 40],
  ]

  cells.forEach(([label, value, x, cellY, color, valueSize]) => {
    setFont(ctx, 18, 900)
    ctx.fillStyle = '#94a3b8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(label, x, cellY)

    drawFitText(ctx, value, x, cellY + 22, CONTENT_WIDTH / 2 - 96, valueSize, 26, {
      color,
      maxLines: 1,
    })
  })
}

function drawInsightBlock(ctx, poster) {
  const y = 830
  const panelHeight = 408
  const innerX = SAFE_X + 36
  const innerRight = SAFE_RIGHT - 36
  const innerWidth = innerRight - innerX
  const panel = ctx.createLinearGradient(SAFE_X, y, SAFE_RIGHT, y + panelHeight)
  panel.addColorStop(0, 'rgba(2, 6, 23, 0.7)')
  panel.addColorStop(0.55, 'rgba(15, 23, 42, 0.62)')
  panel.addColorStop(1, 'rgba(6, 78, 59, 0.36)')
  fillRoundedRect(ctx, SAFE_X, y, CONTENT_WIDTH, panelHeight, 8, panel)
  ctx.strokeStyle = 'rgba(94, 234, 212, 0.16)'
  ctx.lineWidth = 2
  drawRoundedRect(ctx, SAFE_X, y, CONTENT_WIDTH, panelHeight, 8)
  ctx.stroke()

  setFont(ctx, 24, 900)
  ctx.fillStyle = '#5eead4'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('模型解读', innerX, y + 34)
  drawWrappedText(ctx, poster.modelInsightShort || poster.modelInsight, innerX, y + 70, innerWidth, {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 40,
    maxLines: 3,
  })

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(innerX, y + 190)
  ctx.lineTo(innerRight, y + 190)
  ctx.stroke()

  setFont(ctx, 24, 900)
  ctx.fillStyle = '#fbbf24'
  ctx.fillText('首发观察', innerX, y + 214)
  drawWrappedText(ctx, poster.lineupInsightShort || poster.lineupInsight, innerX, y + 250, innerWidth, {
    color: '#dbeafe',
    fontSize: 27,
    fontWeight: 750,
    lineHeight: 38,
    maxLines: 2,
  })

  const summaryY = y + 344
  const summaryFill = ctx.createLinearGradient(innerX, summaryY, innerRight, summaryY + 56)
  summaryFill.addColorStop(0, 'rgba(20, 184, 166, 0.2)')
  summaryFill.addColorStop(1, 'rgba(245, 158, 11, 0.16)')
  fillRoundedRect(ctx, innerX, summaryY, innerWidth, 58, 18, summaryFill)
  drawWrappedText(ctx, poster.oneLineSummaryShort || poster.oneLineSummary, innerX + 22, summaryY + 15, innerWidth - 44, {
    color: '#ffffff',
    fontSize: 25,
    fontWeight: 900,
    lineHeight: 28,
    maxLines: 1,
  })

  drawWrappedText(ctx, poster.footerNote || SHARE_FOOTER_NOTE, CENTER_X, 1278, CONTENT_WIDTH, {
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

  drawFootballBackdrop(ctx)
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
