import { describe, expect, it } from "vitest";
import {
  classifyMidia,
  fileUrl,
  formatDate,
  num,
  numDecimal,
  str,
} from "./contract-detail.functions";

describe("num", () => {
  it("converte string BRL para número", () => {
    expect(num("2.500,75")).toBe(2500.75);
  });

  it("passa números adiante sem alteração", () => {
    expect(num(10)).toBe(10);
  });

  it("retorna 0 para valores ausentes ou inválidos", () => {
    expect(num(undefined)).toBe(0);
    expect(num("")).toBe(0);
  });
});

describe("numDecimal", () => {
  it("converte decimal-ponto simples (formato real do valor_bruto de multas_detalhes)", () => {
    expect(numDecimal("130.16")).toBe(130.16);
    expect(numDecimal("293.47")).toBe(293.47);
  });

  it("também aceita vírgula como decimal (outliers digitados manualmente)", () => {
    expect(numDecimal("130,16")).toBe(130.16);
  });

  it("passa números adiante sem alteração", () => {
    expect(numDecimal(10)).toBe(10);
  });

  it("retorna 0 para valores ausentes ou inválidos", () => {
    expect(numDecimal(undefined)).toBe(0);
    expect(numDecimal("")).toBe(0);
    expect(numDecimal("abc")).toBe(0);
  });
});

describe("str", () => {
  it("converte valores para string", () => {
    expect(str(123)).toBe("123");
  });

  it("retorna string vazia para null/undefined", () => {
    expect(str(null)).toBe("");
    expect(str(undefined)).toBe("");
  });
});

describe("fileUrl", () => {
  it("adiciona https: a URLs protocol-relative", () => {
    expect(fileUrl("//cdn.example.com/arquivo.pdf")).toBe("https://cdn.example.com/arquivo.pdf");
  });

  it("mantém URLs absolutas inalteradas", () => {
    expect(fileUrl("https://cdn.example.com/arquivo.pdf")).toBe(
      "https://cdn.example.com/arquivo.pdf",
    );
  });

  it("retorna string vazia para valores vazios", () => {
    expect(fileUrl("")).toBe("");
    expect(fileUrl(undefined)).toBe("");
  });
});

describe("classifyMidia", () => {
  it("classifica extensões de imagem", () => {
    expect(classifyMidia("https://cdn.example.com/foto.jpg")).toBe("imagem");
    expect(classifyMidia("https://cdn.example.com/foto.png?x=1")).toBe("imagem");
  });

  it("classifica extensões de vídeo", () => {
    expect(classifyMidia("https://cdn.example.com/video.mp4")).toBe("video");
  });

  it("assume vídeo como padrão quando a extensão é desconhecida mas há URL", () => {
    expect(classifyMidia("https://cdn.example.com/arquivo-sem-extensao")).toBe("video");
  });

  it("retorna string vazia quando não há URL", () => {
    expect(classifyMidia("")).toBe("");
  });
});

describe("formatDate", () => {
  it("formata timestamp numérico para pt-BR", () => {
    const ts = new Date("2024-03-15T10:30:00Z").getTime();
    const formatted = formatDate(ts);
    expect(formatted).toContain("2024");
    expect(formatted).toContain("15");
  });

  it("retorna string vazia para valores ausentes ou zero", () => {
    expect(formatDate(0)).toBe("");
    expect(formatDate(undefined)).toBe("");
  });

  it("retorna string vazia para datas inválidas", () => {
    expect(formatDate("não é uma data")).toBe("");
  });
});
