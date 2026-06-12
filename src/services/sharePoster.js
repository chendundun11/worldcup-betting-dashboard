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
  background.addColorStop(0, '#071627')
  background.addColorStop(0.48, '#06101e')
  background.addColorStop(1, '#020711')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  const tealGlow = ctx.createRadialGradient(160, 110, 20, 160, 110, 620)
  tealGlow.addColorStop(0, 'rgba(45, 212, 191, 0.36)')
  tealGlow.addColorStop(0.42, 'rgba(45, 212, 191, 0.14)')
  tealGlow.addColorStop(1, 'rgba(45, 212, 191, 0)')
  ctx.fillStyle = tealGlow
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  const goldGlow = ctx.createRadialGradient(920, 220, 10, 920, 220, 560)
  goldGlow.addColorStop(0, 'rgba(245, 158, 11, 0.3)')
  goldGlow.addColorStop(1, 'rgba(245, 158, 11, 0)')
  ctx.fillStyle = goldGlow
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  ctx.save()
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.055)'
  ctx.lineWidth = 2
  for (let x = -POSTER_HEIGHT; x < POSTER_WIDTH; x += 92) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + POSTER_HEIGHT, POSTER_HEIGHT)
    ctx.stroke()
  }
  ctx.restore()

  const centerBand = ctx.createLinearGradient(72, 0, POSTER_WIDTH - 72, 0)
  centerBand.addColorStop(0, 'rgba(45, 212, 191, 0.08)')
  centerBand.addColorStop(0.5, 'rgba(15, 23, 42, 0.2)')
  centerBand.addColorStop(1, 'rgba(245, 158, 11, 0.08)')
  fillRoundedRect(ctx, 44, 44, POSTER_WIDTH - 88, POSTER_HEIGHT - 88, 46, centerBand)
  ctx.lineWidth = 2
  strokeRoundedRect(ctx, 44, 44, POSTER_WIDTH - 88, POSTER_HEIGHT - 88, 46, 'rgba(226, 232, 240, 0.1)')
}

function drawStatusPills(ctx, tags) {
  let x = 72
  const y = 164

  setFont(ctx, 24, 900)
  for (const tag of tags.slice(0, 3)) {
    const text = safeShareText(tag, '当前重点')
    const width = Math.min(ctx.measureText(text).width + 44, 252)
    fillRoundedRect(ctx, x, y, width, 46, 23, 'rgba(2, 6, 23, 0.58)')
    strokeRoundedRect(ctx, x, y, width, 46, 23, 'rgba(45, 212, 191, 0.34)')
    ctx.fillStyle = '#a7f3d0'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + width / 2, y + 23, width - 28)
    x += width + 14
  }
}

function drawInfoTile(ctx, x, y, width, height, label, value, color = '#f8fafc') {
  const tileGradient = ctx.createLinearGradient(x, y, x + width, y + height)
  tileGradient.addColorStop(0, 'rgba(15, 23, 42, 0.82)')
  tileGradient.addColorStop(1, 'rgba(2, 6, 23, 0.76)')
  fillRoundedRect(ctx, x, y, width, height, 30, tileGradient)
  strokeRoundedRect(ctx, x, y, width, height, 30, 'rgba(148, 163, 184, 0.15)')
  setFont(ctx, 23, 900)
  ctx.fillStyle = '#94a3b8'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(label, x + 28, y + 24)
  drawWrappedText(ctx, value, x + 28, y + 70, width - 56, {
    color,
    fontSize: 44,
    fontWeight: 900,
    lineHeight: 48,
    maxLines: 1,
  })
}

function drawRatingBlock(ctx, payload) {
  const rating = payload.presentationRating ?? {}
  const scoreMode = safeShareText(rating.scoreMode, 'risk')
  const y = 910

  fillRoundedRect(ctx, 72, y, 936, 128, 32, 'rgba(2, 6, 23, 0.66)')
  strokeRoundedRect(ctx, 72, y, 936, 128, 32, 'rgba(245, 158, 11, 0.22)')

  if (scoreMode === 'score') {
    setFont(ctx, 24, 900)
    ctx.fillStyle = '#fcd34d'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(safeShareText(rating.scoreLabel, '方向强度'), 112, y + 24)

    const scoreGradient = ctx.createLinearGradient(112, y + 58, 360, y + 106)
    scoreGradient.addColorStop(0, '#fbbf24')
    scoreGradient.addColorStop(1, '#fde68a')
    setFont(ctx, 52, 900)
    ctx.fillStyle = scoreGradient
    ctx.fillText(safeShareText(rating.displayScoreText, '--/100'), 112, y + 60)

    setFont(ctx, 24, 900)
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('等级', 562, y + 24)
    drawWrappedText(ctx, safeShareText(rating.strengthLabel, '稳健参考'), 562, y + 61, 360, {
      color: '#e2e8f0',
      fontSize: 42,
      fontWeight: 900,
      lineHeight: 46,
      maxLines: 1,
    })
    return
  }

  setFont(ctx, 24, 900)
  ctx.fillStyle = '#fcd34d'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('风险等级', 112, y + 24)
  drawWrappedText(ctx, safeShareText(rating.riskLabel, '风险偏高'), 112, y + 61, 360, {
    color: '#f8fafc',
    fontSize: 42,
    fontWeight: 900,
    lineHeight: 46,
    maxLines: 1,
  })

  setFont(ctx, 24, 900)
  ctx.fillStyle = '#94a3b8'
  ctx.fillText('策略建议', 562, y + 24)
  drawWrappedText(ctx, safeShareText(rating.strategyLabel, '谨慎观望'), 562, y + 61, 360, {
    color: '#5eead4',
    fontSize: 42,
    fontWeight: 900,
    lineHeight: 46,
    maxLines: 1,
  })
}

function drawSharePoster(ctx, payload) {
  const matchName = safeShareText(payload.matchName, '当前重点比赛')
  const homeTeam = safeShareText(payload.homeTeam, matchName)
  const awayTeam = safeShareText(payload.awayTeam, '')
  const kickoffText = safeShareText(payload.kickoffText, '赛前分析')
  const mainDirectionText = safeShareText(payload.mainDirectionText, '临场复核')
  const primaryScoreText = safeShareText(payload.primaryScoreText, '待复核')
  const secondaryScoreText = safeShareText(payload.secondaryScoreText, '待补充')
  const goalsDirectionText = safeShareText(payload.goalsDirectionText, '待复核')
  const lineupStatusText = safeShareText(payload.lineupStatusText, '首发待确认')
  const summaryText = safeShareText(
    payload.summaryText,
    '系统综合盘口、水位与阵容信息后，本场主方向仍需结合临场复核。',
  )

  drawBackground(ctx)

  setFont(ctx, 27, 900)
  ctx.fillStyle = '#5eead4'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('MATCH FOCUS', 72, 78)

  setFont(ctx, 36, 900)
  ctx.fillStyle = '#f8fafc'
  ctx.fillText('赛前方向卡', 72, 112)

  setFont(ctx, 25, 800)
  ctx.fillStyle = '#cbd5e1'
  ctx.textAlign = 'right'
  ctx.fillText(kickoffText, 1008, 92, 470)
  drawStatusPills(ctx, payload.statusTags ?? ['当前重点'])

  const matchY = 238
  drawWrappedText(ctx, homeTeam, POSTER_WIDTH / 2, matchY, 870, {
    align: 'center',
    color: '#f8fafc',
    fontSize: 64,
    fontWeight: 900,
    lineHeight: 70,
    maxLines: 1,
  })
  setFont(ctx, 32, 900)
  ctx.fillStyle = '#fbbf24'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('VS', POSTER_WIDTH / 2, matchY + 76)
  drawWrappedText(ctx, awayTeam || matchName, POSTER_WIDTH / 2, matchY + 124, 870, {
    align: 'center',
    color: '#f8fafc',
    fontSize: 64,
    fontWeight: 900,
    lineHeight: 70,
    maxLines: 1,
  })

  const directionY = 456
  const directionGradient = ctx.createLinearGradient(72, directionY, 1008, directionY + 210)
  directionGradient.addColorStop(0, 'rgba(45, 212, 191, 0.22)')
  directionGradient.addColorStop(0.58, 'rgba(15, 23, 42, 0.86)')
  directionGradient.addColorStop(1, 'rgba(245, 158, 11, 0.16)')
  fillRoundedRect(ctx, 72, directionY, 936, 220, 40, directionGradient)
  strokeRoundedRect(ctx, 72, directionY, 936, 220, 40, 'rgba(45, 212, 191, 0.32)')

  setFont(ctx, 28, 900)
  ctx.fillStyle = '#a7f3d0'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('主方向', 116, directionY + 35)
  drawWrappedText(ctx, mainDirectionText, 116, directionY + 84, 820, {
    color: '#f8fafc',
    fontSize: 78,
    fontWeight: 900,
    lineHeight: 86,
    maxLines: 1,
  })

  const defenseText = safeShareText(payload.defenseDirectionText, '')
  if (defenseText) {
    setFont(ctx, 25, 900)
    ctx.fillStyle = '#cbd5e1'
    ctx.fillText(`防范方向：${defenseText}`, 118, directionY + 174, 760)
  }

  drawInfoTile(ctx, 72, 724, 288, 148, '主推比分', primaryScoreText, '#f8fafc')
  drawInfoTile(ctx, 396, 724, 288, 148, '辅推比分', secondaryScoreText, '#cbd5e1')
  drawInfoTile(ctx, 720, 724, 288, 148, '进球方向', goalsDirectionText, '#5eead4')

  drawRatingBlock(ctx, payload)

  fillRoundedRect(ctx, 72, 1068, 936, 84, 28, 'rgba(15, 23, 42, 0.72)')
  strokeRoundedRect(ctx, 72, 1068, 936, 84, 28, 'rgba(148, 163, 184, 0.14)')
  setFont(ctx, 26, 900)
  ctx.fillStyle = '#cbd5e1'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const formationText = safeShareText(payload.formationText, '')
  const lineupText = formationText
    ? `首发状态：${lineupStatusText}｜阵型：${formationText}`
    : `首发状态：${lineupStatusText}`
  ctx.fillText(lineupText, 110, 1110, 860)

  fillRoundedRect(ctx, 72, 1180, 936, 112, 30, 'rgba(45, 212, 191, 0.08)')
  strokeRoundedRect(ctx, 72, 1180, 936, 112, 30, 'rgba(45, 212, 191, 0.18)')
  setFont(ctx, 23, 900)
  ctx.fillStyle = '#5eead4'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('简要判断', 110, 1204)
  drawWrappedText(ctx, summaryText, 110, 1238, 860, {
    color: '#e2e8f0',
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 38,
    maxLines: 2,
  })

  ctx.globalAlpha = 0.9
  drawWrappedText(ctx, `风险提示：${SHARE_RISK_NOTE}`, 72, 1304, 936, {
    color: '#94a3b8',
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 26,
    maxLines: 1,
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
