import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "CROWD_FLOW // OPTIMISER — WE EXECUTE, WE DON'T JUST WATCH",
  description:
    "Decentralized multi-agent crowd management. Autonomous zone agents negotiate peer-to-peer and execute physical signage interventions — no central point of failure.",
};

export default function Page() {
  return <LandingPage />;
}
