export function SiteFooter() {
  return (
    <footer className="border-border/60 border-t">
      <div className="mx-auto grid max-w-6xl gap-4 px-6 py-10">
        <p className="text-muted-foreground font-mono text-sm leading-relaxed">
          your schema is a value. your form is derived. your components are
          yours.
        </p>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs">
          <span>© Andrew Brown</span>
          <span aria-hidden="true">·</span>
          <span>MIT</span>
          <span aria-hidden="true">·</span>
          <a
            href="https://www.npmjs.com/package/jsonisch"
            className="hover:text-foreground transition-colors"
          >
            npm
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/andrew310/jsonisch"
            className="hover:text-foreground transition-colors"
          >
            github
          </a>
        </div>
      </div>
    </footer>
  );
}
