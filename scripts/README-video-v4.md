# 抖音视频 v4 素材库 + 可定制口播版

v4 是独立新模式，不替换 v3。它复用 dashboard 的本地比赛数据，新增本地素材库扫描、自定义口播、三种自动口播风格、配音字幕和 7 段多镜头数据卡片。

## 生成命令

默认 sharp 风格：

```powershell
node .\scripts\build-douyin-video-v4.mjs --match "葡萄牙"
```

指定风格：

```powershell
node .\scripts\build-douyin-video-v4.mjs --match "葡萄牙" --style sharp
node .\scripts\build-douyin-video-v4.mjs --match "葡萄牙" --style record
node .\scripts\build-douyin-video-v4.mjs --match "葡萄牙" --style explain
```

使用自定义口播：

```powershell
node .\scripts\build-douyin-video-v4.mjs --match "葡萄牙" --script ".\scripts\voiceover-custom.txt"
```

`--script` 存在时优先使用自定义口播。脚本只会去掉多余空行并检查长度，不会改写原意。文件为空或不存在时会 fallback 到自动口播。

## 本地素材库

素材库目录：

```text
C:\Users\chend\Desktop\新建文件夹\video-factory\materials
```

建议结构：

```text
materials/
  football/
    stadium/
    training/
    crowd/
    ball/
  abstract/
    ai/
    dashboard/
    scan/
    data-lines/
  backgrounds/
    dark-tech/
    gradient/
  audio/
    bgm/
    sfx/
```

支持素材：

- `mp4`
- `mov`
- `jpg`
- `png`
- `webp`

没有素材时不会报错，报告会写 `materialMode=fallback-v3`，继续使用足球氛围的数据看板生成视频。有素材时，脚本会优先拿素材作为 scene 背景，并在报告里写入 `materialsUsed`。

真实素材不要提交。`.gitignore` 已忽略 `video-factory/materials/**`、`materials/**`、`*.mp4`、`*.mov`、`*.mp3`、`*.wav`。

## 素材清单

示例文件：

```text
scripts\materials-manifest.example.json
```

当前 v4 会自动扫描素材目录，不强依赖 manifest。manifest 先作为后续人工整理素材库的结构约定。

## 输出

桌面输出总目录：

```text
C:\Users\chend\Desktop\世界杯短视频输出
```

v4 每次运行会创建类似目录：

```text
YYYY-MM-DD_HH-mm_葡萄牙_vs_乌拉圭_v4_voice
```

子目录包含：

- `比赛名_v4.mp4`
- `voiceover.txt`
- `voice.mp3`
- `subtitles.ass`
- `copy.txt`
- `preview_01.jpg`
- `preview_03.jpg`
- `preview_mid.jpg`
- `preview_end.jpg`
- `quality_report.txt`
- `douyin-video-v4-report.json`

项目内报告：

```text
scripts\douyin-video-v4-report.json
```

该报告是本地运行产物，不应提交。

## contentScore

v4 满分 100：

- 有配音：15
- 有字幕：15
- 有自定义或高质量口播：15
- 有足球/AI 素材或 fallback 合理：15
- scene >= 7：10
- 比赛名、主推、比分、大小球清楚：15
- 风险提示清楚：5
- 时长 18 到 30 秒：5
- `usedFallback=false` 或 fallback 可解释：5

`publishReadiness`：

- `ready`: 分数大于等于 85
- `review`: 70 到 84
- `blocked`: 低于 70

## 禁止事项

- 不发布抖音
- 不接抖音 API
- 不下载外网素材
- 不提交素材文件
- 不提交 `mp4/mov/jpg/png/mp3/wav/voice.mp3`
- 不提交字幕产物和报告 JSON
- 不提交 `.env` 或 API key
- 不改 `src/App.jsx`
- 不改 BetEngine 主逻辑
- 不改真实数据源逻辑
