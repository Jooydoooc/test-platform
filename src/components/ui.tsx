import Link from "next/link";
import type { ComponentProps } from "react";

const base =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none sm:min-h-0";

const variants = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger:
    "border border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50",
} as const;

type Variant = keyof typeof variants;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return (
    <Link className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={`rounded-xl border border-slate-200/80 bg-white p-5 shadow-card ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

// text-base (16px) on small screens prevents iOS Safari from auto-zooming
// when an input is focused; sm:text-sm restores the tighter look on desktop.
export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 sm:py-2 sm:text-sm";

const badgeTones = {
  brand: "bg-brand-50 text-brand-700 ring-brand-600/15",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  neutral: "bg-slate-100 text-slate-600 ring-slate-500/15",
} as const;

export function Badge({
  tone = "neutral",
  className = "",
  ...props
}: ComponentProps<"span"> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeTones[tone]} ${className}`}
      {...props}
    />
  );
}

// Thin progress meter for scores / completion. `value` is 0–100.
export function ProgressBar({
  value,
  className = "",
  tone = "brand",
}: {
  value: number;
  className?: string;
  tone?: "brand" | "success" | "amber" | "error";
}) {
  const pct = Math.max(0, Math.min(100, value));
  const fill =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : tone === "error"
          ? "bg-error"
          : "bg-brand-600";
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${fill}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
