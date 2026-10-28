"use client";

// 1차 / 2차 보완 고르기 (Design Ref: §3.1 ① 차수 고르기)

import type { ReplyRound } from "@/lib/reply-types";

interface Props {
  value: ReplyRound;
  onChange: (round: ReplyRound) => void;
  disabled?: boolean;
  label: string;
}

export default function RoundSelect({ value, onChange, disabled, label }: Props) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value) as ReplyRound)}
      className="rounded border border-black/15 bg-transparent px-1.5 py-0.5 text-xs dark:border-white/20"
    >
      <option value={1}>1차</option>
      <option value={2}>2차 보완</option>
    </select>
  );
}
