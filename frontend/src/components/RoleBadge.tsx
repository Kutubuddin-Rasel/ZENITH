"use client";
import React from "react";

const ROLE_STYLES: Record<string, { label: string; className: string }> = {
  "Super-Admin": {
    label: "Super Admin",
    className:
      "bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-yellow-400",
  },
  ProjectLead: {
    label: "Lead",
    className:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  },
  Member: {
    label: "Member",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  Developer: {
    label: "Dev",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  QA: {
    label: "QA",
    className:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  },
  Viewer: {
    label: "Viewer",
    className:
      "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300",
  },
};

export default function RoleBadge({ role, className = "" }: { role: string; className?: string }) {
  const style = ROLE_STYLES[role] || {
    label: role,
    className: "bg-neutral-200 text-neutral-700 border-neutral-300",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-bold rounded border shadow-sm ${style.className} ${className}`}
      title={style.label}
    >
      {style.label}
    </span>
  );
} 