export function formatCnpj(raw: string): string {
  const d = raw.replace(/\D/g, "");
  // O Bubble guarda o campo como número, então CNPJ iniciado em zero chega
  // com 12 ou 13 dígitos. Sem repor o zero, a procuração sai com o CNPJ errado.
  const cnpj = d.length >= 12 && d.length <= 14 ? d.padStart(14, "0") : d;
  if (cnpj.length !== 14) return raw;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

export function formatCpf(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const cpf = d.length >= 9 && d.length <= 11 ? d.padStart(11, "0") : d;
  if (cpf.length !== 11) return raw;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/**
 * Qualificação do mandante. O cadastro chama o campo de "cnpj", mas 11 das 76
 * locadoras são pessoa física e guardam um CPF ali — o texto fixo dizia
 * "pessoa jurídica de direito privado, inscrito no CNPJ nº <CPF>", o que é
 * falso em duas frentes de uma vez.
 *
 * CNPJ tem 14 dígitos e CPF tem 11; os comprimentos menores são zeros à
 * esquerda que o Bubble comeu, e não se sobrepõem entre si.
 */
export function qualificacaoMandante(documento: string): string {
  const d = documento.replace(/\D/g, "");
  if (d.length >= 12 && d.length <= 14) {
    return `pessoa jurídica de direito privado, inscrita no CNPJ nº ${formatCnpj(d)}`;
  }
  if (d.length >= 9 && d.length <= 11) {
    // "inscrito(a)" porque aqui a concordância é com a pessoa, e o cadastro não
    // guarda o gênero dela. No caso da PJ o "inscrita" concorda com "pessoa
    // jurídica" e está correto.
    return `pessoa física, inscrito(a) no CPF nº ${formatCpf(d)}`;
  }
  return "inscrito(a) sob o nº —";
}

/** Tipos de via que o cadastro abrevia sem ponto ("R DOUTOR JULIO PRESTES"). */
const ABREVIACOES_DE_VIA: Record<string, string> = {
  R: "Rua",
  AV: "Avenida",
  AL: "Alameda",
  PC: "Praça",
  ROD: "Rodovia",
  TV: "Travessa",
  EST: "Estrada",
};

export type EnderecoPartes = {
  logradouro: string;
  numero: string;
  bairro: string;
  complemento: string;
  cidade: string;
  estado: string;
};

/**
 * Monta o endereço do mandante a partir do cadastro.
 *
 * Duas armadilhas do Bubble, ambas confirmadas na base:
 *
 * 1. O logradouro **já vem com o tipo de via** nos 74 registros preenchidos, uns
 *    por extenso ("Rua Antoninho Marmo") e outros abreviados sem ponto ("R
 *    DOUTOR JULIO PRESTES"). Prefixar "Rua" gerava "Rua Rua Antoninho Marmo".
 * 2. O complemento repete o número em **48 dos 76** registros, o que produzia
 *    "…, 621, Vila Nastri, 621, …". Só entra quando acrescenta informação.
 */
export function montarEndereco(p: EnderecoPartes): string {
  const logradouro = expandirTipoDeVia(p.logradouro.trim());
  const numero = p.numero.trim();
  const complemento = p.complemento.trim();

  // Um complemento que repete o número, ou que é só pontuação, é ruído.
  const complementoUtil =
    complemento &&
    complemento.toLowerCase() !== numero.toLowerCase() &&
    /[a-z0-9]/i.test(complemento);

  return [
    logradouro || "—",
    numero || "—",
    p.bairro.trim() || "—",
    ...(complementoUtil ? [complemento] : []),
    `${p.cidade.trim() || "—"}/${p.estado.trim() || "—"}`,
  ].join(", ");
}

function expandirTipoDeVia(logradouro: string): string {
  const espaco = logradouro.indexOf(" ");
  if (espaco <= 0) return logradouro;
  const primeira = logradouro.slice(0, espaco).replace(/\.$/, "").toUpperCase();
  const porExtenso = ABREVIACOES_DE_VIA[primeira];
  return porExtenso ? `${porExtenso} ${logradouro.slice(espaco + 1)}` : logradouro;
}

/**
 * O cadastro do Bubble tem o campo de representante legal preenchido a esmo:
 * "1", "0", "111", só o primeiro nome, ou o próprio nome da empresa repetido.
 * Escrever qualquer uma dessas coisas na procuração é pior do que não escrever
 * nada, então só passa o que tem cara de nome de pessoa.
 */
export function nomePlausivel(raw: string, nomeEmpresa = ""): boolean {
  const nome = raw.trim();
  if (nome.length < 6 || /\d/.test(nome)) return false;
  if (nome.split(/\s+/).length < 2) return false;

  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z ]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  // Empresas cujo "representante" é o próprio nome social não identificam pessoa.
  if (nomeEmpresa && norm(nome) === norm(nomeEmpresa)) return false;
  return !/\b(LTDA|ME|EIRELI|S\/?A|MEI)\b/i.test(nome);
}

export function formatCep(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 8) return raw;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export type Representante = {
  nome: string;
  /** Só dígitos. Vem do certificado; o cadastro do Bubble não tem CPF confiável. */
  cpf?: string;
};

/**
 * Fecha o parágrafo do mandante nomeando quem outorga em nome da empresa.
 *
 * Só entra o que dá para provar. Na procuração assinada, nome e CPF vêm do
 * próprio certificado A1 (OIDs 2.16.76.1.3.2 e 2.16.76.1.3.4 da ICP-Brasil),
 * isto é, do mesmo responsável legal que assina o documento. RG, nacionalidade
 * e endereço do representante ficaram de fora de propósito: o certificado quase
 * nunca traz o RG (3 de 55 na base) e o Bubble não guarda os outros dois —
 * inventar esses campos é defeito no instrumento, não detalhe cosmético.
 *
 * Sem representante identificado a cláusula some e o parágrafo termina no CEP.
 * É o caso dos certificados e-CPF, em que o mandante é a própria pessoa física
 * e não há representação a declarar.
 */
export function clausulaRepresentante(rep?: Representante | null): string {
  const nome = rep?.nome?.trim();
  if (!nome) return ".";
  const cpf = rep?.cpf ? `, inscrito(a) no CPF nº ${formatCpf(rep.cpf)}` : "";
  return `, neste ato representado por seu representante legal, o(a) senhor(a) ${nome}${cpf}.`;
}

export function dataPorExtenso(date = new Date()): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
