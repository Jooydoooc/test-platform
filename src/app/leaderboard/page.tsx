"use client";

import { useState, useMemo, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { Flame, Gem, Trophy, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const XP_PER_LESSON = 60; // rough estimate used only to phrase "complete N more lessons"
const PUBLIC_TOP_N = 5; // only the top N are shown publicly; each student always sees their own row

// Real leaderboard rows come from the group_xp_leaderboard() RPC: EXP summed from
// tests + exercises + vocab practice, scoped to the caller's own group, full names.
type Player = {
  name: string;
  streak: number;
  xpWeek: number;
  xpMonth: number;
  xpTotal: number;
  isMe: boolean;
  activity: number;
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

type Badge = { Icon: LucideIcon; label: string };

type Division = {
  label: string;
  progressPct: number;
  xpToNext: number | null;
  nextLabel: string | null;
};

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
  const maxWeek = Math.max(0, ...pool.map((p) => p.xpWeek));
  if (player.streak >= 7) badges.push({ Icon: Flame, label: "7-day streak" });
  if (player.xpWeek === maxWeek && maxWeek > 0) badges.push({ Icon: Zap, label: "Fast learner" });
  if (player.xpTotal >= 3000) badges.push({ Icon: Gem, label: "Gem tier" });
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
      <p className="text-xs font-semibold text-slate-600 tabular-nums">{player.xp.toLocaleString()} xp</p>
    </div>
  );
}

function RankRow({ player, rank, isMe, pool }: { player: PlayerWithXp; rank: number; isMe: boolean; pool: PlayerWithXp[] }) {
  const tier = player.tier;
  const badges = getBadges(player, pool);
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isMe ? "bg-brand-50" : "hover:bg-slate-50"}`}>
      <span className={`text-sm font-bold w-7 text-center shrink-0 tabular-nums ${rank <= 3 ? "text-slate-700" : "text-slate-500"}`}>#{rank}</span>
      <Medallion tier={tier} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className={`text-sm truncate ${isMe ? "font-semibold text-brand-700" : "font-medium text-slate-700"}`}>{player.name}</p>
          {isMe && <span className="text-[10px] bg-brand-600 text-white px-1.5 py-0.5 rounded-full font-semibold">you</span>}
          {badges.map((b) => (
            <span key={b.label} aria-label={b.label} title={b.label} className="inline-flex">
              <b.Icon className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
            </span>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          {tier.label} · {player.activity} {player.activity === 1 ? "activity" : "activities"}
        </p>
      </div>
      <span className="text-sm font-semibold text-slate-700 shrink-0 tabular-nums">{player.xp.toLocaleString()} xp</span>
    </div>
  );
}

/* Compact side-panel row for one tier — de-emphasised so the standings stay the focus.
   Each tier has three steps (divisions III → II → I); `stepsDone` (0–3) reflects the
   viewer's progress, with the current step ring-highlighted on their own tier. */
function TierListItem({
  tier,
  count,
  isCurrent,
  stepsDone,
}: {
  tier: Tier;
  count: number;
  isCurrent: boolean;
  stepsDone: number;
}) {
  return (
    <div className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${isCurrent ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-slate-50"}`}>
      <Medallion tier={tier} size={30} />
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-bold leading-tight ${tier.text}`}>
          {tier.label}
          {isCurrent && <span className="ml-1 text-[9px] font-semibold uppercase tracking-wide text-brand-600">· you</span>}
        </p>
        <div className="mt-1 flex gap-1">
          {DIVISIONS.map((d, i) => {
            const done = i < stepsDone;
            const current = isCurrent && i === stepsDone - 1;
            return (
              <span
                key={d}
                title={`${tier.label} division ${d}`}
                className={`flex-1 rounded text-center text-[9px] font-bold leading-4 ${
                  current
                    ? "bg-brand-600 text-white"
                    : done
                      ? tier.badge
                      : "bg-slate-100 text-slate-300"
                }`}
              >
                {d}
              </span>
            );
          })}
        </div>
      </div>
      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${count > 0 ? tier.badge : "bg-slate-50 text-slate-300"}`}>{count}</span>
    </div>
  );
}

type LeaderRow = {
  student_id: string;
  display_name: string;
  xp_total: number;
  xp_week: number;
  xp_month: number;
  streak: number;
  activity_count: number;
  is_me: boolean;
};

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>("total");
  const [showAll, setShowAll] = useState(false);
  const [showAllTiers, setShowAllTiers] = useState(false);
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Real data: group_xp_leaderboard() sums EXP from tests + exercises + vocab
  // practice, scoped by RLS to the caller's own group. Client read (RPC is
  // grant-execute to authenticated); the function itself does the group scoping.
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.rpc("group_xp_leaderboard").then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setFailed(true);
        setRows([]);
      } else {
        setRows((data ?? []) as LeaderRow[]);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const withXp = useMemo<PlayerWithXp[]>(() => {
    const players: Player[] = (rows ?? []).map((r) => ({
      name: r.display_name || "Student",
      streak: r.streak,
      xpWeek: r.xp_week,
      xpMonth: r.xp_month,
      xpTotal: r.xp_total,
      isMe: r.is_me,
      activity: r.activity_count,
    }));
    return players
      .map((p) => ({ ...p, xp: xpFor(p, period), tier: tierFor(p.xpTotal) }))
      .sort((a, b) => b.xp - a.xp);
  }, [rows, period]);

  const ranked = withXp;

  const byTier = useMemo(() => {
    const map: Record<string, PlayerWithXp[]> = {};
    for (const t of TIERS) map[t.key] = [];
    for (const p of withXp) map[p.tier.key].push(p);
    return map;
  }, [withXp]);

  const me = ranked.find((p) => p.isMe) ?? null;
  const myRank = me ? ranked.findIndex((p) => p.isMe) + 1 : 0;
  const personAbove = me && myRank > 1 ? ranked[myRank - 2] : null;
  const xpToPass = personAbove && me ? personAbove.xp - me.xp + 1 : 0;

  // Rank + division are pinned to ALL-TIME XP — never demoted by the period toggle.
  const myTier = me ? tierFor(me.xpTotal) : TIERS[0];
  const myDiv = me ? divisionInfo(me.xpTotal, myTier) : null;
  const myTierIdx = tierIndex(myTier);
  const myDivIdx = myDiv ? DIVISIONS.indexOf(myDiv.label) : -1;
  const lessonsToNextDiv = myDiv && myDiv.xpToNext ? Math.max(1, Math.ceil(myDiv.xpToNext / XP_PER_LESSON)) : null;
  const lessonPhrase =
    lessonsToNextDiv == null
      ? null
      : lessonsToNextDiv <= 3
        ? `${lessonsToNextDiv} more lesson${lessonsToNextDiv === 1 ? "" : "s"}`
        : "a few more lessons";
  const proximityWord = myDiv && myDiv.progressPct >= 60 ? "close to" : "on your way to";
  const myBadges = me ? getBadges(me, withXp) : [];

  // Rank-journey ladder: by default show only tiers that carry meaning right now —
  // populated tiers plus the viewer's own tier and its immediate neighbours. Empty
  // tiers collapse behind a "Show full ladder" expander. A viewer with no rank yet
  // sees the whole aspirational ladder (nothing to anchor a collapse around).
  const tierShownCollapsed = (idx: number): boolean =>
    byTier[TIERS[idx].key].length > 0 || (!!me && Math.abs(idx - myTierIdx) <= 1);
  const hiddenTierCount = me ? TIERS.filter((_, i) => !tierShownCollapsed(i)).length : 0;

  // The rank number reflects the selected period, so name the period alongside it
  // (a student can be #1 this week but #3 overall). Tier/division stay all-time.
  const rankScope = period === "total" ? "overall" : period === "week" ? "this week" : "this month";

  // Legend for the row badges: touch users can't hover the icon-only badges, so
  // list every badge type that actually appears in the standings, with its label.
  const legendBadges: Badge[] = [];
  {
    const seen = new Set<string>();
    for (const p of withXp)
      for (const b of getBadges(p, withXp))
        if (!seen.has(b.label)) {
          seen.add(b.label);
          legendBadges.push(b);
        }
  }

  const top3 = ranked.slice(0, 3);
  const visible = showAll ? ranked : ranked.slice(0, PUBLIC_TOP_N);
  const meVisible = visible.some((p) => p.isMe);
  const myListIdx = ranked.findIndex((p) => p.isMe);
  const myRow = myListIdx >= 0 ? ranked[myListIdx] : null;

  const loading = rows === null;
  const hasData = ranked.length > 0;

  return (
    <div className="max-w-5xl mx-auto">
      <BadgeDefs />

      {/* Premium gradient hero — matches Tests + Dashboard */}
      <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-brand-900 to-brand-800 p-6 text-white shadow-card-hover sm:p-8 mb-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl motion-reduce:hidden" />
        <div className="pointer-events-none absolute -bottom-28 left-16 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl motion-reduce:hidden" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-inset ring-white/20">
            <Trophy className="h-3.5 w-3.5" />
            Leaderboard
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Your group standings
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-100/90">
            Earn XP from tests, exercises, and vocabulary practice, hold your
            streak, and rise through the tiers against your group.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-10 text-center text-sm text-slate-500">
          Loading standings…
        </div>
      ) : failed ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-10 text-center">
          <p className="text-lg font-bold text-slate-900">Couldn&apos;t load standings</p>
          <p className="mt-1 text-sm text-slate-600">The leaderboard is temporarily unavailable. Please try again shortly.</p>
        </div>
      ) : (
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 lg:items-start">
      {/* MAIN COLUMN — the students' current standings are the focus */}
      <div className="min-w-0 space-y-6">
      {hasData ? (
      <>
      {/* Your Progress Card — only when the viewer is a ranked student in this group */}
      {me && myDiv && (
      <div className="relative bg-brand-600 rounded-2xl px-5 py-5 text-white overflow-hidden">
        <div className="flex items-center gap-4 mb-2">
          <div className="bg-white/15 rounded-2xl p-1.5 shrink-0">
            <Medallion tier={myTier} size={48} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-brand-100">
              You&apos;re <span className="font-bold text-white">#{myRank}</span> {rankScope} in your group
            </p>
            <p className="text-xl font-black leading-tight tabular-nums">
              {myTier.label} {myDiv.label} · {me.xpTotal.toLocaleString()}{" "}
              <span className="text-sm font-semibold text-brand-200">xp all-time</span>
            </p>
            <p className="text-xs text-brand-200 italic mt-0.5">&quot;{myTier.slogan}&quot;</p>
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

        <p className="text-xs text-brand-100 mt-2">
          {myDiv.nextLabel ? `You are ${proximityWord} ${myDiv.nextLabel}. Complete ${lessonPhrase} to get there.` : "Top rank reached — hold your ground."}
        </p>

        {personAbove && (
          <p className="text-xs text-brand-100 mt-1">
            <span className="font-semibold text-white">{xpToPass.toLocaleString()} xp</span> to pass {personAbove.name}
          </p>
        )}

        {myBadges.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {myBadges.map((b) => (
              <span key={b.label} className="flex items-center gap-1 text-[11px] bg-white/15 rounded-full px-2 py-1 font-medium">
                <b.Icon className="h-3 w-3" aria-hidden="true" /> {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Time period filter — governs the podium and standings below */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1" role="tablist" aria-label="Time period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              role="tab"
              aria-selected={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`text-xs sm:text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${period === p.key ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top 3 podium */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-700 px-1">Top 3 {period === "total" ? "of all time" : period === "week" ? "this week" : "this month"}</p>
        <div className="flex items-end gap-3 overflow-x-auto pb-1 sm:overflow-visible">
          {top3.map((p, i) => (
            <PodiumCard key={p.name + i} player={p} rank={i + 1} isMe={p.isMe} />
          ))}
        </div>
      </div>

      {/* Standings */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-slate-700">Standings</p>
          {ranked.length > PUBLIC_TOP_N && (
            <button onClick={() => setShowAll((v) => !v)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
              {showAll ? "Show top 5" : `Show all (${ranked.length})`}
            </button>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card divide-y divide-slate-100 overflow-hidden">
          {visible.map((p, i) => (
            <RankRow key={p.name + i} player={p} rank={i + 1} isMe={p.isMe} pool={withXp} />
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
        {legendBadges.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-0.5">
            <span className="text-[11px] font-medium text-slate-500">Badges</span>
            {legendBadges.map((b) => (
              <span key={b.label} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <b.Icon className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" /> {b.label}
              </span>
            ))}
          </div>
        )}
        {!showAll && (
          <p className="text-[11px] text-slate-500 px-1">
            Only the top {PUBLIC_TOP_N} are shown publicly. You always see your own position.
          </p>
        )}
      </div>
      </>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-10 text-center">
          <p className="text-lg font-bold text-slate-900">No standings yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
            Once you&apos;re in a group and students start earning XP from tests, exercises, and vocabulary practice, rankings appear here. The rank tiers below are always here to aim for.
          </p>
        </div>
      )}
      </div>
      {/* end main column */}

      {/* SIDE PANEL — rank ladder, tucked out of the way (drops below standings on mobile) */}
      <aside className="mt-6 lg:mt-0 lg:sticky lg:top-6 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-3">
          <p className="text-sm font-semibold text-slate-700 px-1 mb-1">Rank journey</p>
          <p className="text-[11px] text-slate-500 px-1 mb-2">Each tier has three steps (III → II → I) · rank comes from all-time XP and never drops.</p>
          <div className="space-y-0.5">
            {/* Descending: highest tier (Challenger) first, Iron last. Reverse a
                copy so TIERS + all index math (tierIndex/stepsDone) stay intact.
                Collapsed by default to the tiers that matter now; empty tiers hide. */}
            {[...TIERS].reverse().map((tier) => {
              const ti = tierIndex(tier);
              if (!showAllTiers && !tierShownCollapsed(ti)) return null;
              const isCurrent = !!me && tier.key === myTier.key;
              // Steps cleared: whole tier if below yours, your current division if it's yours, none if above (or if not ranked).
              const stepsDone = me ? (ti < myTierIdx ? 3 : isCurrent ? myDivIdx + 1 : 0) : 0;
              return (
                <TierListItem
                  key={tier.key}
                  tier={tier}
                  count={byTier[tier.key].length}
                  isCurrent={isCurrent}
                  stepsDone={stepsDone}
                />
              );
            })}
          </div>
          {hiddenTierCount > 0 && (
            <button
              onClick={() => setShowAllTiers((v) => !v)}
              className="mt-1.5 w-full rounded-lg px-2 py-1.5 text-[11px] font-semibold text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
              aria-expanded={showAllTiers}
            >
              {showAllTiers ? "Show fewer tiers" : `Show full ladder (${hiddenTierCount} more)`}
            </button>
          )}
        </div>
      </aside>
      </div>
      )}
      {/* end grid */}
    </div>
  );
}
