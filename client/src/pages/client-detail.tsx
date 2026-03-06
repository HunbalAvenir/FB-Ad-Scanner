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
import { ArrowLeft, Plus, Radio, Shield, AlertTriangle, CheckCircle2, FileText, Download, Scan, Loader2 } from "lucide-react";
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
            clientIssues.map(issue => (
              <IssueCard key={issue.id} issue={issue} />
            ))
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

function IssueCard({ issue }: { issue: ScanIssue }) {
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
            <p className="text-sm font-medium mt-2">{issue.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{issue.description}</p>
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

  return (
    <Card data-testid={`card-ad-account-${account.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="font-medium" data-testid={`text-account-name-${account.id}`}>{account.accountName}</p>
            <p className="text-xs text-muted-foreground font-mono" data-testid={`text-account-id-${account.id}`}>{account.accountId}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              data-testid={`button-scan-account-${account.id}`}
            >
              {scanMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Scan className="h-4 w-4" />
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
