# Public V5 Redesign Audit

## Goal

公开首页这次不是小修卡片，而是改成「世界杯赛前信号室」：

- 首屏必须一眼和旧版不同。
- 外部用户先看到比赛身份、主方向、比分路径、进球方向和风险提示。
- 4+ 高比分雷达必须保留，并且视觉上像信号板，不像普通列表。
- 移动端不能只是桌面缩窄版，要单独保证不遮挡、不横向溢出。
- 过程工作台必须能通过本地 dev server 打开。

## User-View Checks

人工截图检查路径：

- `C:\Users\chend\AppData\Local\Temp\worldcup-redesign-v5\public-desktop-v5-pass3.png`
- `C:\Users\chend\AppData\Local\Temp\worldcup-redesign-v5\public-mobile-v5-pass3.png`
- `C:\Users\chend\AppData\Local\Temp\worldcup-redesign-v5\public-narrow-v5-pass3.png`
- `C:\Users\chend\AppData\Local\Temp\worldcup-redesign-v5\workbench-v5-pass2.png`

可复现截图命令：

- `npm run capture:visual`
- 默认输出到 `.codex/visual-audits/public-v5/`，该目录只做本地审计，不提交。

验收结论：

- 桌面首屏已从普通卡片后台改成三栏赛事指挥屏。
- 手机端风险提示已从 fixed 浮层改成页面内提示条，不遮挡英雄区。
- 320 宽度没有横向溢出，4+ 雷达和多路比分排序可读。
- 比分候选新增强度条，用户不懂公式也能感知排序权重。
- 内部 V5 页面同步升级为黑金/青色执行台视觉，并确认桌面与 390 宽移动端不横向溢出。

## AI-View Checks

自动化守门：

- `npm run check:browser`
  - 跑公开页浏览器交互烟测。
  - 跑 `scripts/check-public-v5-visual.mjs`，检查 V5 首屏、视觉资产、工作台链接、提示条位置、320/360/390/768/1024/1440 多断点横向溢出和关键控件内部溢出。
- `npm run check:quality`
  - 跑 lint、build、量化引擎、内部引擎、回归、API、文案和海报相关检查。

新增/调整的关键文件：

- `src/App.jsx`
- `src/App.css`
- `src/index.css`
- `public/codex-workbench.html`
- `scripts/check-public-v5-visual.mjs`
- `scripts/check-browser-smoke.mjs`
- `package.json`

## Notes

内部页浏览器烟测现在会在默认 24 小时时间窗无比赛时切到「全赛程预览」，这是为了避免日期推进后误判内部候选/保护波胆缺失。

内部 V5 页面本身也会在默认正式范围无比赛、但全赛程有数据时自动打开「全赛程预览」，避免用户进入内部引擎后看到空列表。
