---
name: worldcup-douyin-video
description: Generate local Douyin-ready World Cup prediction videos from worldcup-betting-dashboard through video-factory, including single-match or batch builds, desktop output copies, copy.txt captions, preview consistency checks, contentScore scoring, publishReadiness review status, and local reports. Use when Codex is asked to create, verify, batch-produce, or report short World Cup prediction videos without publishing to Douyin.
---

# worldcup-douyin-video

## 适用场景

Use this skill when the user asks to:

- 根据比赛名或索引生成抖音短视频。
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

## 标准流程

1. 进入 `worldcup-betting-dashboard`。
2. 运行 `git status`，确认是否有用户未提交改动。
3. 按用户指定的 `--match`、`--index`、`--matches` 或 `--limit` 运行脚本。
4. 单条时读取 `scripts\douyin-video-build-report.json`。
5. 批量时读取 `scripts\douyin-batch-report.json` 和桌面 `index.md`。
6. 检查每个桌面子目录是否包含:
   - `*.mp4`
   - `preview_01.jpg`
   - `preview_03.jpg`
   - `preview_mid.jpg`
   - `preview_end.jpg`
   - `quality_report.txt`
   - `douyin-video-build-report.json`
   - `copy.txt`
7. 必要时打开 preview 图或用 `ffmpeg -v error -i <mp4> -f null -` 检查黑屏、解码、声音异常。
8. 最后回报结果；只有用户明确要求保存代码时才提交，除非当前任务授权自行提交。

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
