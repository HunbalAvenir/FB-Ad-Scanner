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
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Radio, Shield, SlidersHorizontal, AlertTriangle, AlertOctagon, CheckCircle2, FileText, Download, Scan, Loader2, ExternalLink, Eye, Link2, Globe, RotateCcw, Filter, X, Info, Pencil, Search, ChevronDown, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Client, AdAccount, Credential, ScanIssue } from "@shared/schema";
import { ruleLabel, typeLabel, objectiveLabel } from "@/lib/labels";
import { ClientRulesTab } from "@/components/client-rules";

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

  const [activeTab, setActiveTab] = useState("accounts");
  const [issueTab, setIssueTab] = useState("open");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterRule, setFilterRule] = useState("all");
  const [filterObjective, setFilterObjective] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterRoute, setFilterRoute] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterAdStatus, setFilterAdStatus] = useState("all");

  const issueFilterOptions = useMemo(() => {
    const severities = [...new Set(clientIssues.map(i => i.severity))];
    const types = [...new Set(clientIssues.map(i => i.issueType))];
    const rules = [...new Set(clientIssues.map(i => i.ruleId).filter(Boolean))] as string[];
    const objectives = [...new Set(clientIssues.map(i => (i as any).campaignObjective).filter(Boolean))] as string[];
    const routes = [...new Set(clientIssues.map(i => i.routeTo))];
    const adStatuses = [...new Set(clientIssues.map(i => (i as any).adEffectiveStatus).filter(Boolean))] as string[];
    return { severities, types, rules, objectives, routes, adStatuses };
  }, [clientIssues]);

  const severityCounts = useMemo(() => {
    const counts = { blocker: 0, high: 0, medium: 0, low: 0 };
    clientIssues.forEach(i => { if (i.severity in counts) counts[i.severity as keyof typeof counts]++; });
    return counts;
  }, [clientIssues]);

  const applyIssueFilters = (list: ScanIssue[]) => {
    return list.filter(i => {
      if (filterSeverity !== "all" && i.severity !== filterSeverity) return false;
      if (filterType !== "all" && i.issueType !== filterType) return false;
      if (filterRule !== "all" && i.ruleId !== filterRule) return false;
      if (filterObjective !== "all" && (i as any).campaignObjective !== filterObjective) return false;
      if (filterAccount !== "all" && i.adAccountId !== Number(filterAccount)) return false;
      if (filterRoute !== "all" && i.routeTo !== filterRoute) return false;
      if (filterAdStatus !== "all" && (i as any).adEffectiveStatus !== filterAdStatus) return false;
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        const matches = i.message.toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q) || (i.ruleId || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  };

  const hasActiveIssueFilters = filterSeverity !== "all" || filterType !== "all" || filterRule !== "all" || filterObjective !== "all" || filterAccount !== "all" || filterRoute !== "all" || filterSearch !== "" || filterAdStatus !== "all";
  const hasActiveUrlFilters = filterSearch !== "" || filterAdStatus !== "all" || filterAccount !== "all";
  const clearAllFilters = () => { setFilterSeverity("all"); setFilterType("all"); setFilterRule("all"); setFilterObjective("all"); setFilterAccount("all"); setFilterRoute("all"); setFilterSearch(""); setFilterAdStatus("all"); };

  const navigateToIssuesForRule = (ruleId: string) => {
    clearAllFilters();
    setFilterRule(ruleId);
    setIssueTab("open");
    setActiveTab("issues");
  };

  const routeLabels: Record<string, string> = { ops: "Ops", account_manager: "AM", buyer: "Buyer", client: "Client" };

  const openIssues = clientIssues.filter(i => i.status === "open");
  const acknowledgedIssues = clientIssues.filter(i => i.status === "acknowledged");
  const closedIssues = clientIssues.filter(i => i.status === "resolved" || i.status === "dismissed");

  const filteredOpen = applyIssueFilters(openIssues);
  const filteredAcknowledged = applyIssueFilters(acknowledgedIssues);
  const filteredClosed = applyIssueFilters(closedIssues);

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
            <EditClientDialog client={client} />
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="accounts" data-testid="tab-accounts">
            <Radio className="h-3.5 w-3.5 mr-1" /> Accounts ({accounts?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="urls" data-testid="tab-urls">
            <Link2 className="h-3.5 w-3.5 mr-1" /> URLs
          </TabsTrigger>
          <TabsTrigger value="scan" data-testid="tab-scan">
            <Scan className="h-3.5 w-3.5 mr-1" /> Scan
          </TabsTrigger>
          <TabsTrigger value="credentials" data-testid="tab-credentials">
            <Shield className="h-3.5 w-3.5 mr-1" /> Credentials ({credentials?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="issues" data-testid="tab-issues">
            <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Issues {hasActiveIssueFilters ? `(${filteredOpen.length + filteredAcknowledged.length + filteredClosed.length}/${clientIssues.length})` : `(${clientIssues.length})`}
          </TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Rules
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

        <TabsContent value="urls" className="mt-4 space-y-4">
          {!accounts || accounts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Link2 className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
                <p className="font-medium">No ad accounts</p>
                <p className="text-sm text-muted-foreground">Add an ad account first to audit URLs.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <SharedFilterBar
                accounts={accounts}
                filterSearch={filterSearch} setFilterSearch={setFilterSearch}
                filterAdStatus={filterAdStatus} setFilterAdStatus={setFilterAdStatus}
                filterAccount={filterAccount} setFilterAccount={setFilterAccount}
                hasActiveFilters={hasActiveUrlFilters} clearAllFilters={clearAllFilters}
                mode="urls"
              />
              {(filterAccount === "all" ? accounts : accounts.filter(a => String(a.id) === filterAccount)).map(acct => (
                <div key={acct.id} className="space-y-2">
                  {(filterAccount === "all" && accounts.length > 1) && (
                    <p className="text-sm font-medium">{acct.accountName}</p>
                  )}
                  <UrlAuditInline account={acct} searchQuery={filterSearch} statusFilter={filterAdStatus} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="scan" className="mt-4 space-y-4">
          <ScanTab
            accounts={accounts || []}
            clientId={clientId}
            issues={clientIssues}
            filterSeverity={filterSeverity} setFilterSeverity={setFilterSeverity}
            filterType={filterType} setFilterType={setFilterType}
            filterRule={filterRule} setFilterRule={setFilterRule}
            filterAccount={filterAccount} setFilterAccount={setFilterAccount}
            filterRoute={filterRoute} setFilterRoute={setFilterRoute}
            filterSearch={filterSearch} setFilterSearch={setFilterSearch}
            filterAdStatus={filterAdStatus} setFilterAdStatus={setFilterAdStatus}
            hasActiveFilters={hasActiveIssueFilters} clearAllFilters={clearAllFilters}
            severityCounts={severityCounts}
            issueFilterOptions={issueFilterOptions}
            routeLabels={routeLabels}
            navigateToIssuesForRule={navigateToIssuesForRule}
          />
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

        <TabsContent value="issues" className="mt-4 space-y-4">
          {clientIssues.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle2 className="h-10 w-10 text-primary mb-3 opacity-60" />
                <p className="font-medium">No issues</p>
                <p className="text-sm text-muted-foreground">This client has no reported issues.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <SharedFilterBar
                accounts={accounts || []}
                filterSearch={filterSearch} setFilterSearch={setFilterSearch}
                filterAdStatus={filterAdStatus} setFilterAdStatus={setFilterAdStatus}
                filterAccount={filterAccount} setFilterAccount={setFilterAccount}
                filterSeverity={filterSeverity} setFilterSeverity={setFilterSeverity}
                filterType={filterType} setFilterType={setFilterType}
                filterRule={filterRule} setFilterRule={setFilterRule}
                filterRoute={filterRoute} setFilterRoute={setFilterRoute}
                filterObjective={filterObjective} setFilterObjective={setFilterObjective}
                hasActiveFilters={hasActiveIssueFilters} clearAllFilters={clearAllFilters}
                severityCounts={severityCounts}
                issueFilterOptions={issueFilterOptions}
                routeLabels={routeLabels}
                mode="issues"
              />

              <Tabs value={issueTab} onValueChange={setIssueTab}>
                <TabsList>
                  <TabsTrigger value="open" data-testid="tab-issues-open">
                    Open ({filteredOpen.length}{hasActiveIssueFilters ? `/${openIssues.length}` : ""})
                  </TabsTrigger>
                  <TabsTrigger value="acknowledged" data-testid="tab-issues-acknowledged">
                    In Progress ({filteredAcknowledged.length}{hasActiveIssueFilters ? `/${acknowledgedIssues.length}` : ""})
                  </TabsTrigger>
                  <TabsTrigger value="closed" data-testid="tab-issues-closed">
                    Closed ({filteredClosed.length}{hasActiveIssueFilters ? `/${closedIssues.length}` : ""})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="open" className="mt-3">
                  <GroupedIssueList issues={filteredOpen} accounts={accounts} allIssues={clientIssues} />
                </TabsContent>
                <TabsContent value="acknowledged" className="mt-3">
                  <GroupedIssueList issues={filteredAcknowledged} accounts={accounts} allIssues={clientIssues} />
                </TabsContent>
                <TabsContent value="closed" className="mt-3">
                  <GroupedIssueList issues={filteredClosed} accounts={accounts} allIssues={clientIssues} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <ClientRulesTab key={client.id} client={client} />
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

interface SharedFilterBarProps {
  accounts: AdAccount[];
  filterSearch: string; setFilterSearch: (v: string) => void;
  filterAdStatus: string; setFilterAdStatus: (v: string) => void;
  filterAccount: string; setFilterAccount: (v: string) => void;
  filterSeverity?: string; setFilterSeverity?: (v: string) => void;
  filterType?: string; setFilterType?: (v: string) => void;
  filterRule?: string; setFilterRule?: (v: string) => void;
  filterRoute?: string; setFilterRoute?: (v: string) => void;
  filterObjective?: string; setFilterObjective?: (v: string) => void;
  hasActiveFilters: boolean; clearAllFilters: () => void;
  severityCounts?: Record<string, number>;
  issueFilterOptions?: { severities: string[]; types: string[]; rules: string[]; objectives: string[]; routes: string[]; adStatuses: string[] };
  routeLabels?: Record<string, string>;
  mode: "urls" | "scan" | "issues";
}

function SharedFilterBar(props: SharedFilterBarProps) {
  const {
    accounts, filterSearch, setFilterSearch, filterAdStatus, setFilterAdStatus,
    filterAccount, setFilterAccount, filterSeverity, setFilterSeverity,
    filterType, setFilterType, filterRule, setFilterRule,
    filterRoute, setFilterRoute, filterObjective, setFilterObjective,
    hasActiveFilters, clearAllFilters,
    severityCounts, issueFilterOptions, routeLabels, mode,
  } = props;

  const showIssueFilters = mode === "scan" || mode === "issues";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={mode === "urls" ? "Search URLs, ad names..." : "Search issues..."}
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
            data-testid="input-shared-search"
          />
        </div>

        {accounts.length > 1 && (
          <Select value={filterAccount} onValueChange={setFilterAccount}>
            <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="select-shared-account">
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {accounts.map(a => (
                <SelectItem key={a.id} value={String(a.id)}>{a.accountName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {mode === "urls" && (
          <Select value={filterAdStatus} onValueChange={setFilterAdStatus}>
            <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-shared-ad-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
              <SelectItem value="DELETED">Deleted</SelectItem>
            </SelectContent>
          </Select>
        )}

        {showIssueFilters && setFilterSeverity && (
          <Select value={filterSeverity || "all"} onValueChange={setFilterSeverity}>
            <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-shared-severity">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              {issueFilterOptions?.severities.map(s => (
                <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {showIssueFilters && setFilterType && issueFilterOptions && issueFilterOptions.types.length > 1 && (
          <Select value={filterType || "all"} onValueChange={setFilterType}>
            <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="select-shared-type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {issueFilterOptions.types.map(t => (
                <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {showIssueFilters && setFilterRule && issueFilterOptions && issueFilterOptions.rules.length > 1 && (
          <Select value={filterRule || "all"} onValueChange={setFilterRule}>
            <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="select-shared-rule">
              <SelectValue placeholder="Rule" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rules</SelectItem>
              {issueFilterOptions.rules.map(r => (
                <SelectItem key={r} value={r}>{ruleLabel(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {showIssueFilters && setFilterRoute && issueFilterOptions && issueFilterOptions.routes.length > 1 && (
          <Select value={filterRoute || "all"} onValueChange={setFilterRoute}>
            <SelectTrigger className="w-[120px] h-8 text-xs" data-testid="select-shared-route">
              <SelectValue placeholder="Route To" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {issueFilterOptions.routes.map(r => (
                <SelectItem key={r} value={r}>{(routeLabels || {})[r] || r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {showIssueFilters && setFilterObjective && issueFilterOptions && issueFilterOptions.objectives.length > 0 && (
          <Select value={filterObjective || "all"} onValueChange={setFilterObjective}>
            <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="select-shared-objective">
              <SelectValue placeholder="Objective" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Objectives</SelectItem>
              {issueFilterOptions.objectives.map(o => (
                <SelectItem key={o} value={o}>{objectiveLabel(o)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {showIssueFilters && issueFilterOptions && issueFilterOptions.adStatuses.length > 0 && (
          <Select value={filterAdStatus} onValueChange={setFilterAdStatus}>
            <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-shared-ad-live-status">
              <SelectValue placeholder="Ad Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ad Statuses</SelectItem>
              {issueFilterOptions.adStatuses.map(s => (
                <SelectItem key={s} value={s}>{s === "ACTIVE" ? "Live" : s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasActiveFilters && (
          <button onClick={clearAllFilters} className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1" data-testid="button-clear-filters">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {showIssueFilters && severityCounts && setFilterSeverity && (
        <div className="flex items-center gap-2 flex-wrap">
          {(severityCounts.blocker || 0) > 0 && (
            <button
              onClick={() => setFilterSeverity(filterSeverity === "blocker" ? "all" : "blocker")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${filterSeverity === "blocker" ? "bg-red-500/15 text-red-600" : "text-red-600 hover:bg-red-500/10"}`}
              data-testid="pill-severity-blocker"
            >
              {severityCounts.blocker} Blocker
            </button>
          )}
          {(severityCounts.high || 0) > 0 && (
            <button
              onClick={() => setFilterSeverity(filterSeverity === "high" ? "all" : "high")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${filterSeverity === "high" ? "bg-orange-500/15 text-orange-600" : "text-orange-600 hover:bg-orange-500/10"}`}
              data-testid="pill-severity-high"
            >
              {severityCounts.high} High
            </button>
          )}
          {(severityCounts.medium || 0) > 0 && (
            <button
              onClick={() => setFilterSeverity(filterSeverity === "medium" ? "all" : "medium")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${filterSeverity === "medium" ? "bg-yellow-500/15 text-yellow-600" : "text-yellow-600 hover:bg-yellow-500/10"}`}
              data-testid="pill-severity-medium"
            >
              {severityCounts.medium} Medium
            </button>
          )}
          {(severityCounts.low || 0) > 0 && (
            <button
              onClick={() => setFilterSeverity(filterSeverity === "low" ? "all" : "low")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${filterSeverity === "low" ? "bg-blue-500/15 text-blue-600" : "text-blue-600 hover:bg-blue-500/10"}`}
              data-testid="pill-severity-low"
            >
              {severityCounts.low} Low
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const TIER1_RULES = new Set(["ASPECT_001", "AI_006", "AI_007", "CREATIVE_003", "CREATIVE_005"]);

function GroupedIssueList({ issues, accounts, allIssues, onOpenIssues }: { issues: ScanIssue[]; accounts?: AdAccount[]; allIssues: ScanIssue[]; onOpenIssues?: (ruleId: string) => void }) {
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());

  const { tier1Groups, otherGroups } = useMemo(() => {
    const map = new Map<string, ScanIssue[]>();
    for (const issue of issues) {
      const key = issue.ruleId || `no-rule-${issue.issueType}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(issue);
    }
    const sevOrder: Record<string, number> = { blocker: 0, high: 1, medium: 2, low: 3 };
    const sortFn = (a: [string, ScanIssue[]], b: [string, ScanIssue[]]) => {
      const aSev = sevOrder[a[1][0].severity] ?? 4;
      const bSev = sevOrder[b[1][0].severity] ?? 4;
      if (aSev !== bSev) return aSev - bSev;
      return b[1].length - a[1].length;
    };
    const allEntries = [...map.entries()];
    const tier1Groups = allEntries.filter(([key]) => TIER1_RULES.has(key)).sort(sortFn);
    const otherGroups = allEntries.filter(([key]) => !TIER1_RULES.has(key)).sort(sortFn);
    return { tier1Groups, otherGroups };
  }, [issues]);

  const toggleRule = (ruleKey: string) => {
    setExpandedRules(prev => {
      const next = new Set(prev);
      if (next.has(ruleKey)) next.delete(ruleKey); else next.add(ruleKey);
      return next;
    });
  };

  const routeLabels: Record<string, string> = { ops: "Ops", account_manager: "AM", buyer: "Buyer", client: "Client" };

  const allGroups = [...tier1Groups, ...otherGroups];
  if (allGroups.length === 0) {
    return <Card><CardContent className="flex flex-col items-center justify-center py-8"><CheckCircle2 className="h-8 w-8 text-primary mb-2 opacity-60" /><p className="text-sm font-medium">No issues</p></CardContent></Card>;
  }

  const renderGroup = ([ruleKey, ruleIssues]: [string, ScanIssue[]], isTier1: boolean) => {
    const expanded = expandedRules.has(ruleKey);
    const first = ruleIssues[0];
    const uniqueAds = new Set(ruleIssues.map(i => i.adId).filter(Boolean)).size;
    const liveCount = ruleIssues.filter(i => (i as any).adEffectiveStatus === "ACTIVE").length;
    return (
      <Card key={ruleKey} data-testid={`group-${ruleKey}`} className={isTier1 ? "border-destructive/40 bg-destructive/5" : ""}>
        <button
          onClick={() => toggleRule(ruleKey)}
          className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors cursor-pointer"
          data-testid={`button-toggle-group-${ruleKey}`}
        >
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={first.severity} />
              <span className="text-sm font-medium">{ruleLabel(first.ruleId)}</span>
              <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{first.ruleId || first.issueType}</span>
              <span className="text-xs text-muted-foreground">Route: {routeLabels[first.routeTo] || first.routeTo}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{first.whyItMatters || first.description}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {liveCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" data-testid={`text-live-count-${ruleKey}`}>
                {liveCount} live
              </span>
            )}
            <span className="text-sm font-semibold tabular-nums" data-testid={`text-count-${ruleKey}`}>
              {ruleIssues.length} {ruleIssues.length === 1 ? "issue" : "issues"}
            </span>
            {uniqueAds > 0 && (
              <span className="text-xs text-muted-foreground">{uniqueAds} {uniqueAds === 1 ? "ad" : "ads"}</span>
            )}
          </div>
        </button>
        {onOpenIssues && (
          <div className="px-4 pb-2 -mt-1">
            <button
              onClick={() => onOpenIssues(ruleKey)}
              className="text-xs text-primary hover:underline cursor-pointer"
              data-testid={`link-open-issues-${ruleKey}`}
            >
              Open in Issues tab to resolve
            </button>
          </div>
        )}
        {expanded && (
          <div className="border-t border-card-border px-4 pb-4 pt-2 space-y-3">
            {ruleIssues.map(issue => {
              const acct = accounts?.find(a => a.id === issue.adAccountId);
              return <IssueCard key={issue.id} issue={issue} metaAccountId={acct?.accountId} allIssues={allIssues} />;
            })}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-4" data-testid="grouped-issue-list">
      {tier1Groups.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-destructive/30" />
            <span className="text-xs font-semibold uppercase tracking-wider text-destructive" data-testid="label-tier1-section">
              Tier 1 — Priority Issues
            </span>
            <div className="h-px flex-1 bg-destructive/30" />
          </div>
          {tier1Groups.map(group => renderGroup(group, true))}
        </div>
      )}
      {otherGroups.length > 0 && (
        <div className="space-y-2">
          {tier1Groups.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Other Issues
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          {otherGroups.map(group => renderGroup(group, false))}
        </div>
      )}
    </div>
  );
}

function IssueCard({ issue, metaAccountId, allIssues }: { issue: ScanIssue; metaAccountId?: string; allIssues?: ScanIssue[] }) {
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

  const isPending = mutation.isPending || bulkMutation.isPending;

  const countSameRule = (statusFilter: string) => {
    if (!allIssues || !issue.ruleId) return 0;
    return allIssues.filter(i =>
      i.ruleId === issue.ruleId &&
      i.adAccountId === issue.adAccountId &&
      i.status === statusFilter &&
      i.id !== issue.id
    ).length;
  };

  const handleBulkAction = (currentStatus: string, newStatus: string) => {
    if (!issue.ruleId) return;
    bulkMutation.mutate({
      ruleId: issue.ruleId,
      adAccountId: issue.adAccountId,
      currentStatus,
      status: newStatus,
    });
  };

  const routeLabels: Record<string, string> = {
    ops: "Ops",
    account_manager: "Account Manager",
    buyer: "Media Buyer",
    client: "Client",
  };

  const objective = (issue as any).campaignObjective;
  const adLiveStatus = (issue as any).adEffectiveStatus;

  return (
    <Card data-testid={`card-issue-${issue.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={issue.severity} />
              <StatusBadge status={issue.status} />
              {adLiveStatus && (
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${adLiveStatus === "ACTIVE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`} data-testid={`text-ad-status-${issue.id}`}>
                  {adLiveStatus === "ACTIVE" ? "Live" : adLiveStatus.charAt(0) + adLiveStatus.slice(1).toLowerCase()}
                </span>
              )}
              {issue.ruleId && (
                <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded" data-testid={`text-rule-id-${issue.id}`} title={issue.ruleId}>
                  {ruleLabel(issue.ruleId)}
                </span>
              )}
              {objective && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" data-testid={`text-objective-${issue.id}`} title={objective}>
                  {objectiveLabel(objective)}
                </span>
              )}
              <span className="text-xs text-muted-foreground">Route: {routeLabels[issue.routeTo] || issue.routeTo}</span>
            </div>
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
                <div className="mt-1 p-2 bg-muted rounded text-[11px] overflow-x-auto" data-testid={`text-evidence-${issue.id}`}>
                  {(issue.evidence as any).active_features && Array.isArray((issue.evidence as any).active_features) ? (
                    <div className="space-y-1">
                      <span className="font-medium text-foreground">Active AI features:</span>
                      <ul className="list-disc list-inside ml-1 space-y-0.5">
                        {(issue.evidence as any).active_features.map((f: string, i: number) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                      {Object.entries(issue.evidence as Record<string, any>).filter(([k]) => k !== "active_features" && k !== "ad_name" && k !== "enhancement_type").length > 0 && (
                        <pre className="mt-2 whitespace-pre-wrap text-muted-foreground">
                          {JSON.stringify(Object.fromEntries(Object.entries(issue.evidence as Record<string, any>).filter(([k]) => k !== "active_features" && k !== "ad_name" && k !== "enhancement_type")), null, 2)}
                        </pre>
                      )}
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(issue.evidence, null, 2)}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
        {issue.status === "open" && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-card-border flex-wrap items-center">
            <Button variant="secondary" size="sm" onClick={() => mutation.mutate("acknowledged")} disabled={isPending} data-testid={`button-acknowledge-${issue.id}`}>
              Acknowledge
            </Button>
            <Button variant="secondary" size="sm" onClick={() => mutation.mutate("resolved")} disabled={isPending} data-testid={`button-resolve-${issue.id}`}>
              Resolve
            </Button>
            <Button variant="ghost" size="sm" onClick={() => mutation.mutate("dismissed")} disabled={isPending} data-testid={`button-dismiss-${issue.id}`}>
              Dismiss
            </Button>
            {countSameRule("open") > 0 && issue.ruleId && (
              <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <span>{countSameRule("open")} more with same rule</span>
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleBulkAction("open", "resolved")} disabled={isPending} data-testid={`button-bulk-resolve-${issue.id}`}>
                  Resolve All ({countSameRule("open") + 1})
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleBulkAction("open", "dismissed")} disabled={isPending} data-testid={`button-bulk-dismiss-${issue.id}`}>
                  Dismiss All
                </Button>
              </div>
            )}
          </div>
        )}
        {issue.status === "acknowledged" && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-card-border flex-wrap items-center">
            <Button variant="secondary" size="sm" onClick={() => mutation.mutate("resolved")} disabled={isPending} data-testid={`button-resolve-${issue.id}`}>
              Resolve
            </Button>
            <Button variant="ghost" size="sm" onClick={() => mutation.mutate("dismissed")} disabled={isPending} data-testid={`button-dismiss-${issue.id}`}>
              Dismiss
            </Button>
            <Button variant="ghost" size="sm" onClick={() => mutation.mutate("open")} disabled={isPending} data-testid={`button-reopen-${issue.id}`}>
              <RotateCcw className="h-3 w-3 mr-1" /> Reopen
            </Button>
            {countSameRule("acknowledged") > 0 && issue.ruleId && (
              <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <span>{countSameRule("acknowledged")} more</span>
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleBulkAction("acknowledged", "resolved")} disabled={isPending} data-testid={`button-bulk-resolve-${issue.id}`}>
                  Resolve All ({countSameRule("acknowledged") + 1})
                </Button>
              </div>
            )}
          </div>
        )}
        {(issue.status === "resolved" || issue.status === "dismissed") && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-card-border flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => mutation.mutate("open")} disabled={isPending} data-testid={`button-reopen-${issue.id}`}>
              <RotateCcw className="h-3 w-3 mr-1" /> Reopen
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
  sourceType?: string;
  urlTags?: string;
}

function UrlAuditInline({ account, searchQuery = "", statusFilter = "all" }: { account: AdAccount; searchQuery?: string; statusFilter?: string }) {
  const [activeFilter, setActiveFilter] = useState<{ type: "domain" | "invalid" | "missingUtm"; value?: string } | null>(null);
  const { data, isLoading } = useQuery<{ urls: AdUrlEntry[]; error?: string }>({
    queryKey: [`/api/ad-accounts/${account.id}/urls`],
  });

  const allUrls = data?.urls || [];
  const actNum = account.accountId.replace("act_", "");

  const statusFilteredUrls = useMemo(() => {
    if (statusFilter !== "all") {
      return allUrls.filter(u => u.effectiveStatus === statusFilter);
    }
    return allUrls;
  }, [allUrls, statusFilter]);

  const domains = useMemo(() => [...new Set(statusFilteredUrls.map(u => u.domain))], [statusFilteredUrls]);
  const invalidUrls = useMemo(() => statusFilteredUrls.filter(u => u.domain === "INVALID_URL"), [statusFilteredUrls]);
  const missingUtm = useMemo(() => statusFilteredUrls.filter(u => !u.hasUtm), [statusFilteredUrls]);

  const preFilteredUrls = useMemo(() => {
    let list = statusFilteredUrls;
    if (activeFilter) {
      if (activeFilter.type === "domain") list = list.filter(u => u.domain === activeFilter.value);
      else if (activeFilter.type === "invalid") list = list.filter(u => u.domain === "INVALID_URL");
      else if (activeFilter.type === "missingUtm") list = list.filter(u => !u.hasUtm);
    }
    return list;
  }, [statusFilteredUrls, activeFilter]);

  const filteredUrls = useMemo(() => {
    if (!searchQuery) return preFilteredUrls;
    const q = searchQuery.toLowerCase();
    return preFilteredUrls.filter(u =>
      u.adName.toLowerCase().includes(q) ||
      u.destinationUrl.toLowerCase().includes(q) ||
      u.domain.toLowerCase().includes(q)
    );
  }, [preFilteredUrls, searchQuery]);

  const toggleFilter = (type: "domain" | "invalid" | "missingUtm", value?: string) => {
    if (activeFilter?.type === type && activeFilter?.value === value) {
      setActiveFilter(null);
    } else {
      setActiveFilter({ type, value });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    );
  }

  if (data?.error) {
    return <div className="p-4 text-sm text-destructive bg-destructive/5 rounded-md">{data.error}</div>;
  }

  if (allUrls.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No destination URLs found in this account's ads.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <button
          onClick={() => setActiveFilter(null)}
          className={`px-2 py-0.5 rounded-md text-sm cursor-pointer transition-colors ${!activeFilter ? "bg-primary/10 text-primary font-medium" : "hover-elevate"}`}
          data-testid="filter-url-all"
        >
          {statusFilteredUrls.length} URL{statusFilteredUrls.length !== 1 ? "s" : ""} found
        </button>
        {invalidUrls.length > 0 && (
          <button
            onClick={() => toggleFilter("invalid")}
            className={`px-2 py-0.5 rounded-md text-sm cursor-pointer font-medium transition-colors ${activeFilter?.type === "invalid" ? "bg-destructive/15 text-destructive" : "text-destructive hover-elevate"}`}
            data-testid="filter-url-invalid"
          >
            {invalidUrls.length} invalid
          </button>
        )}
        {missingUtm.length > 0 && (
          <button
            onClick={() => toggleFilter("missingUtm")}
            className={`px-2 py-0.5 rounded-md text-sm cursor-pointer font-medium transition-colors ${activeFilter?.type === "missingUtm" ? "bg-yellow-500/15 text-yellow-600" : "text-yellow-600 hover-elevate"}`}
            data-testid="filter-url-missing-utm"
          >
            {missingUtm.length} missing UTM
          </button>
        )}
      </div>

      {(activeFilter || searchQuery || statusFilter !== "all") && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Showing {filteredUrls.length} of {statusFilteredUrls.length} URLs
            {activeFilter?.type === "domain" && ` in ${activeFilter.value}`}
            {activeFilter?.type === "invalid" && " with invalid URLs"}
            {activeFilter?.type === "missingUtm" && " missing UTM parameters"}
            {searchQuery && ` matching "${searchQuery}"`}
          </span>
          {activeFilter && (
            <button onClick={() => setActiveFilter(null)} className="text-primary hover:underline cursor-pointer" data-testid="button-clear-url-local-filter">
              Clear local filter
            </button>
          )}
        </div>
      )}

      <DomainGroupedUrlList urls={filteredUrls} actNum={actNum} />
    </div>
  );
}

function DomainGroupedUrlList({ urls, actNum }: { urls: any[]; actNum: string }) {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());

  const domainGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const u of urls) {
      const d = u.domain || "UNKNOWN";
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(u);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [urls]);

  const toggleDomain = (domain: string) => {
    setExpandedDomains(prev => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain); else next.add(domain);
      return next;
    });
  };

  if (domainGroups.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No URLs match your filters.</p>;
  }

  return (
    <div className="space-y-2" data-testid="domain-grouped-url-list">
      {domainGroups.map(([domain, domainUrls]) => {
        const expanded = expandedDomains.has(domain);
        const missingUtmCount = domainUrls.filter((u: any) => !u.hasUtm && u.domain !== "INVALID_URL").length;
        const utmOkCount = domainUrls.filter((u: any) => u.hasUtm).length;
        const isInvalid = domain === "INVALID_URL";
        return (
          <Card key={domain} data-testid={`group-domain-${domain}`}>
            <button
              onClick={() => toggleDomain(domain)}
              className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors cursor-pointer"
              data-testid={`button-toggle-domain-${domain}`}
            >
              {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              <Globe className={`h-4 w-4 shrink-0 ${isInvalid ? "text-destructive" : "text-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium ${isInvalid ? "text-destructive" : ""}`}>
                  {isInvalid ? "Invalid URLs" : domain}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {utmOkCount > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-primary/10 text-primary">{utmOkCount} UTM</span>
                )}
                {missingUtmCount > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20">{missingUtmCount} no UTM</span>
                )}
                <span className="text-sm font-semibold tabular-nums">
                  {domainUrls.length} {domainUrls.length === 1 ? "ad" : "ads"}
                </span>
              </div>
            </button>
            {expanded && (
              <div className="border-t px-4 pb-3 pt-2 space-y-2">
                {domainUrls.map((entry: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-md border text-xs space-y-1" data-testid={`card-url-${domain}-${idx}`}>
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
                      <a href={`https://www.facebook.com/adsmanager/manage/ads?act=${actNum}&selected_ad_ids=${entry.adId}`} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-0.5" data-testid={`link-url-ad-${domain}-${idx}`}>
                        Open in Ads Manager <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      {entry.previewUrl && (
                        <a href={entry.previewUrl} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-0.5 text-primary" data-testid={`link-url-preview-${domain}-${idx}`}>
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
            )}
          </Card>
        );
      })}
    </div>
  );
}

interface ScanTabProps {
  accounts: AdAccount[];
  clientId: number;
  issues: ScanIssue[];
  filterSeverity: string; setFilterSeverity: (v: string) => void;
  filterType: string; setFilterType: (v: string) => void;
  filterRule: string; setFilterRule: (v: string) => void;
  filterAccount: string; setFilterAccount: (v: string) => void;
  filterRoute: string; setFilterRoute: (v: string) => void;
  filterSearch: string; setFilterSearch: (v: string) => void;
  filterAdStatus: string; setFilterAdStatus: (v: string) => void;
  hasActiveFilters: boolean; clearAllFilters: () => void;
  severityCounts: Record<string, number>;
  issueFilterOptions: { severities: string[]; types: string[]; rules: string[]; objectives: string[]; routes: string[]; adStatuses: string[] };
  routeLabels: Record<string, string>;
  navigateToIssuesForRule?: (ruleId: string) => void;
}

function ScanTab(props: ScanTabProps) {
  const { accounts, clientId, issues,
    filterSeverity, setFilterSeverity, filterType, setFilterType,
    filterRule, setFilterRule, filterAccount, setFilterAccount,
    filterRoute, setFilterRoute, filterSearch, setFilterSearch,
    filterAdStatus, setFilterAdStatus,
    hasActiveFilters, clearAllFilters,
    severityCounts, issueFilterOptions, routeLabels, navigateToIssuesForRule,
  } = props;
  const { toast } = useToast();
  const [scanningAccountId, setScanningAccountId] = useState<number | null>(null);

  const scanMutation = useMutation({
    mutationFn: async (accountId: number) => {
      setScanningAccountId(accountId);
      const res = await apiRequest("POST", `/api/scan/account/${accountId}`);
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
      setScanningAccountId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
      setScanningAccountId(null);
    },
  });

  const scanAllMutation = useMutation({
    mutationFn: async () => {
      const results = [];
      for (const account of accounts) {
        setScanningAccountId(account.id);
        const res = await apiRequest("POST", `/api/scan/account/${account.id}`);
        results.push(await res.json());
      }
      return results;
    },
    onSuccess: (results: any[]) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      const total = results.reduce((sum, r) => sum + (r.issuesFound || 0), 0);
      toast({ title: "Scan complete", description: `Scanned ${results.length} account${results.length !== 1 ? "s" : ""}, found ${total} issue${total !== 1 ? "s" : ""}.` });
      setScanningAccountId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
      setScanningAccountId(null);
    },
  });

  const filteredIssues = useMemo(() => {
    return issues.filter(i => {
      if (filterSeverity !== "all" && i.severity !== filterSeverity) return false;
      if (filterType !== "all" && i.issueType !== filterType) return false;
      if (filterRule !== "all" && i.ruleId !== filterRule) return false;
      if (filterAccount !== "all" && String(i.adAccountId) !== filterAccount) return false;
      if (filterRoute !== "all" && i.routeTo !== filterRoute) return false;
      if (filterAdStatus !== "all" && (i as any).adEffectiveStatus !== filterAdStatus) return false;
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        const matches = i.message.toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q) || (i.ruleId || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [issues, filterSeverity, filterType, filterRule, filterAccount, filterRoute, filterAdStatus, filterSearch]);

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Scan className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
          <p className="font-medium">No ad accounts</p>
          <p className="text-sm text-muted-foreground">Add an ad account first to run scans.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={() => scanAllMutation.mutate()}
          disabled={scanAllMutation.isPending || scanMutation.isPending}
          data-testid="button-scan-all"
        >
          {scanAllMutation.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning all accounts...</>
          ) : (
            <><Scan className="h-4 w-4 mr-2" /> Scan All Accounts</>
          )}
        </Button>
        {accounts.map(account => (
          <Button
            key={account.id}
            variant="outline"
            size="sm"
            onClick={() => scanMutation.mutate(account.id)}
            disabled={scanMutation.isPending || scanAllMutation.isPending}
            data-testid={`button-scan-account-${account.id}`}
          >
            {scanningAccountId === account.id && (scanMutation.isPending || scanAllMutation.isPending) ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> {account.accountName}</>
            ) : (
              <><Scan className="h-3 w-3 mr-1" /> {account.accountName}</>
            )}
          </Button>
        ))}
      </div>

      {accounts.some(a => a.lastScanError) && (
        <div className="space-y-2">
          {accounts.filter(a => a.lastScanError).map(account => (
            <div key={account.id} className="p-2 rounded-md bg-destructive/5 border border-destructive/10">
              <p className="text-xs text-destructive"><span className="font-medium">{account.accountName}:</span> {account.lastScanError}</p>
            </div>
          ))}
        </div>
      )}

      {issues.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3 opacity-60" />
            <p className="font-medium">No issues found</p>
            <p className="text-sm text-muted-foreground">Run a scan to check for ad issues.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <SharedFilterBar
            accounts={accounts}
            filterSearch={filterSearch} setFilterSearch={setFilterSearch}
            filterAdStatus={filterAdStatus} setFilterAdStatus={setFilterAdStatus}
            filterAccount={filterAccount} setFilterAccount={setFilterAccount}
            filterSeverity={filterSeverity} setFilterSeverity={setFilterSeverity}
            filterType={filterType} setFilterType={setFilterType}
            filterRule={filterRule} setFilterRule={setFilterRule}
            filterRoute={filterRoute} setFilterRoute={setFilterRoute}
            hasActiveFilters={hasActiveFilters} clearAllFilters={clearAllFilters}
            severityCounts={severityCounts}
            issueFilterOptions={issueFilterOptions}
            routeLabels={routeLabels}
            mode="scan"
          />

          {hasActiveFilters && (
            <p className="text-xs text-muted-foreground">Showing {filteredIssues.length} of {issues.length} issues</p>
          )}

          <GroupedIssueList issues={filteredIssues} accounts={accounts} allIssues={issues} onOpenIssues={navigateToIssuesForRule || undefined} />
        </>
      )}
    </div>
  );
}

function AdAccountCard({ account, clientId }: { account: AdAccount; clientId: number }) {
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
            <EditAdAccountDialog account={account} clientId={clientId} />
            <StatusBadge status={account.status} />
          </div>
        </div>
        <CoverageWidget account={account} />
      </CardContent>
    </Card>
  );
}

function EditClientDialog({ client }: { client: Client }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(client.name);
  const [status, setStatus] = useState(client.status);
  const [accessMode, setAccessMode] = useState(client.accessMode);
  const [notes, setNotes] = useState(client.notes || "");

  const resetForm = () => {
    setName(client.name);
    setStatus(client.status);
    setAccessMode(client.accessMode);
    setNotes(client.notes || "");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/clients/${client.id}`, {
        name,
        status,
        accessMode,
        notes: notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", client.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client updated" });
      setOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-edit-client">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Client Name</Label>
            <Input id="edit-name" value={name} onChange={e => setName(e.target.value)} data-testid="input-edit-client-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="select-edit-client-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="onboarding">Onboarding</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="degraded">Degraded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-access">Access Mode</Label>
            <Select value={accessMode} onValueChange={setAccessMode}>
              <SelectTrigger data-testid="select-edit-client-access">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="partner">Partner Access</SelectItem>
                <SelectItem value="user">User Access</SelectItem>
                <SelectItem value="both">Both</SelectItem>
                <SelectItem value="public_only">Public Only</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea id="edit-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Primary contact, special instructions..." data-testid="input-edit-client-notes" />
          </div>
          <Button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending} className="w-full" data-testid="button-save-client">
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditAdAccountDialog({ account, clientId }: { account: AdAccount; clientId: number }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [accountName, setAccountName] = useState(account.accountName);
  const [accountId, setAccountId] = useState(account.accountId);

  const resetForm = () => {
    setAccountName(account.accountName);
    setAccountId(account.accountId);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/ad-accounts/${account.id}`, {
        accountName,
        accountId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ad-accounts"] });
      toast({ title: "Ad account updated" });
      setOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-edit-account-${account.id}`}>
          <Pencil className="h-3 w-3 mr-1" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Ad Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-account-name">Account Name</Label>
            <Input id="edit-account-name" value={accountName} onChange={e => setAccountName(e.target.value)} data-testid="input-edit-account-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-account-id">Account ID</Label>
            <Input id="edit-account-id" value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="act_123456789" data-testid="input-edit-account-id" />
          </div>
          <Button onClick={() => mutation.mutate()} disabled={!accountName || !accountId || mutation.isPending} className="w-full" data-testid="button-save-account">
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
