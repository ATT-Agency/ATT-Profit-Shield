"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signIn,
  signUp,
  signInWithGoogle,
  signInWithMicrosoft,
  type AuthState
} from "@/app/auth/actions";

type Mode = "signin" | "signup";

function SubmitButton({ mode }: { mode: Mode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" disabled={pending} className="w-full">
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {mode === "signup" ? "Creating account…" : "Signing in…"}
        </>
      ) : mode === "signup" ? (
        "Create account"
      ) : (
        "Sign in"
      )}
    </Button>
  );
}

function OAuthButton({
  label,
  icon
}: {
  label: string;
  icon: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      size="md"
      disabled={pending}
      className="w-full"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : icon}
      <span>{label}</span>
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.7 2.3 2.4 6.6 2.4 12s4.3 9.7 9.6 9.7c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

export function LoginForm({ initialMode }: { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const action = mode === "signup" ? signUp : signIn;
  const [state, formAction] = useFormState<AuthState, FormData>(action, undefined);

  return (
    <div className="space-y-5">
      <div className="grid gap-3">
        <form action={signInWithGoogle}>
          <OAuthButton label="Continue with Google" icon={<GoogleIcon />} />
        </form>
        <form action={signInWithMicrosoft}>
          <OAuthButton label="Continue with Microsoft" icon={<MicrosoftIcon />} />
        </form>
      </div>

      <div className="flex items-center gap-3">
        <div className="hairline-divider flex-1" />
        <span className="text-[10px] uppercase tracking-[0.22em] text-cream-mute">
          or
        </span>
        <div className="hairline-divider flex-1" />
      </div>

      <form action={formAction} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {mode === "signin" ? (
              <Link
                href="/forgot-password"
                className="text-[11px] uppercase tracking-[0.18em] text-cream-mute hover:text-cream underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            ) : null}
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="At least 6 characters"
            minLength={6}
            required
          />
        </div>

        {state?.error ? (
          <p
            role="alert"
            className="rounded-2xl border border-hotpink/40 bg-hotpink/10 px-4 py-3 text-sm text-hotpink"
          >
            {state.error}
          </p>
        ) : null}

        {state?.message ? (
          <p
            role="status"
            className="rounded-2xl border border-vibrant/40 bg-vibrant/10 px-4 py-3 text-sm text-cream"
          >
            {state.message}
          </p>
        ) : null}

        <SubmitButton mode={mode} />

        <div className="hairline-divider" />

        <p className="text-center text-sm text-cream-mute">
          {mode === "signup" ? "Already have an account?" : "New to Profit Shield?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="text-cream underline-offset-4 hover:underline focus:outline-none focus-visible:underline"
          >
            {mode === "signup" ? "Sign in" : "Create an account"}
          </button>
        </p>
      </form>
    </div>
  );
}
