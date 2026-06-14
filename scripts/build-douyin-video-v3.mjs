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
import { generateV3Scenes } from './generate-v3-scenes.mjs'
import { writeVoiceoverFiles } from './generate-voiceover-script.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(projectRoot, '..')
const videoFactoryPath = path.join(workspaceRoot, 'video-factory')
const videoFactoryOutputDir = path.join(videoFactoryPath, 'output')
const videoFactoryV3FinalPath = path.join(videoFactoryOutputDir, 'final_douyin_v3.mp4')
const v3WorkRoot = path.join(videoFactoryOutputDir, 'v3_work')
const desktopOutputRoot = path.join(path.resolve(workspaceRoot, '..'), '世界杯短视频输出')
const exportScriptPath = path.join(__dirname, 'export-video-package.mjs')
const exportReportPath = path.join(__dirname, 'video-package-export-report.json')
const v3ReportPath = path.join(__dirname, 'douyin-video-v3-report.json')
const packageDir = path.join(videoFactoryPath, 'input', 'package')
const packageMetaPath = path.join(packageDir, 'meta.json')
const previewSpecs = [
  { fileName: 'preview_01.jpg', label: '1s', time: (duration) => 1 },
  { fileName: 'preview_03.jpg', label: '3s', time: (duration) => 3 },
  { fileName: 'preview_mid.jpg', label: 'mid', time: (duration) => duration / 2 },
  {
    fileName: 'preview_end.jpg',
    label: 'end_minus_2s',
    time: (duration) => Math.max(duration - 2, 0),
  },
]

function parseArgs(argv) {
  const options = {
    exportArgs: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  node .\\scripts\\build-douyin-video-v3.mjs --match "葡萄牙"',
          '  node .\\scripts\\build-douyin-video-v3.mjs --index 0',
        ].join('\n'),
      )
      process.exit(0)
    }

    if (arg === '--match') {
      const value = String(argv[index + 1] ?? '').trim()
      if (!value) throw new Error('--match 需要一个比赛关键词。')
      options.exportArgs.push('--match', value)
      index += 1
      continue
    }

    if (arg.startsWith('--match=')) {
      const value = arg.slice('--match='.length).trim()
      if (!value) throw new Error('--match 需要一个比赛关键词。')
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

function targetDurationFromAudio(ttsResult) {
  const audioDuration = Number(ttsResult?.durationSeconds ?? 0)
  if (!audioDuration) return 20
  return Math.min(Math.max(audioDuration + 0.45, 15), 25)
}

function createDesktopOutputDir(matchName) {
  const safeMatchName = sanitizeFileName(matchName)
  const dir = uniqueDirectory(
    path.join(desktopOutputRoot, `${formatLocalTimestamp()}_${safeMatchName}_v3_voice`),
  )
  mkdirSync(dir, { recursive: true })
  return {
    desktopOutputDir: dir,
    safeMatchName,
  }
}

function createAnimatedSceneSegment({ duration, index, sceneFile, segmentPath }) {
  const frames = Math.max(Math.round(duration * 30), 30)
  const fadeOutStart = Math.max(duration - 0.28, 0)
  const zoomSpeed = index % 2 === 0 ? '0.00075' : '0.00095'
  const scanSpeed = index % 2 === 0 ? 235 : 280
  const filter = [
    `zoompan=z='min(zoom+${zoomSpeed},1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30`,
    `drawbox=x=0:y='mod(t*${scanSpeed}\\,1920)':w=iw:h=8:color=0x5eead455:t=fill`,
    `drawbox=x='mod(t*180\\,1080)':y=0:w=5:h=ih:color=0xfacc1538:t=fill`,
    'fade=t=in:st=0:d=0.22',
    `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.24`,
    'format=yuv420p',
  ].join(',')

  runCommand(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-loop',
      '1',
      '-i',
      sceneFile,
      '-vf',
      filter,
      '-frames:v',
      String(frames),
      '-an',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      segmentPath,
    ],
    { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] },
  )
}

function writeConcatFile({ concatPath, segmentFiles }) {
  const lines = segmentFiles.map((filePath) => {
    const normalized = filePath.replace(/\\/g, '/').replace(/'/g, "'\\''")
    return `file '${normalized}'`
  })
  writeFileSync(concatPath, `${lines.join('\n')}\n`, 'utf8')
}

function concatSegments({ concatPath, outputPath }) {
  runCommand(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatPath,
      '-c',
      'copy',
      outputPath,
    ],
    { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] },
  )
}

function renderFinalVideo({
  desktopOutputDir,
  desktopVideoPath,
  hasVoice,
  subtitlePath,
  targetDuration,
  voiceAudioPath,
  visualPath,
}) {
  const common = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    visualPath,
  ]
  const inputs = hasVoice
    ? ['-i', voiceAudioPath]
    : ['-f', 'lavfi', '-t', targetDuration.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100']

  runCommand(
    'ffmpeg',
    [
      ...common,
      ...inputs,
      '-vf',
      `ass=${path.basename(subtitlePath)}`,
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
  const updated = Object.values(files).every(
    (item) => item.exists && item.sizeBytes > 0 && statSync(item.path).mtimeMs >= statSync(video.path).mtimeMs,
  )

  return {
    files,
    updated,
    updatedAt,
  }
}

function writeQualityReport({
  desktopOutputDir,
  exportReport,
  finalVideoInfo,
  meta,
  previewStatus,
  sceneResult,
  ttsResult,
}) {
  const reportPath = path.join(desktopOutputDir, 'quality_report.txt')
  const previewLines = previewSpecs.map((preview) => {
    const info = previewStatus.files[preview.fileName]
    return `${preview.fileName}: ${info.exists ? 'generated' : 'missing'}, ${info.sizeBytes} bytes, updated_at=${info.lastModifiedAt ?? 'null'}`
  })
  const lines = [
    'douyin v3 voice quality report',
    `generated_at=${new Date().toISOString()}`,
    '',
    'render_mode=v3_voice',
    `selected_match=${meta.match_name}`,
    'preview_source_video=desktop_v3_mp4',
    `preview_updated_at=${previewStatus.updatedAt}`,
    `preview_files_updated=${previewStatus.updated ? 'true' : 'false'}`,
    `scene_count=${sceneResult.sceneCount}`,
    `scene_files=${sceneResult.sceneFiles.map((item) => path.basename(item)).join(', ')}`,
    '',
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
      ? 'No blocking technical anomaly found. V3 previews were regenerated from the current desktop mp4.'
      : 'warning: Preview images were not confirmed as regenerated.',
    '',
  ]
  writeFileSync(reportPath, lines.join('\n'), 'utf8')
  return reportPath
}

function scoreItem(pass, points) {
  return pass ? points : 0
}

function evaluateV3({
  exportReport,
  finalVideoInfo,
  meta,
  previewStatus,
  sceneResult,
  subtitlePath,
  ttsResult,
  voiceAudioPath,
}) {
  const hasVoice = Boolean(ttsResult?.ttsEnabled && existsSync(voiceAudioPath) && fileInfo(voiceAudioPath).sizeBytes > 0)
  const hasSubtitles = Boolean(existsSync(subtitlePath) && fileInfo(subtitlePath).sizeBytes > 0)
  const durationOk = finalVideoInfo.durationSeconds >= 15 && finalVideoInfo.durationSeconds <= 25
  const usedFallbackFalse = exportReport?.usedFallback === false
  const notStaticSingleImage = sceneResult.sceneCount >= 5
  const breakdown = {
    hasVoice: scoreItem(hasVoice, 20),
    hasSubtitles: scoreItem(hasSubtitles, 15),
    duration15To25Seconds: scoreItem(durationOk, 10),
    matchNameClear: scoreItem(Boolean(meta.match_name), 10),
    mainPickClear: scoreItem(Boolean(meta.main_pick), 10),
    scoresClear: scoreItem(Boolean(meta.score_1 && meta.score_2), 10),
    totalGoalsClear: scoreItem(Boolean(meta.total_goals), 5),
    riskNoteClear: scoreItem(Boolean(meta.risk_note), 5),
    notStaticSingleImage: scoreItem(notStaticSingleImage, 10),
    usedFallbackFalse: scoreItem(usedFallbackFalse, 5),
  }
  const contentScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0)
  const warnings = []
  if (!hasVoice) warnings.push('TTS 配音未成功生成，v3 不能标 ready。')
  if (!hasSubtitles) warnings.push('字幕文件缺失。')
  if (!durationOk) warnings.push(`视频时长 ${finalVideoInfo.durationSeconds.toFixed(2)} 秒不在 15~25 秒目标区间。`)
  if (!previewStatus.updated) warnings.push('preview 图未确认从当前 v3 mp4 刷新。')
  if (!usedFallbackFalse) warnings.push('usedFallback 不是 false。')
  if (!notStaticSingleImage) warnings.push('scene 数量不足 5。')
  if (ttsResult?.warning) warnings.push(ttsResult.warning)

  const publishReadiness =
    !hasVoice || contentScore < 70
      ? 'blocked'
      : contentScore >= 85 && hasSubtitles
        ? 'ready'
        : 'review'

  return {
    contentScore,
    contentScoreBreakdown: breakdown,
    hasBurnedSubtitles: hasSubtitles,
    hasVoice,
    publishReadiness,
    warnings,
  }
}

function writeV3Report(report) {
  writeFileSync(v3ReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
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
  const command = commandText(['node', '.\\scripts\\build-douyin-video-v3.mjs', ...process.argv.slice(2)])

  if (!existsSync(videoFactoryPath)) {
    throw new Error(`找不到 video-factory 目录：${videoFactoryPath}`)
  }

  mkdirSync(videoFactoryOutputDir, { recursive: true })
  runCommand(process.execPath, [exportScriptPath, ...options.exportArgs], { cwd: projectRoot })

  const exportReport = readJson(exportReportPath, {})
  const meta = readJson(packageMetaPath, {})
  const selectedMatchName = exportReport?.selectedMatchName ?? meta.match_name ?? '未命名比赛'
  const { desktopOutputDir, safeMatchName } = createDesktopOutputDir(selectedMatchName)
  const workDir = path.join(v3WorkRoot, `${formatLocalTimestamp()}_${safeMatchName}_v3_voice`)
  mkdirSync(workDir, { recursive: true })

  const voiceoverPath = path.join(desktopOutputDir, 'voiceover.txt')
  const voiceAudioPath = path.join(desktopOutputDir, 'voice.mp3')
  const subtitlePath = path.join(desktopOutputDir, 'subtitles.ass')
  const copyTextPath = path.join(desktopOutputDir, 'copy.txt')
  const desktopVideoPath = path.join(desktopOutputDir, `${safeMatchName}_v3.mp4`)

  const voiceover = writeVoiceoverFiles({
    copyPath: copyTextPath,
    metaPath: packageMetaPath,
    outputPath: voiceoverPath,
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

  const targetDuration = targetDurationFromAudio(ttsResult)
  const sceneResult = generateV3Scenes({
    durationSeconds: targetDuration,
    exportReportPath,
    metaPath: packageMetaPath,
    outputDir: workDir,
    subtitlePath,
    voiceoverPath,
  })

  const segmentFiles = []
  for (const scene of sceneResult.scenes) {
    const sceneFile = path.join(workDir, scene.fileName)
    const segmentPath = path.join(workDir, `segment_${pad2(scene.index)}.mp4`)
    createAnimatedSceneSegment({
      duration: scene.duration,
      index: scene.index,
      sceneFile,
      segmentPath,
    })
    segmentFiles.push(segmentPath)
  }

  const concatPath = path.join(workDir, 'concat.txt')
  const visualPath = path.join(workDir, 'visual_silent.mp4')
  writeConcatFile({ concatPath, segmentFiles })
  concatSegments({ concatPath, outputPath: visualPath })
  renderFinalVideo({
    desktopOutputDir,
    desktopVideoPath,
    hasVoice: Boolean(ttsResult?.ttsEnabled),
    subtitlePath,
    targetDuration: sceneResult.durationSeconds,
    voiceAudioPath,
    visualPath,
  })

  copyFileSync(desktopVideoPath, videoFactoryV3FinalPath)
  const finalVideoInfo = probeVideo(desktopVideoPath)
  const previewStatus = refreshPreviewFiles({
    durationSeconds: finalVideoInfo.durationSeconds,
    outputDir: desktopOutputDir,
    videoPath: desktopVideoPath,
  })
  const qualityReportPath = writeQualityReport({
    desktopOutputDir,
    exportReport,
    finalVideoInfo,
    meta,
    previewStatus,
    sceneResult,
    ttsResult,
  })
  const quality = evaluateV3({
    exportReport,
    finalVideoInfo,
    meta,
    previewStatus,
    sceneResult,
    subtitlePath,
    ttsResult,
    voiceAudioPath,
  })
  const desktopReportPath = path.join(desktopOutputDir, 'douyin-video-v3-report.json')
  const requiredDesktopFiles = [
    desktopVideoPath,
    voiceoverPath,
    subtitlePath,
    copyTextPath,
    qualityReportPath,
    ...previewSpecs.map((preview) => path.join(desktopOutputDir, preview.fileName)),
  ]
  if (ttsResult?.ttsEnabled) requiredDesktopFiles.push(voiceAudioPath)

  const copiedToDesktop = requiredDesktopFiles.every((filePath) => fileInfo(filePath).exists)
  const warnings = [
    ...(quality.warnings ?? []),
    ...(ttsError ? [`TTS 失败：${ttsError}`] : []),
  ]
  const ok =
    copiedToDesktop &&
    fileInfo(desktopVideoPath).exists &&
    fileInfo(videoFactoryV3FinalPath).exists &&
    quality.publishReadiness === 'ready' &&
    exportReport?.usedFallback === false

  const report = {
    builtAt: new Date().toISOString(),
    command,
    contentScore: quality.contentScore,
    contentScoreBreakdown: quality.contentScoreBreakdown,
    copiedFiles: buildCopiedFiles(requiredDesktopFiles),
    copiedToDesktop,
    desktopOutputDir,
    desktopVideoPath,
    finalVideoPath: videoFactoryV3FinalPath,
    finalVideoSizeBytes: fileInfo(videoFactoryV3FinalPath).sizeBytes,
    hasAudio: finalVideoInfo.hasAudio,
    hasBurnedSubtitles: quality.hasBurnedSubtitles,
    matchKey: exportReport?.matchKey ?? null,
    ok,
    previewFiles: previewStatus.files,
    previewFilesUpdated: previewStatus.updated,
    publishReadiness: quality.publishReadiness,
    qualityReportPath,
    sceneCount: sceneResult.sceneCount,
    sceneManifestPath: sceneResult.manifestPath,
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
    voiceoverPath,
    warnings,
  }

  writeV3Report(report)
  copyFileSync(v3ReportPath, desktopReportPath)
  report.copiedFiles.push({
    fileName: 'douyin-video-v3-report.json',
    path: desktopReportPath,
    sizeBytes: fileInfo(desktopReportPath).sizeBytes,
  })
  writeV3Report(report)
  copyFileSync(v3ReportPath, desktopReportPath)

  console.log(
    JSON.stringify(
      {
        contentScore: report.contentScore,
        desktopOutputDir: report.desktopOutputDir,
        desktopVideoPath: report.desktopVideoPath,
        ok: report.ok,
        publishReadiness: report.publishReadiness,
        selectedMatchName: report.selectedMatchName,
        ttsEnabled: report.ttsEnabled,
        usedFallback: report.usedFallback,
        videoDurationSeconds: report.videoDurationSeconds,
      },
      null,
      2,
    ),
  )
  console.log(
    [
      'v3 视频已生成：',
      report.desktopVideoPath,
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
    command: commandText(['node', '.\\scripts\\build-douyin-video-v3.mjs', ...process.argv.slice(2)]),
    ok: false,
    publishReadiness: 'blocked',
    warnings: [error?.message ?? String(error)],
  }
  writeV3Report(fallbackReport)
  console.error(error?.message ?? error)
  process.exit(1)
}
