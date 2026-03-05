import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { CoverageWidget, CoveragePercentage } from "@/components/coverage-widget";
import { Link } from "wouter";
import { Radio, ArrowRight } from "lucide-react";
import type { Client, AdAccount } from "@shared/schema";

export default function AdAccountsPage() {
  const { data: accounts, isLoading } = useQuery<AdAccount[]>({ queryKey: ["/api/ad-accounts"] });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const healthy = accounts?.filter(a => a.status === "healthy") || [];
  const degraded = accounts?.filter(a => a.status === "degraded") || [];
  const errored = accounts?.filter(a => a.status === "error") || [];
  const pending = accounts?.filter(a => a.status === "pending") || [];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Ad Accounts</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitor scanning coverage and health across all ad accounts.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Healthy" count={healthy.length} color="text-primary" />
        <MiniStat label="Degraded" count={degraded.length} color="text-destructive" />
        <MiniStat label="Error" count={errored.length} color="text-destructive" />
        <MiniStat label="Pending" count={pending.length} color="text-muted-foreground" />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : accounts?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Radio className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
            <p className="text-lg font-medium">No ad accounts</p>
            <p className="text-sm text-muted-foreground mt-1">Add ad accounts via client profiles.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts?.map(account => {
            const client = clients?.find(c => c.id === account.clientId);
            return (
              <Card key={account.id} data-testid={`card-ad-account-${account.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{account.accountName}</p>
                        <StatusBadge status={account.status} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span className="font-mono">{account.accountId}</span>
                        {client && (
                          <>
                            <span>&middot;</span>
                            <Link href={`/clients/${client.id}`}>
                              <span className="hover:underline cursor-pointer">{client.name}</span>
                            </Link>
                          </>
                        )}
                      </div>
                      {account.lastScanError && (
                        <div className="mt-2 p-2 rounded-md bg-destructive/5 border border-destructive/10">
                          <p className="text-xs text-destructive">{account.lastScanError}</p>
                        </div>
                      )}
                    </div>
                    <div className="w-40 shrink-0">
                      <CoverageWidget account={account} compact />
                      <p className="text-xs text-muted-foreground mt-1 text-right">
                        Coverage: <CoveragePercentage account={account} />
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <p className={`text-xl font-semibold ${color}`}>{count}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
