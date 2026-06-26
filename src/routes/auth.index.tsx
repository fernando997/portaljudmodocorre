import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import logoModo from "@/assets/logo_modo.png.asset.json";
import lawBg from "@/assets/law-bg.webp.asset.json";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser, requestOtp } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth/")({
  head: () => ({
    meta: [{ title: "Entrar — Portal Judiciário Modo Corre" }, { name: "description", content: "Acesso seguro ao portal jurídico." }],
  }),
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (user) throw redirect({ to: "/home" });
  },
  component: AuthPage,
});

function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const REMEMBER_KEY = "portal_juridico_remember";
const REMEMBER_PHONE_KEY = "portal_juridico_remember_phone";

function AuthPage() {
  const [phone, setPhone] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const sendOtp = useServerFn(requestOtp);

  useEffect(() => {
    const savedRemember = window.localStorage.getItem(REMEMBER_KEY);
    const savedPhone = window.localStorage.getItem(REMEMBER_PHONE_KEY);
    if (savedRemember !== null) setRemember(savedRemember === "1");
    if (savedPhone) setPhone(formatPhone(savedPhone));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await sendOtp({ data: { phone } });
      window.localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
      if (remember) {
        window.localStorage.setItem(REMEMBER_PHONE_KEY, phone.replace(/\D/g, ""));
      } else {
        window.localStorage.removeItem(REMEMBER_PHONE_KEY);
      }
      toast.success("Código enviado", {
        description: `Use o código de teste: ${res.devCode}`,
        duration: 8000,
      });
      window.sessionStorage.setItem("portal_juridico_otp_ticket", res.ticket);
      navigate({ to: "/auth/verify" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar código");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Background image with overlays */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${lawBg.url})` }}
      />
      <div className="absolute inset-0 bg-background/85 backdrop-blur-[2px]" />
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background/70 to-background/95" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--gold)_0%,_transparent_45%)] opacity-[0.12]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--gold-soft)_0%,_transparent_50%)] opacity-[0.08]" />

      <div className="relative grid min-h-screen lg:grid-cols-2">
        <div className="hidden flex-col items-center justify-center gap-12 border-r border-border/30 p-12 lg:flex">
          <div className="flex flex-col items-center gap-5">
            <img src={logoModo.url} alt="Modo Corre" className="h-56 w-auto drop-shadow-[0_8px_32px_rgba(201,168,76,0.35)]" />
            <div className="text-center font-display text-base font-bold uppercase tracking-[0.25em] leading-tight text-foreground">
              Portal Judiciário
              <div className="mt-2 text-primary text-sm tracking-[0.35em]">Modo Corre</div>
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
          <div className="w-full max-w-md rounded-3xl border border-border/40 bg-card/70 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10">
            <div className="mb-8 lg:hidden">
              <div className="flex flex-col items-center gap-3 text-center">
                <img src={logoModo.url} alt="Modo Corre" className="h-28 w-auto" />
                <div className="font-display text-sm font-bold uppercase tracking-[0.25em] leading-tight">
                  Portal Judiciário
                  <div className="mt-1 text-primary text-xs tracking-[0.35em]">Modo Corre</div>
                </div>
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
                  className="h-12 rounded-xl border-border/60 bg-background/60 text-base"
                  autoComplete="tel"
                  autoFocus
                  required
                />
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/40 bg-background/40 p-3 transition-colors hover:border-primary/40">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <div className="flex-1 leading-tight">
                  <div className="text-sm font-medium text-foreground">Manter conectado</div>
                  <div className="text-xs text-muted-foreground">
                    Permanece logado neste dispositivo por 30 dias.
                  </div>
                </div>
              </label>

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
