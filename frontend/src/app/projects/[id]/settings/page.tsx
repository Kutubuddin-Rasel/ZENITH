"use client";
import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function SettingsRedirectPage() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    if (params?.id) {
      router.replace(`/projects/${params.id}/settings/access`);
    }
  }, [params, router]);
  return null;
} 