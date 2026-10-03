import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { metaFor, pad2 } from "@/designs/content";
import DesignOne from "@/designs/DesignOne";
import DesignTwo from "@/designs/DesignTwo";
import DesignThree from "@/designs/DesignThree";
import DesignFour from "@/designs/DesignFour";
import DesignFive from "@/designs/DesignFive";
import DesignSix from "@/designs/DesignSix";
import DesignSeven from "@/designs/DesignSeven";
import DesignEight from "@/designs/DesignEight";
import DesignNine from "@/designs/DesignNine";
import DesignTen from "@/designs/DesignTen";

const PAGES: Record<number, () => React.ReactElement> = {
  1: DesignOne,
  2: DesignTwo,
  3: DesignThree,
  4: DesignFour,
  5: DesignFive,
  6: DesignSix,
  7: DesignSeven,
  8: DesignEight,
  9: DesignNine,
  10: DesignTen,
};

export function generateStaticParams() {
  return Array.from({ length: 10 }, (_, i) => ({ n: String(i + 1) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ n: string }>;
}): Promise<Metadata> {
  const { n } = await params;
  const meta = metaFor(Number(n));
  if (!meta) return { title: "Design not found — todosst" };
  return {
    title: `Design ${pad2(meta.n)} · ${meta.name} — todosst`,
    description: `${meta.name} — ${meta.blurb}`,
  };
}

export default async function DesignPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const num = Number(n);
  const Page = PAGES[num];
  if (!Page || !metaFor(num)) notFound();
  return <Page />;
}
