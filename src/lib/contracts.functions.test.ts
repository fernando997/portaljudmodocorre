import { describe, expect, it } from "vitest";
import { formatPhone, normalize, parseBrl, type CustomerInfo } from "./contracts.functions";

describe("parseBrl", () => {
  it("converte string BRL (milhar com ponto, decimal com vírgula)", () => {
    expect(parseBrl("1.234,56")).toBe(1234.56);
  });

  it("passa números adiante sem alteração", () => {
    expect(parseBrl(42)).toBe(42);
  });

  it("retorna 0 para valores inválidos ou ausentes", () => {
    expect(parseBrl(undefined)).toBe(0);
    expect(parseBrl(null)).toBe(0);
    expect(parseBrl("abc")).toBe(0);
  });
});

describe("formatPhone", () => {
  it("formata celular com 11 dígitos (DDD + 9 dígitos)", () => {
    expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
  });

  it("formata telefone com 10 dígitos", () => {
    expect(formatPhone("1132654321")).toBe("(11) 3265-4321");
  });

  it("ignora caracteres não numéricos antes de formatar", () => {
    expect(formatPhone("(11) 98765-4321")).toBe("(11) 98765-4321");
  });

  it("retorna o valor original quando não bate com 10 ou 11 dígitos", () => {
    expect(formatPhone("123")).toBe("123");
  });
});

describe("normalize", () => {
  const customers = new Map<string, CustomerInfo>([
    [
      "cust-1",
      {
        nome_completo: "Maria Silva",
        celular: "11987654321",
        cidade: "São Paulo",
        bairro: "Centro",
        fiador: "fiador-1",
      },
    ],
    [
      "fiador-1",
      {
        nome_completo: "João Fiador",
        celular: "11911112222",
        cidade: "São Paulo",
        bairro: "Centro",
        fiador: "",
      },
    ],
  ]);
  const fechamentos = new Map<string, number>([["ctr-1", 1500.5]]);

  it("marca como bloqueado quando há campo bloqueio preenchido", () => {
    const c = normalize(
      { _id: "ctr-1", cliente: "cust-1", bloqueio: "Sim" },
      0,
      customers,
      fechamentos,
    );
    expect(c.status).toBe("bloqueado");
  });

  it("marca como encerrado quando há aditivo e não há bloqueio", () => {
    const c = normalize(
      { _id: "ctr-1", cliente: "cust-1", Aditivo: "Sim" },
      0,
      customers,
      fechamentos,
    );
    expect(c.status).toBe("encerrado");
  });

  it("marca como ativo quando não há bloqueio nem aditivo", () => {
    const c = normalize({ _id: "ctr-1", cliente: "cust-1" }, 0, customers, fechamentos);
    expect(c.status).toBe("ativo");
  });

  it("resolve nome e telefone do cliente e do fiador a partir dos mapas", () => {
    const c = normalize({ _id: "ctr-1", cliente: "cust-1" }, 0, customers, fechamentos);
    expect(c.clienteNome).toBe("Maria Silva");
    expect(c.clienteCelular).toBe("(11) 98765-4321");
    expect(c.fiadorNome).toBe("João Fiador");
  });

  it("soma o total de fechamento vinculado ao id do contrato", () => {
    const c = normalize({ _id: "ctr-1", cliente: "cust-1" }, 0, customers, fechamentos);
    expect(c.totalFechamento).toBe(1500.5);
  });

  it("usa o próprio id do cliente como nome quando ele não é um id interno do Bubble", () => {
    const c = normalize({ _id: "ctr-2", cliente: "Cliente Avulso" }, 1, customers, fechamentos);
    expect(c.clienteNome).toBe("Cliente Avulso");
  });
});
