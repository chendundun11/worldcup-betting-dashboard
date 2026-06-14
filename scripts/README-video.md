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
