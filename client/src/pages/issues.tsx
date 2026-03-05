import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { ScanIssue, Client } from "@shared/schema";

export default function IssuesPage() {
  const { data: issues, isLoading } = useQuery<ScanIssue[]>({ queryKey: ["/api/issues"] });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
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

  const typeLabels: Record<string, string> = {
    creative: "Creative",
    targeting: "Targeting",
    delivery: "Delivery",
    identity: "Identity",
    access: "Access",
    placement: "Placement",
    utm: "UTM",
  };

  const routeLabels: Record<string, string> = {
    ops: "Ops",
    account_manager: "Account Manager",
    buyer: "Media Buyer",
    client: "Client",
  };

  const severityIcon = (severity: string) => {
    if (severity === "critical") return <AlertTriangle className="h-4 w-4 text-destructive" />;
    if (severity === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
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
          return (
            <Card key={issue.id} data-testid={`card-issue-${issue.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">{severityIcon(issue.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={issue.severity} />
                      <StatusBadge status={issue.issueType} className="" />
                      {client && (
                        <Link href={`/clients/${client.id}`}>
                          <span className="text-xs text-muted-foreground hover:underline cursor-pointer">{client.name}</span>
                        </Link>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-1.5">{issue.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{issue.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span>Route: <span className="font-medium">{routeLabels[issue.routeTo]}</span></span>
                      <span>Type: <span className="font-medium">{typeLabels[issue.issueType]}</span></span>
                    </div>
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
        <p className="text-sm text-muted-foreground mt-1">Track and manage scan issues across all accounts.</p>
      </div>

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
