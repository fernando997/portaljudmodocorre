import { describe, expect, it } from "vitest";
import {
  clausulaRepresentante,
  formatCnpj,
  formatCpf,
  montarEndereco,
  nomePlausivel,
  qualificacaoMandante,
} from "./formatters";

describe("formatCnpj", () => {
  it("formata 14 dígitos", () => {
    expect(formatCnpj("54880289000100")).toBe("54.880.289/0001-00");
  });

  it("repõe o zero à esquerda que o Bubble come ao guardar como número", () => {
    // SANTO ANTONIO ENG CONSULT SANE: o certificado diz 08929245000100,
    // o cadastro devolve 8929245000100 e a procuração saía com o CNPJ errado.
    expect(formatCnpj("8929245000100")).toBe("08.929.245/0001-00");
    expect(formatCnpj("9096679000139")).toBe("09.096.679/0001-39");
  });
});

describe("montarEndereco", () => {
  const base = {
    logradouro: "Rua Izolina de Moraes Rosa",
    numero: "621",
    bairro: "Vila Nastri",
    complemento: "",
    cidade: "Itapetininga",
    estado: "SP",
  };

  it("não prefixa tipo de via, porque o cadastro já traz", () => {
    // Regressão: saía "Rua Rua Izolina de Moraes Rosa".
    const r = montarEndereco(base);
    expect(r).toBe("Rua Izolina de Moraes Rosa, 621, Vila Nastri, Itapetininga/SP");
    expect(r).not.toContain("Rua Rua");
  });

  it("expande a abreviação de via usada no cadastro", () => {
    // 22 registros vêm como "R DOUTOR JULIO PRESTES".
    expect(montarEndereco({ ...base, logradouro: "R DOUTOR JULIO PRESTES" })).toContain(
      "Rua DOUTOR JULIO PRESTES",
    );
    expect(montarEndereco({ ...base, logradouro: "AV. BRASIL" })).toContain("Avenida BRASIL");
  });

  it("descarta complemento que só repete o número", () => {
    // 48 das 76 locadoras têm complemento idêntico ao número.
    const r = montarEndereco({ ...base, complemento: "621" });
    expect(r).toBe("Rua Izolina de Moraes Rosa, 621, Vila Nastri, Itapetininga/SP");
    expect(r.match(/621/g)).toHaveLength(1);
  });

  it("descarta complemento que é só pontuação", () => {
    expect(montarEndereco({ ...base, complemento: "." })).not.toContain(".,");
  });

  it("mantém complemento que acrescenta informação", () => {
    expect(montarEndereco({ ...base, complemento: "Sala 4" })).toBe(
      "Rua Izolina de Moraes Rosa, 621, Vila Nastri, Sala 4, Itapetininga/SP",
    );
  });

  it("não quebra com campos vazios", () => {
    expect(
      montarEndereco({
        logradouro: "",
        numero: "",
        bairro: "",
        complemento: "",
        cidade: "",
        estado: "",
      }),
    ).toBe("—, —, —, —/—");
  });
});

describe("qualificacaoMandante", () => {
  it("trata 14 dígitos como pessoa jurídica", () => {
    expect(qualificacaoMandante("54880289000100")).toBe(
      "pessoa jurídica de direito privado, inscrita no CNPJ nº 54.880.289/0001-00",
    );
  });

  it("trata CNPJ sem o zero à esquerda ainda como pessoa jurídica", () => {
    expect(qualificacaoMandante("8929245000100")).toContain("CNPJ nº 08.929.245/0001-00");
  });

  it("trata 11 dígitos como pessoa física, não como CNPJ", () => {
    // 11 das 76 locadoras são PF e guardam o CPF no campo chamado "cnpj".
    expect(qualificacaoMandante("12175786846")).toBe(
      "pessoa física, inscrito(a) no CPF nº 121.757.868-46",
    );
  });

  it("repõe zero à esquerda também no CPF", () => {
    expect(qualificacaoMandante("4805471140")).toBe(
      "pessoa física, inscrito(a) no CPF nº 048.054.711-40",
    );
  });

  it("nunca chama pessoa física de pessoa jurídica", () => {
    // Regressão: o texto era fixo em "pessoa jurídica ... CNPJ".
    for (const doc of ["12175786846", "537548165", "3256092179", "34215401879"]) {
      expect(qualificacaoMandante(doc)).not.toContain("jurídica");
      expect(qualificacaoMandante(doc)).not.toContain("CNPJ");
    }
  });

  it("não inventa qualificação quando o campo está vazio", () => {
    expect(qualificacaoMandante("")).toBe("inscrito(a) sob o nº —");
  });
});

describe("formatCpf", () => {
  it("formata 11 dígitos", () => {
    expect(formatCpf("12175786846")).toBe("121.757.868-46");
  });

  it("devolve intacto o que não tem 11 dígitos", () => {
    expect(formatCpf("1")).toBe("1");
    expect(formatCpf("39523091000185")).toBe("39523091000185");
  });
});

describe("nomePlausivel", () => {
  // Todos os casos abaixo saíram do campo RL_nome da base real.
  it("aceita nome de pessoa com sobrenome", () => {
    expect(nomePlausivel("MARCELO POLI")).toBe(true);
    expect(nomePlausivel("Thayna de Melo Raulino Bueno")).toBe(true);
  });

  it("rejeita os marcadores numéricos que poluem o cadastro", () => {
    expect(nomePlausivel("1")).toBe(false);
    expect(nomePlausivel("0")).toBe(false);
    expect(nomePlausivel("111")).toBe(false);
  });

  it("rejeita primeiro nome solto, que não identifica ninguém", () => {
    expect(nomePlausivel("Fernando")).toBe(false);
    expect(nomePlausivel("Higor")).toBe(false);
    expect(nomePlausivel("CASSIANO")).toBe(false);
  });

  it("rejeita o nome da própria empresa repetido no campo", () => {
    expect(nomePlausivel("GENESIS TUR LTDA", "GENESIS TUR LTDA")).toBe(false);
    expect(nomePlausivel("VASQUES LOCADORA DE MOTOS LTDA", "VASQUES LOCADORA DE MOTOS LTDA")).toBe(
      false,
    );
  });

  it("rejeita razão social mesmo sem saber o nome da empresa", () => {
    expect(nomePlausivel("MBL MOBILIDADE LTDA")).toBe(false);
  });

  it("rejeita vazio", () => {
    expect(nomePlausivel("")).toBe(false);
    expect(nomePlausivel("   ")).toBe(false);
  });
});

describe("clausulaRepresentante", () => {
  it("nomeia o representante com CPF quando veio do certificado", () => {
    expect(clausulaRepresentante({ nome: "MARCELO POLI", cpf: "12175786846" })).toBe(
      ", neste ato representado por seu representante legal, o(a) senhor(a) MARCELO POLI, inscrito(a) no CPF nº 121.757.868-46.",
    );
  });

  it("omite o CPF quando só há o nome do cadastro", () => {
    expect(clausulaRepresentante({ nome: "MARCELO POLI" })).toBe(
      ", neste ato representado por seu representante legal, o(a) senhor(a) MARCELO POLI.",
    );
  });

  it("fecha o parágrafo sem cláusula quando não há representante (e-CPF)", () => {
    expect(clausulaRepresentante(null)).toBe(".");
    expect(clausulaRepresentante(undefined)).toBe(".");
    expect(clausulaRepresentante({ nome: "  " })).toBe(".");
  });

  it("nunca imprime dados de terceiro: sem fonte, não inventa nome", () => {
    // Regressão do bug antigo, em que todas as 76 locadoras saíam com o mesmo
    // sócio administrador fixo no texto.
    expect(clausulaRepresentante(null)).not.toContain("Bonatti");
  });
});
