import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { COPY } from "@/lib/copy";
import { UpdatePasswordForm } from "./update-password-form";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const recoverySession = Boolean(user && !user.is_anonymous);

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="size-12 rounded-2xl bg-vibrant flex items-center justify-center text-cocoa-950 shadow-glow">
            <ShieldCheck className="size-6" />
          </div>
          <p className="font-display text-2xl mt-4 tracking-tight">{COPY.brand}</p>
          <p className="text-[11px] uppercase tracking-[0.22em] text-cream-mute mt-1">
            ATT Agency
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Choose a new password</CardTitle>
            <CardDescription>
              {recoverySession
                ? "Pick a fresh password for your Profit Shield account. You'll be signed straight in after."
                : "This page needs a valid reset link to work. Request a new one from the forgot-password screen."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recoverySession ? (
              <UpdatePasswordForm />
            ) : (
              <Link
                href="/forgot-password"
                className="inline-flex w-full justify-center rounded-full bg-vibrant px-6 py-3 text-sm font-medium text-cocoa-950 shadow-glow hover:bg-vibrant-soft"
              >
                Request a new reset link
              </Link>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-cream-mute">
          Back to{" "}
          <Link
            href="/login?mode=signin"
            className="text-cream underline-offset-4 hover:underline"
          >
            sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
