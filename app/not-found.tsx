import Link from "next/link";
import { Button } from "@/components/ui/button";

export const runtime = "edge";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-[11px] uppercase tracking-[0.22em] text-cream-mute">Error 404</p>
      <h1 className="font-display text-display-lg mt-3 tracking-tight">Page not found</h1>
      <p className="text-sm text-cream-mute mt-3 max-w-md">
        The page you were looking for doesn&apos;t exist or has moved.
      </p>
      <Link href="/" className="mt-6">
        <Button variant="primary" size="md">
          Back to dashboard
        </Button>
      </Link>
    </div>
  );
}
