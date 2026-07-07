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
  Icon: (props: { color: string }) => React.ReactElement;
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
   Tier symbols — faceted, light-sourced metals & gems.
   Each icon derives light/mid/dark planes from the tier colour
   so the cut catches light like a real stone. White specular
   accents add sparkle. Top-left is the light source throughout.
   ============================================================ */
const BronzeIcon = ({ color }: { color: string }) => {
  const hi = shade(color, 0.42),
    lo = shade(color, -0.22),
    deep = shade(color, -0.45);
  return (
    <svg viewBox="0 0 48 48" width="72%" height="72%" aria-hidden="true">
      <path d="M24 6 L40 11 V25 C40 33.5 32.5 39.5 24 43 C15.5 39.5 8 33.5 8 25 V11 Z" fill={deep} />
      <path d="M24 9 L37 13 V25 C37 32 31 37 24 40 C17 37 11 32 11 25 V13 Z" fill={color} />
      <path d="M24 9 L37 13 V25 C37 32 31 37 24 40 Z" fill={lo} />
      <path d="M24 14 L26.6 19.4 L32.5 20.1 L28.2 24.2 L29.3 30 L24 27.1 L18.7 30 L19.8 24.2 L15.5 20.1 L21.4 19.4 Z" fill={hi} />
    </svg>
  );
};
const SilverIcon = ({ color }: { color: string }) => {
  const hi = shade(color, 0.5),
    lo = shade(color, -0.24),
    deep = shade(color, -0.45);
  return (
    <svg viewBox="0 0 48 48" width="74%" height="74%" aria-hidden="true">
      <polygon points="24,5 40,14.5 40,33.5 24,43 8,33.5 8,14.5" fill={deep} />
      <polygon points="24,8 37,15.7 37,32.3 24,40 11,32.3 11,15.7" fill={color} />
      <polygon points="24,8 37,15.7 37,32.3 24,40" fill={lo} />
      <circle cx="24" cy="24" r="6.5" fill={hi} />
      <ellipse cx="21.5" cy="21.5" rx="2.4" ry="1.5" fill="#fff" opacity="0.6" />
    </svg>
  );
};
const GoldIcon = ({ color }: { color: string }) => {
  const hi = shade(color, 0.5),
    lo = shade(color, -0.22),
    deep = shade(color, -0.42);
  return (
    <svg viewBox="0 0 48 48" width="76%" height="76%" aria-hidden="true">
      <circle cx="24" cy="24" r="17" fill={deep} />
      <circle cx="24" cy="24" r="14.5" fill={color} />
      <path d="M24 9.5 A14.5 14.5 0 0 1 24 38.5 Z" fill={lo} />
      <path d="M24 13 L27 20.6 L35.1 21.2 L28.9 26.3 L30.9 34.2 L24 29.8 L17.1 34.2 L19.1 26.3 L12.9 21.2 L21 20.6 Z" fill={hi} />
      <path d="M24 13 L27 20.6 L24 22 Z" fill="#fff" opacity="0.4" />
    </svg>
  );
};
const EmeraldIcon = ({ color }: { color: string }) => {
  const hi = shade(color, 0.4),
    tbl = shade(color, 0.18),
    lo = shade(color, -0.24),
    deep = shade(color, -0.42);
  return (
    <svg viewBox="0 0 48 48" width="70%" height="70%" aria-hidden="true">
      <polygon points="15,10 33,10 40,17 40,31 33,38 15,38 8,31 8,17" fill={deep} />
      <polygon points="16,12 32,12 38,18 38,30 32,36 16,36 10,30 10,18" fill={color} />
      <polygon points="16,12 32,12 38,18 10,18" fill={hi} />
      <polygon points="10,30 16,36 32,36 38,30" fill={lo} />
      <rect x="15.5" y="18" width="17" height="12" fill={tbl} />
      <rect x="15.5" y="18" width="17" height="12" fill="none" stroke="#fff" strokeWidth="0.8" opacity="0.3" />
      <line x1="15.5" y1="23" x2="32.5" y2="23" stroke="#fff" strokeWidth="0.6" opacity="0.22" />
    </svg>
  );
};
const SapphireIcon = ({ color }: { color: string }) => {
  const hi = shade(color, 0.42),
    mid = shade(color, -0.1),
    lo = shade(color, -0.28),
    deep = shade(color, -0.45);
  return (
    <svg viewBox="0 0 48 48" width="74%" height="74%" aria-hidden="true">
      <polygon points="24,8 41,37 7,37" fill={deep} />
      <polygon points="24,10 39,36 9,36" fill={color} />
      <polygon points="24,10 24,36 9,36" fill={lo} />
      <polygon points="24,22 39,36 24,36" fill={mid} />
      <polygon points="24,10 31,22 17,22" fill={hi} />
      <polygon points="24,10 27.5,22 24,22" fill="#fff" opacity="0.25" />
    </svg>
  );
};
const AmethystIcon = ({ color }: { color: string }) => {
  const hi = shade(color, 0.42),
    lo = shade(color, -0.26),
    deep = shade(color, -0.45);
  return (
    <svg viewBox="0 0 48 48" width="74%" height="74%" aria-hidden="true">
      <path d="M24 6 C31.5 13 35 20 35 24 C35 28 31.5 35 24 42 C16.5 35 13 28 13 24 C13 20 16.5 13 24 6 Z" fill={deep} />
      <path d="M24 8 C31 14.5 34 20.5 34 24 C34 27.5 31 33.5 24 40 C17 33.5 14 27.5 14 24 C14 20.5 17 14.5 24 8 Z" fill={color} />
      <path d="M24 8 C31 14.5 34 20.5 34 24 C34 27.5 31 33.5 24 40 Z" fill={lo} />
      <polygon points="24,8 30,24 18,24" fill={hi} />
      <line x1="24" y1="8" x2="24" y2="40" stroke="#fff" strokeWidth="1" opacity="0.4" />
      <line x1="14" y1="24" x2="34" y2="24" stroke="#fff" strokeWidth="0.8" opacity="0.25" />
    </svg>
  );
};
const RubyIcon = ({ color }: { color: string }) => {
  const hi = shade(color, 0.4),
    tbl = shade(color, 0.2),
    ll = shade(color, -0.12),
    lo = shade(color, -0.28),
    deep = shade(color, -0.46);
  return (
    <svg viewBox="0 0 48 48" width="74%" height="74%" aria-hidden="true">
      <polygon points="24,7 35,13 41,24 35,35 24,41 13,35 7,24 13,13" fill={deep} />
      <polygon points="24,9 34,14.5 39,24 34,33.5 24,39 14,33.5 9,24 14,14.5" fill={color} />
      <polygon points="24,9 14,14.5 9,24 24,24" fill={hi} />
      <polygon points="24,9 34,14.5 39,24 24,24" fill={lo} />
      <polygon points="9,24 24,24 24,39 14,33.5" fill={ll} />
      <polygon points="39,24 24,24 24,39 34,33.5" fill={deep} />
      <polygon points="24,17 30,24 24,31 18,24" fill={tbl} />
      <circle cx="21" cy="21" r="1.6" fill="#fff" opacity="0.55" />
    </svg>
  );
};
const OnyxIcon = ({ color }: { color: string }) => {
  const hi = shade(color, 0.55),
    lo = shade(color, -0.2),
    deep = shade(color, -0.5);
  return (
    <svg viewBox="0 0 48 48" width="74%" height="74%" aria-hidden="true">
      <polygon points="17,8 31,8 40,17 40,31 31,40 17,40 8,31 8,17" fill={deep} />
      <polygon points="17,10 31,10 38,17 38,31 31,38 17,38 10,31 10,17" fill={color} />
      <polygon points="17,10 31,10 38,17 10,17" fill={hi} />
      <polygon points="10,31 17,38 31,38 38,31" fill={lo} />
      <ellipse cx="21" cy="18" rx="5.5" ry="2.6" fill="#fff" opacity="0.32" />
    </svg>
  );
};
const OpalIcon = ({ color }: { color: string }) => {
  const hi = shade(color, 0.45),
    lo = shade(color, -0.24),
    deep = shade(color, -0.42);
  return (
    <svg viewBox="0 0 48 48" width="74%" height="74%" aria-hidden="true">
      <path d="M24 6 C31.5 15 35 21 35 28 C35 34.5 29.5 41 24 41 C18.5 41 13 34.5 13 28 C13 21 16.5 15 24 6 Z" fill={deep} />
      <path d="M24 8 C31 16 34 21.5 34 28 C34 34 29 39.5 24 39.5 C19 39.5 14 34 14 28 C14 21.5 17 16 24 8 Z" fill={color} />
      <path d="M24 8 C31 16 34 21.5 34 28 C34 34 29 39.5 24 39.5 Z" fill={lo} />
      <path d="M24 8 C28 13 30 17 30 22 L20 25 C19 18 21 13 24 8 Z" fill={hi} />
      <circle cx="20" cy="26" r="2" fill="#f9a8d4" opacity="0.75" />
      <circle cx="27" cy="31" r="1.6" fill="#fde68a" opacity="0.8" />
      <circle cx="24" cy="19" r="1.5" fill="#a5f3fc" opacity="0.85" />
      <circle cx="22" cy="33" r="1.3" fill="#c4b5fd" opacity="0.8" />
      <circle cx="21.5" cy="17" r="1" fill="#fff" opacity="0.7" />
    </svg>
  );
};
const DiamondIcon = ({ color }: { color: string }) => {
  const hi = shade(color, 0.55),
    tbl = shade(color, 0.32),
    mid = shade(color, -0.08),
    lo = shade(color, -0.26),
    deep = shade(color, -0.46);
  return (
    <svg viewBox="0 0 48 48" width="78%" height="78%" aria-hidden="true">
      {/* crown */}
      <polygon points="13,10 35,10 43,19 5,19" fill={color} />
      <polygon points="13,10 20,19 5,19" fill={hi} />
      <polygon points="35,10 43,19 28,19" fill={lo} />
      <polygon points="20,19 28,19 30,10 18,10" fill={tbl} />
      {/* pavilion */}
      <polygon points="5,19 43,19 24,43" fill={deep} />
      <polygon points="5,19 24,19 24,43" fill={mid} />
      <polygon points="14,19 24,19 24,43" fill={lo} />
      <line x1="5" y1="19" x2="43" y2="19" stroke="#fff" strokeWidth="1" opacity="0.4" />
      {/* sparkle */}
      <path d="M31 13 L32 15.4 L34.4 16.4 L32 17.4 L31 19.8 L30 17.4 L27.6 16.4 L30 15.4 Z" fill="#fff" opacity="0.85" />
      <circle cx="21" cy="14.5" r="1.1" fill="#fff" opacity="0.7" />
    </svg>
  );
};

/* min/span preserved from the original ladder — same thresholds, restyled. */
const TIERS: Tier[] = [
  { key: "bronze", label: "Bronze", slogan: "Every climb starts here.", min: 0, span: 200, Icon: BronzeIcon, from: "#ffedd5", to: "#c2660c", text: "text-orange-800", badge: "bg-orange-100 text-orange-800" },
  { key: "silver", label: "Silver", slogan: "You're picking up speed.", min: 200, span: 300, Icon: SilverIcon, from: "#f1f5f9", to: "#94a3b8", text: "text-slate-600", badge: "bg-slate-100 text-slate-600" },
  { key: "gold", label: "Gold", slogan: "Time to shine.", min: 500, span: 400, Icon: GoldIcon, from: "#fef3c7", to: "#f59e0b", text: "text-amber-700", badge: "bg-amber-100 text-amber-800" },
  { key: "emerald", label: "Emerald", slogan: "Rare company now.", min: 900, span: 500, Icon: EmeraldIcon, from: "#d1fae5", to: "#10b981", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-800" },
  { key: "sapphire", label: "Sapphire", slogan: "Cool, sharp, consistent.", min: 1400, span: 600, Icon: SapphireIcon, from: "#dbeafe", to: "#3b82f6", text: "text-blue-700", badge: "bg-blue-100 text-blue-700" },
  { key: "amethyst", label: "Amethyst", slogan: "Among the elite.", min: 2000, span: 800, Icon: AmethystIcon, from: "#ede9fe", to: "#8b5cf6", text: "text-violet-700", badge: "bg-violet-100 text-violet-700" },
  { key: "ruby", label: "Ruby", slogan: "You're on fire.", min: 2800, span: 1000, Icon: RubyIcon, from: "#ffe4e6", to: "#e11d48", text: "text-rose-700", badge: "bg-rose-100 text-rose-700" },
  { key: "onyx", label: "Onyx", slogan: "Forged under pressure.", min: 3800, span: 1200, Icon: OnyxIcon, from: "#e2e8f0", to: "#334155", text: "text-slate-700", badge: "bg-slate-200 text-slate-700" },
  { key: "opal", label: "Opal", slogan: "One of a kind.", min: 5000, span: 1500, Icon: OpalIcon, from: "#ccfbf1", to: "#14b8a6", text: "text-teal-700", badge: "bg-teal-100 text-teal-700" },
  { key: "diamond", label: "Diamond", slogan: "Unbreakable.", min: 6500, span: 1500, Icon: DiamondIcon, from: "#e0f2fe", to: "#38bdf8", text: "text-sky-600", badge: "bg-sky-100 text-sky-700" },
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

function Medallion({ tier, size = 52, dim = false }: { tier: Tier; size?: number; dim?: boolean }) {
  const Icon = tier.Icon;
  return (
    <div
      role="img"
      aria-label={`${tier.label} rank medal`}
      className="relative rounded-full flex items-center justify-center shrink-0 transition-transform"
      style={{
        width: size,
        height: size,
        background: dim
          ? "#e2e8f0"
          : `radial-gradient(circle at 34% 28%, #ffffff, ${tier.from} 52%, ${shade(tier.to, 0.35)} 100%)`,
        boxShadow: dim
          ? "inset 0 2px 3px rgba(0,0,0,0.06)"
          : `inset 0 -3px 7px rgba(0,0,0,0.10), inset 0 2px 4px rgba(255,255,255,0.85), 0 3px 7px rgba(0,0,0,0.12), 0 0 0 1px ${tier.to}1f`,
        opacity: dim ? 0.55 : 1,
      }}
    >
      <Icon color={dim ? "#94a3b8" : tier.to} />
      {!dim && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at 30% 24%, rgba(255,255,255,0.6), rgba(255,255,255,0) 46%)" }}
        />
      )}
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
      <Medallion tier={tier} size={54} />
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

  const visible = showAll ? ranked : ranked.slice(0, PUBLIC_TOP_N);
  const meVisible = visible.some((p) => p.name === CURRENT_USER);
  const myListIdx = ranked.findIndex((p) => p.name === CURRENT_USER);
  const myRow = myListIdx >= 0 ? ranked[myListIdx] : null;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Leaderboard</h1>
        <p className="text-sm text-slate-400 mt-1">Vocabulary practice · climb the ranks</p>
      </div>

      {/* Your Progress Card */}
      <div className="relative bg-indigo-600 rounded-2xl px-5 py-5 mb-5 text-white overflow-hidden">
        <div className="flex items-center gap-4 mb-2">
          <div className="bg-white/15 rounded-full p-1 shrink-0">
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
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1 px-1">Rank journey</p>
      <p className="flex items-center gap-1 text-[11px] text-slate-400 mb-2 px-1">
        <Info className="w-3 h-3 shrink-0" aria-hidden="true" /> Your rank comes from all-time XP and never drops.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {TIERS.map((tier) => (
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
