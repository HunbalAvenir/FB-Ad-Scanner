import { CheckCircle2, XCircle, Clock } from "lucide-react";
import type { AdAccount } from "@shared/schema";

interface CoverageWidgetProps {
  account: AdAccount;
  compact?: boolean;
}

const coverageItems = [
  { key: "identityChecksAvailable" as const, label: "Identity Checks" },
  { key: "creativeMetadataAvailable" as const, label: "Creative Metadata" },
  { key: "placementTogglesAvailable" as const, label: "Placement Toggles" },
  { key: "deliveryStatusAvailable" as const, label: "Delivery Status" },
];

export function CoverageWidget({ account, compact }: CoverageWidgetProps) {
  const availableCount = coverageItems.filter(item => account[item.key]).length;
  const percentage = Math.round((availableCount / coverageItems.length) * 100);

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      {!compact && (
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-medium">Coverage</span>
          <span className="text-sm text-muted-foreground">{percentage}%</span>
        </div>
      )}
      <div className="flex gap-1">
        {coverageItems.map(item => (
          <div
            key={item.key}
            className={`h-1.5 flex-1 rounded-full ${account[item.key] ? "bg-primary" : "bg-muted"}`}
            title={`${item.label}: ${account[item.key] ? "Available" : "Unavailable"}`}
            data-testid={`coverage-bar-${item.key}`}
          />
        ))}
      </div>
      {!compact && (
        <div className="space-y-1">
          {coverageItems.map(item => (
            <div key={item.key} className="flex items-center gap-2 text-xs">
              {account[item.key] ? (
                <CheckCircle2 className="h-3 w-3 text-primary" />
              ) : (
                <XCircle className="h-3 w-3 text-muted-foreground" />
              )}
              <span className={account[item.key] ? "" : "text-muted-foreground"}>{item.label}</span>
            </div>
          ))}
        </div>
      )}
      {!compact && account.lastScanSuccessAt && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
          <Clock className="h-3 w-3" />
          <span>Last scan: {formatTimeAgo(new Date(account.lastScanSuccessAt))}</span>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CoveragePercentage({ account }: { account: AdAccount }) {
  const availableCount = coverageItems.filter(item => account[item.key]).length;
  const percentage = Math.round((availableCount / coverageItems.length) * 100);
  return <span data-testid={`text-coverage-pct-${account.id}`}>{percentage}%</span>;
}
