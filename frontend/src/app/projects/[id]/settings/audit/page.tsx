"use client";
import React from "react";
import { useParams } from "next/navigation";
import AuditDashboard from "../../../../../components/AuditDashboard";
import ProtectedProjectRoute from "../../../../../components/ProtectedProjectRoute";

export default function AuditSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;

  return (
    <ProtectedProjectRoute allowedRoles={["Super-Admin", "ProjectLead"]}>
      <AuditDashboard projectId={projectId} />
    </ProtectedProjectRoute>
  );
}
