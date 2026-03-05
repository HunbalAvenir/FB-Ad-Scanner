import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Shield, Key, User } from "lucide-react";
import { Link } from "wouter";
import type { Credential, Client } from "@shared/schema";

export default function CredentialsPage() {
  const { data: credentials, isLoading } = useQuery<Credential[]>({ queryKey: ["/api/credentials"] });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const activeCount = credentials?.filter(c => c.status === "active").length || 0;
  const expiredCount = credentials?.filter(c => c.status === "expired").length || 0;
  const systemTokens = credentials?.filter(c => c.credentialType === "system_user_token") || [];
  const userTokens = credentials?.filter(c => c.credentialType === "user_token") || [];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Credentials</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage Meta API tokens and access credentials.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Total" count={credentials?.length || 0} />
        <MiniStat label="Active" count={activeCount} color="text-primary" />
        <MiniStat label="Expired" count={expiredCount} color="text-destructive" />
        <MiniStat label="System Tokens" count={systemTokens.length} />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : credentials?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Shield className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
            <p className="text-lg font-medium">No credentials</p>
            <p className="text-sm text-muted-foreground mt-1">Add credentials via client profiles.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {credentials?.map(cred => {
            const client = clients?.find(c => c.id === cred.clientId);
            const isExpired = cred.expiresAt && new Date(cred.expiresAt) < new Date();
            const daysUntilExpiry = cred.expiresAt ? Math.ceil((new Date(cred.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

            return (
              <Card key={cred.id} data-testid={`card-credential-${cred.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-md shrink-0 ${cred.credentialType === "system_user_token" ? "bg-primary/10" : "bg-muted"}`}>
                      {cred.credentialType === "system_user_token" ? (
                        <Key className="h-4 w-4 text-primary" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">
                          {cred.credentialType === "system_user_token" ? "System User Token" : "User Token"}
                        </p>
                        <StatusBadge status={cred.status} />
                        {daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 14 && (
                          <Badge variant="outline">{daysUntilExpiry}d until expiry</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{cred.tokenOwner}</p>
                      {client && (
                        <Link href={`/clients/${client.id}`}>
                          <p className="text-xs text-muted-foreground hover:underline cursor-pointer mt-0.5">{client.name}</p>
                        </Link>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {cred.scopesGranted?.map(scope => (
                          <Badge key={scope} variant="outline" className="text-xs font-mono">{scope}</Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span>Validated: {cred.lastValidatedAt ? formatDate(new Date(cred.lastValidatedAt)) : "Never"}</span>
                        <span>Expires: {cred.expiresAt ? formatDate(new Date(cred.expiresAt)) : "N/A"}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, count, color }: { label: string; count: number; color?: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <p className={`text-xl font-semibold ${color || ""}`}>{count}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
