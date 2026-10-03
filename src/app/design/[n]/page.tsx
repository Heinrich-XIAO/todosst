import { notFound } from "next/navigation";
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

export function generateStaticParams() {
  return Array.from({ length: 10 }, (_, i) => ({ n: String(i + 1) }));
}

export default async function DesignPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  switch (n) {
    case "1": return <DesignOne />;
    case "2": return <DesignTwo />;
    case "3": return <DesignThree />;
    case "4": return <DesignFour />;
    case "5": return <DesignFive />;
    case "6": return <DesignSix />;
    case "7": return <DesignSeven />;
    case "8": return <DesignEight />;
    case "9": return <DesignNine />;
    case "10": return <DesignTen />;
    default: notFound();
  }
}
