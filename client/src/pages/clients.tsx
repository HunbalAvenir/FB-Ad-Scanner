import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, AccessModeBadge } from "@/components/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";
import { Plus, Users, ArrowRight, Download, Loader2, Search, CheckCircle2, LogIn, LogOut } from "lucide-react";
import { useState, useMemo } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SiFacebook } from "react-icons/si";
import type { Client, AdAccount, ScanIssue } from "@shared/schema";

const ACCOUNT_STATUS_LABELS: Record<number, string> = {
  1: "Active",
  2: "Disabled",
  3: "Unsettled",
  7: "Pending Review",
  8: "Pending Closure",
  9: "In Grace Period",
  100: "Pending Risk Review",
};

interface MetaAccount {
  id: string;
  name: string;
  account_status: number;
  business_name?: string;
  currency?: string;
  timezone_name?: string;
  alreadyImported: boolean;
}

export default function ClientsPage() {
  const { data: clients, isLoading } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: accounts } = useQuery<AdAccount[]>({ queryKey: ["/api/ad-accounts"] });
  const { data: issues } = useQuery<ScanIssue[]>({ queryKey: ["/api/issues"] });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage client access profiles and onboarding.</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-import-accounts">
                <Download className="h-4 w-4 mr-1" /> Import Accounts
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Import Ad Accounts</DialogTitle>
              </DialogHeader>
              <BulkImportForm onSuccess={() => setImportDialogOpen(false)} />
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-client">
                <Plus className="h-4 w-4 mr-1" /> Add Client
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Client</DialogTitle>
              </DialogHeader>
              <AddClientForm onSuccess={() => setDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : clients?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
            <p className="text-lg font-medium">No clients yet</p>
            <p className="text-sm text-muted-foreground mt-1">Add your first client to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients?.map(client => {
            const clientAccounts = accounts?.filter(a => a.clientId === client.id) || [];
            const healthyCount = clientAccounts.filter(a => a.status === "healthy").length;
            const issueCount = issues?.filter(i => i.clientId === client.id && i.status === "open").length || 0;
            return (
              <Link key={client.id} href={`/clients/${client.id}`}>
                <Card className="cursor-pointer hover-elevate h-full" data-testid={`card-client-${client.id}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate" data-testid={`text-client-name-${client.id}`}>{client.name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <AccessModeBadge mode={client.accessMode} />
                          <StatusBadge status={client.status} />
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-1 border-t border-card-border">
                      <div>
                        <p className="text-xs text-muted-foreground">Ad Accounts</p>
                        <p className="text-sm font-medium">{clientAccounts.length}</p>
                        {clientAccounts.length > 0 && (
                          <p className="text-xs text-muted-foreground">{healthyCount} healthy</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Open Issues</p>
                        <p className={`text-sm font-medium ${issueCount > 0 ? "text-destructive" : ""}`}>{issueCount}</p>
                      </div>
                    </div>
                    {client.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2 pt-1 border-t border-card-border">{client.notes}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BulkImportForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clientNameOverrides, setClientNameOverrides] = useState<Record<string, string>>({});

  const { data: authStatus, isLoading: authLoading } = useQuery<{ authenticated: boolean; name: string | null }>({
    queryKey: ["/api/auth/facebook/status"],
  });

  const { data: metaAccounts, isLoading: accountsLoading, error: accountsError } = useQuery<MetaAccount[]>({
    queryKey: ["/api/meta/user-ad-accounts"],
    enabled: !!authStatus?.authenticated,
    staleTime: 60_000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/facebook/logout");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/facebook/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/user-ad-accounts"] });
      setSelected(new Set());
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const accounts = Array.from(selected).map(id => {
        const acct = metaAccounts?.find(a => a.id === id);
        return {
          metaAccountId: id,
          accountName: acct?.name || id,
          businessName: acct?.business_name || undefined,
          clientName: clientNameOverrides[id] || undefined,
        };
      });
      const res = await apiRequest("POST", "/api/clients/bulk-import", { accounts });
      return res.json();
    },
    onSuccess: (data: { created: number; skipped: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/user-ad-accounts"] });
      toast({
        title: "Import complete",
        description: `${data.created} account${data.created !== 1 ? "s" : ""} imported${data.skipped > 0 ? `, ${data.skipped} skipped (already exist)` : ""}.`,
      });
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    if (!metaAccounts) return [];
    if (!search) return metaAccounts;
    const q = search.toLowerCase();
    return metaAccounts.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      (a.business_name || "").toLowerCase().includes(q)
    );
  }, [metaAccounts, search]);

  const available = filtered.filter(a => !a.alreadyImported);
  const imported = filtered.filter(a => a.alreadyImported);

  const toggleAccount = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(available.map(a => a.id)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Checking authentication...</p>
      </div>
    );
  }

  if (!authStatus?.authenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <SiFacebook className="h-10 w-10 text-[#1877F2]" />
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">Connect your Facebook account</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Log in with Facebook to see all the ad accounts in your Business Manager. We'll request read-only access to your ads and business info.
          </p>
        </div>
        <Button
          onClick={() => { window.location.href = "/api/auth/facebook"; }}
          className="bg-[#1877F2] hover:bg-[#166FE5] text-white"
          data-testid="button-facebook-login"
        >
          <LogIn className="h-4 w-4 mr-2" />
          Log in with Facebook
        </Button>
      </div>
    );
  }

  if (accountsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading ad accounts from your Business Manager...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span>Logged in as <span className="font-medium">{authStatus.name}</span></span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => logoutMutation.mutate()} data-testid="button-facebook-logout">
          <LogOut className="h-3.5 w-3.5 mr-1" /> Disconnect
        </Button>
      </div>

      {accountsError ? (
        <div className="py-8 text-center text-sm text-destructive">
          Failed to load accounts: {(accountsError as Error).message}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, ID, or business..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-import-search"
              />
            </div>
            {available.length > 0 && (
              <>
                <Button variant="ghost" size="sm" onClick={selectAll} data-testid="button-select-all">
                  Select All ({available.length})
                </Button>
                <Button variant="ghost" size="sm" onClick={selectNone} data-testid="button-select-none">
                  Clear
                </Button>
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {metaAccounts?.length || 0} account{(metaAccounts?.length || 0) !== 1 ? "s" : ""} found.
            {imported.length > 0 && ` ${imported.length} already imported.`}
            {selected.size > 0 && ` ${selected.size} selected.`}
          </p>

          <div className="overflow-y-auto max-h-[45vh] border rounded-md divide-y">
            {available.length === 0 && imported.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {search ? "No accounts match your search." : "No ad accounts found in your Business Manager."}
              </div>
            )}
            {available.map(acct => (
              <label
                key={acct.id}
                className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${selected.has(acct.id) ? "bg-primary/5" : ""}`}
                data-testid={`row-account-${acct.id}`}
              >
                <Checkbox
                  checked={selected.has(acct.id)}
                  onCheckedChange={() => toggleAccount(acct.id)}
                  className="mt-0.5"
                  data-testid={`checkbox-account-${acct.id}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate" data-testid={`text-account-name-${acct.id}`}>{acct.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${acct.account_status === 1 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"}`}>
                      {ACCOUNT_STATUS_LABELS[acct.account_status] || `Status ${acct.account_status}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{acct.id}</span>
                    {acct.business_name && <span>{acct.business_name}</span>}
                    {acct.currency && <span>{acct.currency}</span>}
                  </div>
                  {selected.has(acct.id) && (
                    <div className="mt-2">
                      <Input
                        placeholder={acct.business_name || acct.name}
                        value={clientNameOverrides[acct.id] || ""}
                        onChange={e => setClientNameOverrides(prev => ({ ...prev, [acct.id]: e.target.value }))}
                        className="h-7 text-xs"
                        data-testid={`input-client-name-${acct.id}`}
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Client name (defaults to {acct.business_name || acct.name})
                      </p>
                    </div>
                  )}
                </div>
              </label>
            ))}
            {imported.length > 0 && (
              <>
                <div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                  Already imported
                </div>
                {imported.map(acct => (
                  <div key={acct.id} className="flex items-start gap-3 p-3 opacity-50" data-testid={`row-imported-${acct.id}`}>
                    <Checkbox checked disabled className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{acct.name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="font-mono">{acct.id}</span>
                        {acct.business_name && <span>{acct.business_name}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          <Button
            onClick={() => importMutation.mutate()}
            disabled={selected.size === 0 || importMutation.isPending}
            className="w-full"
            data-testid="button-submit-import"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importing...
              </>
            ) : (
              `Import ${selected.size} Account${selected.size !== 1 ? "s" : ""}`
            )}
          </Button>
        </>
      )}
    </div>
  );
}

function AddClientForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [accessMode, setAccessMode] = useState("unknown");
  const [notes, setNotes] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [accountSearch, setAccountSearch] = useState("");

  const { data: authStatus } = useQuery<{ authenticated: boolean; name: string | null }>({
    queryKey: ["/api/auth/facebook/status"],
  });

  const { data: metaAccounts, isLoading: loadingAccounts } = useQuery<MetaAccount[]>({
    queryKey: ["/api/meta/user-ad-accounts"],
    enabled: !!authStatus?.authenticated,
  });

  const { data: systemAccounts, isLoading: loadingSystemAccounts } = useQuery<MetaAccount[]>({
    queryKey: ["/api/meta/ad-accounts"],
    enabled: !authStatus?.authenticated,
  });

  const availableAccounts = authStatus?.authenticated ? metaAccounts : systemAccounts;
  const isLoadingAccounts = authStatus?.authenticated ? loadingAccounts : loadingSystemAccounts;

  const filteredAccounts = useMemo(() => {
    if (!availableAccounts) return [];
    const q = accountSearch.toLowerCase();
    return availableAccounts.filter(a =>
      !q || a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || (a.business_name || "").toLowerCase().includes(q)
    );
  }, [availableAccounts, accountSearch]);

  const toggleAccount = (id: string) => {
    setSelectedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const adAccountSelections = Array.from(selectedAccounts).map(id => {
        const acct = availableAccounts?.find(a => a.id === id);
        return { accountId: id, accountName: acct?.name || id };
      });
      await apiRequest("POST", "/api/clients", {
        name,
        accessMode,
        notes: notes || null,
        status: "onboarding",
        adAccountSelections,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ad-accounts"] });
      toast({ title: "Client added", description: `${name} has been added successfully.` });
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Client Name</Label>
        <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme Corp" data-testid="input-client-name" />
      </div>
      <div className="space-y-2">
        <Label>Access Method</Label>
        <Select value={accessMode} onValueChange={setAccessMode}>
          <SelectTrigger data-testid="select-access-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="partner">Partner Access (Recommended)</SelectItem>
            <SelectItem value="user">User Token</SelectItem>
            <SelectItem value="both">Both</SelectItem>
            <SelectItem value="public_only">Public Only</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Ad Accounts</Label>
        {isLoadingAccounts ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts from Meta...
          </div>
        ) : availableAccounts && availableAccounts.length > 0 ? (
          <div className="space-y-2">
            {availableAccounts.length > 5 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={accountSearch}
                  onChange={e => setAccountSearch(e.target.value)}
                  placeholder="Search accounts..."
                  className="pl-9"
                  data-testid="input-account-search"
                />
              </div>
            )}
            <div className="border rounded-md max-h-48 overflow-y-auto">
              {filteredAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 text-center">No accounts match your search</p>
              ) : (
                filteredAccounts.map(acct => {
                  const isSelected = selectedAccounts.has(acct.id);
                  return (
                    <label
                      key={acct.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/50 border-b last:border-b-0 transition-colors ${
                        acct.alreadyImported ? "opacity-50" : ""
                      } ${isSelected ? "bg-accent/30" : ""}`}
                      data-testid={`account-option-${acct.id}`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleAccount(acct.id)}
                        disabled={acct.alreadyImported}
                        data-testid={`checkbox-account-${acct.id}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{acct.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {acct.id}
                          {acct.business_name ? ` · ${acct.business_name}` : ""}
                          {acct.alreadyImported ? " · Already imported" : ""}
                        </p>
                      </div>
                      {acct.account_status === 1 && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 shrink-0">Active</span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
            {selectedAccounts.size > 0 && (
              <p className="text-xs text-muted-foreground">{selectedAccounts.size} account{selectedAccounts.size !== 1 ? "s" : ""} selected</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">
            {!authStatus?.authenticated
              ? "Use Import Accounts to connect your Facebook and load ad accounts, or add accounts manually after creating the client."
              : "No ad accounts found in your Meta account."}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Primary contact, special instructions..." data-testid="input-client-notes" />
      </div>
      <Button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending} className="w-full" data-testid="button-submit-client">
        {mutation.isPending ? "Adding..." : "Add Client"}
      </Button>
    </div>
  );
}
