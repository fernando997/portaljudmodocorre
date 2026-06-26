import { useSession } from "@tanstack/react-start/server";

export type SessionData = {
  userId?: string;
  phone?: string;
  pendingPhone?: string;
  pendingCode?: string;
  pendingExpires?: number;
};

export function getAppSession() {
  return useSession<SessionData>({
    password: process.env.SESSION_SECRET!,
    name: "portal_juridico_session",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    },
  });
}
