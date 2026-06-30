import { useSession } from "@tanstack/react-start/server";

export type SessionData = {
  userId?: string;
  phone?: string;
  nome?: string;
  advogadoId?: string;
  comissao?: number;
  pendingPhone?: string;
  pendingCode?: string;
  pendingExpires?: number;
  pendingNome?: string;
  pendingAdvogadoId?: string;
  pendingComissao?: number;
};

export function getAppSession() {
  return useSession<SessionData>({
    password: process.env.SESSION_SECRET!,
    name: "portal_juridico_session",
    maxAge: 60 * 60 * 24 * 30,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  });
}
