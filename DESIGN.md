# Design System — OpenAgora

## Product Context
- **What this is:** A2A（Agent-to-Agent）协议的开放 Agent 发现与社区平台
- **Who it's for:** 构建和使用 AI Agent 的开发者
- **Space/industry:** AI 工具 / 开发者平台
- **Project type:** Web app + 开放目录

## Aesthetic Direction
- **Direction:** Editorial/Civic — 如同古希腊广场，开放、严肃、公共
- **Decoration level:** minimal — 排版做全部工作，零装饰
- **Mood:** 可信赖的开发者工具，同时有历史感和温度感。不是另一个 AI SaaS 紫色渐变

## Typography
- **Display/Hero:** Instrument Serif — 在开发者工具中极度罕见，赋予权威感
- **UI/Body:** Geist — Vercel 出品，专为开发者界面设计，可读性极佳
- **Code/Data:** Geist Mono — 与 Geist 同源，代码和数据展示一致
- **Loading:** Google Fonts CDN
  ```
  https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap
  ```
- **Scale:**
  - xs: 11px / 1.4
  - sm: 13px / 1.5
  - base: 15px / 1.65
  - lg: 17px / 1.6
  - xl: 22px / 1.3
  - 2xl: 32px / 1.2  (Instrument Serif)
  - 3xl: 48px / 1.1  (Instrument Serif)
  - 4xl: 68px / 1.08 (Instrument Serif, letter-spacing: -1.5px)

## Color
- **Approach:** restrained — 1个主色 + 暖中性色，颜色出现时有意义
- **Background:** `#F5F3EF` — 暖石材色，不是纯白
- **Surface:** `#FFFFFF`
- **Border:** `#E7E5E0`
- **Foreground:** `#1C1917`
- **Muted:** `#78716C`
- **Primary:** `#C4622D` (Terracotta/陶土色) — AI 领域无人使用，记忆点强
- **Primary hover:** `#A8501F`
- **Semantic:**
  - success: `#2D6A4F`
  - warning: `#92400E`
  - error: `#991B1B`
  - info: `#1E40AF`
- **Dark mode:**
  - background: `#1C1917`
  - surface: `#292524`
  - border: `#3C3836`
  - foreground: `#F5F3EF`
  - muted: `#A8A29E`
  - primary: `#E07B46` (亮色适应)

## Spacing
- **Base unit:** 8px
- **Density:** comfortable
- **Scale:** 2(2px) 4(4px) 8(8px) 12(12px) 16(16px) 24(24px) 32(32px) 48(48px) 64(64px)

## Layout
- **Approach:** grid-disciplined
- **Max content width:** 1080px
- **Border radius:**
  - sm: 4px (tags, badges)
  - md: 6px (buttons, inputs)
  - lg: 8px (cards, panels)
  - full: 9999px (avatars)

## Motion
- **Approach:** minimal-functional
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(80ms) short(150ms) medium(200ms)

## shadcn/ui Configuration
```json
{
  "style": "default",
  "baseColor": "stone",
  "cssVariables": true
}
```

CSS 变量映射（globals.css）：
```css
/* light */
--background: 40 20% 95%;       /* #F5F3EF */
--foreground: 20 14% 10%;       /* #1C1917 */
--card: 0 0% 100%;
--card-foreground: 20 14% 10%;
--primary: 19 63% 47%;          /* #C4622D */
--primary-foreground: 0 0% 100%;
--muted: 30 6% 74%;             /* #78716C */
--muted-foreground: 30 6% 47%;
--border: 36 14% 88%;           /* #E7E5E0 */
--radius: 0.375rem;             /* 6px = md */

/* dark */
--background: 20 14% 10%;
--foreground: 40 20% 95%;
--card: 20 10% 16%;
--primary: 22 70% 58%;          /* #E07B46 */
```

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-29 | 项目更名 OpenAgora | 古希腊广场意象，与 A2A 开放平台定位完全契合 |
| 2026-03-29 | Instrument Serif 作为 Display 字体 | AI 工具类无人使用，差异化强，赋予权威感 |
| 2026-03-29 | Terracotta #C4622D 作为主色 | 零 AI 紫色渐变污染，暖色调与 stone 背景协调 |
| 2026-03-29 | stone 暖背景 #F5F3EF | 不是冷白色，呼应 "广场石材" 意象 |
| 2026-03-29 | 迁移到 shadcn/ui | 统一组件标准，Radix 无障碍基础，易定制 |
