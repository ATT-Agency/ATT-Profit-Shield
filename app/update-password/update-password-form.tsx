"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, type AuthState } from "@/app/auth/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" disabled={pending} className="w-full">
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Updating password…
        </>
      ) : (
        "Update password"
      )}
    </Button>
  );
}

export function UpdatePasswordForm() {
  const [state, formAction] = useFormState<AuthState, FormData>(updatePassword, undefined);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 6 characters"
          minLength={6}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your new password"
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

      <SubmitButton />
    </form>
  );
}
