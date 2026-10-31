import { Suspense } from "react";
import { auth } from "@/auth";
import { AccentPicker } from "@/components/SideFrame";
import { isAdmin } from "@/lib/admin";

async function Gate() {
  if (process.env.NODE_ENV === "development") return <AccentPicker />;
  const session = await auth();
  return session && (await isAdmin(session.user.id)) ? <AccentPicker /> : null;
}

/** The accent trial on a page without a session of its own (the demo, `/claude`): shown to the admin only, and anyone in `npm run dev`. */
export function AdminAccentPicker() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  );
}
