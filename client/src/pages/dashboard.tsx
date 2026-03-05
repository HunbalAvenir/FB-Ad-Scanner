import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, AccessModeBadge } from "@/components/status-badge";
import { CoverageWidget } from "@/components/coverage-widget";
import { Link } from "wouter";
import { Users, Radio, AlertTriangle, ShieldAlert, Activity, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Client, AdAccount, ScanIssue } from "@shared/schema";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalClients: number;
    activeClients: number;
    degradedAccounts: number;
    openIssues: number;
    criticalIssues: number;
  }>({ queryKey: ["/api/dashboard/stats"] });

  const { data: clients, isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: accounts, isLoading: accountsLoading } = useQuery<AdAccount[]>({
    queryKey: ["/api/ad-accounts"],
  });

  const { data: issues, isLoading: issuesLoading } = useQuery<ScanIssue[]>({
    queryKey: ["/api/issues"],
  });

  const isLoading = statsLoading || clientsLoading || accountsLoading || issuesLoading;

  const degradedAccounts = accounts?.filter(a => a.status === "degraded" || a.status === "error") || [];
  const criticalIssues = issues?.filter(i => i.severity === "critical" && i.status === "open") || [];
  const recentIssues = issues?.slice(0, 5) || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitor your Meta Ads QA scanning coverage across all clients.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Clients"
          value={stats?.totalClients}
          icon={Users}
          loading={isLoading}
          testId="stat-total-clients"
        />
        <StatCard
          title="Active Clients"
          value={stats?.activeClients}
          icon={Activity}
          loading={isLoading}
          testId="stat-active-clients"
        />
        <StatCard
          title="Degraded Accounts"
          value={stats?.degradedAccounts}
          icon={Radio}
          loading={isLoading}
          alert={!!stats?.degradedAccounts && stats.degradedAccounts > 0}
          testId="stat-degraded-accounts"
        />
        <StatCard
          title="Open Issues"
          value={stats?.openIssues}
          subtitle={stats?.criticalIssues ? `${stats.criticalIssues} critical` : undefined}
          icon={AlertTriangle}
          loading={isLoading}
          alert={!!stats?.criticalIssues && stats.criticalIssues > 0}
          testId="stat-open-issues"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <CardTitle className="text-base font-medium">Degraded Accounts</CardTitle>
            <Link href="/ad-accounts">
              <Button variant="ghost" size="sm" data-testid="link-view-all-accounts">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : degradedAccounts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">All accounts are healthy</p>
              </div>
            ) : (
              <div className="space-y-3">
                {degradedAccounts.map(account => {
                  const client = clients?.find(c => c.id === account.clientId);
                  return (
                    <div
                      key={account.id}
                      className="flex items-start justify-between gap-3 p-3 rounded-md bg-card border border-card-border"
                      data-testid={`card-degraded-account-${account.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{account.accountName}</p>
                        <p className="text-xs text-muted-foreground">{client?.name}</p>
                        {account.lastScanError && (
                          <p className="text-xs text-destructive mt-1 line-clamp-2">{account.lastScanError}</p>
                        )}
                      </div>
                      <StatusBadge status={account.status} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <CardTitle className="text-base font-medium">Recent Issues</CardTitle>
            <Link href="/issues">
              <Button variant="ghost" size="sm" data-testid="link-view-all-issues">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : recentIssues.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No open issues</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentIssues.map(issue => {
                  const client = clients?.find(c => c.id === issue.clientId);
                  return (
                    <div
                      key={issue.id}
                      className="flex items-start gap-3 p-3 rounded-md bg-card border border-card-border"
                      data-testid={`card-issue-${issue.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={issue.severity} />
                          <span className="text-xs text-muted-foreground">{client?.name}</span>
                        </div>
                        <p className="text-sm mt-1 line-clamp-1">{issue.title}</p>
                      </div>
                      <StatusBadge status={issue.status} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
          <CardTitle className="text-base font-medium">Client Overview</CardTitle>
          <Link href="/clients">
            <Button variant="ghost" size="sm" data-testid="link-view-all-clients">
              View all <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {clients?.map(client => {
                const clientAccounts = accounts?.filter(a => a.clientId === client.id) || [];
                const clientIssueCount = issues?.filter(i => i.clientId === client.id && i.status === "open").length || 0;
                return (
                  <Link key={client.id} href={`/clients/${client.id}`}>
                    <div
                      className="flex items-center justify-between gap-3 p-3 rounded-md hover-elevate cursor-pointer"
                      data-testid={`card-client-${client.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{client.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <AccessModeBadge mode={client.accessMode} />
                            <span className="text-xs text-muted-foreground">{clientAccounts.length} account{clientAccounts.length !== 1 ? "s" : ""}</span>
                            {clientIssueCount > 0 && (
                              <span className="text-xs text-destructive">{clientIssueCount} issue{clientIssueCount !== 1 ? "s" : ""}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <StatusBadge status={client.status} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  loading,
  alert,
  testId,
}: {
  title: string;
  value?: number;
  subtitle?: string;
  icon: any;
  loading: boolean;
  alert?: boolean;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-1">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <div className="flex items-baseline gap-2 mt-1">
                <p className={`text-2xl font-semibold ${alert ? "text-destructive" : ""}`}>{value ?? 0}</p>
                {subtitle && <p className="text-xs text-destructive">{subtitle}</p>}
              </div>
            )}
          </div>
          <div className={`p-2 rounded-md ${alert ? "bg-destructive/10" : "bg-muted"}`}>
            <Icon className={`h-4 w-4 ${alert ? "text-destructive" : "text-muted-foreground"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
