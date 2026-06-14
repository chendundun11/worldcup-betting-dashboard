# 抖音视频本地生成

在 `worldcup-betting-dashboard` 项目根目录运行。所有视频只做本地生成，不发布抖音，不登录账号。

## 单条视频生成

按比赛关键词生成：

```powershell
node .\scripts\build-douyin-video.mjs --match "葡萄牙"
```

按索引生成：

```powershell
node .\scripts\build-douyin-video.mjs --index 0
```

默认生成：

```powershell
node .\scripts\build-douyin-video.mjs
```

单条命令会导出 `video-factory\input\package\` 素材包，生成 `video-factory\output\final_douyin.mp4`，刷新 preview 图和 `quality_report.txt`，再复制到桌面输出目录。

## 批量视频生成

按多个比赛关键词生成：

```powershell
node .\scripts\build-douyin-batch.mjs --matches "葡萄牙,德国,西班牙"
```

按数量生成：

```powershell
node .\scripts\build-douyin-batch.mjs --limit 3
```

按索引生成：

```powershell
node .\scripts\build-douyin-batch.mjs --index 0,1,2
```

批量脚本会逐场调用 `scripts\build-douyin-video.mjs`。某一场失败时会记录失败原因并继续下一场。

批量脚本会先解析比赛并去重。若多个 term 命中同一场比赛，例如 `德国` 和 `西班牙` 都命中 `西班牙 vs 德国`，后续重复 term 会写入 `skippedTerms` 和 `duplicateMatches`，不会重复生成第二条 ready 视频。

## 输出位置

素材包输出到：

```text
C:\Users\chend\Desktop\新建文件夹\video-factory\input\package\
```

当前最终视频输出到：

```text
C:\Users\chend\Desktop\新建文件夹\video-factory\output\final_douyin.mp4
```

桌面成片会复制到：

```text
C:\Users\chend\Desktop\世界杯短视频输出
```

每次单条生成都会创建一个比赛子目录，包含：

- `*.mp4`
- `preview_01.jpg`
- `preview_03.jpg`
- `preview_mid.jpg`
- `preview_end.jpg`
- `quality_report.txt`
- `douyin-video-build-report.json`
- `copy.txt`

## copy.txt

每条桌面视频目录都会生成 `copy.txt`，包含 3 个抖音文案版本：

- 短版
- 正常版
- 口语版

文案会包含比赛名、主推方向、两个比分、大小球方向、风险提示和“仅供娱乐参考”。文案不承诺命中，不诱导下注。

## index.md

批量生成后会更新桌面总索引：

```text
C:\Users\chend\Desktop\世界杯短视频输出\index.md
```

索引会列出本次批量生成的视频、`copy.txt`、`quality_report.txt`、`ok`、`usedFallback`、`copiedToDesktop` 和内容评分。

## 报告文件

单条总报告：

```text
C:\Users\chend\Desktop\新建文件夹\worldcup-betting-dashboard\scripts\douyin-video-build-report.json
```

批量总报告：

```text
C:\Users\chend\Desktop\新建文件夹\worldcup-betting-dashboard\scripts\douyin-batch-report.json
```

这些报告是本地运行产物，已通过 `.gitignore` 忽略，不应提交。

批量报告还包含：

- `requestedTerms`
- `resolvedMatches`
- `duplicateMatches`
- `skippedTerms`
- `uniqueMatchCount`

## contentScore

`contentScore` 满分 100，按本地启发式评分：

- 比赛名清楚：20
- 主推清楚：15
- 比分清楚：15
- 大小球清楚：10
- 风险提示清楚：10
- preview 与 final 一致：10
- `usedFallback=false`：10
- 视频时长 8 到 18 秒：5
- 无明显异常：5

`publishReadiness` 可能是：

- `ready`: 可优先发布前人工复看。
- `review`: 需要人工复核文案或画面。
- `blocked`: 不建议发布，需要先修复异常。

## Codex 使用方式

以后可以让 Codex 按项目内 Skill 执行短视频生成流程：

```text
.codex/skills/worldcup-douyin-video/SKILL.md
```

常用说法：

```text
使用 worldcup-douyin-video Skill，按比赛名“葡萄牙”生成抖音短视频，并回报桌面 mp4 路径。
```

批量说法：

```text
使用 worldcup-douyin-video Skill，批量生成“葡萄牙,德国,西班牙”的抖音短视频，并回报 batch-report 和桌面 index。
```

## 常见问题

### 找不到比赛

换更具体的球队名，或改用：

```powershell
node .\scripts\build-douyin-video.mjs --index 0
```

### `usedFallback=true`

不建议直接发布。先查看 `fallbackFields` 和 `warnings`，确认推荐、比分、大小球或风险提示是否缺失。

### preview 不一致

检查 `quality_report.txt` 里的：

- `selected_match`
- `preview_source_video=final_douyin.mp4`
- `preview_updated_at`
- `preview_files_updated=true`

### 桌面没有输出

检查 `douyin-video-build-report.json` 里的：

- `desktopOutputDir`
- `desktopVideoPath`
- `copiedToDesktop`

### 视频能生成但不适合发

看 `contentScore` 和 `publishReadiness`。如果是 `review` 或 `blocked`，先人工复核画面、文案和风险提示。
