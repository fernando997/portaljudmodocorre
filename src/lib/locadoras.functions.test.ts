import { describe, expect, it } from "vitest";
import { certificadoValido } from "./locadoras.functions";

describe("certificadoValido", () => {
  const DIA = 86_400_000;

  it("é válido com certificado cadastrado e vencimento no futuro", () => {
    expect(
      certificadoValido({ temCertificado: true, certificadoVencimento: Date.now() + 30 * DIA }),
    ).toBe(true);
  });

  it("é inválido sem certificado, mesmo com data de vencimento futura", () => {
    // Acontece no cadastro: vencimento preenchido, arquivo .pfx não.
    expect(
      certificadoValido({ temCertificado: false, certificadoVencimento: Date.now() + 30 * DIA }),
    ).toBe(false);
  });

  it("é inválido com certificado vencido", () => {
    expect(
      certificadoValido({ temCertificado: true, certificadoVencimento: Date.now() - DIA }),
    ).toBe(false);
  });

  it("trata vencimento ausente como válido, desde que haja certificado", () => {
    // 1 das 76 locadoras tem certificado sem data cadastrada. Sem a data não
    // dá para afirmar que venceu, então a tela deixa tentar — e a assinatura
    // em si vai falhar com mensagem clara se o certificado estiver vencido.
    expect(certificadoValido({ temCertificado: true, certificadoVencimento: null })).toBe(true);
  });

  it("é a mesma regra que a vitrine e a tela de locadoras aplicam", () => {
    // Guarda contra as duas telas divergirem: o filtro "Com procuração
    // assinada" e o bloqueio do botão de assinar precisam concordar.
    const casos = [
      { temCertificado: true, certificadoVencimento: Date.now() + DIA },
      { temCertificado: true, certificadoVencimento: Date.now() - DIA },
      { temCertificado: false, certificadoVencimento: null },
    ];
    expect(casos.map(certificadoValido)).toEqual([true, false, false]);
  });
});
