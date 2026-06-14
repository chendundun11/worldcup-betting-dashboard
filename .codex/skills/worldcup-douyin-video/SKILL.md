---
name: worldcup-douyin-video
description: Generate local Douyin-ready World Cup prediction videos from worldcup-betting-dashboard match data through video-factory. Use when Codex is asked to create a short video by match name or index, copy the result to the desktop output folder, verify preview images match final_douyin.mp4, and report local build status without publishing to Douyin.
---

# worldcup-douyin-video

## 适用场景

Use this skill when the user asks to:

- 根据比赛名生成抖音短视频。
- 生成后复制到桌面输出文件夹。
- 检查 preview 图与 `final_douyin.mp4` 是否一致。
- 只做本地文件处理，不发布、不登录、不调用抖音。

## 固定路径

- `worldcup-betting-dashboard`: `C:\Users\chend\Desktop\新建文件夹\worldcup-betting-dashboard`
- `video-factory`: `C:\Users\chend\Desktop\新建文件夹\video-factory`
- 桌面输出目录: `C:\Users\chend\Desktop\世界杯短视频输出`
- 当前视频: `C:\Users\chend\Desktop\新建文件夹\video-factory\output\final_douyin.mp4`
- 总报告: `C:\Users\chend\Desktop\新建文件夹\worldcup-betting-dashboard\scripts\douyin-video-build-report.json`

## 固定命令

Always run from `worldcup-betting-dashboard`:

```powershell
node .\scripts\build-douyin-video.mjs --match "葡萄牙"
```

```powershell
node .\scripts\build-douyin-video.mjs --index 0
```

## 标准流程

1. 进入 `worldcup-betting-dashboard`。
2. 运行 `git status`，确认是否有用户未提交改动。
3. 按用户指定的 `--match` 或 `--index` 运行 `scripts/build-douyin-video.mjs`。
4. 读取 `scripts\douyin-video-build-report.json`，确认输出状态。
5. 检查桌面输出子目录是否包含:
   - `*.mp4`
   - `preview_01.jpg`
   - `preview_03.jpg`
   - `preview_mid.jpg`
   - `preview_end.jpg`
   - `quality_report.txt`
   - `douyin-video-build-report.json`
6. 必要时打开 preview 图或用 `ffmpeg -v error -i <mp4> -f null -` 检查黑屏、解码、声音异常。
7. 最后回报结果，不提交、不 push，除非用户明确要求。

## 验收标准

- `ok=true`
- `usedFallback=false`
- `copiedToDesktop=true`
- `final_douyin.mp4` 存在。
- 桌面 mp4 存在。
- preview 图与比赛一致。
- `quality_report.txt` 已更新。
- `douyin-video-build-report.json` 已更新。

## 禁止事项

- 不发布抖音。
- 不登录任何账号。
- 不提交 `mp4/jpg/png/mp3`。
- 不提交报告 JSON。
- 不提交 `.env` 或 API key。
- 不改 `App.jsx`。
- 不改 `BetEngine`。
- 不改真实数据源逻辑。
- 不 force push。
- 不删除素材或输出文件，除非用户明确要求。

## 常见错误处理

### preview 图没更新

- 检查 `douyin-video-build-report.json` 里的 `previewFilesUpdated`。
- 检查 `quality_report.txt` 里的 `preview_updated_at`、`preview_source_video=final_douyin.mp4`、`selected_match`。
- 重新运行同一条 `node .\scripts\build-douyin-video.mjs ...` 命令。

### `usedFallback=true`

- 不建议直接发布。
- 回报 `fallbackFields` 和 `warnings`。
- 不改数据源主线逻辑，除非用户明确要求。

### 找不到 `video-factory`

- 确认目录存在: `C:\Users\chend\Desktop\新建文件夹\video-factory`
- 不重新初始化项目。
- 回报缺失路径和失败命令。

### 桌面输出目录没生成

- 检查 `copiedToDesktop`、`desktopOutputDir`、`desktopVideoPath`。
- 确认 `C:\Users\chend\Desktop\世界杯短视频输出` 是否存在。
- 回报错误，不手动移动或删除原始输出。

### match 匹配不到比赛

- 尝试更具体的球队名或改用 `--index 0`。
- 回报原始命令和错误信息。
- 不修改真实数据源逻辑。

## 回报模板

```text
生成比赛：
桌面 mp4 路径：
ok：
usedFallback：
copiedToDesktop：
黑屏/文字重叠/声音异常：
git status：
```
