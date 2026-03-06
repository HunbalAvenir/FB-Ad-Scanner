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
import { Plus, Users, ArrowRight, Download, Loader2, Search, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { useState, useMemo } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Client, AdAccount, ScanIssue } from "@shared/schema";

const ACCOUNT_STATUS_LABELS: Record<number, string> = {
  1: "Active",
  2: "Disabled",
  3: "Unsettled",
  7: "Pending Review",
  8: "Pending Closure",
  9: "In Grace Period",
  100: "Pending Risk Review",
  101: "Any Active",
  201: "Any Closed",
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

interface VerifiedAccount {
  id: string;
  name: string;
  account_status: number;
  accessible: boolean;
  error?: string;
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
  const [idsInput, setIdsInput] = useState("");
  const [verified, setVerified] = useState<VerifiedAccount[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clientNameOverrides, setClientNameOverrides] = useState<Record<string, string>>({});

  const verifyMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/meta/verify-accounts", { accountIds: ids });
      return res.json() as Promise<VerifiedAccount[]>;
    },
    onSuccess: (data) => {
      setVerified(data);
      const accessibleIds = data.filter(a => a.accessible && !a.alreadyImported).map(a => a.id);
      setSelected(new Set(accessibleIds));
    },
    onError: (err: Error) => {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const accounts = Array.from(selected).map(id => {
        const acct = verified?.find(a => a.id === id);
        return {
          metaAccountId: id,
          accountName: acct?.name || id,
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

  const handleVerify = () => {
    const raw = idsInput.trim();
    if (!raw) return;
    const ids = raw
      .split(/[\n,;\s]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    if (ids.length === 0) return;
    verifyMutation.mutate(ids);
  };

  const toggleAccount = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!verified) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Paste ad account IDs below (one per line, comma-separated, or space-separated). The act_ prefix is optional.
        </p>
        <Textarea
          placeholder={"act_123456789\n987654321\nact_111222333"}
          value={idsInput}
          onChange={e => setIdsInput(e.target.value)}
          className="min-h-[140px] font-mono text-sm"
          data-testid="input-account-ids"
        />
        <p className="text-xs text-muted-foreground">
          {idsInput.trim() ? `${idsInput.trim().split(/[\n,;\s]+/).filter(s => s.trim()).length} account ID(s) entered` : "Enter at least one account ID"}
        </p>
        <Button
          onClick={handleVerify}
          disabled={!idsInput.trim() || verifyMutation.isPending}
          className="w-full"
          data-testid="button-verify-accounts"
        >
          {verifyMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Verifying access...
            </>
          ) : (
            "Verify Access"
          )}
        </Button>
      </div>
    );
  }

  const accessible = verified.filter(a => a.accessible && !a.alreadyImported);
  const alreadyImported = verified.filter(a => a.alreadyImported);
  const noAccess = verified.filter(a => !a.accessible && !a.alreadyImported);

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {verified.length} account{verified.length !== 1 ? "s" : ""} verified.
          {accessible.length > 0 && ` ${accessible.length} accessible.`}
          {alreadyImported.length > 0 && ` ${alreadyImported.length} already imported.`}
          {noAccess.length > 0 && ` ${noAccess.length} no access.`}
        </p>
        <Button variant="ghost" size="sm" onClick={() => { setVerified(null); setSelected(new Set()); }} data-testid="button-back-to-input">
          Back
        </Button>
      </div>

      <div className="overflow-y-auto max-h-[50vh] border rounded-md divide-y">
        {accessible.length === 0 && alreadyImported.length === 0 && noAccess.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No results found.
          </div>
        )}

        {accessible.map(acct => (
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
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <p className="text-sm font-medium truncate" data-testid={`text-account-name-${acct.id}`}>{acct.name}</p>
                {acct.account_status > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${acct.account_status === 1 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"}`}>
                    {ACCOUNT_STATUS_LABELS[acct.account_status] || `Status ${acct.account_status}`}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{acct.id}</p>
              {selected.has(acct.id) && (
                <div className="mt-2">
                  <Input
                    placeholder={acct.name}
                    value={clientNameOverrides[acct.id] || ""}
                    onChange={e => setClientNameOverrides(prev => ({ ...prev, [acct.id]: e.target.value }))}
                    className="h-7 text-xs"
                    data-testid={`input-client-name-${acct.id}`}
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Client name (defaults to {acct.name})
                  </p>
                </div>
              )}
            </div>
          </label>
        ))}

        {alreadyImported.length > 0 && (
          <>
            <div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
              Already imported
            </div>
            {alreadyImported.map(acct => (
              <div key={acct.id} className="flex items-start gap-3 p-3 opacity-50" data-testid={`row-imported-${acct.id}`}>
                <Checkbox checked disabled className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{acct.name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{acct.id}</p>
                </div>
              </div>
            ))}
          </>
        )}

        {noAccess.length > 0 && (
          <>
            <div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
              No access
            </div>
            {noAccess.map(acct => (
              <div key={acct.id} className="flex items-start gap-3 p-3 opacity-50" data-testid={`row-noaccess-${acct.id}`}>
                <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono">{acct.id}</p>
                  <p className="text-xs text-destructive mt-0.5">{acct.error || "Access denied"}</p>
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
    </div>
  );
}

function AddClientForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [accessMode, setAccessMode] = useState("unknown");
  const [bmOurs, setBmOurs] = useState("");
  const [bmClient, setBmClient] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/clients", {
        name,
        accessMode,
        businessManagerIdOurs: bmOurs || null,
        businessManagerIdClient: bmClient || null,
        notes: notes || null,
        status: "onboarding",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
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
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="bm-ours">Our BM ID</Label>
          <Input id="bm-ours" value={bmOurs} onChange={e => setBmOurs(e.target.value)} placeholder="BM-..." data-testid="input-bm-ours" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bm-client">Client BM ID</Label>
          <Input id="bm-client" value={bmClient} onChange={e => setBmClient(e.target.value)} placeholder="BM-..." data-testid="input-bm-client" />
        </div>
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
