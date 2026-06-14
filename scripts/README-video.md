# 抖音视频本地生成

在 `worldcup-betting-dashboard` 项目根目录运行。

## 默认生成

```powershell
node .\scripts\build-douyin-video.mjs
```

默认会导出当前本地赛程里的第一场待赛比赛。

## 按比赛关键词生成

```powershell
node .\scripts\build-douyin-video.mjs --match "葡萄牙"
```

关键词会匹配比赛 ID、球队 ID、球队名称、赛程标题等本地字段。

## 按索引生成

```powershell
node .\scripts\build-douyin-video.mjs --index 0
```

索引从 `src/data/matches.json` 的 `matches` 数组第 0 场开始。

## 输出位置

素材包输出到：

```text
C:\Users\chend\Desktop\新建文件夹\video-factory\input\package\
```

最终视频输出到：

```text
C:\Users\chend\Desktop\新建文件夹\video-factory\output\final_douyin.mp4
```

总报告输出到：

```text
C:\Users\chend\Desktop\新建文件夹\worldcup-betting-dashboard\scripts\douyin-video-build-report.json
```

桌面成片会复制到：

```text
C:\Users\chend\Desktop\世界杯短视频输出
```

每次运行会创建一个本次专属子目录，里面包含 mp4、4 张 preview 图、`quality_report.txt` 和 `douyin-video-build-report.json`。

## Codex 使用方式

以后可以让 Codex 按项目内 Skill 执行短视频生成流程：

```text
.codex/skills/worldcup-douyin-video/SKILL.md
```

常用说法：

```text
使用 worldcup-douyin-video Skill，按比赛名“葡萄牙”生成抖音短视频，并回报桌面 mp4 路径。
```

Codex 应按该 Skill 检查 `ok=true`、`usedFallback=false`、`copiedToDesktop=true`，并确认 preview 图与当前比赛一致。除非明确要求，不要提交、不 push、不发布抖音。
