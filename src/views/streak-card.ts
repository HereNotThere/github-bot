import type { StreakStats } from "../api/github-stats";
import { escapeHtml } from "../utils/html-escape";

/** Theme configuration for streak cards */
export interface StreakTheme {
  background: string;
  border: string;
  stroke: string;
  ring: string;
  fire: string;
  currStreakNum: string;
  sideNums: string;
  currStreakLabel: string;
  sideLabels: string;
  dates: string;
}

/** Options for rendering streak cards */
export interface StreakCardOptions {
  theme?: string;
  hideBorder?: boolean;
  borderRadius?: number;
  dateFormat?: string;
  title?: string;
}

/** Available themes - adapted from DenverCoder1/github-readme-streak-stats */
export const STREAK_THEMES: Record<string, StreakTheme> = {
  default: {
    background: "#fffefe",
    border: "#e4e2e2",
    stroke: "#e4e2e2",
    ring: "#fb8c00",
    fire: "#fb8c00",
    currStreakNum: "#151515",
    sideNums: "#151515",
    currStreakLabel: "#fb8c00",
    sideLabels: "#151515",
    dates: "#464646",
  },
  dark: {
    background: "#151515",
    border: "#e4e2e2",
    stroke: "#e4e2e2",
    ring: "#fb8c00",
    fire: "#fb8c00",
    currStreakNum: "#ffffff",
    sideNums: "#ffffff",
    currStreakLabel: "#fb8c00",
    sideLabels: "#ffffff",
    dates: "#9e9e9e",
  },
  radical: {
    background: "#141321",
    border: "#fe428e",
    stroke: "#fe428e",
    ring: "#f8d847",
    fire: "#f8d847",
    currStreakNum: "#fe428e",
    sideNums: "#fe428e",
    currStreakLabel: "#f8d847",
    sideLabels: "#a9fef7",
    dates: "#a9fef7",
  },
  tokyonight: {
    background: "#1a1b27",
    border: "#70a5fd",
    stroke: "#70a5fd",
    ring: "#bf91f3",
    fire: "#bf91f3",
    currStreakNum: "#70a5fd",
    sideNums: "#70a5fd",
    currStreakLabel: "#bf91f3",
    sideLabels: "#38bdae",
    dates: "#38bdae",
  },
  dracula: {
    background: "#282a36",
    border: "#6272a4",
    stroke: "#6272a4",
    ring: "#ff6e96",
    fire: "#ff6e96",
    currStreakNum: "#f8f8f2",
    sideNums: "#f8f8f2",
    currStreakLabel: "#ff6e96",
    sideLabels: "#bd93f9",
    dates: "#bd93f9",
  },
  gruvbox: {
    background: "#282828",
    border: "#ebdbb2",
    stroke: "#ebdbb2",
    ring: "#fabd2f",
    fire: "#fabd2f",
    currStreakNum: "#ebdbb2",
    sideNums: "#ebdbb2",
    currStreakLabel: "#fabd2f",
    sideLabels: "#fb4934",
    dates: "#b8bb26",
  },
  onedark: {
    background: "#282c34",
    border: "#abb2bf",
    stroke: "#abb2bf",
    ring: "#e5c07b",
    fire: "#e5c07b",
    currStreakNum: "#abb2bf",
    sideNums: "#abb2bf",
    currStreakLabel: "#e5c07b",
    sideLabels: "#61afef",
    dates: "#98c379",
  },
  monokai: {
    background: "#272822",
    border: "#f92672",
    stroke: "#f92672",
    ring: "#f4bf75",
    fire: "#f4bf75",
    currStreakNum: "#f8f8f2",
    sideNums: "#f8f8f2",
    currStreakLabel: "#f4bf75",
    sideLabels: "#a6e22e",
    dates: "#66d9ef",
  },
  nord: {
    background: "#2e3440",
    border: "#88c0d0",
    stroke: "#88c0d0",
    ring: "#ebcb8b",
    fire: "#ebcb8b",
    currStreakNum: "#eceff4",
    sideNums: "#eceff4",
    currStreakLabel: "#ebcb8b",
    sideLabels: "#8fbcbb",
    dates: "#81a1c1",
  },
  highcontrast: {
    background: "#000000",
    border: "#ffffff",
    stroke: "#ffffff",
    ring: "#e7f216",
    fire: "#e7f216",
    currStreakNum: "#ffffff",
    sideNums: "#ffffff",
    currStreakLabel: "#e7f216",
    sideLabels: "#79ff97",
    dates: "#79ff97",
  },
  github_dark: {
    background: "#0d1117",
    border: "#30363d",
    stroke: "#30363d",
    ring: "#f78166",
    fire: "#f78166",
    currStreakNum: "#c9d1d9",
    sideNums: "#c9d1d9",
    currStreakLabel: "#f78166",
    sideLabels: "#58a6ff",
    dates: "#8b949e",
  },
  github_dark_dimmed: {
    background: "#22272e",
    border: "#444c56",
    stroke: "#444c56",
    ring: "#f69d50",
    fire: "#f69d50",
    currStreakNum: "#adbac7",
    sideNums: "#adbac7",
    currStreakLabel: "#f69d50",
    sideLabels: "#539bf5",
    dates: "#768390",
  },
  github_light: {
    background: "#ffffff",
    border: "#d0d7de",
    stroke: "#d0d7de",
    ring: "#cf222e",
    fire: "#cf222e",
    currStreakNum: "#24292f",
    sideNums: "#24292f",
    currStreakLabel: "#cf222e",
    sideLabels: "#0969da",
    dates: "#57606a",
  },
  solarized_dark: {
    background: "#002b36",
    border: "#586e75",
    stroke: "#586e75",
    ring: "#b58900",
    fire: "#b58900",
    currStreakNum: "#93a1a1",
    sideNums: "#93a1a1",
    currStreakLabel: "#b58900",
    sideLabels: "#268bd2",
    dates: "#859900",
  },
  solarized_light: {
    background: "#fdf6e3",
    border: "#93a1a1",
    stroke: "#93a1a1",
    ring: "#b58900",
    fire: "#b58900",
    currStreakNum: "#586e75",
    sideNums: "#586e75",
    currStreakLabel: "#b58900",
    sideLabels: "#268bd2",
    dates: "#859900",
  },
  cobalt: {
    background: "#193549",
    border: "#0088ff",
    stroke: "#0088ff",
    ring: "#ff9d00",
    fire: "#ff9d00",
    currStreakNum: "#ffffff",
    sideNums: "#ffffff",
    currStreakLabel: "#ff9d00",
    sideLabels: "#0088ff",
    dates: "#3ad900",
  },
  synthwave: {
    background: "#2b213a",
    border: "#e2e9ec",
    stroke: "#e2e9ec",
    ring: "#f97e72",
    fire: "#f97e72",
    currStreakNum: "#e2e9ec",
    sideNums: "#e2e9ec",
    currStreakLabel: "#f97e72",
    sideLabels: "#36f9f6",
    dates: "#fcea2b",
  },
  nightowl: {
    background: "#011627",
    border: "#7e57c2",
    stroke: "#7e57c2",
    ring: "#ffeb95",
    fire: "#ffeb95",
    currStreakNum: "#d6deeb",
    sideNums: "#d6deeb",
    currStreakLabel: "#ffeb95",
    sideLabels: "#c792ea",
    dates: "#7fdbca",
  },
  merko: {
    background: "#0a0f0b",
    border: "#abd200",
    stroke: "#abd200",
    ring: "#b7d364",
    fire: "#b7d364",
    currStreakNum: "#68b587",
    sideNums: "#68b587",
    currStreakLabel: "#b7d364",
    sideLabels: "#abd200",
    dates: "#abd200",
  },
  vue: {
    background: "#35495e",
    border: "#42b883",
    stroke: "#42b883",
    ring: "#42b883",
    fire: "#42b883",
    currStreakNum: "#ffffff",
    sideNums: "#ffffff",
    currStreakLabel: "#42b883",
    sideLabels: "#41d1ff",
    dates: "#41d1ff",
  },
  shades_of_purple: {
    background: "#2d2b55",
    border: "#4f3d99",
    stroke: "#4f3d99",
    ring: "#fad000",
    fire: "#fad000",
    currStreakNum: "#ffffff",
    sideNums: "#ffffff",
    currStreakLabel: "#fad000",
    sideLabels: "#a599e9",
    dates: "#b362ff",
  },
  material_palenight: {
    background: "#292d3e",
    border: "#89ddff",
    stroke: "#89ddff",
    ring: "#ffcb6b",
    fire: "#ffcb6b",
    currStreakNum: "#a6accd",
    sideNums: "#a6accd",
    currStreakLabel: "#ffcb6b",
    sideLabels: "#c792ea",
    dates: "#676e95",
  },
  catppuccin_latte: {
    background: "#eff1f5",
    border: "#7287fd",
    stroke: "#7287fd",
    ring: "#df8e1d",
    fire: "#df8e1d",
    currStreakNum: "#4c4f69",
    sideNums: "#4c4f69",
    currStreakLabel: "#df8e1d",
    sideLabels: "#1e66f5",
    dates: "#6c6f85",
  },
  catppuccin_frappe: {
    background: "#303446",
    border: "#babbf1",
    stroke: "#babbf1",
    ring: "#e5c890",
    fire: "#e5c890",
    currStreakNum: "#c6d0f5",
    sideNums: "#c6d0f5",
    currStreakLabel: "#e5c890",
    sideLabels: "#8caaee",
    dates: "#a5adce",
  },
  catppuccin_macchiato: {
    background: "#24273a",
    border: "#b7bdf8",
    stroke: "#b7bdf8",
    ring: "#eed49f",
    fire: "#eed49f",
    currStreakNum: "#cad3f5",
    sideNums: "#cad3f5",
    currStreakLabel: "#eed49f",
    sideLabels: "#8aadf4",
    dates: "#a5adcb",
  },
  catppuccin_mocha: {
    background: "#1e1e2e",
    border: "#b4befe",
    stroke: "#b4befe",
    ring: "#f9e2af",
    fire: "#f9e2af",
    currStreakNum: "#cdd6f4",
    sideNums: "#cdd6f4",
    currStreakLabel: "#f9e2af",
    sideLabels: "#89b4fa",
    dates: "#a6adc8",
  },
  rose_pine: {
    background: "#191724",
    border: "#eb6f92",
    stroke: "#eb6f92",
    ring: "#f6c177",
    fire: "#f6c177",
    currStreakNum: "#e0def4",
    sideNums: "#e0def4",
    currStreakLabel: "#f6c177",
    sideLabels: "#c4a7e7",
    dates: "#908caa",
  },
  ayu_mirage: {
    background: "#1f2430",
    border: "#ffcc66",
    stroke: "#ffcc66",
    ring: "#f29e74",
    fire: "#f29e74",
    currStreakNum: "#cbccc6",
    sideNums: "#cbccc6",
    currStreakLabel: "#f29e74",
    sideLabels: "#73d0ff",
    dates: "#707a8c",
  },
};

/**
 * Render a streak card SVG
 *
 * @param stats - Streak statistics
 * @param options - Rendering options
 * @returns SVG string
 */
export function renderStreakCard(
  stats: StreakStats,
  options: StreakCardOptions = {}
): string {
  const theme =
    STREAK_THEMES[options.theme ?? "default"] ?? STREAK_THEMES.default;
  const hideBorder = options.hideBorder ?? false;
  const borderRadius = options.borderRadius ?? 4.5;

  const width = 495;
  const height = 195;

  const currentYear = new Date().getFullYear();

  const formatDateShort = (dateStr: string, includeYear = false): string => {
    const date = new Date(dateStr + "T00:00:00");
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const base = `${months[date.getMonth()]} ${date.getDate()}`;
    // Include year if explicitly requested or if not current year
    if (includeYear || date.getFullYear() !== currentYear) {
      return `${base}, ${date.getFullYear()}`;
    }
    return base;
  };

  const formatDateRange = (
    range: [string, string],
    usePresent = false
  ): string => {
    const startYear = new Date(range[0] + "T00:00:00").getFullYear();
    const endYear = new Date(range[1] + "T00:00:00").getFullYear();
    // Include year on start date if years differ
    const start = formatDateShort(range[0], startYear !== endYear);
    const end = usePresent ? "Present" : formatDateShort(range[1]);
    return `${start} - ${end}`;
  };

  const borderAttr = hideBorder
    ? ""
    : `stroke="${escapeHtml(theme.border)}" stroke-width="1"`;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <style>
    .header { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${escapeHtml(theme.sideLabels)}; }
    .stat { font: 700 28px 'Segoe UI', Ubuntu, Sans-Serif; }
    .rank-text { font: 600 16px 'Segoe UI', Ubuntu, Sans-Serif; }
    .not-hierarchical { fill: ${escapeHtml(theme.sideNums)}; }
    .rank-percentile { fill: ${escapeHtml(theme.currStreakNum)}; }
    .bold { font-weight: 700; }
    .date-range { font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${escapeHtml(theme.dates)}; }
    .label { font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${escapeHtml(theme.sideLabels)}; }
    .curr-label { font: 700 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${escapeHtml(theme.currStreakLabel)}; }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .animate { animation: fadeIn 0.3s ease-in-out forwards; }
    .s1 { animation-delay: 0ms; }
    .s2 { animation-delay: 150ms; }
    .s3 { animation-delay: 300ms; }
  </style>

  <rect x="0.5" y="0.5" rx="${borderRadius}" ry="${borderRadius}" width="${width - 1}" height="${height - 1}" fill="${escapeHtml(theme.background)}" ${borderAttr}/>

  <!-- Total Contributions (left column, center = 82.5) -->
  <g transform="translate(0, 0)" class="animate s1" style="opacity: 0;">
    <text x="82.5" y="78" class="stat not-hierarchical" text-anchor="middle">${stats.total}</text>
    <text x="82.5" y="115" class="label" text-anchor="middle">Total Contributions</text>
    <text x="82.5" y="145" class="date-range" text-anchor="middle">${escapeHtml(formatDateRange(stats.totalRange, true))}</text>
  </g>

  <!-- Divider 1 -->
  <line x1="165" y1="28" x2="165" y2="170" stroke="${escapeHtml(theme.stroke)}" stroke-width="1"/>

  <!-- Current Streak (center column, center = 247.5) -->
  <g transform="translate(165, 0)" class="animate s2" style="opacity: 0;">
    <!-- Ring around number -->
    <circle cx="82.5" cy="68" r="40" stroke="${escapeHtml(theme.ring)}" stroke-width="5" fill="none"/>
    <text x="82.5" y="78" class="stat rank-percentile" text-anchor="middle">${stats.curr}</text>
    <text x="82.5" y="132" class="curr-label" text-anchor="middle">Current Streak</text>
    <text x="82.5" y="160" class="date-range" text-anchor="middle">${escapeHtml(formatDateRange(stats.currDate))}</text>
  </g>

  <!-- Divider 2 -->
  <line x1="330" y1="28" x2="330" y2="170" stroke="${escapeHtml(theme.stroke)}" stroke-width="1"/>

  <!-- Longest Streak (right column, center = 412.5) -->
  <g transform="translate(330, 0)" class="animate s3" style="opacity: 0;">
    <text x="82.5" y="78" class="stat not-hierarchical" text-anchor="middle">${stats.longest}</text>
    <text x="82.5" y="115" class="label" text-anchor="middle">Longest Streak</text>
    <text x="82.5" y="145" class="date-range" text-anchor="middle">${escapeHtml(formatDateRange(stats.longestDate))}</text>
  </g>
</svg>`.trim();

  return svg;
}
