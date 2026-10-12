"use client";

import { FormEvent, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

export function AuthPanel() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn("password", { flow: mode, email: email.trim().toLowerCase(), password });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That sign-in did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card surface">
        <div className="brand-mark">D</div>
        <p className="eyebrow">Private daily health</p>
        <h1>{mode === "signIn" ? "Your day, in frame." : "Make your day portable."}</h1>
        <p className="auth-copy">Sign in to keep sleep, movement, meals, and model settings synced securely with Convex.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signIn" ? "current-password" : "new-password"} minLength={8} required /></label>
          {error && <p className="inline-error">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Connecting…" : mode === "signIn" ? "Sign in" : "Create account"}</button>
        </form>
        <button className="text-button auth-switch" type="button" onClick={() => { setMode(mode === "signIn" ? "signUp" : "signIn"); setError(""); }}>{mode === "signIn" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
        <small className="auth-note">Your health data is separated by your account. Dayframe is a journal, not a medical device.</small>
      </section>
    </main>
  );
}
