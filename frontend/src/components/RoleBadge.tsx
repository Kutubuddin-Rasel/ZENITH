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
      "bg-gradient-to-r from-blue-500 to-purple-600 text-white border-blue-500",
  },
  Developer: {
    label: "Dev",
    className:
      "bg-gradient-to-r from-green-500 to-blue-500 text-white border-green-500",
  },
  QA: {
    label: "QA",
    className:
      "bg-gradient-to-r from-pink-500 to-red-500 text-white border-pink-500",
  },
  Viewer: {
    label: "Viewer",
    className:
      "bg-gradient-to-r from-gray-400 to-gray-600 text-white border-gray-400",
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