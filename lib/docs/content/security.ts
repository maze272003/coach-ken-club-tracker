import type { DocSection } from "../types";

export const securitySection: DocSection = {
  id: "security",
  title: "Permissions & Security",
  icon: "ShieldCheck",
  summary:
    "Authentication flow, role-based access, protected routes, and the authorization rules that keep data safe.",
  subsections: [
    {
      id: "s-auth",
      title: "Authentication Flow",
      icon: "Lock",
      blocks: [
        {
          type: "flow",
          nodes: [
            "Submit email + password at /login",
            "Coach check: environment credentials",
            "Else student check: scrypt hash",
            "Inactive student? Rejected",
            "JWT session issued",
            "Server layouts route by role",
          ],
        },
        {
          type: "bullets",
          items: [
            "One credentials provider. The coach account is validated against server-side environment variables (`COACH_EMAIL` / `COACH_PASSWORD`) — those values never reach the browser and the coach password is not stored in the database.",
            "Student passwords are stored only as scrypt hashes. The coach can reset a password (which signs the student out everywhere) but can never read one.",
            "Deactivated students are refused at sign-in with a clear message.",
            "Sessions are JWT-based; expired sessions produce a friendly “session expired” prompt to sign in again.",
            "There is **no public registration** — the only way an account exists is the coach creating it (or the demo seed).",
          ],
        },
      ],
    },
    {
      id: "s-routes",
      title: "Protected Routes",
      icon: "Route",
      blocks: [
        {
          type: "table",
          headers: ["Route", "Who can open it", "Otherwise"],
          rows: [
            ["`/login`", "Anyone (unauthenticated)", "Authenticated users are routed to their dashboard."],
            ["`/`", "Anyone", "Redirects by role: coach → `/coach/dashboard`, student → `/student/dashboard`, none → `/login`."],
            ["`/coach/*`", "Coach only", "Redirected to `/` (then to their own area or login)."],
            ["`/student/*`", "Student only", "Redirected to `/`."],
            ["`/docs`", "Any signed-in user (coach or student)", "Redirected to `/login`."],
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Layout guards are not the security boundary",
          text: "Redirects only improve navigation. Every Convex function independently verifies the caller’s role and ownership — calling an API directly without the right role fails with “Not authorized”.",
        },
      ],
    },
    {
      id: "s-rbac",
      title: "Role Permission Matrix",
      icon: "ShieldCheck",
      blocks: [
        {
          type: "table",
          headers: ["Capability", "Coach", "Student"],
          rows: [
            ["Create / edit / deactivate student accounts", "Yes", "No"],
            ["Reset student passwords", "Yes", "No"],
            ["Manage groups (create/rename/archive)", "Yes", "No"],
            ["Schedule / edit / cancel / complete practices", "Yes", "No"],
            ["Record roll call (bulk or single)", "Yes", "No"],
            ["Create / edit / delete training sessions", "Yes", "No"],
            ["Manage skill library + set skill progress", "Yes", "No"],
            ["Create / edit / delete goals", "Yes", "No"],
            ["Record / delete swim times, run time trials", "Yes", "No"],
            ["Export times / attendance to CSV", "Yes", "No"],
            ["View dashboards, insights flags, trends", "Yes (whole team)", "Own data only"],
            ["View weekly reports / print report cards", "Yes", "No"],
            ["Data overview & demo seed", "Yes", "No"],
            ["Edit own display name and avatar", "Yes (profile page is read-only info; name/image live on the user record)", "Yes"],
            ["View any student’s full profile", "Yes", "No — server rejects other ids"],
          ],
        },
      ],
    },
    {
      id: "s-rules",
      title: "Authorization Rules Worth Knowing",
      icon: "Lock",
      blocks: [
        {
          type: "bullets",
          items: [
            "**Never trust the client.** All authorization is enforced inside Convex functions; the UI merely reflects it.",
            "**Students never pass a student id.** Their queries resolve identity from the authenticated session, so a student is structurally unable to request someone else’s data. Parameterized student views additionally verify that the requested id belongs to the caller.",
            "**Coach-only functions** verify `role === \"coach\"` before touching data; **student functions** resolve the caller’s own active student record and reject everything else.",
            "**Archive, don’t delete.** Groups and skills are archived (history preserved); students are deactivated (data retained, login blocked).",
            "**Email addresses are immutable** after account creation.",
            "**Password resets invalidate all sessions** for that student immediately.",
            "**Coach credentials** exist only as server-side environment variables — they are not stored in the database and cannot be changed from the app.",
          ],
        },
      ],
    },
  ],
};
