import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-fd-muted-foreground text-sm font-medium uppercase tracking-wide">
        Documentation
      </p>
      <h1 className="text-4xl font-bold tracking-tight">
        firebase-storage-kit
      </h1>
      <p className="text-fd-muted-foreground text-lg leading-relaxed">
        A friendly layer on top of Firebase Storage for browser uploads —
        progress tracking, pause and resume, batch uploads, retries, and file
        helpers.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          className="bg-fd-primary text-fd-primary-foreground inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium"
          href="/docs"
        >
          Get started
        </Link>
        <Link
          className="border-fd-border hover:bg-fd-accent inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium"
          href="/docs/getting-started/single-upload"
        >
          Single upload
        </Link>
      </div>
    </main>
  );
}
