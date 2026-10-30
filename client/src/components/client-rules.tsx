import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Wand2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AI_FEATURES } from "@shared/ai-features";
import type { Client } from "@shared/schema";

interface Suggestion {
  value: string;
  name?: string;
  ads: number;
}

interface IdentitySuggestions {
  domains: Suggestion[];
  pages: Suggestion[];
  instagram: Suggestion[];
  error?: string;
}

// One value per line (commas also work); blanks and repeats dropped.
function parseList(text: string, normalize: (v: string) => string = v => v): string[] {
  const values = text.split(/[\n,]/).map(v => normalize(v.trim())).filter(Boolean);
  return Array.from(new Set(values));
}

function normalizeDomain(value: string): string {
  return value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function mergeLines(text: string, suggestions: Suggestion[]): string {
  return Array.from(new Set([...parseList(text), ...suggestions.map(s => s.value)])).join("\n");
}

function ListField({ id, label, hint, value, onChange, suggestions }: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  suggestions?: Suggestion[];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={3} value={value} onChange={e => onChange(e.target.value)} placeholder={hint} className="font-mono text-xs" />
      {suggestions && (
        <p className="text-xs text-muted-foreground">
          {suggestions.length === 0
            ? "None found in current ads."
            : "Found in current ads: " + suggestions.map(s => `${s.name ? `${s.name} (${s.value})` : s.value}: ${s.ads} ad${s.ads === 1 ? "" : "s"}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

export function ClientRulesTab({ client }: { client: Client }) {
  const { toast } = useToast();
  const [requiredUtm, setRequiredUtm] = useState(client.requiredUtm !== false);
  const [allowedAi, setAllowedAi] = useState(new Set(client.allowedAiEnhancements ?? []));
  const [domains, setDomains] = useState((client.allowedDomains ?? []).join("\n"));
  const [pages, setPages] = useState((client.allowedPageIds ?? []).join("\n"));
  const [instagram, setInstagram] = useState((client.allowedIgActorIds ?? []).join("\n"));
  const [suggestions, setSuggestions] = useState<IdentitySuggestions | null>(null);

  const fill = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", `/api/clients/${client.id}/identity-suggestions`);
      return res.json() as Promise<IdentitySuggestions>;
    },
    onSuccess: (data) => {
      setSuggestions(data);
      setDomains(text => mergeLines(text, data.domains));
      setPages(text => mergeLines(text, data.pages));
      setInstagram(text => mergeLines(text, data.instagram));
      toast({
        title: data.error ? "Filled in what we could" : "Filled from current ads",
        description: data.error ?? "Check the lists below, remove anything that isn't this client's, then save.",
        variant: data.error ? "destructive" : "default",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't read this client's ads", description: err.message, variant: "destructive" });
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/clients/${client.id}`, {
        requiredUtm,
        allowedAiEnhancements: Array.from(allowedAi),
        allowedDomains: parseList(domains, normalizeDomain),
        allowedPageIds: parseList(pages),
        allowedIgActorIds: parseList(instagram),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", client.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Rules saved", description: "They apply from this client's next scan." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
    },
  });

  const toggleAi = (key: string, checked: boolean) => {
    setAllowedAi(prev => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="rule-utm" className="font-normal">Flag ads whose links are missing UTM tracking tags</Label>
            <Switch id="rule-utm" checked={requiredUtm} onCheckedChange={setRequiredUtm} data-testid="switch-required-utm" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Approved website, pages & Instagram</CardTitle>
          <CardDescription>
            Ads that use anything not listed here get flagged. Leave a list empty to skip that check.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={() => fill.mutate()} disabled={fill.isPending} className="gap-2" data-testid="button-fill-identity">
            {fill.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Fill from current ads
          </Button>
          <ListField
            id="rule-domains"
            label="Websites (domains)"
            hint="example.com"
            value={domains}
            onChange={setDomains}
            suggestions={suggestions?.domains}
          />
          <ListField
            id="rule-pages"
            label="Facebook page IDs"
            hint="One page ID per line"
            value={pages}
            onChange={setPages}
            suggestions={suggestions?.pages}
          />
          <ListField
            id="rule-instagram"
            label="Instagram account IDs"
            hint="One account ID per line"
            value={instagram}
            onChange={setInstagram}
            suggestions={suggestions?.instagram}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Allowed AI features</CardTitle>
          <CardDescription>
            Every AI feature Meta turns on is flagged, unless it's ticked here for this client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {AI_FEATURES.map(feature => (
              <div key={feature.key} className="flex items-center gap-2">
                <Checkbox
                  id={`ai-${feature.key}`}
                  checked={allowedAi.has(feature.key)}
                  onCheckedChange={checked => toggleAi(feature.key, checked === true)}
                />
                <Label htmlFor={`ai-${feature.key}`} className="font-normal text-sm">{feature.label}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-rules">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save rules"}
        </Button>
      </div>
    </div>
  );
}
