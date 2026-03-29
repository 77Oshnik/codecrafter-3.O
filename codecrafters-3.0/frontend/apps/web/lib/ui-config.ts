export const uiConfig = {
  brand: {
    name: "CodeCrafter",
    themeLabel: "Kintsugi Modern",
  },
  dashboard: {
    storageKey: "codecrafter.dashboard.layout.v1",
    breakpointPx: 1024,
    handleWidthPx: 10,
    minContentWidthPx: 560,
    left: {
      defaultWidthPx: 272,
      minWidthPx: 220,
      maxWidthPx: 420,
      collapsedWidthPx: 72,
    },
    right: {
      defaultWidthPx: 360,
      minWidthPx: 300,
      maxWidthPx: 520,
      collapsedWidthPx: 72,
    },
  },
  motion: {
    fastMs: 160,
    normalMs: 260,
    slowMs: 420,
  },
} as const

export type DashboardUiConfig = typeof uiConfig.dashboard

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
