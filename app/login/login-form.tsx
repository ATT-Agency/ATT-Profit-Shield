"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signUp, type AuthState } from "@/app/auth/actions";

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

export function LoginForm({ initialMode }: { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const action = mode === "signup" ? signUp : signIn;
  const [state, formAction] = useFormState<AuthState, FormData>(action, undefined);

  return (
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
        <Label htmlFor="password">Password</Label>
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
  );
}
