"use client";

import { useState, useMemo } from "react";
import { ChevronDown, Flame, Trophy, Sparkles, Info } from "lucide-react";

const CURRENT_USER = "Leo";
const XP_PER_LESSON = 60; // rough estimate used only to phrase "complete N more lessons"
const PUBLIC_TOP_N = 5; // only the top N are shown publicly; each student always sees their own row

type Player = {
  name: string;
  group: string;
  streak: number;
  accuracy: number;
  xpWeek: number;
  xpMonth: number;
  xpTotal: number;
};

type Period = "week" | "month" | "total";

type Tier = {
  key: string;
  label: string;
  slogan: string;
  min: number;
  span: number;
  Icon: () => React.ReactElement;
  from: string;
  to: string;
  text: string;
  badge: string;
};

type PlayerWithXp = Player & { xp: number; tier: Tier };

type Badge = { emoji: string; label: string };

type Division = {
  label: string;
  progressPct: number;
  xpToNext: number | null;
  nextLabel: string | null;
};

const PLAYERS: Player[] = [
  { name: "Aziz", group: "Class B", streak: 21, accuracy: 92, xpWeek: 520, xpMonth: 2400, xpTotal: 7200 },
  { name: "Priya", group: "Class B", streak: 12, accuracy: 95, xpWeek: 610, xpMonth: 2100, xpTotal: 5400 },
  { name: "Maya", group: "Class A", streak: 6, accuracy: 88, xpWeek: 380, xpMonth: 1500, xpTotal: 4100 },
  { name: "Dilnoza", group: "Class A", streak: 5, accuracy: 90, xpWeek: 410, xpMonth: 1200, xpTotal: 3050 },
  { name: "Kamila", group: "Class B", streak: 0, accuracy: 75, xpWeek: 150, xpMonth: 900, xpTotal: 2200 },
  { name: "Ken", group: "Class B", streak: 2, accuracy: 80, xpWeek: 95, xpMonth: 700, xpTotal: 1650 },
  { name: "Leo", group: "Class A", streak: 9, accuracy: 86, xpWeek: 410, xpMonth: 820, xpTotal: 1480 },
  { name: "Javlon", group: "Class B", streak: 0, accuracy: 70, xpWeek: 60, xpMonth: 400, xpTotal: 950 },
  { name: "Ana", group: "Class A", streak: 4, accuracy: 82, xpWeek: 150, xpMonth: 300, xpTotal: 640 },
  { name: "Tom", group: "Class B", streak: 0, accuracy: 60, xpWeek: 0, xpMonth: 120, xpTotal: 310 },
  { name: "Nodira", group: "Class B", streak: 1, accuracy: 77, xpWeek: 80, xpMonth: 80, xpTotal: 120 },
  { name: "Sardor", group: "Class A", streak: 0, accuracy: 65, xpWeek: 40, xpMonth: 40, xpTotal: 40 },
];

/* Shade a hex colour toward white (amt > 0) or black (amt < 0), amt in -1..1. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}

/* ============================================================
   Rank badges — brushed-metal to cut-crystal shields.
   Each badge is a self-contained shield SVG that catches a
   top-left light. The shared #bevel + #innerShadow filters
   (rendered once via <BadgeDefs/>) give real specular relief
   and gemstone refraction. Restyled from a dark glass mock to
   sit on the app's light surfaces. Top-left is the light source.
   ============================================================ */
function BadgeDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <defs>
        {/* realistic bevel: blurred alpha-based specular lighting */}
        <filter id="bevel" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="blur" />
          <feSpecularLighting in="blur" surfaceScale="4" specularConstant="0.85" specularExponent="14" lightingColor="#ffffff" result="spec">
            <fePointLight x="-40" y="-60" z="90" />
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceAlpha" operator="in" result="specClip" />
          <feComposite in="SourceGraphic" in2="specClip" operator="arithmetic" k1="0" k2="1" k3="0.55" k4="0" />
        </filter>
        {/* glass gem inner refraction */}
        <filter id="innerShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feOffset dx="0" dy="3" />
          <feGaussianBlur stdDeviation="2.5" result="off" />
          <feComposite in="SourceAlpha" in2="off" operator="out" result="inv" />
          <feFlood floodColor="#000000" floodOpacity="0.35" />
          <feComposite in2="inv" operator="in" />
          <feComposite in2="SourceGraphic" operator="over" />
        </filter>
        {/* brushed metal grain */}
        <filter id="grain" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.9" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
      </defs>
    </svg>
  );
}

const overlay = { mixBlendMode: "overlay" as const };

const badgeSvg = { overflow: "visible" as const };

const IronIcon = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={badgeSvg} aria-hidden="true">
    <defs>
      <linearGradient id="ironBody" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#7d828a" />
        <stop offset="35%" stopColor="#4b4f56" />
        <stop offset="70%" stopColor="#2c2e33" />
        <stop offset="100%" stopColor="#1a1c1f" />
      </linearGradient>
      <linearGradient id="ironShine" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
      <clipPath id="ironClip">
        <path d="M50 6 L80 19 L80 51 C80 72 67 85 50 93 C33 85 20 72 20 51 L20 19 Z" />
      </clipPath>
    </defs>
    <path d="M50 6 L80 19 L80 51 C80 72 67 85 50 93 C33 85 20 72 20 51 L20 19 Z" fill="url(#ironBody)" stroke="#0e0f11" strokeWidth="1.6" filter="url(#bevel)" />
    <rect x="15" y="5" width="70" height="90" filter="url(#grain)" clipPath="url(#ironClip)" opacity="0.4" style={overlay} />
    <path d="M50 6 L80 19 L80 40 L20 40 L20 19 Z" fill="url(#ironShine)" opacity="0.7" />
    <rect x="43" y="38" width="14" height="18" rx="2" fill="#0e0f11" opacity="0.55" />
    <path d="M21 20 L21 50" stroke="#ffffff" strokeWidth="1" opacity="0.25" strokeLinecap="round" />
    <ellipse cx="38" cy="24" rx="10" ry="5" fill="#ffffff" opacity="0.2" />
  </svg>
);

const BronzeIcon = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={badgeSvg} aria-hidden="true">
    <defs>
      <linearGradient id="bronzeBody" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#e3a76a" />
        <stop offset="30%" stopColor="#c17f42" />
        <stop offset="65%" stopColor="#8f5726" />
        <stop offset="100%" stopColor="#5c3a1f" />
      </linearGradient>
      <clipPath id="bronzeClip">
        <path d="M50 6 L82 20 L82 52 C82 74 68 88 50 96 C32 88 18 74 18 52 L18 20 Z" />
      </clipPath>
    </defs>
    <path d="M50 6 L82 20 L82 52 C82 74 68 88 50 96 C32 88 18 74 18 52 L18 20 Z" fill="url(#bronzeBody)" stroke="#43290f" strokeWidth="1.6" filter="url(#bevel)" />
    <rect x="15" y="5" width="72" height="94" filter="url(#grain)" clipPath="url(#bronzeClip)" opacity="0.35" style={overlay} />
    <path d="M50 6 L82 20 L82 42 L18 42 L18 20 Z" fill="#ffffff" opacity="0.16" />
    <circle cx="50" cy="48" r="11" fill="#43290f" opacity="0.4" />
    <circle cx="50" cy="48" r="11" fill="none" stroke="#f0c088" strokeWidth="1" opacity="0.5" />
    <path d="M19 21 L19 51" stroke="#ffffff" strokeWidth="1" opacity="0.3" strokeLinecap="round" />
    <ellipse cx="37" cy="22" rx="11" ry="5" fill="#ffffff" opacity="0.35" />
  </svg>
);

const SilverIcon = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={badgeSvg} aria-hidden="true">
    <defs>
      <linearGradient id="silverBody" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="30%" stopColor="#d7dde5" />
        <stop offset="65%" stopColor="#9aa4b0" />
        <stop offset="100%" stopColor="#5b6472" />
      </linearGradient>
      <clipPath id="silverClip">
        <path d="M50 5 L84 20 L84 53 C84 76 69 90 50 97 C31 90 16 76 16 53 L16 20 Z" />
      </clipPath>
    </defs>
    <path d="M50 5 L84 20 L84 53 C84 76 69 90 50 97 C31 90 16 76 16 53 L16 20 Z" fill="url(#silverBody)" stroke="#3d4450" strokeWidth="1.6" filter="url(#bevel)" />
    <rect x="14" y="4" width="72" height="94" filter="url(#grain)" clipPath="url(#silverClip)" opacity="0.3" style={overlay} />
    <path d="M50 16 L70 26 L70 52 C70 68 60 79 50 84 C40 79 30 68 30 52 L30 26 Z" fill="none" stroke="#3d4450" strokeWidth="1.4" opacity="0.55" />
    <path d="M50 34 L58 46 L50 58 L42 46 Z" fill="#ffffff" opacity="0.65" />
    <path d="M50 34 L58 46 L50 58 L42 46 Z" fill="none" stroke="#5b6472" strokeWidth="0.8" opacity="0.5" />
    <path d="M17 21 L17 52" stroke="#ffffff" strokeWidth="1" opacity="0.35" strokeLinecap="round" />
    <ellipse cx="38" cy="21" rx="12" ry="5.5" fill="#ffffff" opacity="0.5" />
  </svg>
);

const GoldIcon = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={badgeSvg} aria-hidden="true">
    <defs>
      <linearGradient id="goldBody" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#fff2c2" />
        <stop offset="28%" stopColor="#f4c95d" />
        <stop offset="62%" stopColor="#c9922a" />
        <stop offset="100%" stopColor="#8a6112" />
      </linearGradient>
      <radialGradient id="goldCore" cx="50%" cy="42%" r="55%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#ffe08a" />
        <stop offset="100%" stopColor="#c9922a" />
      </radialGradient>
      <clipPath id="goldClip">
        <path d="M50 4 L86 21 L86 54 C86 77 70 91 50 98 C30 91 14 77 14 54 L14 21 Z" />
      </clipPath>
    </defs>
    <path d="M50 4 L86 21 L86 54 C86 77 70 91 50 98 C30 91 14 77 14 54 L14 21 Z" fill="url(#goldBody)" stroke="#6b4a0d" strokeWidth="1.6" filter="url(#bevel)" />
    <rect x="13" y="3" width="74" height="96" filter="url(#grain)" clipPath="url(#goldClip)" opacity="0.25" style={overlay} />
    <path d="M50 30 L58 44 L50 58 L42 44 Z" fill="url(#goldCore)" />
    <circle cx="50" cy="44" r="3" fill="#ffffff" opacity="0.9" />
    <path d="M15 22 L15 53" stroke="#ffffff" strokeWidth="1" opacity="0.4" strokeLinecap="round" />
    <ellipse cx="38" cy="20" rx="12" ry="5.5" fill="#ffffff" opacity="0.5" />
  </svg>
);

const PlatinumIcon = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={badgeSvg} aria-hidden="true">
    <defs>
      <linearGradient id="platBody" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#e8fffb" />
        <stop offset="30%" stopColor="#5fe3d6" />
        <stop offset="65%" stopColor="#1f8a8a" />
        <stop offset="100%" stopColor="#0f5c5c" />
      </linearGradient>
      <radialGradient id="platCore" cx="50%" cy="42%" r="60%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#9bfff0" />
        <stop offset="100%" stopColor="#1f8a8a" />
      </radialGradient>
    </defs>
    <path d="M50 3 L88 21 L88 55 C88 78 71 92 50 99 C29 92 12 78 12 55 L12 21 Z" fill="url(#platBody)" stroke="#083f3f" strokeWidth="1.6" filter="url(#bevel)" />
    <path d="M13 22 L13 54" stroke="#ffffff" strokeWidth="1" opacity="0.4" strokeLinecap="round" />
    <polygon points="50,26 62,40 62,54 50,68 38,54 38,40" fill="url(#platCore)" filter="url(#innerShadow)" />
    <polygon points="50,26 62,40 50,47 38,40" fill="#ffffff" opacity="0.55" />
    <ellipse cx="38" cy="19" rx="12" ry="5.5" fill="#ffffff" opacity="0.5" />
  </svg>
);

const DiamondIcon = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={badgeSvg} aria-hidden="true">
    <defs>
      <linearGradient id="diaBody" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#eaf3ff" />
        <stop offset="30%" stopColor="#7fb1ff" />
        <stop offset="65%" stopColor="#3454c9" />
        <stop offset="100%" stopColor="#1b2e73" />
      </linearGradient>
      <radialGradient id="diaCore" cx="50%" cy="40%" r="65%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="50%" stopColor="#bfe0ff" />
        <stop offset="100%" stopColor="#3454c9" />
      </radialGradient>
    </defs>
    <path d="M50 2 L90 22 L90 56 C90 80 72 94 50 100 C28 94 10 80 10 56 L10 22 Z" fill="url(#diaBody)" stroke="#101c4a" strokeWidth="1.6" filter="url(#bevel)" />
    <path d="M11 23 L11 55" stroke="#ffffff" strokeWidth="1" opacity="0.45" strokeLinecap="round" />
    <polygon points="50,20 66,38 58,66 42,66 34,38" fill="url(#diaCore)" filter="url(#innerShadow)" />
    <polygon points="50,20 66,38 50,48 34,38" fill="#ffffff" opacity="0.6" />
    <line x1="50" y1="20" x2="50" y2="66" stroke="#101c4a" strokeWidth="0.9" opacity="0.4" />
    <line x1="42" y1="38" x2="58" y2="38" stroke="#101c4a" strokeWidth="0.9" opacity="0.3" />
    <ellipse cx="38" cy="18" rx="13" ry="6" fill="#ffffff" opacity="0.55" />
  </svg>
);

const MasterIcon = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={badgeSvg} aria-hidden="true">
    <defs>
      <linearGradient id="masterBody" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#e6cfff" />
        <stop offset="30%" stopColor="#9b4fd6" />
        <stop offset="65%" stopColor="#5b1f8a" />
        <stop offset="100%" stopColor="#33104f" />
      </linearGradient>
      <radialGradient id="masterCore" cx="50%" cy="45%" r="60%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#c98bff" />
        <stop offset="100%" stopColor="#5b1f8a" />
      </radialGradient>
    </defs>
    <path d="M50 2 L92 22 L86 58 C82 82 66 96 50 100 C34 96 18 82 14 58 L8 22 Z" fill="url(#masterBody)" stroke="#240b3d" strokeWidth="1.6" filter="url(#bevel)" />
    <path d="M9 23 L9 58" stroke="#ffffff" strokeWidth="1" opacity="0.4" strokeLinecap="round" />
    <circle cx="50" cy="48" r="16" fill="url(#masterCore)" filter="url(#innerShadow)" />
    <ellipse cx="45" cy="42" rx="6" ry="4" fill="#ffffff" opacity="0.55" />
    <ellipse cx="38" cy="18" rx="13" ry="6" fill="#ffffff" opacity="0.45" />
  </svg>
);

const GrandmasterIcon = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={badgeSvg} aria-hidden="true">
    <defs>
      <linearGradient id="gmBody" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#ffb0b8" />
        <stop offset="30%" stopColor="#c22c3a" />
        <stop offset="65%" stopColor="#7a1420" />
        <stop offset="100%" stopColor="#3f0a10" />
      </linearGradient>
      <radialGradient id="gmCore" cx="50%" cy="45%" r="60%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#ff5f6e" />
        <stop offset="100%" stopColor="#7a1420" />
      </radialGradient>
    </defs>
    <path d="M50 1 L94 22 L88 60 C83 85 65 98 50 101 C35 98 17 85 12 60 L6 22 Z" fill="url(#gmBody)" stroke="#2e0409" strokeWidth="1.6" filter="url(#bevel)" />
    <path d="M7 23 L7 60" stroke="#ffffff" strokeWidth="1" opacity="0.4" strokeLinecap="round" />
    <polygon points="50,28 62,42 62,58 50,72 38,58 38,42" fill="url(#gmCore)" filter="url(#innerShadow)" />
    <polygon points="50,28 62,42 50,50 38,42" fill="#ffffff" opacity="0.5" />
    <ellipse cx="38" cy="18" rx="13" ry="6" fill="#ffffff" opacity="0.4" />
  </svg>
);

const ChallengerIcon = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={badgeSvg} aria-hidden="true">
    <defs>
      <linearGradient id="chalBody" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#fffbe6" />
        <stop offset="28%" stopColor="#ffd76a" />
        <stop offset="62%" stopColor="#c9891b" />
        <stop offset="100%" stopColor="#7a5410" />
      </linearGradient>
      <radialGradient id="chalCore" cx="50%" cy="42%" r="65%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="50%" stopColor="#fff2c2" />
        <stop offset="100%" stopColor="#c9891b" />
      </radialGradient>
    </defs>
    <path d="M50 0 L96 22 L90 62 C85 88 65 99 50 102 C35 99 15 88 10 62 L4 22 Z" fill="url(#chalBody)" stroke="#5c3d0a" strokeWidth="1.6" filter="url(#bevel)" />
    <path d="M5 23 L5 62" stroke="#ffffff" strokeWidth="1" opacity="0.45" strokeLinecap="round" />
    <circle cx="50" cy="46" r="21" fill="url(#chalCore)" filter="url(#innerShadow)" />
    <path d="M50 26 L50 66 M30 46 L70 46 M36 32 L64 60 M64 32 L36 60" stroke="#5c3d0a" strokeWidth="0.9" opacity="0.3" />
    <ellipse cx="42" cy="34" rx="8" ry="5" fill="#ffffff" opacity="0.6" />
    <ellipse cx="38" cy="17" rx="13" ry="6" fill="#ffffff" opacity="0.5" />
  </svg>
);

/* Nine tiers: brushed metal (Iron→Gold) into cut crystal (Platinum→Challenger).
   XP thresholds remapped from the previous ladder so ranks stay well-spread. */
const TIERS: Tier[] = [
  { key: "iron", label: "Iron", slogan: "Every climb starts here.", min: 0, span: 200, Icon: IronIcon, from: "#e5e7eb", to: "#4b4f56", text: "text-slate-500", badge: "bg-slate-100 text-slate-600" },
  { key: "bronze", label: "Bronze", slogan: "Finding your footing.", min: 200, span: 300, Icon: BronzeIcon, from: "#fde9d3", to: "#c17f42", text: "text-orange-800", badge: "bg-orange-100 text-orange-800" },
  { key: "silver", label: "Silver", slogan: "Picking up speed.", min: 500, span: 400, Icon: SilverIcon, from: "#eef2f6", to: "#9aa4b0", text: "text-slate-600", badge: "bg-slate-100 text-slate-600" },
  { key: "gold", label: "Gold", slogan: "Time to shine.", min: 900, span: 500, Icon: GoldIcon, from: "#fdecc0", to: "#d9a021", text: "text-amber-700", badge: "bg-amber-100 text-amber-800" },
  { key: "platinum", label: "Platinum", slogan: "Rare air now.", min: 1400, span: 600, Icon: PlatinumIcon, from: "#d3faf3", to: "#1f8a8a", text: "text-teal-700", badge: "bg-teal-100 text-teal-700" },
  { key: "diamond", label: "Diamond", slogan: "Cut from something harder.", min: 2000, span: 800, Icon: DiamondIcon, from: "#dbe6ff", to: "#3454c9", text: "text-blue-700", badge: "bg-blue-100 text-blue-700" },
  { key: "master", label: "Master", slogan: "Among the elite.", min: 2800, span: 1000, Icon: MasterIcon, from: "#ecdcff", to: "#7a35b8", text: "text-violet-700", badge: "bg-violet-100 text-violet-700" },
  { key: "grandmaster", label: "Grandmaster", slogan: "Few ever reach this.", min: 3800, span: 1200, Icon: GrandmasterIcon, from: "#ffd9dd", to: "#c22c3a", text: "text-rose-700", badge: "bg-rose-100 text-rose-700" },
  { key: "challenger", label: "Challenger", slogan: "The very top.", min: 5000, span: 1500, Icon: ChallengerIcon, from: "#fff2c2", to: "#d99a1e", text: "text-amber-600", badge: "bg-amber-100 text-amber-800" },
];
const DIVISIONS = ["III", "II", "I"];

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "total", label: "All time" },
];
function xpFor(player: Player, period: Period): number {
  return period === "week" ? player.xpWeek : period === "month" ? player.xpMonth : player.xpTotal;
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}
function tierFor(xp: number): Tier {
  return [...TIERS].reverse().find((t) => xp >= t.min) || TIERS[0];
}
function tierIndex(tier: Tier): number {
  return TIERS.findIndex((t) => t.key === tier.key);
}
function divisionInfo(xp: number, tier: Tier): Division {
  const third = tier.span / 3;
  const position = xp - tier.min;
  const divisionIdx = Math.min(2, Math.floor(position / third));
  const remainder = position - divisionIdx * third;
  const progressPct = Math.min(100, Math.round((remainder / third) * 100));
  const idx = tierIndex(tier);
  const next = idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
  if (divisionIdx < 2) {
    return {
      label: DIVISIONS[divisionIdx],
      progressPct,
      xpToNext: Math.ceil(third - remainder),
      nextLabel: `${tier.label} ${DIVISIONS[divisionIdx + 1]}`,
    };
  }
  return {
    label: DIVISIONS[2],
    progressPct,
    xpToNext: next ? Math.ceil(third - remainder) : null,
    nextLabel: next ? `${next.label} ${DIVISIONS[0]}` : null,
  };
}

function getBadges(player: Player, pool: Player[]): Badge[] {
  const badges: Badge[] = [];
  const maxAccuracy = Math.max(...pool.map((p) => p.accuracy));
  const maxWeek = Math.max(...pool.map((p) => p.xpWeek));
  if (player.streak >= 7) badges.push({ emoji: "🔥", label: "7-day streak" });
  if (player.xpWeek === maxWeek && maxWeek > 0) badges.push({ emoji: "⚡", label: "Fast learner" });
  if (player.xpTotal >= 3000) badges.push({ emoji: "💎", label: "Gem tier" });
  if (player.accuracy === maxAccuracy) badges.push({ emoji: "🎯", label: "Sharpest aim" });
  return badges;
}

/* Renders a tier's shield badge at a given pixel size. */
function Medallion({ tier, size = 52 }: { tier: Tier; size?: number }) {
  const Icon = tier.Icon;
  return (
    <div
      role="img"
      aria-label={`${tier.label} rank badge`}
      className="shrink-0"
      style={{ width: size, height: size, filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.28))" }}
    >
      <Icon />
    </div>
  );
}

const PODIUM_STYLE: Record<number, { h: string; ring: string; medal: string; order: string }> = {
  1: { h: "pt-2 pb-5", ring: "ring-2 ring-amber-300", medal: "bg-amber-400 text-amber-900", order: "order-2" },
  2: { h: "pt-6 pb-4", ring: "ring-1 ring-slate-200", medal: "bg-slate-300 text-slate-700", order: "order-1" },
  3: { h: "pt-6 pb-4", ring: "ring-1 ring-slate-200", medal: "bg-orange-300 text-orange-900", order: "order-3" },
};

function PodiumCard({ player, rank, isMe }: { player: PlayerWithXp; rank: number; isMe: boolean }) {
  const tier = player.tier; // lifetime rank; XP figure below reflects the selected period
  const s = PODIUM_STYLE[rank];
  return (
    <div className={`${s.order} min-w-[104px] sm:min-w-0 sm:flex-1 flex flex-col items-center bg-white rounded-2xl ${s.ring} ${s.h} px-3 relative shrink-0 transition-transform hover:-translate-y-1`}>
      {rank === 1 && <Trophy className="w-5 h-5 text-amber-400 absolute -top-3" strokeWidth={2} aria-hidden="true" />}
      <div className="relative mt-2">
        <Medallion tier={tier} size={52} />
        <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${s.medal}`}>{rank}</span>
      </div>
      <p className={`mt-2.5 font-semibold text-sm truncate max-w-[90px] ${isMe ? "text-slate-900" : "text-slate-800"}`}>
        {player.name}
        {isMe && " (you)"}
      </p>
      <p className="text-[11px] text-slate-400">{player.xp.toLocaleString()} xp</p>
    </div>
  );
}

function RankRow({ player, rank, isMe, pool }: { player: PlayerWithXp; rank: number; isMe: boolean; pool: PlayerWithXp[] }) {
  const tier = player.tier;
  const badges = getBadges(player, pool);
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isMe ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
      <span className={`text-sm font-bold w-7 text-center shrink-0 ${rank <= 3 ? "text-slate-700" : "text-slate-400"}`}>#{rank}</span>
      <Medallion tier={tier} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className={`text-sm truncate ${isMe ? "font-semibold text-indigo-700" : "font-medium text-slate-700"}`}>{player.name}</p>
          {isMe && <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-semibold">you</span>}
          {badges.map((b) => (
            <span key={b.label} role="img" aria-label={b.label} title={b.label} className="text-xs">
              {b.emoji}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          {player.group} · {tier.label}
        </p>
      </div>
      <span className="text-sm font-semibold text-slate-700 shrink-0">{player.xp.toLocaleString()} xp</span>
    </div>
  );
}

function TierCard({ tier, players, isCurrent }: { tier: Tier; players: PlayerWithXp[]; isCurrent: boolean }) {
  const sorted = [...players].sort((a, b) => b.xpTotal - a.xpTotal);
  return (
    <div className={`relative bg-white rounded-2xl p-4 flex flex-col items-center text-center transition-shadow hover:shadow-md ${isCurrent ? "border-2 border-indigo-300 ring-2 ring-indigo-100" : "border border-slate-100"}`}>
      {isCurrent && <span className="absolute -top-2 text-[10px] font-bold text-white bg-indigo-600 px-2 py-0.5 rounded-full shadow-sm">You&apos;re here</span>}
      <Medallion tier={tier} size={60} />
      <p className={`font-bold text-sm mt-2 ${tier.text}`}>{tier.label}</p>
      <p className="text-[11px] text-slate-400 italic mt-0.5 leading-snug min-h-[28px]">&quot;{tier.slogan}&quot;</p>
      <p className="text-[10px] font-medium text-slate-400 mt-0.5">{tier.min === 0 ? "Starting rank" : `${tier.min.toLocaleString()}+ xp`}</p>
      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold mt-2 ${tier.badge}`}>
        {sorted.length} {sorted.length === 1 ? "student" : "students"}
      </span>
      <div className="mt-3 flex items-center -space-x-2 min-h-[28px]">
        {sorted.length > 0 ? (
          sorted.slice(0, 4).map((p) => (
            <div key={p.name} title={p.name} className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-white" style={{ background: tier.to }}>
              {initials(p.name)}
            </div>
          ))
        ) : (
          <div className="flex items-center gap-1 text-amber-500">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />
            <p className="text-[11px] font-medium">Be the first here!</p>
          </div>
        )}
        {sorted.length > 4 && <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold bg-slate-100 text-slate-500 ring-2 ring-white">+{sorted.length - 4}</div>}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const [group, setGroup] = useState("All groups");
  const [period, setPeriod] = useState<Period>("total");
  const [showAll, setShowAll] = useState(false);
  const [showTiers, setShowTiers] = useState(false);
  const groups = ["All groups", "Class A", "Class B"];

  const withXp = useMemo<PlayerWithXp[]>(
    () => PLAYERS.map((p) => ({ ...p, xp: xpFor(p, period), tier: tierFor(p.xpTotal) })),
    [period],
  );

  const filtered = useMemo(
    () => (group === "All groups" ? withXp : withXp.filter((p) => p.group === group)),
    [withXp, group],
  );

  const ranked = useMemo(() => [...filtered].sort((a, b) => b.xp - a.xp), [filtered]);
  const globalRanked = useMemo(() => [...withXp].sort((a, b) => b.xp - a.xp), [withXp]);

  const byTier = useMemo(() => {
    const map: Record<string, PlayerWithXp[]> = {};
    for (const t of TIERS) map[t.key] = [];
    for (const p of filtered) map[p.tier.key].push(p);
    return map;
  }, [filtered]);

  const classAvg = useMemo(() => {
    const a = withXp.filter((p) => p.group === "Class A");
    const b = withXp.filter((p) => p.group === "Class B");
    const avg = (arr: PlayerWithXp[]) => (arr.length ? Math.round(arr.reduce((s, p) => s + p.xp, 0) / arr.length) : 0);
    return { A: avg(a), B: avg(b) };
  }, [withXp]);

  const me = withXp.find((p) => p.name === CURRENT_USER)!;

  const meInFiltered = ranked.some((p) => p.name === CURRENT_USER);
  const board = meInFiltered ? ranked : globalRanked;
  const scope = meInFiltered && group !== "All groups" ? `in ${group}` : "overall";
  const myRank = board.findIndex((p) => p.name === CURRENT_USER) + 1;
  const personAbove = myRank > 1 ? board[myRank - 2] : null;
  const xpToPass = personAbove ? personAbove.xp - me.xp + 1 : 0;

  // Rank + division are pinned to ALL-TIME XP — a student is never demoted by the period toggle.
  const myTier = tierFor(me.xpTotal);
  const myDiv = divisionInfo(me.xpTotal, myTier);
  const lessonsToNextDiv = myDiv.xpToNext ? Math.max(1, Math.ceil(myDiv.xpToNext / XP_PER_LESSON)) : null;
  const lessonPhrase =
    lessonsToNextDiv == null
      ? null
      : lessonsToNextDiv <= 3
        ? `${lessonsToNextDiv} more lesson${lessonsToNextDiv === 1 ? "" : "s"}`
        : "a few more lessons";
  const proximityWord = myDiv.progressPct >= 60 ? "close to" : "on your way to";
  const myBadges = getBadges(me, withXp);

  const top3 = ranked.slice(0, 3);

  // Collapsed rank journey: show up to the user's current tier (min 3) so "You're here" stays visible.
  const myTierIdx = tierIndex(myTier);
  const tierPreviewCount = Math.max(3, myTierIdx + 1);
  const visibleTiers = showTiers ? TIERS : TIERS.slice(0, tierPreviewCount);

  const visible = showAll ? ranked : ranked.slice(0, PUBLIC_TOP_N);
  const meVisible = visible.some((p) => p.name === CURRENT_USER);
  const myListIdx = ranked.findIndex((p) => p.name === CURRENT_USER);
  const myRow = myListIdx >= 0 ? ranked[myListIdx] : null;

  return (
    <div className="max-w-2xl mx-auto">
      <BadgeDefs />

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Leaderboard</h1>
        <p className="text-sm text-slate-400 mt-1">Vocabulary practice · climb the ranks</p>
      </div>

      {/* Your Progress Card */}
      <div className="relative bg-indigo-600 rounded-2xl px-5 py-5 mb-5 text-white overflow-hidden">
        <div className="flex items-center gap-4 mb-2">
          <div className="bg-white/15 rounded-2xl p-1.5 shrink-0">
            <Medallion tier={myTier} size={48} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-indigo-100">
              You are <span className="font-bold text-white">#{myRank}</span> {scope}
            </p>
            <p className="text-xl font-black leading-tight">
              {myTier.label} {myDiv.label} · {me.xpTotal.toLocaleString()} xp
            </p>
            <p className="text-xs text-indigo-200 italic mt-0.5">&quot;{myTier.slogan}&quot;</p>
          </div>
          {me.streak > 0 && (
            <div className="flex items-center gap-1 bg-white/15 rounded-lg px-2.5 py-1.5 shrink-0" title={`${me.streak}-day streak`}>
              <Flame className="w-4 h-4 text-orange-200 fill-orange-200" aria-hidden="true" />
              <span className="text-sm font-bold">{me.streak}</span>
            </div>
          )}
        </div>

        <div
          className="h-2 bg-white/15 rounded-full overflow-hidden mt-3"
          role="progressbar"
          aria-valuenow={myDiv.progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progress through ${myTier.label} ${myDiv.label}`}
        >
          <div className="h-full bg-white rounded-full transition-all duration-700 ease-out" style={{ width: `${myDiv.progressPct}%` }} />
        </div>

        <p className="text-xs text-indigo-100 mt-2">
          {myDiv.nextLabel ? `You are ${proximityWord} ${myDiv.nextLabel}. Complete ${lessonPhrase} to get there.` : "Top rank reached — hold your ground."}
        </p>

        {personAbove && (
          <p className="text-xs text-indigo-100 mt-1">
            <span className="font-semibold text-white">{xpToPass.toLocaleString()} xp</span> to pass {personAbove.name} {scope}
          </p>
        )}

        {myBadges.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {myBadges.map((b) => (
              <span key={b.label} className="flex items-center gap-1 text-[11px] bg-white/15 rounded-full px-2 py-1 font-medium">
                {b.emoji} {b.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Top 3 Podium */}
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 px-1">Top 3 {period === "total" ? "of all time" : period === "week" ? "this week" : "this month"}</p>
      <div className="flex items-end gap-3 mb-6 overflow-x-auto pb-1 sm:overflow-visible">
        {top3.map((p, i) => (
          <PodiumCard key={p.name} player={p} rank={i + 1} isMe={p.name === CURRENT_USER} />
        ))}
      </div>

      {/* Filters: Group + Time */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1" role="tablist" aria-label="Time period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              role="tab"
              aria-selected={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`text-xs sm:text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${period === p.key ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <label htmlFor="group-filter" className="sr-only">
            Filter by group
          </label>
          <select
            id="group-filter"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="appearance-none text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 cursor-pointer"
          >
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        </div>
      </div>

      {/* Class comparison */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 bg-white rounded-xl border border-slate-100 px-3 py-2">
          <p className="text-[11px] text-slate-400">Class A average</p>
          <p className="text-sm font-bold text-indigo-600">{classAvg.A.toLocaleString()} xp</p>
        </div>
        <div className="flex-1 bg-white rounded-xl border border-slate-100 px-3 py-2">
          <p className="text-[11px] text-slate-400">Class B average</p>
          <p className="text-sm font-bold text-teal-600">{classAvg.B.toLocaleString()} xp</p>
        </div>
      </div>

      {/* Rank Journey */}
      <div className="flex items-center justify-between mb-1 px-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Rank journey</p>
        {TIERS.length > tierPreviewCount && (
          <button onClick={() => setShowTiers((v) => !v)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
            {showTiers ? "Show fewer" : `Show all tiers (${TIERS.length})`}
          </button>
        )}
      </div>
      <p className="flex items-center gap-1 text-[11px] text-slate-400 mb-2 px-1">
        <Info className="w-3 h-3 shrink-0" aria-hidden="true" /> Brushed metal to cut crystal — your rank comes from all-time XP and never drops.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {visibleTiers.map((tier) => (
          <TierCard key={tier.key} tier={tier} players={byTier[tier.key]} isCurrent={tier.key === myTier.key} />
        ))}
      </div>

      {/* Standings */}
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Standings</p>
        {ranked.length > PUBLIC_TOP_N && (
          <button onClick={() => setShowAll((v) => !v)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
            {showAll ? "Show top 5" : `Show all (${ranked.length})`}
          </button>
        )}
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50 overflow-hidden">
        {visible.map((p, i) => (
          <RankRow key={p.name} player={p} rank={i + 1} isMe={p.name === CURRENT_USER} pool={withXp} />
        ))}
        {!showAll && !meVisible && myRow && (
          <>
            <div className="text-center text-slate-300 text-xs py-1 select-none" aria-hidden="true">
              ···
            </div>
            <RankRow player={myRow} rank={myListIdx + 1} isMe pool={withXp} />
          </>
        )}
      </div>
      {!showAll && (
        <p className="text-[11px] text-slate-400 mt-2 px-1">
          Only the top {PUBLIC_TOP_N} are shown publicly. You always see your own position.
        </p>
      )}
    </div>
  );
}
