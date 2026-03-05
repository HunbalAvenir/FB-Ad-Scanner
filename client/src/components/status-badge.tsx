import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  active: { variant: "default", label: "Active" },
  healthy: { variant: "default", label: "Healthy" },
  onboarding: { variant: "secondary", label: "Onboarding" },
  paused: { variant: "secondary", label: "Paused" },
  degraded: { variant: "destructive", label: "Degraded" },
  error: { variant: "destructive", label: "Error" },
  pending: { variant: "outline", label: "Pending" },
  expired: { variant: "destructive", label: "Expired" },
  revoked: { variant: "destructive", label: "Revoked" },
  insufficient_permissions: { variant: "destructive", label: "Insufficient" },
  open: { variant: "destructive", label: "Open" },
  acknowledged: { variant: "secondary", label: "Acknowledged" },
  resolved: { variant: "default", label: "Resolved" },
  dismissed: { variant: "outline", label: "Dismissed" },
  critical: { variant: "destructive", label: "Critical" },
  warning: { variant: "secondary", label: "Warning" },
  info: { variant: "outline", label: "Info" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const config = statusConfig[status] || { variant: "outline" as const, label: status };
  return (
    <Badge variant={config.variant} className={className} data-testid={`badge-status-${status}`}>
      {config.label}
    </Badge>
  );
}

const accessModeLabels: Record<string, string> = {
  partner: "Partner Access",
  user: "User Token",
  both: "Partner + User",
  public_only: "Public Only",
  unknown: "Unknown",
};

export function AccessModeBadge({ mode }: { mode: string }) {
  const label = accessModeLabels[mode] || mode;
  const variant = mode === "partner" || mode === "both" ? "default" : mode === "user" ? "secondary" : "outline";
  return (
    <Badge variant={variant as any} data-testid={`badge-access-${mode}`}>
      {label}
    </Badge>
  );
}
