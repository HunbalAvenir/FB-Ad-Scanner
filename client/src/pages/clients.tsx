import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, AccessModeBadge } from "@/components/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { Plus, Users, ArrowRight } from "lucide-react";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Client, AdAccount, ScanIssue } from "@shared/schema";

export default function ClientsPage() {
  const { data: clients, isLoading } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: accounts } = useQuery<AdAccount[]>({ queryKey: ["/api/ad-accounts"] });
  const { data: issues } = useQuery<ScanIssue[]>({ queryKey: ["/api/issues"] });
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage client access profiles and onboarding.</p>
        </div>
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
