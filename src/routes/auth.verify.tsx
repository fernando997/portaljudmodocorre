import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Scale, Loader2, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { verifyOtp } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth/verify")({
  head: () => ({ meta: [{ title: "Verificar código — PORTAL JUD · Modo Corre" }] }),
  component: VerifyPage,
});

function VerifyPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const verify = useServerFn(verifyOtp);

  const submit = async (value: string) => {
    setLoading(true);
    try {
      const result = await verify({ data: { code: value } });
      if (!result.ok) {
        toast.error(result.error);
        setCode("");
        return;
      }
      toast.success("Bem-vindo de volta!");
      navigate({ to: "/home" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido");
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--gold)_0%,_transparent_55%)] opacity-[0.06]" />

      <div className="relative w-full max-w-md">
        <Link
          to="/auth"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>

        <div className="rounded-2xl border border-border/50 bg-card/80 p-8 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs uppercase tracking-[0.25em] text-primary">
                Etapa 2 de 2
              </span>
              <h2 className="font-display text-2xl font-bold">Digite o código</h2>
            </div>
          </div>

          <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
            Enviamos um código de 6 dígitos via WhatsApp. Insira abaixo para
            concluir o acesso.
          </p>

          <div className="flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(v) => {
                setCode(v);
                if (v.length === 6) void submit(v);
              }}
              autoFocus
              disabled={loading}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="h-14 w-12 rounded-xl border-border/60 bg-background text-xl font-semibold text-foreground"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          <Button
            type="button"
            onClick={() => void submit(code)}
            disabled={loading || code.length !== 6}
            className="mt-8 h-12 w-full rounded-xl bg-gradient-to-r from-primary to-accent text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
          </Button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Não recebeu?{" "}
            <Link to="/auth" className="text-primary hover:underline">
              Enviar novamente
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
