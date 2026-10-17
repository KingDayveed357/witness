import { Review } from "./review";

export const metadata = { title: "Review a payment · Second Key" };

// The trusted contact's page, opened from the one-time link the API issues (/holds/:id?t=…).
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t } = await searchParams;
  return (
    <div className="stack-lg">
      <header className="stack-sm" style={{ maxWidth: 440, margin: "0 auto", width: "100%" }}>
        <span className="sk-section-title">Experience B · the trusted contact</span>
      </header>
      <Review id={id} token={typeof t === "string" ? t : ""} />
    </div>
  );
}
