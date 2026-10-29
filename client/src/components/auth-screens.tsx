import { useEffect, useState } from "react";
import { Shield, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { login } from "@/hooks/use-auth";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary mb-4">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
            <p className="text-xs font-medium tracking-widest text-primary uppercase mb-1">Meta Ads QA</p>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "Something went wrong"));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm">If that email has an account, a reset link is on its way.</p>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>Back to sign in</Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        type="email"
        placeholder="Your email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        data-testid="input-forgot-email"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Sending…" : "Send reset link"}
      </Button>
      <div className="text-center">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>Back to sign in</Button>
      </div>
    </form>
  );
}

function LoginForm({ onForgot }: { onForgot: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err, "Sign in failed"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        type="email"
        placeholder="Email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        data-testid="input-login-email"
      />
      <Input
        type="password"
        placeholder="Password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        data-testid="input-login-password"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={submitting} data-testid="button-login">
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
      <div className="text-center">
        <Button type="button" variant="ghost" size="sm" onClick={onForgot}>Forgot password?</Button>
      </div>
    </form>
  );
}

export function LoginScreen() {
  const [forgot, setForgot] = useState(false);

  return forgot ? (
    <AuthCard title="Reset password" subtitle="We'll email you a link to set a new one.">
      <ForgotPasswordForm onBack={() => setForgot(false)} />
    </AuthCard>
  ) : (
    <AuthCard title="Sign in" subtitle="Scanner Portal for Infinity Media">
      <LoginForm onForgot={() => setForgot(true)} />
    </AuthCard>
  );
}

// Landing page for invite and password reset links: /reset-password?token=...
export function ResetPasswordScreen() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [status, setStatus] = useState<"checking" | "valid" | "invalid">("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((res) => res.json() as Promise<{ valid: boolean; email?: string }>)
      .then((data) => {
        setEmail(data.email ?? null);
        setStatus(data.valid ? "valid" : "invalid");
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, password });
      // Full reload so the app picks up the new session.
      window.location.href = "/";
    } catch (err) {
      setError(errorMessage(err, "Something went wrong"));
      setSubmitting(false);
    }
  }

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <AuthCard title="Link expired" subtitle="This link is invalid or has expired.">
        <Button className="w-full" onClick={() => { window.location.href = "/"; }}>Back to sign in</Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set your password" subtitle={email ?? "Choose a password to sign in with."}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          type="password"
          placeholder="New password (8+ characters)"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="input-new-password"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Saving…" : "Set password & sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}
