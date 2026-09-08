import Image from "next/image";
import Link from "next/link";

export function SiteNav() {
  return (
    <header className="border-border/60 border-b">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          {/* One artwork everywhere: the painted logo, plate removed by
              screen blending (Andrew's 🅱️ ruling — no typeset-brace
              reconstructions). The favicon is this artwork's face crop. logo-nav.png is the
              tight content crop so the visual mass centers on the wordmark. */}
          <Image
            src="/logo-nav.png"
            alt=""
            width={39}
            height={30}
            priority
            style={{ mixBlendMode: "screen" }}
          />
          <span className="font-mono text-sm font-medium tracking-tight">
            jsonisch
          </span>
        </Link>
        <div className="flex items-center font-mono text-sm">
          <a
            href="https://github.com/andrew310/jsonisch/tree/main/docs"
            className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1.5 transition-colors sm:px-3"
          >
            docs
          </a>
          <Link
            href="/api"
            className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1.5 transition-colors sm:px-3"
          >
            api
          </Link>
          <Link
            href="/playground"
            className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1.5 transition-colors sm:px-3"
          >
            playground
          </Link>
          <a
            href="https://github.com/andrew310/jsonisch"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors sm:px-3"
          >
            <svg
              viewBox="0 0 16 16"
              width="15"
              height="15"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            {/* Four items don't fit a 390px viewport with the label; the
                icon alone carries it on phones. */}
            <span className="hidden sm:inline">github</span>
          </a>
        </div>
      </nav>
    </header>
  );
}
