import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { firstSnapshotRunning } from "@/lib/snapshot";

/** Whether the signed-in member's first snapshot is still under way; polled by `FirstSnapshotWait`. */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ running: false }, { status: 401 });
  const [user] = await db.select({ firstSnapshot: users.firstSnapshot, createdAt: users.createdAt }).from(users).where(eq(users.id, session.user.id));
  return NextResponse.json({ running: user ? firstSnapshotRunning(user) : false }, { headers: { "Cache-Control": "no-store" } });
}
