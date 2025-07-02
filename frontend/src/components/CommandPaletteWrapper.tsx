"use client";
import React, { useState, useEffect } from "react";
import CommandPalette, { CommandItem } from "./CommandPalette";
import { useRouter } from "next/navigation";

export default function CommandPaletteWrapper({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const router = useRouter();

  const commands: CommandItem[] = [
    {
      id: "goto-projects",
      label: "Go to Projects",
      type: "action",
      onSelect: () => router.push("/projects"),
    },
    {
      id: "goto-notifications",
      label: "Go to Notifications",
      type: "action",
      onSelect: () => router.push("/notifications"),
    },
  ];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        (e.metaKey && e.key.toLowerCase() === "k") ||
        (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey)
      ) {
        setPaletteOpen(true);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={commands} />
      {children}
    </>
  );
} 