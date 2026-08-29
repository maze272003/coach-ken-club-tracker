// app/api/parent-report/csv/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { athleteCardToCsv, type ReportEmailPayload } from "@/convex/lib/reportEmail";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  const result = await fetchQuery(api.parentEmails.getByToken, { token });
  if (!result) {
    return new NextResponse("Report not found or link expired", { status: 404 });
  }

  const payload = JSON.parse(result.payloadJson) as ReportEmailPayload;
  const csvContent = athleteCardToCsv(payload);
  const safeName = payload.card.student.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${safeName}-report-${payload.weekStart}.csv`;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
