import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { COPY } from "@/lib/copy";
import { ForgotPasswordForm } from "./forgot-password-form";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
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
            <CardTitle>Reset your password</CardTitle>
            <CardDescription>
              Enter the email on your Profit Shield account. We&apos;ll send a secure
              link to choose a new password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ForgotPasswordForm />
          </CardContent>
        </Card>

        <p className="text-center text-xs text-cream-mute">
          Remembered it?{" "}
          <Link
            href="/login?mode=signin"
            className="text-cream underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
