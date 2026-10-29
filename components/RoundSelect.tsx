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
      className="input input-inline !w-auto !px-2 !py-1 !text-sm"
    >
      <option value={1}>1차</option>
      <option value={2}>2차 보완</option>
    </select>
  );
}
