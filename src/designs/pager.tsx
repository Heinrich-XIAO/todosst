import Link from "next/link";
import { metaFor, pad2 } from "./content";

/**
 * Prev / index / next links, one per design so reviewers can walk 1 → 10.
 * `className` + `linkClass` are supplied by each design so the pager adopts
 * that page's own type, colour and border language instead of a shared look.
 */
export function DesignPager({
  n,
  className = "",
  linkClass = "",
}: {
  n: number;
  className?: string;
  linkClass?: string;
}) {
  const prev = metaFor(n - 1);
  const next = n < 10 ? metaFor(n + 1) : metaFor(1);
  const prevHref = prev ? `/design/${prev.n}` : "/design";
  const nextHref = `/design/${next!.n}`;
  return (
    <nav aria-label="Design pager" className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <Link href={prevHref} className={`min-h-11 px-3 py-2 ${linkClass}`}>
        ← {prev ? `${pad2(prev.n)} ${prev.name}` : "All ten designs"}
      </Link>
      <Link href="/design" className={`min-h-11 px-3 py-2 ${linkClass}`}>
        Index
      </Link>
      <Link href={nextHref} className={`min-h-11 px-3 py-2 ${linkClass}`}>
        {pad2(next!.n)} {next!.name} →
      </Link>
    </nav>
  );
}
