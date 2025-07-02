"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Optionally, you can map route segments to readable names here
const segmentNameMap: Record<string, string> = {
  projects: "Projects",
  backlog: "Backlog",
  boards: "Boards",
  sprints: "Sprints",
  releases: "Releases",
  epics: "Epics",
  issues: "Issues",
  notifications: "Notifications",
  settings: "Settings",
  profile: "Profile",
  contact: "Contact",
};

export default function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Build up the breadcrumb links
  const crumbs = segments.map((seg, idx) => {
    const href = "/" + segments.slice(0, idx + 1).join("/");
    let label = segmentNameMap[seg] || seg;
    // Optionally, show IDs as '#' or fetch names for projects/issues
    if (/^[0-9a-fA-F-]{8,}$/.test(seg)) label = "#" + seg.slice(0, 6);
    return { href, label };
  });

  return (
    <nav aria-label="Breadcrumb" className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
      <Link href="/" className="hover:underline">Home</Link>
      {crumbs.map((crumb, idx) => (
        <React.Fragment key={crumb.href}>
          <span className="mx-1">/</span>
          {idx === crumbs.length - 1 ? (
            <span className="font-semibold text-gray-700 dark:text-gray-200">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:underline">{crumb.label}</Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
} 