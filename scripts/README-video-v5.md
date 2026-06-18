# v5 网站录屏素材模式

v5 是独立模式，不替换 v3/v4。它会打开本项目的 capture 页面，录制“本地 AI 模型正在分析比赛”的网页过程，再叠加口播、TTS 配音和烧录字幕，最终输出抖音 9:16 视频。

v5.1 起，视频先生成 `storyboard.json`，再由同一份 storyboard 驱动 capture 页面、口播、字幕和报告。不要让页面、口播、字幕分别生成内容，否则会出现画面和口播不对应。

## 生成命令

默认 sharp 风格：

```powershell
node .\scripts\build-douyin-video-v5.mjs --match "葡萄牙"
```

指定风格：

```powershell
node .\scripts\build-douyin-video-v5.mjs --match "葡萄牙" --style record
node .\scripts\build-douyin-video-v5.mjs --match "葡萄牙" --style sharp
node .\scripts\build-douyin-video-v5.mjs --match "葡萄牙" --style explain
```

使用自定义口播：

```powershell
node .\scripts\build-douyin-video-v5.mjs --match "葡萄牙" --script ".\scripts\voiceover-custom.txt"
```

## capture 页面

录屏页面地址：

```text
http://localhost:5173/?capture=1
http://localhost:5173/?capture=1&match=葡萄牙
```

只有 `capture=1` 时才进入录屏页面。普通页面不受影响。

capture 页面会自动展示：

- Scene 1：开头钩子
- Scene 2：模型扫描
- Scene 3：主方向
- Scene 4：比分预测
- Scene 5：大小球
- Scene 6：风险复核
- Scene 7：结尾

天气、阵容、临场盘口等没有真实 API 的信息只显示为“待复核”“预留因子”“临场复核项”或“赛前二次确认”。

页面文案避免出现工程化表达，例如不要显示 `raw response`、provider error 或 API key 相关内容。

## 输出目录

桌面输出目录：

```text
C:\Users\chend\Desktop\世界杯短视频输出
```

每次 v5 生成一个子目录：

```text
YYYY-MM-DD_HH-mm_比赛名_v5_capture
```

子目录包含：

- `比赛名_v5.mp4`
- `capture_raw.mp4`
- `storyboard.json`
- `voiceover.txt`
- `voice.mp3`
- `subtitles.ass`
- `copy.txt`
- `preview_01.jpg`
- `preview_03.jpg`
- `preview_mid.jpg`
- `preview_end.jpg`
- `quality_report.txt`
- `douyin-video-v5-report.json`

这些都是本地运行产物，不提交 git。

## 报告

本地报告：

```text
scripts\douyin-video-v5-report.json
```

报告会记录：

- `captureUrl`
- `captureModeEnabled`
- `captureVideoPath`
- `captureDurationSeconds`
- `sceneFlowDetected`
- `autoScrollDetected`
- `captureLooksDynamic`
- `storyboardPath`
- `storyboardSceneCount`
- `storyboardDurationSeconds`
- `voiceoverSceneAligned`
- `subtitleSceneAligned`
- `captureSceneAligned`
- `mismatchWarnings`
- `sceneTimeline`
- `ttsEnabled`
- `hasBurnedSubtitles`
- `contentScore`
- `publishReadiness`
- `ok`

## Playwright

v5 录屏依赖 Playwright：

```powershell
npm install -D playwright
```

不要安装无关依赖，不下载 GitHub 项目，不接抖音发布。

## 验收

运行：

```powershell
node .\scripts\build-douyin-video-v5.mjs --match "葡萄牙" --style sharp
```

通过标准：

- capture 页面能打开
- 普通页面不受影响
- 自动录屏成功
- `capture_raw.mp4` 生成
- `storyboard.json` 生成
- `voiceover.txt` 来自 storyboard
- `subtitles.ass` 按 storyboard 分 scene 生成
- `voiceoverSceneAligned=true`
- `subtitleSceneAligned=true`
- `captureSceneAligned=true`
- `mismatchWarnings` 为空
- final v5 mp4 生成
- 有配音
- 有烧录字幕
- preview 图更新
- `copy.txt` 生成
- `quality_report.txt` 生成
- `douyin-video-v5-report.json` 生成
- `contentScore >= 85`
- `publishReadiness` 不是 `blocked`
- `npm run build` 通过

如果使用 `--script` 自定义口播，仍会先生成 storyboard。自定义口播无法按 scene 对齐时，报告会记录 `customVoiceoverMayNotMatchStoryboard`，`publishReadiness` 不能直接是 `ready`。
