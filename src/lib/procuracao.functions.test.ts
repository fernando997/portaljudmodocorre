import { describe, expect, it } from "vitest";
import { limparNomeCertificado } from "./procuracao.functions";

describe("limparNomeCertificado", () => {
  it("remove o CNPJ do final do CN (padrão ICP-Brasil NOME:CNPJ)", () => {
    expect(limparNomeCertificado("MARANATA MULTIMARCAS LTDA:27487900000161")).toBe(
      "MARANATA MULTIMARCAS LTDA",
    );
  });

  it("remove o CNPJ que os certificados MEI colam na frente do nome", () => {
    expect(limparNomeCertificado("63.064.846 THAYNA DE MELO RAULINO BUENO:63064846000104")).toBe(
      "THAYNA DE MELO RAULINO BUENO",
    );
    expect(limparNomeCertificado("39.523.091 MARCUS VINICIUS RIBEIRO VAZ:39523091000100")).toBe(
      "MARCUS VINICIUS RIBEIRO VAZ",
    );
  });

  it("preserva nomes de pessoa física sem prefixo", () => {
    expect(limparNomeCertificado("FERNANDO CUSTODIO DE OLIVEIRA JUNIOR:12345678901")).toBe(
      "FERNANDO CUSTODIO DE OLIVEIRA JUNIOR",
    );
  });

  it("não confunde número que faça parte do nome com prefixo de CNPJ", () => {
    expect(limparNomeCertificado("3C EMPREENDIMENTOS LTDA:11222333000144")).toBe(
      "3C EMPREENDIMENTOS LTDA",
    );
  });

  it("aceita CN sem o separador de documento", () => {
    expect(limparNomeCertificado("BRASIL MOTORS LTDA")).toBe("BRASIL MOTORS LTDA");
  });

  it("devolve o nome truncado como veio — o corte é da AC, não nosso", () => {
    expect(
      limparNomeCertificado("SANTO ANTONIO ENGENHARIA CONSULTORIA SANEAMENTO A:08929245000100"),
    ).toBe("SANTO ANTONIO ENGENHARIA CONSULTORIA SANEAMENTO A");
  });
});
