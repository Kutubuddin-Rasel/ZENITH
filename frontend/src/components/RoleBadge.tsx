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
      "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  },
};

export default function RoleBadge({ role, className = "" }: { role: string; className?: string }) {
  const style = ROLE_STYLES[role] || {
    label: role,
    className: "bg-gray-200 text-gray-700 border-gray-300",
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