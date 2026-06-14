# 抖音视频 v3 配音解说版

v3 是独立的新模式，不替换 v2 Plus。它继续复用 `export-video-package.mjs` 的本地比赛数据与推荐结果，但重新生成动态 scene、中文配音、烧录字幕、预览图、文案和 v3 报告。

## 生成命令

按比赛名生成：

```powershell
node .\scripts\build-douyin-video-v3.mjs --match "葡萄牙"
```

按索引生成：

```powershell
node .\scripts\build-douyin-video-v3.mjs --index 0
```

## 输出位置

桌面输出总目录：

```text
C:\Users\chend\Desktop\世界杯短视频输出
```

v3 每次运行会创建独立子目录，格式类似：

```text
YYYY-MM-DD_HH-mm_葡萄牙_vs_乌拉圭_v3_voice
```

子目录包含：

- `比赛名_v3.mp4`
- `voiceover.txt`
- `voice.mp3`
- `subtitles.ass`
- `copy.txt`
- `preview_01.jpg`
- `preview_03.jpg`
- `preview_mid.jpg`
- `preview_end.jpg`
- `quality_report.txt`
- `douyin-video-v3-report.json`

项目内报告：

```text
scripts\douyin-video-v3-report.json
```

该报告是本地运行产物，已在 `.gitignore` 中忽略。

## TTS

v3 优先使用 `edge-tts`：

- 默认声音：`zh-CN-XiaoxiaoNeural`
- 如果未安装，脚本会尝试 `python -m pip install edge-tts`
- 如果 TTS 失败，视频可以生成 fallback 版本，但 `publishReadiness` 会是 `blocked`

## 字幕

字幕来源于 `voiceover.txt`，按句子切分，生成 `subtitles.ass` 并烧录进视频。字幕使用白字、黑色描边/底框和底部安全区。

## contentScore

v3 满分 100：

- 有配音：20
- 有字幕：15
- 视频时长 15 到 25 秒：10
- 比赛名清楚：10
- 主推清楚：10
- 比分清楚：10
- 大小球清楚：5
- 风险提示清楚：5
- 画面不是静态单图：10
- `usedFallback=false`：5

`publishReadiness`：

- `ready`: 分数大于等于 85，且有配音、有字幕
- `review`: 70 到 84
- `blocked`: 低于 70，或没有配音

## 禁止事项

- 不发布抖音
- 不接抖音 API
- 不下载外网视频素材
- 不提交 `mp4/jpg/png/mp3/voice.mp3`
- 不提交报告 JSON
- 不提交 `.env` 或 API key
- 不改 `src/App.jsx`
- 不改 BetEngine 主逻辑
- 不改真实数据源逻辑
