function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function toScore(value) {
  const score = Number(value)
  if (!Number.isFinite(score)) return 0
  return clamp(Math.round(score), 0, 100)
}

function scaleRange(rawScore, rawMin, rawMax, displayMin, displayMax) {
  if (rawMax <= rawMin) return displayMin

  const ratio = (rawScore - rawMin) / (rawMax - rawMin)
  return Math.round(displayMin + ratio * (displayMax - displayMin))
}

export function getDisplayConfidence(rawScore) {
  const score = toScore(rawScore)

  if (score < 50) return clamp(score + 5, 0, 58)
  if (score <= 54) return scaleRange(score, 50, 54, 60, 64)
  if (score <= 59) return scaleRange(score, 55, 59, 65, 69)
  if (score <= 64) return scaleRange(score, 60, 64, 70, 74)
  if (score <= 69) return scaleRange(score, 65, 69, 75, 80)
  if (score <= 74) return scaleRange(score, 70, 74, 81, 86)

  return clamp(scaleRange(score, 75, 84, 87, 92), 87, 92)
}

export function getDisplayConfidenceTier(displayConfidence) {
  const score = toScore(displayConfidence)

  if (score >= 80) return { label: '重点关注', tone: 'low' }
  if (score >= 70) return { label: '稳健参考', tone: 'low' }
  if (score >= 60) return { label: '轻仓娱乐', tone: 'medium' }
  return { label: '谨慎观望', tone: 'none' }
}
