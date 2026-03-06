import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, AccessModeBadge } from "@/components/status-badge";
import { CoverageWidget } from "@/components/coverage-widget";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Radio, Shield, AlertTriangle, CheckCircle2, FileText, Download, Scan, Loader2, ExternalLink, Eye, Link2, Globe } from "lucide-react";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Client, AdAccount, Credential, ScanIssue } from "@shared/schema";

export default function ClientDetailPage() {
  const [, params] = useRoute("/clients/:id");
  const clientId = Number(params?.id);

  const { data: client, isLoading: clientLoading } = useQuery<Client>({
    queryKey: ["/api/clients", clientId],
  });

  const { data: accounts, isLoading: accountsLoading } = useQuery<AdAccount[]>({
    queryKey: ["/api/clients", clientId, "ad-accounts"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/ad-accounts`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: credentials, isLoading: credsLoading } = useQuery<Credential[]>({
    queryKey: ["/api/clients", clientId, "credentials"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/credentials`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: issues } = useQuery<ScanIssue[]>({
    queryKey: ["/api/issues"],
  });

  const clientIssues = issues?.filter(i => i.clientId === clientId) || [];
  const isLoading = clientLoading || accountsLoading || credsLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6 text-center py-16">
        <p className="text-lg">Client not found</p>
        <Link href="/clients">
          <Button variant="ghost" className="mt-4">Back to Clients</Button>
        </Link>
      </div>
    );
  }

  const partnerChecklist = [
    { label: "Business Manager shared as partner", done: !!client.businessManagerIdClient },
    { label: "Ad account access granted", done: (accounts?.length || 0) > 0 },
    { label: "Page IDs configured", done: (client.allowedPageIds?.length || 0) > 0 },
    { label: "System user token configured", done: credentials?.some(c => c.credentialType === "system_user_token" && c.status === "active") || false },
  ];

  const userChecklist = [
    { label: "Employee added to BM or ad account", done: credentials?.some(c => c.credentialType === "user_token") || false },
    { label: "OAuth authentication completed", done: credentials?.some(c => c.credentialType === "user_token" && c.status === "active") || false },
    { label: "Ad account accessible", done: (accounts?.length || 0) > 0 },
  ];

  const checklist = client.accessMode === "partner" ? partnerChecklist :
    client.accessMode === "user" ? userChecklist :
    client.accessMode === "both" ? [...partnerChecklist, ...userChecklist] : [];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/clients">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight truncate" data-testid="text-client-name">{client.name}</h1>
            <StatusBadge status={client.status} />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <AccessModeBadge mode={client.accessMode} />
            {client.businessManagerIdOurs && (
              <span className="text-xs text-muted-foreground">Our BM: {client.businessManagerIdOurs}</span>
            )}
            {client.businessManagerIdClient && (
              <span className="text-xs text-muted-foreground">Client BM: {client.businessManagerIdClient}</span>
            )}
          </div>
        </div>
      </div>

      {client.notes && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{client.notes}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts" data-testid="tab-accounts">
            <Radio className="h-3.5 w-3.5 mr-1" /> Accounts ({accounts?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="credentials" data-testid="tab-credentials">
            <Shield className="h-3.5 w-3.5 mr-1" /> Credentials ({credentials?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="issues" data-testid="tab-issues">
            <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Issues ({clientIssues.length})
          </TabsTrigger>
          <TabsTrigger value="onboarding" data-testid="tab-onboarding">
            <FileText className="h-3.5 w-3.5 mr-1" /> Onboarding
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4 space-y-4">
          <AddAdAccountDialog clientId={clientId} />
          {accounts?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Radio className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
                <p className="font-medium">No ad accounts</p>
                <p className="text-sm text-muted-foreground">Add an ad account to start scanning.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {accounts?.map(account => (
                <AdAccountCard key={account.id} account={account} clientId={clientId} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="credentials" className="mt-4 space-y-4">
          <AddCredentialDialog clientId={clientId} />
          {credentials?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Shield className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
                <p className="font-medium">No credentials</p>
                <p className="text-sm text-muted-foreground">Add a credential to enable scanning.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {credentials?.map(cred => (
                <Card key={cred.id} data-testid={`card-credential-${cred.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">
                            {cred.credentialType === "system_user_token" ? "System User Token" : "User Token"}
                          </p>
                          <StatusBadge status={cred.status} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{cred.tokenOwner}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-card-border">
                      <div>
                        <p className="text-xs text-muted-foreground">Scopes</p>
                        <p className="text-xs font-mono">{cred.scopesGranted?.join(", ") || "None"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Last Validated</p>
                        <p className="text-xs">{cred.lastValidatedAt ? formatDate(new Date(cred.lastValidatedAt)) : "Never"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Expires</p>
                        <p className="text-xs">{cred.expiresAt ? formatDate(new Date(cred.expiresAt)) : "N/A"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="issues" className="mt-4 space-y-3">
          {clientIssues.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle2 className="h-10 w-10 text-primary mb-3 opacity-60" />
                <p className="font-medium">No issues</p>
                <p className="text-sm text-muted-foreground">This client has no reported issues.</p>
              </CardContent>
            </Card>
          ) : (
            clientIssues.map(issue => {
              const acct = accounts?.find(a => a.id === issue.adAccountId);
              return <IssueCard key={issue.id} issue={issue} metaAccountId={acct?.accountId} />;
            })
          )}
        </TabsContent>

        <TabsContent value="onboarding" className="mt-4 space-y-4">
          {checklist.length === 0 ? (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Select an access method to see the onboarding checklist.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Onboarding Checklist</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {checklist.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm" data-testid={`checklist-item-${idx}`}>
                      <CheckCircle2 className={`h-4 w-4 shrink-0 ${item.done ? "text-primary" : "text-muted-foreground/30"}`} />
                      <span className={item.done ? "" : "text-muted-foreground"}>{item.label}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {(client.accessMode === "partner" || client.accessMode === "both") && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
                    <CardTitle className="text-base">Client Instructions</CardTitle>
                    <Button variant="ghost" size="sm" data-testid="button-download-instructions">
                      <Download className="h-3 w-3 mr-1" /> Download PDF
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="text-muted-foreground">Share these steps with your client to set up partner access:</p>
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                      <li>Go to Business Settings in your Meta Business Manager</li>
                      <li>Navigate to <span className="font-medium">Partners</span> under Users</li>
                      <li>Click <span className="font-medium">Add</span> and enter our Business Manager ID: <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{client.businessManagerIdOurs || "BM-XXXXXXXXXX"}</span></li>
                      <li>Grant access to the specific ad account(s) to be scanned</li>
                      <li>If identity checks are needed, also share the Facebook Page and Instagram account</li>
                      <li>Set role level to <span className="font-medium">Analyst</span> or higher</li>
                    </ol>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function adsManagerUrl(accountId: string, type: "ad" | "adset" | "campaign", entityId: string): string {
  const actNum = accountId.replace("act_", "");
  if (type === "ad") return `https://www.facebook.com/adsmanager/manage/ads?act=${actNum}&selected_ad_ids=${entityId}`;
  if (type === "adset") return `https://www.facebook.com/adsmanager/manage/adsets?act=${actNum}&selected_adset_ids=${entityId}`;
  return `https://www.facebook.com/adsmanager/manage/campaigns?act=${actNum}&selected_campaign_ids=${entityId}`;
}

function IssueCard({ issue, metaAccountId }: { issue: ScanIssue; metaAccountId?: string }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async (newStatus: string) => {
      await apiRequest("PATCH", `/api/issues/${issue.id}`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Issue updated" });
    },
  });

  const routeLabels: Record<string, string> = {
    ops: "Ops",
    account_manager: "Account Manager",
    buyer: "Media Buyer",
    client: "Client",
  };

  return (
    <Card data-testid={`card-issue-${issue.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={issue.severity} />
              <StatusBadge status={issue.status} />
              <span className="text-xs text-muted-foreground">Route: {routeLabels[issue.routeTo] || issue.routeTo}</span>
            </div>
            {issue.ruleId && (
              <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded" data-testid={`text-rule-id-${issue.id}`}>
                {issue.ruleId}
              </span>
            )}
            <p className="text-sm font-medium mt-2">{issue.message}</p>
            <p className="text-xs text-muted-foreground mt-1">{issue.description}</p>
            {issue.recommendedFix && (
              <p className="text-xs text-primary mt-1">{issue.recommendedFix}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
              {issue.campaignId && metaAccountId && (
                <a href={adsManagerUrl(metaAccountId, "campaign", issue.campaignId)} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-0.5" data-testid={`link-campaign-${issue.id}`}>
                  Campaign <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
              {issue.adsetId && metaAccountId && (
                <a href={adsManagerUrl(metaAccountId, "adset", issue.adsetId)} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-0.5" data-testid={`link-adset-${issue.id}`}>
                  Ad Set <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
              {issue.adId && metaAccountId && (
                <a href={adsManagerUrl(metaAccountId, "ad", issue.adId)} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-0.5" data-testid={`link-ad-${issue.id}`}>
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
          <div className="flex gap-2 mt-3 pt-3 border-t border-card-border flex-wrap">
            <Button variant="secondary" size="sm" onClick={() => mutation.mutate("acknowledged")} disabled={mutation.isPending} data-testid={`button-acknowledge-${issue.id}`}>
              Acknowledge
            </Button>
            <Button variant="secondary" size="sm" onClick={() => mutation.mutate("resolved")} disabled={mutation.isPending} data-testid={`button-resolve-${issue.id}`}>
              Resolve
            </Button>
            <Button variant="ghost" size="sm" onClick={() => mutation.mutate("dismissed")} disabled={mutation.isPending} data-testid={`button-dismiss-${issue.id}`}>
              Dismiss
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddAdAccountDialog({ clientId }: { clientId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [accountId, setAccountId] = useState("");
  const [accountName, setAccountName] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const normalizedId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
      await apiRequest("POST", "/api/ad-accounts", {
        clientId,
        accountId: normalizedId,
        accountName,
        status: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ad-accounts"] });
      toast({ title: "Ad account added" });
      setOpen(false);
      setAccountId("");
      setAccountName("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" data-testid="button-add-ad-account">
          <Plus className="h-3 w-3 mr-1" /> Add Ad Account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Ad Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Account ID</Label>
            <Input value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="act_..." data-testid="input-account-id" />
          </div>
          <div className="space-y-2">
            <Label>Account Name</Label>
            <Input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Campaign name..." data-testid="input-account-name" />
          </div>
          <Button onClick={() => mutation.mutate()} disabled={!accountId || !accountName || mutation.isPending} className="w-full" data-testid="button-submit-ad-account">
            {mutation.isPending ? "Adding..." : "Add Account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddCredentialDialog({ clientId }: { clientId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [credType, setCredType] = useState("system_user_token");
  const [tokenOwner, setTokenOwner] = useState("");
  const [scopes, setScopes] = useState("ads_read");

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/credentials", {
        clientId,
        credentialType: credType,
        tokenOwner,
        scopesGranted: scopes.split(",").map(s => s.trim()).filter(Boolean),
        status: "active",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credentials"] });
      toast({ title: "Credential added" });
      setOpen(false);
      setTokenOwner("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" data-testid="button-add-credential">
          <Plus className="h-3 w-3 mr-1" /> Add Credential
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Credential</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={credType} onValueChange={setCredType}>
              <SelectTrigger data-testid="select-cred-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system_user_token">System User Token</SelectItem>
                <SelectItem value="user_token">User Token</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Token Owner</Label>
            <Input value={tokenOwner} onChange={e => setTokenOwner(e.target.value)} placeholder={credType === "system_user_token" ? "sys_user_..." : "email@agency.com"} data-testid="input-token-owner" />
          </div>
          <div className="space-y-2">
            <Label>Scopes (comma separated)</Label>
            <Input value={scopes} onChange={e => setScopes(e.target.value)} placeholder="ads_read, ads_management" data-testid="input-scopes" />
          </div>
          <Button onClick={() => mutation.mutate()} disabled={!tokenOwner || mutation.isPending} className="w-full" data-testid="button-submit-credential">
            {mutation.isPending ? "Adding..." : "Add Credential"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface AdUrlEntry {
  adId: string;
  adName: string;
  adsetId?: string;
  campaignId?: string;
  destinationUrl: string;
  domain: string;
  hasUtm: boolean;
  utmParams: Record<string, string>;
  previewUrl?: string;
  effectiveStatus: string;
}

function UrlAuditDialog({ account }: { account: AdAccount }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery<{ urls: AdUrlEntry[]; error?: string }>({
    queryKey: [`/api/ad-accounts/${account.id}/urls`],
    enabled: open,
  });

  const urls = data?.urls || [];
  const domains = [...new Set(urls.map(u => u.domain))];
  const invalidUrls = urls.filter(u => u.domain === "INVALID_URL");
  const missingUtm = urls.filter(u => !u.hasUtm);
  const actNum = account.accountId.replace("act_", "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-audit-urls-${account.id}`}>
          <Link2 className="h-3 w-3 mr-1" /> URLs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>URL Audit: {account.accountName}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : data?.error ? (
          <div className="p-4 text-sm text-destructive bg-destructive/5 rounded-md">{data.error}</div>
        ) : urls.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No destination URLs found in this account's ads.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <span data-testid="text-url-total">{urls.length} URL{urls.length !== 1 ? "s" : ""} found</span>
              <span>{domains.length} domain{domains.length !== 1 ? "s" : ""}</span>
              {invalidUrls.length > 0 && (
                <span className="text-destructive font-medium">{invalidUrls.length} invalid</span>
              )}
              {missingUtm.length > 0 && (
                <span className="text-yellow-600 font-medium">{missingUtm.length} missing UTM</span>
              )}
            </div>

            {domains.length > 1 && (
              <div className="p-3 rounded-md bg-muted">
                <p className="text-xs font-medium mb-1">Domains in use:</p>
                <div className="flex flex-wrap gap-2">
                  {domains.map(d => (
                    <span key={d} className={`text-xs px-2 py-0.5 rounded-full border ${d === "INVALID_URL" ? "border-destructive text-destructive" : "border-border"}`} data-testid={`text-domain-${d}`}>
                      <Globe className="h-2.5 w-2.5 inline mr-0.5" />{d}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {urls.map((entry: any, idx: number) => (
                <div key={idx} className="p-3 rounded-md border text-xs space-y-1" data-testid={`card-url-${idx}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{entry.adName}</p>
                        {entry.sourceType && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground shrink-0">
                            {entry.sourceType === "shared_post" ? "Shared Post" :
                             entry.sourceType === "link_url" ? "Link" :
                             entry.sourceType === "link_data" ? "Link Data" :
                             entry.sourceType === "video_data" ? "Video" :
                             entry.sourceType === "carousel" ? "Carousel" :
                             entry.sourceType === "asset_feed" ? "Dynamic" :
                             entry.sourceType}
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground font-mono break-all mt-0.5">{entry.destinationUrl}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {entry.domain === "INVALID_URL" && (
                        <span className="text-destructive font-medium px-1.5 py-0.5 bg-destructive/10 rounded">Invalid</span>
                      )}
                      {!entry.hasUtm && entry.domain !== "INVALID_URL" && (
                        <span className="text-yellow-600 font-medium px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/20 rounded">No UTM</span>
                      )}
                      {entry.hasUtm && (
                        <span className="text-primary font-medium px-1.5 py-0.5 bg-primary/10 rounded">UTM OK</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
                    <span>Status: {entry.effectiveStatus}</span>
                    <a href={`https://www.facebook.com/adsmanager/manage/ads?act=${actNum}&selected_ad_ids=${entry.adId}`} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-0.5" data-testid={`link-url-ad-${idx}`}>
                      Open in Ads Manager <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    {entry.previewUrl && (
                      <a href={entry.previewUrl} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-0.5 text-primary" data-testid={`link-url-preview-${idx}`}>
                        <Eye className="h-2.5 w-2.5" /> Preview
                      </a>
                    )}
                  </div>
                  {entry.hasUtm && Object.keys(entry.utmParams || {}).length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">UTM Parameters</summary>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {Object.entries(entry.utmParams).map(([k, v]: [string, any]) => (
                          <span key={k} className="font-mono bg-muted px-1.5 py-0.5 rounded">{k}={String(v)}</span>
                        ))}
                      </div>
                    </details>
                  )}
                  {entry.urlTags && !entry.hasUtm && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">URL Tags</summary>
                      <p className="mt-1 font-mono bg-muted px-2 py-1 rounded break-all">{entry.urlTags}</p>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdAccountCard({ account, clientId }: { account: AdAccount; clientId: number }) {
  const { toast } = useToast();
  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/scan/account/${account.id}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: data.success ? "Scan complete" : "Scan failed",
        description: data.success
          ? `Found ${data.issuesFound} issue${data.issuesFound !== 1 ? "s" : ""}.`
          : data.error || "Unknown error",
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    },
  });

  const actNum = account.accountId.replace("act_", "");

  return (
    <Card data-testid={`card-ad-account-${account.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="font-medium" data-testid={`text-account-name-${account.id}`}>{account.accountName}</p>
            <p className="text-xs text-muted-foreground font-mono" data-testid={`text-account-id-${account.id}`}>
              <a href={`https://www.facebook.com/adsmanager/manage/campaigns?act=${actNum}`} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-0.5" data-testid={`link-ads-manager-${account.id}`}>
                {account.accountId} <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <UrlAuditDialog account={account} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              data-testid={`button-scan-account-${account.id}`}
            >
              {scanMutation.isPending ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Scanning</>
              ) : (
                <><Scan className="h-3 w-3 mr-1" /> Scan</>
              )}
            </Button>
            <StatusBadge status={account.status} />
          </div>
        </div>
        <CoverageWidget account={account} />
        {account.lastScanError && (
          <div className="mt-3 p-2 rounded-md bg-destructive/5 border border-destructive/10" data-testid={`text-scan-error-${account.id}`}>
            <p className="text-xs text-destructive">{account.lastScanError}</p>
            {account.lastScanErrorCode && (
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{account.lastScanErrorCode}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
