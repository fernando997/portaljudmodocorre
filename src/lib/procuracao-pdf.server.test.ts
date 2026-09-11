import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  enquadrar,
  gerarProcuracaoPdf,
  sanitize,
  type DadosProcuracao,
} from "./procuracao-pdf.server";

describe("enquadrar", () => {
  it("escala a assinatura padrão do cadastro pela largura", () => {
    // As 56 assinaturas cadastradas são todas 800x200.
    expect(enquadrar(800, 200, 220, 70).largura).toBeCloseTo(220, 5);
    expect(enquadrar(800, 200, 220, 70).altura).toBeCloseTo(55, 5);
  });

  it("preserva a proporção original", () => {
    const r = enquadrar(800, 200, 220, 70);
    expect(r.largura / r.altura).toBeCloseTo(4, 5);
  });

  it("limita pela altura quando a imagem é alta, sem esticar", () => {
    // Regressão: a versão anterior fixava a largura em 150 e cortava a altura
    // com Math.min, o que distorceria qualquer assinatura fora do 4:1.
    const r = enquadrar(200, 800, 220, 70);
    expect(r.altura).toBe(70);
    expect(r.largura).toBeCloseTo(17.5, 5);
    expect(r.largura / r.altura).toBeCloseTo(0.25, 5);
  });

  it("nunca ultrapassa a caixa", () => {
    for (const [w, h] of [
      [800, 200],
      [200, 800],
      [1000, 1000],
      [50, 20],
    ]) {
      const r = enquadrar(w, h, 220, 70);
      expect(r.largura).toBeLessThanOrEqual(220 + 1e-9);
      expect(r.altura).toBeLessThanOrEqual(70 + 1e-9);
    }
  });

  it("devolve zero para dimensão inválida em vez de NaN", () => {
    expect(enquadrar(0, 0, 220, 70)).toEqual({ largura: 0, altura: 0 });
  });
});

const base: DadosProcuracao = {
  nomeSocial: "MOP MOTOS LOCAÇÕES",
  cnpj: "54880289000100",
  logradouro: "Rua Antoninho Marmo",
  numero: "4391",
  bairro: "Solo Sagrado",
  complemento: "Sala 4",
  cidade: "São José do Rio Preto",
  estado: "SP",
  cep: "15044050",
  // Vazio de propósito: o teste não deve depender de rede.
  assinaturaUrl: "",
};

describe("sanitize", () => {
  it("normaliza caracteres tipográficos que a Helvetica não codifica", () => {
    expect(sanitize("traço — e travessão –")).toBe("traço - e travessão -");
    expect(sanitize("aspas “curvas” e ‘simples’")).toBe("aspas \"curvas\" e 'simples'");
    expect(sanitize("reticências…")).toBe("reticências...");
  });

  it("preserva acentuação do português", () => {
    expect(sanitize("Procuração ação São José nº 1º")).toBe("Procuração ação São José nº 1º");
  });

  it("remove caracteres fora do Latin-1", () => {
    expect(sanitize("emoji 🚗 fim")).toBe("emoji  fim");
  });
});

describe("gerarProcuracaoPdf", () => {
  it("gera um PDF válido de uma página", async () => {
    const bytes = await gerarProcuracaoPdf(base);

    expect(bytes.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);

    const [page] = pdf.getPages();
    expect(Math.round(page.getWidth())).toBe(595);
    expect(Math.round(page.getHeight())).toBe(842);
  });

  it("não quebra quando os campos de endereço estão vazios", async () => {
    const bytes = await gerarProcuracaoPdf({
      ...base,
      logradouro: "",
      numero: "",
      bairro: "",
      complemento: "",
      cidade: "",
      estado: "",
      cep: "",
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("aceita CNPJ e CEP já formatados ou crus", async () => {
    const cru = await gerarProcuracaoPdf(base);
    const formatado = await gerarProcuracaoPdf({
      ...base,
      cnpj: "54.880.289/0001-00",
      cep: "15044-050",
    });
    expect(cru.length).toBeGreaterThan(1000);
    expect(formatado.length).toBeGreaterThan(1000);
  });
});
