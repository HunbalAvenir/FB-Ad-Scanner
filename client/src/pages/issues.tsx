import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, ExternalLink, Wrench, Eye, RotateCcw, X, Filter } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { ScanIssue, Client, AdAccount } from "@shared/schema";

function adsManagerUrl(accountId: string, type: "ad" | "adset" | "campaign", entityId: string): string {
  const actNum = accountId.replace("act_", "");
  if (type === "ad") return `https://www.facebook.com/adsmanager/manage/ads?act=${actNum}&selected_ad_ids=${entityId}`;
  if (type === "adset") return `https://www.facebook.com/adsmanager/manage/adsets?act=${actNum}&selected_adset_ids=${entityId}`;
  return `https://www.facebook.com/adsmanager/manage/campaigns?act=${actNum}&selected_campaign_ids=${entityId}`;
}

function formatObjective(obj: string | null | undefined): string {
  if (!obj) return "";
  return obj.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function IssuesPage() {
  const { data: issues, isLoading } = useQuery<ScanIssue[]>({ queryKey: ["/api/issues"] });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: accounts } = useQuery<AdAccount[]>({ queryKey: ["/api/ad-accounts"] });
  const { toast } = useToast();

  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterRule, setFilterRule] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterObjective, setFilterObjective] = useState<string>("all");

  const mutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/issues/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Issue updated" });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (body: { ruleId: string; adAccountId: number; currentStatus: string; status: string }) => {
      const res = await apiRequest("PATCH", "/api/issues/bulk", body);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: `Updated ${data.updated} issue${data.updated !== 1 ? "s" : ""}` });
    },
  });

  const filterOptions = useMemo(() => {
    if (!issues) return { severities: [], types: [], rules: [], objectives: [] };
    const severities = [...new Set(issues.map(i => i.severity))];
    const types = [...new Set(issues.map(i => i.issueType))];
    const rules = [...new Set(issues.map(i => i.ruleId).filter(Boolean))] as string[];
    const objectives = [...new Set(issues.map(i => (i as any).campaignObjective).filter(Boolean))] as string[];
    return { severities, types, rules, objectives };
  }, [issues]);

  const applyFilters = (list: ScanIssue[]) => {
    return list.filter(i => {
      if (filterSeverity !== "all" && i.severity !== filterSeverity) return false;
      if (filterType !== "all" && i.issueType !== filterType) return false;
      if (filterRule !== "all" && i.ruleId !== filterRule) return false;
      if (filterClient !== "all" && i.clientId !== Number(filterClient)) return false;
      if (filterObjective !== "all" && (i as any).campaignObjective !== filterObjective) return false;
      return true;
    });
  };

  const hasActiveFilters = filterSeverity !== "all" || filterType !== "all" || filterRule !== "all" || filterClient !== "all" || filterObjective !== "all";

  const clearFilters = () => {
    setFilterSeverity("all");
    setFilterType("all");
    setFilterRule("all");
    setFilterClient("all");
    setFilterObjective("all");
  };

  const openIssues = issues?.filter(i => i.status === "open") || [];
  const acknowledgedIssues = issues?.filter(i => i.status === "acknowledged") || [];
  const resolvedIssues = issues?.filter(i => i.status === "resolved" || i.status === "dismissed") || [];

  const filteredOpen = applyFilters(openIssues);
  const filteredAcknowledged = applyFilters(acknowledgedIssues);
  const filteredResolved = applyFilters(resolvedIssues);

  const blockerCount = openIssues.filter(i => i.severity === "blocker").length;
  const highCount = openIssues.filter(i => i.severity === "high").length;
  const mediumCount = openIssues.filter(i => i.severity === "medium").length;

  const severityIcon = (severity: string) => {
    if (severity === "blocker") return <AlertOctagon className="h-4 w-4 text-destructive" />;
    if (severity === "high") return <AlertTriangle className="h-4 w-4 text-destructive" />;
    if (severity === "medium") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <Info className="h-4 w-4 text-muted-foreground" />;
  };

  const countSameRule = (issue: ScanIssue, statusFilter: string) => {
    if (!issues || !issue.ruleId) return 0;
    return issues.filter(i =>
      i.ruleId === issue.ruleId &&
      i.adAccountId === issue.adAccountId &&
      i.status === statusFilter &&
      i.id !== issue.id
    ).length;
  };

  const handleBulkAction = (issue: ScanIssue, currentStatus: string, newStatus: string) => {
    if (!issue.ruleId) return;
    bulkMutation.mutate({
      ruleId: issue.ruleId,
      adAccountId: issue.adAccountId,
      currentStatus,
      status: newStatus,
    });
  };

  const renderIssueActions = (issue: ScanIssue) => {
    const isPending = mutation.isPending || bulkMutation.isPending;

    if (issue.status === "open") {
      const sameCount = countSameRule(issue, "open");
      return (
        <div className="flex gap-2 mt-3 pt-3 border-t border-card-border ml-7 flex-wrap items-center">
          <Button variant="secondary" size="sm" onClick={() => mutation.mutate({ id: issue.id, status: "acknowledged" })} disabled={isPending} data-testid={`button-acknowledge-${issue.id}`}>
            Acknowledge
          </Button>
          <Button variant="secondary" size="sm" onClick={() => mutation.mutate({ id: issue.id, status: "resolved" })} disabled={isPending} data-testid={`button-resolve-${issue.id}`}>
            Resolve
          </Button>
          <Button variant="ghost" size="sm" onClick={() => mutation.mutate({ id: issue.id, status: "dismissed" })} disabled={isPending} data-testid={`button-dismiss-${issue.id}`}>
            Dismiss
          </Button>
          {sameCount > 0 && issue.ruleId && (
            <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <span>{sameCount} more with same rule</span>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleBulkAction(issue, "open", "resolved")} disabled={isPending} data-testid={`button-bulk-resolve-${issue.id}`}>
                Resolve All ({sameCount + 1})
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleBulkAction(issue, "open", "dismissed")} disabled={isPending} data-testid={`button-bulk-dismiss-${issue.id}`}>
                Dismiss All
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (issue.status === "acknowledged") {
      const sameCount = countSameRule(issue, "acknowledged");
      return (
        <div className="flex gap-2 mt-3 pt-3 border-t border-card-border ml-7 flex-wrap items-center">
          <Button variant="secondary" size="sm" onClick={() => mutation.mutate({ id: issue.id, status: "resolved" })} disabled={isPending} data-testid={`button-resolve-${issue.id}`}>
            Resolve
          </Button>
          <Button variant="ghost" size="sm" onClick={() => mutation.mutate({ id: issue.id, status: "dismissed" })} disabled={isPending} data-testid={`button-dismiss-${issue.id}`}>
            Dismiss
          </Button>
          <Button variant="ghost" size="sm" onClick={() => mutation.mutate({ id: issue.id, status: "open" })} disabled={isPending} data-testid={`button-reopen-${issue.id}`}>
            <RotateCcw className="h-3 w-3 mr-1" /> Reopen
          </Button>
          {sameCount > 0 && issue.ruleId && (
            <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <span>{sameCount} more</span>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleBulkAction(issue, "acknowledged", "resolved")} disabled={isPending} data-testid={`button-bulk-resolve-${issue.id}`}>
                Resolve All ({sameCount + 1})
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (issue.status === "resolved" || issue.status === "dismissed") {
      return (
        <div className="flex gap-2 mt-3 pt-3 border-t border-card-border ml-7 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => mutation.mutate({ id: issue.id, status: "open" })} disabled={isPending} data-testid={`button-reopen-${issue.id}`}>
            <RotateCcw className="h-3 w-3 mr-1" /> Reopen
          </Button>
        </div>
      );
    }

    return null;
  };

  const renderIssues = (list: ScanIssue[]) => {
    if (list.length === 0) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-10 w-10 text-primary mb-3 opacity-60" />
            <p className="font-medium">No issues here</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {list.map(issue => {
          const client = clients?.find(c => c.id === issue.clientId);
          const account = accounts?.find(a => a.id === issue.adAccountId);
          const actId = account?.accountId || "";
          const objective = (issue as any).campaignObjective;
          return (
            <Card key={issue.id} data-testid={`card-issue-${issue.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">{severityIcon(issue.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={issue.severity} />
                      <StatusBadge status={issue.issueType} />
                      {issue.ruleId && (
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded" data-testid={`text-rule-id-${issue.id}`}>
                          {issue.ruleId}
                        </span>
                      )}
                      {objective && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" data-testid={`text-objective-${issue.id}`}>
                          {formatObjective(objective)}
                        </span>
                      )}
                      {(issue.status === "resolved" || issue.status === "dismissed") && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {issue.status === "resolved" ? "Resolved" : "Dismissed"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-1.5" data-testid={`text-issue-message-${issue.id}`}>{issue.message}</p>
                    {issue.whyItMatters && (
                      <p className="text-xs text-muted-foreground mt-1">{issue.whyItMatters}</p>
                    )}
                    {issue.recommendedFix && (
                      <div className="flex items-start gap-1.5 mt-2 text-xs">
                        <Wrench className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                        <span className="text-primary" data-testid={`text-fix-${issue.id}`}>{issue.recommendedFix}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      {client && (
                        <Link href={`/clients/${client.id}`}>
                          <span className="hover:underline cursor-pointer">{client.name}</span>
                        </Link>
                      )}
                      {account && <span className="font-mono">{account.accountName}</span>}
                      {issue.campaignId && actId && (
                        <a href={adsManagerUrl(actId, "campaign", issue.campaignId)} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-0.5" data-testid={`link-campaign-${issue.id}`}>
                          Campaign <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                      {issue.adsetId && actId && (
                        <a href={adsManagerUrl(actId, "adset", issue.adsetId)} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-0.5" data-testid={`link-adset-${issue.id}`}>
                          Ad Set <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                      {issue.adId && actId && (
                        <a href={adsManagerUrl(actId, "ad", issue.adId)} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-0.5" data-testid={`link-ad-${issue.id}`}>
                          Ad <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                      {issue.previewUrl && (
                        <a href={issue.previewUrl} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-0.5 text-primary" data-testid={`link-preview-${issue.id}`}>
                          <Eye className="h-2.5 w-2.5" /> Preview
                        </a>
                      )}
                    </div>
                    {issue.evidence && typeof issue.evidence === "object" && Object.keys(issue.evidence as Record<string, any>).length > 0 && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Evidence</summary>
                        <pre className="mt-1 p-2 bg-muted rounded text-[11px] overflow-x-auto whitespace-pre-wrap" data-testid={`text-evidence-${issue.id}`}>
                          {JSON.stringify(issue.evidence, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
                {renderIssueActions(issue)}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Issues</h1>
        <p className="text-sm text-muted-foreground mt-1">Track and manage scan findings across all accounts.</p>
      </div>

      {!isLoading && openIssues.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
          {blockerCount > 0 && (
            <button
              onClick={() => { setFilterSeverity("blocker"); }}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
              data-testid="filter-blocker-count"
            >
              <AlertOctagon className="h-4 w-4 text-destructive" />
              <span className="font-medium text-destructive">{blockerCount} Blocker{blockerCount !== 1 ? "s" : ""}</span>
            </button>
          )}
          {highCount > 0 && (
            <button
              onClick={() => { setFilterSeverity("high"); }}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
              data-testid="filter-high-count"
            >
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="font-medium">{highCount} High</span>
            </button>
          )}
          {mediumCount > 0 && (
            <button
              onClick={() => { setFilterSeverity("medium"); }}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
              data-testid="filter-medium-count"
            >
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="font-medium">{mediumCount} Medium</span>
            </button>
          )}
        </div>
      )}

      {!isLoading && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterSeverity} onValueChange={setFilterSeverity}>
            <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="filter-severity">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              {filterOptions.severities.map(s => (
                <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="filter-type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {filterOptions.types.map(t => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterRule} onValueChange={setFilterRule}>
            <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="filter-rule">
              <SelectValue placeholder="Rule" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rules</SelectItem>
              {filterOptions.rules.map(r => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="filter-client">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients?.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filterOptions.objectives.length > 0 && (
            <Select value={filterObjective} onValueChange={setFilterObjective}>
              <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="filter-objective">
                <SelectValue placeholder="Objective" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Objectives</SelectItem>
                {filterOptions.objectives.map(o => (
                  <SelectItem key={o} value={o}>{formatObjective(o)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters} data-testid="button-clear-filters">
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <Tabs defaultValue="open">
          <TabsList>
            <TabsTrigger value="open" data-testid="tab-open">Open ({filteredOpen.length}{hasActiveFilters ? `/${openIssues.length}` : ""})</TabsTrigger>
            <TabsTrigger value="acknowledged" data-testid="tab-acknowledged">In Progress ({filteredAcknowledged.length}{hasActiveFilters ? `/${acknowledgedIssues.length}` : ""})</TabsTrigger>
            <TabsTrigger value="resolved" data-testid="tab-resolved">Closed ({filteredResolved.length}{hasActiveFilters ? `/${resolvedIssues.length}` : ""})</TabsTrigger>
          </TabsList>
          <TabsContent value="open" className="mt-4">{renderIssues(filteredOpen)}</TabsContent>
          <TabsContent value="acknowledged" className="mt-4">{renderIssues(filteredAcknowledged)}</TabsContent>
          <TabsContent value="resolved" className="mt-4">{renderIssues(filteredResolved)}</TabsContent>
        </Tabs>
      )}
    </div>
  );
}
