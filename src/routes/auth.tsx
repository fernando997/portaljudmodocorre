import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import logoModo from "@/assets/logo_modo.png.asset.json";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser, requestOtp } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Entrar — Lex.Portal" }, { name: "description", content: "Acesso seguro ao portal jurídico." }],
  }),
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (user) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function AuthPage() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const sendOtp = useServerFn(requestOtp);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await sendOtp({ data: { phone } });
      toast.success("Código enviado", {
        description: `Use o código de teste: ${res.devCode}`,
        duration: 8000,
      });
      navigate({ to: "/auth/verify" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar código");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--gold)_0%,_transparent_45%)] opacity-[0.08]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--gold-soft)_0%,_transparent_50%)] opacity-[0.05]" />

      <div className="relative grid min-h-screen lg:grid-cols-2">
        <div className="hidden flex-col items-center justify-center gap-12 border-r border-border/40 p-12 lg:flex">
          <div className="flex flex-col items-center gap-5">
            <img src={logoModo.url} alt="Modo Corre" className="h-24 w-auto" />
            <div className="text-center font-display text-sm font-bold uppercase tracking-[0.25em] leading-tight text-foreground">
              Portal Judiciário
              <div className="mt-2 text-primary text-xs tracking-[0.35em]">Modo Corre</div>
            </div>
          </div>

          <div className="space-y-6 text-center">
            <p className="max-w-md text-base leading-relaxed text-muted-foreground">
              Plataforma dedicada para advogados gerirem comissões, contratos
              e clientes em um só lugar — com a segurança que a sua atuação exige.
            </p>
            <div className="flex items-center gap-4 pt-4">
              <div className="h-px flex-1 bg-gradient-to-r from-primary/60 to-transparent" />
              <span className="text-xs uppercase tracking-[0.3em] text-primary">
                Sigilo · Integridade · Velocidade
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-primary/60 to-transparent" />
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Portal Judiciário Modo Corre — Todos os direitos reservados.
          </div>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-10 lg:hidden">
              <div className="flex items-center gap-3">
                <img src={logoModo.url} alt="Modo Corre" className="h-10 w-auto" />
                <span className="font-display text-sm font-bold uppercase tracking-[0.2em]">
                  Portal Judiciário <span className="text-primary">Modo Corre</span>
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs uppercase tracking-[0.25em] text-primary">
                Etapa 1 de 2
              </span>
              <h2 className="font-display text-3xl font-bold">Acesse sua conta</h2>
              <p className="text-sm text-muted-foreground">
                Informe seu celular para receber um código de verificação por WhatsApp.
              </p>
            </div>

            <form onSubmit={submit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-foreground">
                  Celular
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  className="h-12 rounded-xl border-border/60 bg-card text-base"
                  autoComplete="tel"
                  autoFocus
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={loading || phone.replace(/\D/g, "").length < 10}
                className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-accent text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Receber código"
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Ao continuar você concorda com os Termos de Uso e a Política de
              Privacidade da plataforma.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
