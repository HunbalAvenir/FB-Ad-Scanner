import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, ExternalLink, Wrench, Eye } from "lucide-react";
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

export default function IssuesPage() {
  const { data: issues, isLoading } = useQuery<ScanIssue[]>({ queryKey: ["/api/issues"] });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: accounts } = useQuery<AdAccount[]>({ queryKey: ["/api/ad-accounts"] });
  const { toast } = useToast();

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

  const openIssues = issues?.filter(i => i.status === "open") || [];
  const acknowledgedIssues = issues?.filter(i => i.status === "acknowledged") || [];
  const resolvedIssues = issues?.filter(i => i.status === "resolved" || i.status === "dismissed") || [];

  const blockerCount = openIssues.filter(i => i.severity === "blocker").length;
  const highCount = openIssues.filter(i => i.severity === "high").length;
  const mediumCount = openIssues.filter(i => i.severity === "medium").length;

  const severityIcon = (severity: string) => {
    if (severity === "blocker") return <AlertOctagon className="h-4 w-4 text-destructive" />;
    if (severity === "high") return <AlertTriangle className="h-4 w-4 text-destructive" />;
    if (severity === "medium") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <Info className="h-4 w-4 text-muted-foreground" />;
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
                {issue.status === "open" && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-card-border ml-7 flex-wrap">
                    <Button variant="secondary" size="sm" onClick={() => mutation.mutate({ id: issue.id, status: "acknowledged" })} disabled={mutation.isPending} data-testid={`button-acknowledge-${issue.id}`}>
                      Acknowledge
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => mutation.mutate({ id: issue.id, status: "resolved" })} disabled={mutation.isPending} data-testid={`button-resolve-${issue.id}`}>
                      Resolve
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => mutation.mutate({ id: issue.id, status: "dismissed" })} disabled={mutation.isPending} data-testid={`button-dismiss-${issue.id}`}>
                      Dismiss
                    </Button>
                  </div>
                )}
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
            <div className="flex items-center gap-1.5">
              <AlertOctagon className="h-4 w-4 text-destructive" />
              <span className="font-medium text-destructive" data-testid="text-blocker-count">{blockerCount} Blocker{blockerCount !== 1 ? "s" : ""}</span>
            </div>
          )}
          {highCount > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="font-medium" data-testid="text-high-count">{highCount} High</span>
            </div>
          )}
          {mediumCount > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="font-medium" data-testid="text-medium-count">{mediumCount} Medium</span>
            </div>
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
            <TabsTrigger value="open" data-testid="tab-open">Open ({openIssues.length})</TabsTrigger>
            <TabsTrigger value="acknowledged" data-testid="tab-acknowledged">In Progress ({acknowledgedIssues.length})</TabsTrigger>
            <TabsTrigger value="resolved" data-testid="tab-resolved">Closed ({resolvedIssues.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="open" className="mt-4">{renderIssues(openIssues)}</TabsContent>
          <TabsContent value="acknowledged" className="mt-4">{renderIssues(acknowledgedIssues)}</TabsContent>
          <TabsContent value="resolved" className="mt-4">{renderIssues(resolvedIssues)}</TabsContent>
        </Tabs>
      )}
    </div>
  );
}
