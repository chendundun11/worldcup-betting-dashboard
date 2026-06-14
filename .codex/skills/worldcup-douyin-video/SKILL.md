---
name: worldcup-douyin-video
description: Generate local Douyin-ready World Cup prediction videos from worldcup-betting-dashboard through video-factory, including single-match or batch builds, desktop output copies, copy.txt captions, preview consistency checks, contentScore scoring, publishReadiness review status, and local reports. Use when Codex is asked to create, verify, batch-produce, or report short World Cup prediction videos without publishing to Douyin.
---

# worldcup-douyin-video

## 适用场景

Use this skill when the user asks to:

- 根据比赛名或索引生成抖音短视频。
- 根据比赛名或索引生成 v3 配音解说版抖音短视频。
- 根据比赛名或索引生成 v4 素材库 + 可定制口播版抖音短视频。
- 根据比赛名或索引生成 v5 网站录屏素材模式抖音短视频。
- 批量生成多场比赛短视频。
- 生成后复制到桌面输出文件夹。
- 生成或检查 `copy.txt`、preview 图、`quality_report.txt`、`douyin-video-build-report.json`、`douyin-batch-report.json`。
- 检查 `contentScore`、`publishReadiness` 和 preview/final 一致性。

## 固定路径

- `worldcup-betting-dashboard`: `C:\Users\chend\Desktop\新建文件夹\worldcup-betting-dashboard`
- `video-factory`: `C:\Users\chend\Desktop\新建文件夹\video-factory`
- 桌面输出目录: `C:\Users\chend\Desktop\世界杯短视频输出`
- 当前视频: `C:\Users\chend\Desktop\新建文件夹\video-factory\output\final_douyin.mp4`
- 单条报告: `C:\Users\chend\Desktop\新建文件夹\worldcup-betting-dashboard\scripts\douyin-video-build-report.json`
- 批量报告: `C:\Users\chend\Desktop\新建文件夹\worldcup-betting-dashboard\scripts\douyin-batch-report.json`
- v3 报告: `C:\Users\chend\Desktop\新建文件夹\worldcup-betting-dashboard\scripts\douyin-video-v3-report.json`
- v4 报告: `C:\Users\chend\Desktop\新建文件夹\worldcup-betting-dashboard\scripts\douyin-video-v4-report.json`
- v5 报告: `C:\Users\chend\Desktop\新建文件夹\worldcup-betting-dashboard\scripts\douyin-video-v5-report.json`
- v4 素材库: `C:\Users\chend\Desktop\新建文件夹\video-factory\materials`
- v5 capture 页面: `http://localhost:5173/?capture=1&match=葡萄牙`
- 桌面索引: `C:\Users\chend\Desktop\世界杯短视频输出\index.md`

## 固定命令

Always run from `worldcup-betting-dashboard`.

Single build:

```powershell
node .\scripts\build-douyin-video.mjs --match "葡萄牙"
```

```powershell
node .\scripts\build-douyin-video.mjs --index 0
```

Batch build:

```powershell
node .\scripts\build-douyin-batch.mjs --matches "葡萄牙,德国,西班牙"
```

```powershell
node .\scripts\build-douyin-batch.mjs --limit 3
```

```powershell
node .\scripts\build-douyin-batch.mjs --index 0,1,2
```

Batch builds must resolve matches before rendering and keep selected matches unique. If two terms hit the same match, skip the later duplicate term, write it to `skippedTerms` and `duplicateMatches`, and do not create another `ready` video for the same `selectedMatchName`.

V3 voiceover build:

```powershell
node .\scripts\build-douyin-video-v3.mjs --match "葡萄牙"
```

```powershell
node .\scripts\build-douyin-video-v3.mjs --index 0
```

V3 must generate `voiceover.txt`, `voice.mp3` when TTS succeeds, `subtitles.ass`, `copy.txt`, 4 preview images, `quality_report.txt`, `douyin-video-v3-report.json`, and a desktop mp4 in a `_v3_voice` folder.

V4 materials and customizable voiceover build:

```powershell
node .\scripts\build-douyin-video-v4.mjs --match "葡萄牙" --style sharp
```

```powershell
node .\scripts\build-douyin-video-v4.mjs --match "葡萄牙" --script ".\scripts\voiceover-custom.txt"
```

V4 must generate `voiceover.txt`, `voice.mp3`, `subtitles.ass`, `copy.txt`, 4 preview images, `quality_report.txt`, `douyin-video-v4-report.json`, and a desktop mp4 in a `_v4_voice` folder. If the local materials folder is empty, `materialMode` should be `fallback-v3` and the build should continue.

V5 capture build:

```powershell
node .\scripts\build-douyin-video-v5.mjs --match "葡萄牙" --style sharp
```

```powershell
node .\scripts\build-douyin-video-v5.mjs --match "葡萄牙" --script ".\scripts\voiceover-custom.txt"
```

V5 must open the `capture=1` page, record it with Playwright, generate `capture_raw.mp4`, `voiceover.txt`, `voice.mp3`, `subtitles.ass`, `copy.txt`, 4 preview images, `quality_report.txt`, `douyin-video-v5-report.json`, and a desktop mp4 in a `_v5_capture` folder. It must not publish to Douyin.

## 标准流程

1. 进入 `worldcup-betting-dashboard`。
2. 运行 `git status`，确认是否有用户未提交改动。
3. 按用户指定的 `--match`、`--index`、`--matches` 或 `--limit` 运行脚本。
4. 单条时读取 `scripts\douyin-video-build-report.json`。
5. 批量时读取 `scripts\douyin-batch-report.json` 和桌面 `index.md`。
6. v3 时读取 `scripts\douyin-video-v3-report.json`，确认 `ttsEnabled=true`、`hasBurnedSubtitles=true`、`sceneCount>=5`。
7. v4 时读取 `scripts\douyin-video-v4-report.json`，确认 `voiceoverSource`、`materialMode`、`ttsEnabled=true`、`hasBurnedSubtitles=true`、`sceneCount>=7`。
8. v5 时读取 `scripts\douyin-video-v5-report.json`，确认 `captureModeEnabled=true`、`autoScrollDetected=true`、`captureLooksDynamic=true`、`ttsEnabled=true`、`hasBurnedSubtitles=true`。
9. 检查每个桌面子目录是否包含:
   - `*.mp4`
   - `preview_01.jpg`
   - `preview_03.jpg`
   - `preview_mid.jpg`
   - `preview_end.jpg`
   - `quality_report.txt`
   - `douyin-video-build-report.json`
   - `copy.txt`
10. v3/v4/v5 子目录还要检查:
   - `voiceover.txt`
   - `voice.mp3`
   - `subtitles.ass`
   - `douyin-video-v3-report.json`
   - `douyin-video-v4-report.json`
   - `douyin-video-v5-report.json`
11. v5 子目录还要检查 `capture_raw.mp4`。
12. 必要时打开 preview 图或用 `ffmpeg -v error -i <mp4> -f null -` 检查黑屏、解码、声音异常。
13. 最后回报结果；只有用户明确要求保存代码时才提交，除非当前任务授权自行提交。

## copy.txt 规则

Each generated desktop subfolder must include `copy.txt` with:

- `【短版】`
- `【正常版】`
- `【口语版】`

Each version must include:

- 比赛名
- 主推方向
- 两个比分
- 大小球方向
- 风险提示
- 仅供娱乐参考

Do not promise a hit rate. Do not induce betting. Keep the tone like: “本地搭了个 AI 世界杯预测系统，每天跑几场记录一下。”

## contentScore 验收

Use `contentScore` out of 100:

- 比赛名清楚：20
- 主推清楚：15
- 比分清楚：15
- 大小球清楚：10
- 风险提示清楚：10
- preview 与 final 一致：10
- `usedFallback=false`：10
- 视频时长 8 到 18 秒：5
- 无明显异常：5

Prefer `contentScore >= 80`. If below 80, report it as needing review.

## v3 contentScore 验收

V3 score is also out of 100:

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

For v3, `publishReadiness=ready` requires `contentScore>=85`, voiceover audio, and burned subtitles. If TTS fails, report `blocked`.

## v4 contentScore 验收

V4 score is out of 100:

- 有配音：15
- 有字幕：15
- 有自定义或高质量口播：15
- 有足球/AI 素材或 fallback 合理：15
- scene >= 7：10
- 比赛名、主推、比分、大小球清楚：15
- 风险提示清楚：5
- 时长 18 到 30 秒：5
- `usedFallback=false` 或 fallback 可解释：5

For v4, `publishReadiness` should not be `blocked`. If `materialMode=fallback-v3`, report it clearly but do not fail solely because the materials folder is empty.

## v5 contentScore 验收

V5 score is out of 100:

- capture 页面可用：15
- 自动录屏成功：15
- 页面有明显 AI 模型运行感：15
- 有配音：15
- 有字幕：10
- 比赛名、主推、比分、大小球清楚：15
- 风险提示清楚：5
- 视频时长 20 到 35 秒：5
- 无明显黑屏、横向滚动或乱码：5

For v5, `publishReadiness` should not be `blocked`. If Playwright is missing, install only `playwright` as a dev dependency; do not install unrelated tools or download GitHub projects.

## publishReadiness

- `ready`: Content is technically ready; still recommend human review before publishing.
- `review`: Something is acceptable but worth checking, such as duplicate match output or warnings.
- `blocked`: Do not publish; fix missing files, fallback data, copy mismatch, preview mismatch, or severe technical errors.

Never claim a video is ready if `publishReadiness=blocked`.

## 验收标准

- `ok=true`
- `usedFallback=false`
- `copiedToDesktop=true`
- `final_douyin.mp4` exists.
- Desktop mp4 exists.
- For v5, `captureModeEnabled=true`, `sceneFlowDetected=true`, and `capture_raw.mp4` exists.
- `copy.txt` exists and contains the selected match name.
- Preview images exist and match the selected match.
- `quality_report.txt` has current `selected_match`.
- `contentScore >= 80`.
- `publishReadiness` is not `blocked`.
- Batch report has `totalSucceeded` matching the requested successful count.
- Batch report has `uniqueMatchCount` equal to the number of generated unique matches.
- Duplicate match terms appear in `duplicateMatches` and `skippedTerms`, not as repeated ready videos.

## 常见错误处理

### preview 图没更新

- Check `previewFilesUpdated`.
- Check `quality_report.txt`: `preview_updated_at`, `preview_source_video=final_douyin.mp4`, `selected_match`.
- Re-run the same build command.

### `usedFallback=true`

- Do not recommend publishing.
- Report `fallbackFields` and `warnings`.
- Do not change the real data source logic unless the user explicitly asks.

### 找不到 `video-factory`

- Confirm `C:\Users\chend\Desktop\新建文件夹\video-factory` exists.
- Do not reinitialize projects.
- Report the missing path and failed command.

### 桌面输出目录没生成

- Check `desktopOutputDir`, `desktopVideoPath`, `copiedToDesktop`.
- Do not manually move or delete original outputs.

### match 匹配不到比赛

- Try a more specific team name or use `--index`.
- Report the original command and error.
- Do not modify real data source logic.

## 提交前检查规则

Before committing, run:

```powershell
git status
git diff --stat
npm run build
```

Commit only source scripts, docs, Skill files, and necessary `.gitignore` updates. Do not commit:

- `mp4/jpg/png/mp3`
- `mov/wav`
- `webm`
- `voice.mp3`
- `subtitles.ass`
- `.env` or API keys
- local report JSON files
- desktop output files
- `video-factory` output files

Never force push. Do not push unless the user explicitly asks.

## 回报模板

```text
生成比赛：
桌面 mp4 路径：
copy.txt：
contentScore：
publishReadiness：
ok：
usedFallback：
copiedToDesktop：
黑屏/文字重叠/声音异常：
git status：
```
