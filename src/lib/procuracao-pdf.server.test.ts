import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  enquadrar,
  gerarProcuracaoPdf,
  runsToWords,
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

describe("runsToWords", () => {
  async function fontes() {
    const pdf = await PDFDocument.create();
    return {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    };
  }

  it("cola a pontuação na palavra anterior", async () => {
    // Regressão: o nome ia num run em negrito e a vírgula no run seguinte, o
    // que imprimia "MARANATA MULTIMARCAS , pessoa jurídica".
    const w = runsToWords(
      [{ text: "MARANATA MULTIMARCAS", bold: true }, { text: ", pessoa jurídica" }],
      await fontes(),
      10,
    );
    expect(w.map((x) => x.text)).toEqual(["MARANATA", "MULTIMARCAS,", "pessoa", "jurídica"]);
  });

  it("não cola runs que começam em letra", async () => {
    // "Mandante:" e o nome são runs separados e precisam continuar separados.
    const w = runsToWords(
      [
        { text: "Mandante:", bold: true },
        { text: "MARANATA", bold: true },
      ],
      await fontes(),
      10,
    );
    expect(w.map((x) => x.text)).toEqual(["Mandante:", "MARANATA"]);
  });

  it("remede a palavra depois de colar a pontuação", async () => {
    const f = await fontes();
    const w = runsToWords([{ text: "NOME", bold: true }, { text: ", resto" }], f, 10);
    expect(w[0].text).toBe("NOME,");
    expect(w[0].width).toBeCloseTo(f.bold.widthOfTextAtSize("NOME,", 10), 5);
  });

  it("não cola quando não há palavra anterior", async () => {
    const w = runsToWords([{ text: ", solto" }], await fontes(), 10);
    expect(w.map((x) => x.text)).toEqual([",", "solto"]);
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

  it("só embute a logomarca da ICP-Brasil quando o documento é assinado", async () => {
    // O selo declara por escrito "assinado digitalmente ... em tal data". Num
    // PDF que não vai ser assinado isso seria afirmação falsa, então a ausência
    // de `assinadoEm` tem que deixar o selo inteiro de fora.
    const contarImagens = (b: Uint8Array) =>
      (new TextDecoder("latin1").decode(b).match(/\/Subtype\s*\/Image/g) ?? []).length;

    const semSelo = await gerarProcuracaoPdf(base);
    const comSelo = await gerarProcuracaoPdf({ ...base, assinadoEm: new Date() });

    expect(contarImagens(comSelo)).toBeGreaterThan(contarImagens(semSelo));
    expect(comSelo.length).toBeGreaterThan(semSelo.length);
  });

  it("mantém uma página só com o selo aplicado", async () => {
    const bytes = await gerarProcuracaoPdf({ ...base, assinadoEm: new Date() });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
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
