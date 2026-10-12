import { HoldApproval } from "../../_components/hold";

export const metadata = { title: "Approve a held purchase · Witness" };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t } = await searchParams;
  return <HoldApproval id={id} token={typeof t === "string" ? t : ""} />;
}
