import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { generateTtsAudio } from './generate-tts-audio.mjs'
import { writeSubtitleAss } from './generate-v3-scenes.mjs'
import { writeV5VoiceoverFiles } from './generate-v5-voiceover.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(projectRoot, '..')
const videoFactoryPath = path.join(workspaceRoot, 'video-factory')
const videoFactoryOutputDir = path.join(videoFactoryPath, 'output')
const videoFactoryV5FinalPath = path.join(videoFactoryOutputDir, 'final_douyin_v5.mp4')
const desktopOutputRoot = path.join(path.resolve(workspaceRoot, '..'), '世界杯短视频输出')
const exportScriptPath = path.join(__dirname, 'export-video-package.mjs')
const exportReportPath = path.join(__dirname, 'video-package-export-report.json')
const recordScriptPath = path.join(__dirname, 'record-capture-page.mjs')
const v5ReportPath = path.join(__dirname, 'douyin-video-v5-report.json')
const packageDir = path.join(videoFactoryPath, 'input', 'package')
const packageMetaPath = path.join(packageDir, 'meta.json')
const previewSpecs = [
  { fileName: 'preview_01.jpg', time: () => 1 },
  { fileName: 'preview_03.jpg', time: () => 3 },
  { fileName: 'preview_mid.jpg', time: (duration) => duration / 2 },
  { fileName: 'preview_end.jpg', time: (duration) => Math.max(duration - 2, 0) },
]

function parseArgs(argv) {
  const options = {
    captureMatchTerm: '',
    customScriptPath: '',
    exportArgs: [],
    style: 'sharp',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  node .\\scripts\\build-douyin-video-v5.mjs --match "葡萄牙"',
          '  node .\\scripts\\build-douyin-video-v5.mjs --match "葡萄牙" --style sharp',
          '  node .\\scripts\\build-douyin-video-v5.mjs --match "葡萄牙" --script ".\\scripts\\voiceover-custom.txt"',
        ].join('\n'),
      )
      process.exit(0)
    }

    if (arg === '--match') {
      const value = String(argv[index + 1] ?? '').trim()
      if (!value) throw new Error('--match 需要一个比赛关键词。')
      options.captureMatchTerm = value
      options.exportArgs.push('--match', value)
      index += 1
      continue
    }

    if (arg.startsWith('--match=')) {
      const value = arg.slice('--match='.length).trim()
      if (!value) throw new Error('--match 需要一个比赛关键词。')
      options.captureMatchTerm = value
      options.exportArgs.push('--match', value)
      continue
    }

    if (arg === '--index') {
      const value = String(argv[index + 1] ?? '').trim()
      if (!/^\d+$/.test(value)) throw new Error('--index 必须是非负整数。')
      options.exportArgs.push('--index', value)
      index += 1
      continue
    }

    if (arg.startsWith('--index=')) {
      const value = arg.slice('--index='.length).trim()
      if (!/^\d+$/.test(value)) throw new Error('--index 必须是非负整数。')
      options.exportArgs.push('--index', value)
      continue
    }

    if (arg === '--script') {
      options.customScriptPath = path.resolve(projectRoot, String(argv[index + 1] ?? '').trim())
      index += 1
      continue
    }

    if (arg.startsWith('--script=')) {
      options.customScriptPath = path.resolve(projectRoot, arg.slice('--script='.length).trim())
      continue
    }

    if (arg === '--style') {
      options.style = String(argv[index + 1] ?? '').trim().toLowerCase() || 'sharp'
      index += 1
      continue
    }

    if (arg.startsWith('--style=')) {
      options.style = arg.slice('--style='.length).trim().toLowerCase() || 'sharp'
      continue
    }

    throw new Error(`无法识别参数：${arg}`)
  }

  return options
}

function quoteArg(value) {
  return /\s|"/.test(value) ? `"${String(value).replace(/"/g, '\\"')}"` : String(value)
}

function commandText(argv) {
  return argv.map(quoteArg).join(' ')
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function fileInfo(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return {
      exists: false,
      lastModifiedAt: null,
      path: filePath,
      sizeBytes: 0,
    }
  }

  const stats = statSync(filePath)
  return {
    exists: true,
    lastModifiedAt: stats.mtime.toISOString(),
    path: filePath,
    sizeBytes: stats.size,
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
    stdio: options.stdio ?? 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    throw new Error(
      `${commandText([command, ...args])} 运行失败，退出码 ${result.status}${
        detail ? `\n${detail}` : ''
      }`,
    )
  }
  return result
}

function runCapture(command, args, options = {}) {
  return runCommand(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).stdout
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatLocalTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    '-',
    pad2(date.getMonth() + 1),
    '-',
    pad2(date.getDate()),
    '_',
    pad2(date.getHours()),
    '-',
    pad2(date.getMinutes()),
  ].join('')
}

function sanitizeFileName(value, fallback = '未命名比赛') {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/\s+vs\s+/gi, '_vs_')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return cleaned || fallback
}

function uniqueDirectory(baseDir) {
  if (!existsSync(baseDir)) return baseDir
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseDir}_${pad2(index)}`
    if (!existsSync(candidate)) return candidate
  }
  throw new Error(`无法创建唯一输出目录：${baseDir}`)
}

function parseRate(value) {
  const text = String(value ?? '').trim()
  if (!text || text === '0/0') return null
  if (text.includes('/')) {
    const [left, right] = text.split('/').map(Number)
    if (!left || !right) return text
    const rate = left / right
    return Number.isInteger(rate) ? String(rate) : rate.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  }
  return text
}

function probeVideo(filePath) {
  const output = runCapture(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration,size',
      '-show_streams',
      '-of',
      'json',
      filePath,
    ],
    { cwd: projectRoot },
  )
  const data = JSON.parse(output)
  const videoStream = data.streams?.find((stream) => stream.codec_type === 'video')
  const audioStream = data.streams?.find((stream) => stream.codec_type === 'audio')

  return {
    audioCodec: audioStream?.codec_name ?? null,
    durationSeconds: Number(data.format?.duration ?? 0),
    frameRate: parseRate(videoStream?.avg_frame_rate) ?? parseRate(videoStream?.r_frame_rate),
    hasAudio: Boolean(audioStream),
    height: videoStream?.height ?? null,
    sizeBytes: Number(data.format?.size ?? fileInfo(filePath).sizeBytes),
    videoCodec: videoStream?.codec_name ?? null,
    width: videoStream?.width ?? null,
  }
}

function createDesktopOutputDir(matchName) {
  const safeMatchName = sanitizeFileName(matchName)
  const dir = uniqueDirectory(
    path.join(desktopOutputRoot, `${formatLocalTimestamp()}_${safeMatchName}_v5_capture`),
  )
  mkdirSync(dir, { recursive: true })
  return {
    desktopOutputDir: dir,
    safeMatchName,
  }
}

function buildCaptureUrl(matchTerm) {
  const params = new URLSearchParams({
    capture: '1',
    match: matchTerm,
  })
  return `http://127.0.0.1:5173/?${params.toString()}`
}

function renderFinalVideo({
  captureRawPath,
  desktopOutputDir,
  desktopVideoPath,
  hasVoice,
  subtitlePath,
  targetDuration,
  voiceAudioPath,
}) {
  const inputs = hasVoice
    ? ['-i', voiceAudioPath]
    : ['-f', 'lavfi', '-t', targetDuration.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100']

  runCommand(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      captureRawPath,
      ...inputs,
      '-vf',
      `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,ass=${path.basename(subtitlePath)},format=yuv420p`,
      '-af',
      'apad',
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-shortest',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-crf',
      '20',
      '-preset',
      'medium',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      desktopVideoPath,
    ],
    { cwd: desktopOutputDir, stdio: ['ignore', 'pipe', 'pipe'] },
  )
}

function refreshPreviewFiles({ durationSeconds, outputDir, videoPath }) {
  const updatedAt = new Date().toISOString()
  const files = {}
  for (const preview of previewSpecs) {
    const seconds = Math.min(
      Math.max(preview.time(durationSeconds), 0),
      Math.max(durationSeconds - 0.05, 0),
    )
    const outputPath = path.join(outputDir, preview.fileName)
    runCommand(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        seconds.toFixed(3),
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        outputPath,
      ],
      { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    files[preview.fileName] = fileInfo(outputPath)
  }
  const video = fileInfo(videoPath)
  const videoMtime = statSync(video.path).mtimeMs
  const updated = Object.values(files).every(
    (item) => item.exists && item.sizeBytes > 0 && statSync(item.path).mtimeMs >= videoMtime,
  )
  return { files, updated, updatedAt }
}

function writeQualityReport({
  captureResult,
  desktopOutputDir,
  exportReport,
  finalVideoInfo,
  meta,
  previewStatus,
  ttsResult,
  voiceover,
}) {
  const reportPath = path.join(desktopOutputDir, 'quality_report.txt')
  const previewLines = previewSpecs.map((preview) => {
    const info = previewStatus.files[preview.fileName]
    return `${preview.fileName}: ${info.exists ? 'generated' : 'missing'}, ${info.sizeBytes} bytes, updated_at=${info.lastModifiedAt ?? 'null'}`
  })
  const lines = [
    'douyin v5 capture quality report',
    `generated_at=${new Date().toISOString()}`,
    '',
    'render_mode=v5_capture',
    `selected_match=${meta.match_name}`,
    `capture_url=${captureResult.url}`,
    `capture_mode_enabled=${captureResult.captureModeEnabled ? 'true' : 'false'}`,
    `scene_flow_detected=${captureResult.sceneFlowDetected ? 'true' : 'false'}`,
    `auto_scroll_detected=${captureResult.autoScrollDetected ? 'true' : 'false'}`,
    `capture_looks_dynamic=${captureResult.captureLooksDynamic ? 'true' : 'false'}`,
    `voiceover_source=${voiceover.voiceoverSource}`,
    `voiceover_style=${voiceover.style}`,
    `voiceover_char_count=${voiceover.voiceoverCharCount}`,
    `estimated_voiceover_seconds=${voiceover.estimatedVoiceoverSeconds}`,
    'preview_source_video=desktop_v5_mp4',
    `preview_updated_at=${previewStatus.updatedAt}`,
    `preview_files_updated=${previewStatus.updated ? 'true' : 'false'}`,
    '',
    `capture_duration_seconds=${captureResult.captureDurationSeconds}`,
    `video_duration_seconds=${finalVideoInfo.durationSeconds}`,
    `resolution=${finalVideoInfo.width}x${finalVideoInfo.height}`,
    `frame_rate=${finalVideoInfo.frameRate}`,
    `video_codec=${finalVideoInfo.videoCodec}`,
    `audio_codec=${finalVideoInfo.audioCodec ?? 'none'}`,
    `has_audio=${finalVideoInfo.hasAudio ? 'yes' : 'no'}`,
    `tts_enabled=${ttsResult?.ttsEnabled ? 'true' : 'false'}`,
    `tts_engine=${ttsResult?.ttsEngine ?? 'fallback'}`,
    `tts_voice=${ttsResult?.voice ?? 'none'}`,
    '',
    'meta:',
    ...Object.entries(meta).map(([key, value]) => `${key}: ${value}`),
    '',
    'export:',
    `selectedMatchId=${exportReport?.selectedMatchId ?? 'unknown'}`,
    `matchKey=${exportReport?.matchKey ?? 'unknown'}`,
    `usedFallback=${exportReport?.usedFallback ?? 'unknown'}`,
    '',
    'preview_images:',
    ...previewLines,
    '',
    'obvious_anomalies:',
    previewStatus.updated
      ? 'No blocking technical anomaly found. V5 previews were regenerated from the current desktop mp4.'
      : 'warning: Preview images were not confirmed as regenerated.',
    '',
  ]
  writeFileSync(reportPath, lines.join('\n'), 'utf8')
  return reportPath
}

function scoreItem(pass, points) {
  return pass ? points : 0
}

function evaluateV5({
  captureResult,
  captureVideoInfo,
  exportReport,
  finalVideoInfo,
  meta,
  previewStatus,
  subtitlePath,
  ttsResult,
  voiceAudioPath,
}) {
  const captureAvailable = Boolean(captureResult.captureModeEnabled)
  const captureRecorded = Boolean(captureVideoInfo.durationSeconds >= 20 && existsSync(captureResult.captureVideoPath))
  const aiModelFeeling = Boolean(
    captureResult.sceneFlowDetected &&
      captureResult.autoScrollDetected &&
      captureResult.captureLooksDynamic,
  )
  const hasVoice = Boolean(ttsResult?.ttsEnabled && existsSync(voiceAudioPath) && fileInfo(voiceAudioPath).sizeBytes > 0)
  const hasSubtitles = Boolean(existsSync(subtitlePath) && fileInfo(subtitlePath).sizeBytes > 0)
  const coreInfoClear = Boolean(
    meta.match_name && meta.main_pick && meta.score_1 && meta.score_2 && meta.total_goals,
  )
  const riskNoteClear = Boolean(meta.risk_note)
  const durationOk = finalVideoInfo.durationSeconds >= 20 && finalVideoInfo.durationSeconds <= 35
  const noObviousTechnicalIssue = Boolean(
    finalVideoInfo.width === 1080 &&
      finalVideoInfo.height === 1920 &&
      finalVideoInfo.videoCodec &&
      previewStatus.updated &&
      finalVideoInfo.sizeBytes > 500_000,
  )
  const breakdown = {
    capturePageAvailable: scoreItem(captureAvailable, 15),
    captureRecorded: scoreItem(captureRecorded, 15),
    aiModelFeeling: scoreItem(aiModelFeeling, 15),
    hasVoice: scoreItem(hasVoice, 15),
    hasSubtitles: scoreItem(hasSubtitles, 10),
    coreInfoClear: scoreItem(coreInfoClear, 15),
    riskNoteClear: scoreItem(riskNoteClear, 5),
    duration20To35Seconds: scoreItem(durationOk, 5),
    noObviousTechnicalIssue: scoreItem(noObviousTechnicalIssue, 5),
  }
  const contentScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0)
  const warnings = []
  if (!captureAvailable) warnings.push('capture 页面未确认启用。')
  if (!captureRecorded) warnings.push('自动录屏未达到 20 秒。')
  if (!aiModelFeeling) warnings.push('capture 页面动态感检测不足。')
  if (!hasVoice) warnings.push('TTS 配音未成功生成。')
  if (!hasSubtitles) warnings.push('字幕文件缺失。')
  if (!durationOk) warnings.push(`视频时长 ${finalVideoInfo.durationSeconds.toFixed(2)} 秒不在 20~35 秒目标区间。`)
  if (!previewStatus.updated) warnings.push('preview 图未确认从当前 v5 mp4 刷新。')
  if (exportReport?.usedFallback !== false) warnings.push('export usedFallback 不是 false。')
  const publishReadiness = contentScore >= 85 ? 'ready' : contentScore >= 70 ? 'review' : 'blocked'

  return {
    contentScore,
    contentScoreBreakdown: breakdown,
    hasBurnedSubtitles: hasSubtitles,
    hasVoice,
    publishReadiness,
    warnings,
  }
}

function writeV5Report(report) {
  writeFileSync(v5ReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

function buildCopiedFiles(paths) {
  return paths.map((filePath) => ({
    fileName: path.basename(filePath),
    path: filePath,
    sizeBytes: fileInfo(filePath).sizeBytes,
  }))
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const command = commandText(['node', '.\\scripts\\build-douyin-video-v5.mjs', ...process.argv.slice(2)])

  if (!existsSync(videoFactoryPath)) {
    throw new Error(`找不到 video-factory 目录：${videoFactoryPath}`)
  }

  mkdirSync(videoFactoryOutputDir, { recursive: true })
  runCommand(process.execPath, [exportScriptPath, ...options.exportArgs], { cwd: projectRoot })

  const exportReport = readJson(exportReportPath, {})
  const meta = readJson(packageMetaPath, {})
  const selectedMatchName = exportReport?.selectedMatchName ?? meta.match_name ?? '未命名比赛'
  const captureMatchTerm = options.captureMatchTerm || selectedMatchName
  const captureUrl = buildCaptureUrl(captureMatchTerm)
  const { desktopOutputDir, safeMatchName } = createDesktopOutputDir(selectedMatchName)
  const desktopVideoPath = path.join(desktopOutputDir, `${safeMatchName}_v5.mp4`)
  const captureRawPath = path.join(desktopOutputDir, 'capture_raw.mp4')
  const voiceoverPath = path.join(desktopOutputDir, 'voiceover.txt')
  const voiceAudioPath = path.join(desktopOutputDir, 'voice.mp3')
  const subtitlePath = path.join(desktopOutputDir, 'subtitles.ass')
  const copyTextPath = path.join(desktopOutputDir, 'copy.txt')

  const captureOutput = runCapture(process.execPath, [
    recordScriptPath,
    '--url',
    captureUrl,
    '--output',
    captureRawPath,
    '--duration',
    '30',
  ])
  const captureResult = JSON.parse(captureOutput)
  const captureVideoInfo = probeVideo(captureRawPath)

  const voiceover = writeV5VoiceoverFiles({
    copyPath: copyTextPath,
    customScriptPath: options.customScriptPath,
    metaPath: packageMetaPath,
    outputPath: voiceoverPath,
    style: options.style,
  })

  let ttsResult = null
  let ttsError = null
  try {
    ttsResult = generateTtsAudio({
      outputPath: voiceAudioPath,
      textPath: voiceoverPath,
      voice: 'zh-CN-XiaoxiaoNeural',
    })
  } catch (error) {
    ttsError = error?.message ?? String(error)
  }

  writeSubtitleAss({
    durationSeconds: captureVideoInfo.durationSeconds || 30,
    outputPath: subtitlePath,
    voiceoverText: voiceover.voiceoverText,
  })

  renderFinalVideo({
    captureRawPath,
    desktopOutputDir,
    desktopVideoPath,
    hasVoice: Boolean(ttsResult?.ttsEnabled),
    subtitlePath,
    targetDuration: captureVideoInfo.durationSeconds || 30,
    voiceAudioPath,
  })
  copyFileSync(desktopVideoPath, videoFactoryV5FinalPath)

  const finalVideoInfo = probeVideo(desktopVideoPath)
  const previewStatus = refreshPreviewFiles({
    durationSeconds: finalVideoInfo.durationSeconds,
    outputDir: desktopOutputDir,
    videoPath: desktopVideoPath,
  })
  const qualityReportPath = writeQualityReport({
    captureResult,
    desktopOutputDir,
    exportReport,
    finalVideoInfo,
    meta,
    previewStatus,
    ttsResult,
    voiceover,
  })
  const quality = evaluateV5({
    captureResult,
    captureVideoInfo,
    exportReport,
    finalVideoInfo,
    meta,
    previewStatus,
    subtitlePath,
    ttsResult,
    voiceAudioPath,
  })

  const desktopReportPath = path.join(desktopOutputDir, 'douyin-video-v5-report.json')
  const requiredDesktopFiles = [
    desktopVideoPath,
    captureRawPath,
    voiceoverPath,
    subtitlePath,
    copyTextPath,
    qualityReportPath,
    ...previewSpecs.map((preview) => path.join(desktopOutputDir, preview.fileName)),
  ]
  if (ttsResult?.ttsEnabled) requiredDesktopFiles.push(voiceAudioPath)
  const copiedToDesktop = requiredDesktopFiles.every((filePath) => fileInfo(filePath).exists)
  const warnings = [
    ...quality.warnings,
    ...(ttsError ? [`TTS 失败：${ttsError}`] : []),
    ...(voiceover.warnings ?? []),
  ]
  const ok =
    copiedToDesktop &&
    fileInfo(desktopVideoPath).exists &&
    fileInfo(videoFactoryV5FinalPath).exists &&
    quality.publishReadiness !== 'blocked'

  const report = {
    autoScrollDetected: captureResult.autoScrollDetected,
    builtAt: new Date().toISOString(),
    captureDurationSeconds: captureResult.captureDurationSeconds,
    captureLooksDynamic: captureResult.captureLooksDynamic,
    captureModeEnabled: captureResult.captureModeEnabled,
    captureUrl,
    captureVideoPath: captureRawPath,
    command,
    contentScore: quality.contentScore,
    contentScoreBreakdown: quality.contentScoreBreakdown,
    copiedFiles: buildCopiedFiles(requiredDesktopFiles),
    copiedToDesktop,
    customScriptPath: options.customScriptPath || null,
    desktopOutputDir,
    desktopVideoPath,
    finalVideoPath: videoFactoryV5FinalPath,
    finalVideoSizeBytes: fileInfo(videoFactoryV5FinalPath).sizeBytes,
    hasAudio: finalVideoInfo.hasAudio,
    hasBurnedSubtitles: quality.hasBurnedSubtitles,
    matchKey: exportReport?.matchKey ?? null,
    ok,
    previewFiles: previewStatus.files,
    previewFilesUpdated: previewStatus.updated,
    publishReadiness: quality.publishReadiness,
    qualityReportPath,
    sceneFlowDetected: captureResult.sceneFlowDetected,
    selectedMatchId: exportReport?.selectedMatchId ?? null,
    selectedMatchName,
    subtitlePath,
    ttsEnabled: Boolean(ttsResult?.ttsEnabled),
    ttsEngine: ttsResult?.ttsEngine ?? 'fallback',
    ttsError,
    ttsVoice: ttsResult?.voice ?? 'zh-CN-XiaoxiaoNeural',
    usedFallback: exportReport?.usedFallback ?? null,
    videoDurationSeconds: finalVideoInfo.durationSeconds,
    videoInfo: finalVideoInfo,
    voiceAudioPath: ttsResult?.ttsEnabled ? voiceAudioPath : null,
    voiceoverCharCount: voiceover.voiceoverCharCount,
    voiceoverPath,
    voiceoverSource: voiceover.voiceoverSource,
    voiceoverStyle: voiceover.style,
    estimatedVoiceoverSeconds: voiceover.estimatedVoiceoverSeconds,
    warnings,
  }

  writeV5Report(report)
  copyFileSync(v5ReportPath, desktopReportPath)
  report.copiedFiles.push({
    fileName: 'douyin-video-v5-report.json',
    path: desktopReportPath,
    sizeBytes: fileInfo(desktopReportPath).sizeBytes,
  })
  writeV5Report(report)
  copyFileSync(v5ReportPath, desktopReportPath)

  console.log(
    JSON.stringify(
      {
        captureModeEnabled: report.captureModeEnabled,
        contentScore: report.contentScore,
        desktopOutputDir: report.desktopOutputDir,
        desktopVideoPath: report.desktopVideoPath,
        ok: report.ok,
        publishReadiness: report.publishReadiness,
        selectedMatchName: report.selectedMatchName,
        ttsEnabled: report.ttsEnabled,
        usedFallback: report.usedFallback,
        videoDurationSeconds: report.videoDurationSeconds,
        voiceoverSource: report.voiceoverSource,
      },
      null,
      2,
    ),
  )
  console.log(
    [
      'v5 网站录屏视频已生成：',
      report.desktopVideoPath,
      `capture 页面：${report.captureModeEnabled ? '已启用' : '未确认'}`,
      `录屏动态：${report.captureLooksDynamic ? '已检测' : '不足'}`,
      `配音：${report.ttsEnabled ? report.ttsVoice : '失败'}`,
      `字幕：${report.hasBurnedSubtitles ? '已烧录' : '未确认'}`,
      `是否建议发布：${report.publishReadiness}`,
    ].join('\n'),
  )

  if (!report.ok) process.exit(1)
}

try {
  main()
} catch (error) {
  const fallbackReport = {
    builtAt: new Date().toISOString(),
    command: commandText(['node', '.\\scripts\\build-douyin-video-v5.mjs', ...process.argv.slice(2)]),
    ok: false,
    publishReadiness: 'blocked',
    warnings: [error?.message ?? String(error)],
  }
  writeV5Report(fallbackReport)
  console.error(error?.message ?? error)
  process.exit(1)
}
