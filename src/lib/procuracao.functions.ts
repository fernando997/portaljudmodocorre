import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { nomePlausivel } from "./formatters";
import type { DadosProcuracao, Representante } from "./procuracao-pdf.server";

/**
 * Etapas do pipeline. Cada uma é registrada no log do servidor com o resultado,
 * e o nome da etapa entra na mensagem de erro — sem isso, uma falha vira um
 * "não funcionou" genérico e o diagnóstico só sai por tentativa e erro.
 */
type Etapa =
  | "buscar-locadora"
  | "validar-certificado"
  | "baixar-pfx"
  | "gerar-pdf"
  | "assinar"
  | "publicar";

function log(etapa: Etapa, dados: Record<string, unknown>) {
  console.log(`[PROCURACAO] ${etapa}`, JSON.stringify(dados));
}

/** Erro que carrega a etapa onde ocorreu, para o toast já dizer onde quebrou. */
class ErroProcuracao extends Error {
  constructor(
    readonly etapa: Etapa,
    mensagem: string,
    readonly causa?: unknown,
  ) {
    super(mensagem);
    this.name = "ErroProcuracao";
  }
}

function falhar(etapa: Etapa, mensagem: string, causa?: unknown): never {
  console.error(`[PROCURACAO] ${etapa} FALHOU: ${mensagem}`, causa ?? "");
  throw new ErroProcuracao(etapa, mensagem, causa);
}

function slug(nome: string): string {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return limpo || "locadora";
}

/**
 * Um .pfx (PKCS#12) é DER e sempre começa com um SEQUENCE ASN.1 (0x30). Já
 * aconteceu de subirem a imagem de assinatura no campo do certificado, e o erro
 * que vinha do node-forge não dizia nada de útil — aqui o problema é nomeado.
 */
function descreverArquivoInvalido(buf: Buffer): string | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf.subarray(1, 4).toString() === "PNG") {
    return "uma imagem PNG";
  }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "uma imagem JPEG";
  if (buf.subarray(0, 4).toString() === "%PDF") return "um PDF";
  if (buf.subarray(0, 5).toString() === "-----") {
    return "um certificado em formato PEM, não PKCS#12";
  }
  if (buf[0] !== 0x30) return "um arquivo que não é PKCS#12";
  return null;
}

/**
 * Extrai o nome do titular de dentro do .pfx, para o bloco de assinatura bater
 * com quem realmente assinou.
 *
 * O CN de um certificado ICP-Brasil vem no formato "NOME:CNPJ"; nos certificados
 * de MEI o CNPJ ainda aparece grudado na frente do nome ("63.064.846 FULANO").
 * Os dois estorvos são removidos aqui. Nomes longos podem vir truncados pela
 * própria AC — o limite de 64 caracteres do CN é da ICP-Brasil, não nosso.
 */
export function limparNomeCertificado(cn: string): string {
  const semCnpjFinal = cn.includes(":") ? cn.slice(0, cn.lastIndexOf(":")) : cn;
  return semCnpjFinal.replace(/^\d{2}\.\d{3}\.\d{3}\s+/, "").trim();
}

/**
 * OIDs de OtherName que a ICP-Brasil crava no subjectAltName (DOC-ICP-04).
 * Presença de RESPONSAVEL_NOME é o que distingue um e-CNPJ de um e-CPF.
 */
const OID_TITULAR_PF = "2.16.76.1.3.1";
const OID_RESPONSAVEL_NOME = "2.16.76.1.3.2";
const OID_RESPONSAVEL_PF = "2.16.76.1.3.4";

/**
 * Os campos de pessoa física vêm concatenados em posição fixa:
 * nascimento(8) + CPF(11) + PIS(11) + RG(15) + órgão emissor.
 */
function cpfDosDadosPF(dados: string): string | null {
  if (dados.length < 19) return null;
  const cpf = dados.slice(8, 19);
  return /^\d{11}$/.test(cpf) && cpf !== "00000000000" ? cpf : null;
}

/**
 * Varre a árvore ASN.1 do subjectAltName atrás dos OtherName da ICP-Brasil.
 * Cada entrada é um OID seguido do valor, então basta guardar o texto do
 * elemento imediatamente posterior a um OID conhecido.
 */
function extrairOtherNames(
  no: unknown,
  achados: Record<string, string>,
  derToOid: (der: string) => string,
): void {
  const asn1 = no as { type?: number; value?: unknown };
  if (!asn1 || typeof asn1 !== "object" || !Array.isArray(asn1.value)) return;

  const primeiroTexto = (n: unknown): string | null => {
    const el = n as { value?: unknown };
    if (!el || typeof el !== "object") return null;
    if (typeof el.value === "string") return el.value;
    if (Array.isArray(el.value)) {
      for (const filho of el.value) {
        const t = primeiroTexto(filho);
        if (t) return t;
      }
    }
    return null;
  };

  const filhos = asn1.value as unknown[];
  for (let i = 0; i < filhos.length; i++) {
    const el = filhos[i] as { type?: number; value?: unknown };
    if (el?.type === 6 && typeof el.value === "string") {
      let oid: string | null = null;
      try {
        oid = derToOid(el.value);
      } catch {
        oid = null;
      }
      if (oid && !achados[oid]) {
        const texto = primeiroTexto(filhos[i + 1]);
        if (texto) achados[oid] = texto;
      }
    }
    extrairOtherNames(el, achados, derToOid);
  }
}

export type DadosCertificado = {
  /** CN limpo — quem figura como titular do certificado. */
  nomeTitular: string | null;
  /** Responsável legal do e-CNPJ. Nulo em e-CPF, onde não há representação. */
  representante: { nome: string; cpf?: string } | null;
};

/**
 * Lê do .pfx o titular e o responsável legal. É a fonte autoritativa para o
 * parágrafo do mandante: o responsável nomeado na procuração passa a ser
 * exatamente quem a assina.
 *
 * O cadastro do Bubble não serve para isso — em 24 das 39 locadoras com e-CNPJ
 * o campo RL_nome diverge do responsável real do certificado.
 */
async function lerCertificado(pfx: Buffer, senha: string): Promise<DadosCertificado> {
  const vazio: DadosCertificado = { nomeTitular: null, representante: null };
  try {
    const forge = (await import("node-forge")).default;
    const p12 = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary"))),
      senha,
    );
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    // O titular é o único cujo CN carrega o CNPJ/CPF no padrão "NOME:documento".
    const titular = bags
      .map((b) => b.cert)
      .find((c) => String(c?.subject.getField("CN")?.value ?? "").includes(":"));
    if (!titular) return vazio;

    const cn = String(titular.subject.getField("CN")?.value ?? "");
    const nomeTitular = cn ? limparNomeCertificado(cn) || null : null;

    const san = titular.extensions.find(
      (e: { name?: string; id?: string }) => e.name === "subjectAltName" || e.id === "2.5.29.17",
    ) as { value?: string } | undefined;

    const achados: Record<string, string> = {};
    if (san?.value) {
      try {
        extrairOtherNames(forge.asn1.fromDer(forge.util.createBuffer(san.value)), achados, (der) =>
          forge.asn1.derToOid(der),
        );
      } catch (e) {
        console.error("[PROCURACAO] subjectAltName ilegivel", e);
      }
    }

    const nomeResp = achados[OID_RESPONSAVEL_NOME]?.trim();
    if (!nomeResp) {
      // e-CPF: o titular assina por si, não há representante a declarar.
      log("validar-certificado", {
        tipoCertificado: achados[OID_TITULAR_PF] ? "e-CPF" : "indefinido",
        representante: null,
      });
      return { nomeTitular, representante: null };
    }

    const cpf = cpfDosDadosPF(achados[OID_RESPONSAVEL_PF] ?? "") ?? undefined;
    log("validar-certificado", {
      tipoCertificado: "e-CNPJ",
      representante: nomeResp,
      cpfLido: !!cpf,
    });
    return { nomeTitular, representante: { nome: nomeResp, cpf } };
  } catch (e) {
    console.error("[PROCURACAO] nao foi possivel ler o certificado", e);
    return vazio;
  }
}

/**
 * @signpdf/signpdf é CommonJS e exporta `{ SignPdf, SignPdfError, Signer, default }`.
 * O `.default` só resolve para a instância pronta quando o runtime aplica
 * interopDefault — o vitest aplica, o SSR do Vite não. Instanciar a classe
 * nomeada funciona nos dois, então é por aí que carregamos o assinador.
 */
async function carregarAssinador(): Promise<{
  sign: (pdf: Buffer, signer: unknown) => Promise<Buffer>;
}> {
  const mod = (await import("@signpdf/signpdf")) as unknown as Record<string, unknown>;
  const SignPdfClass = (mod.SignPdf ??
    (mod.default as Record<string, unknown> | undefined)?.SignPdf) as
    | (new () => { sign: (pdf: Buffer, signer: unknown) => Promise<Buffer> })
    | undefined;

  if (typeof SignPdfClass !== "function") {
    falhar(
      "assinar",
      "Não foi possível carregar o assinador de PDF (@signpdf/signpdf).",
      `chaves disponíveis: ${Object.keys(mod).join(", ")}`,
    );
  }

  return new SignPdfClass();
}

/**
 * Sobe o PDF no Vercel Blob. Sem BLOB_READ_WRITE_TOKEN configurado, devolve um
 * data URI para o browser baixar direto — de propósito NÃO cai para um host
 * público anônimo (como o tmpfiles.org usado no upload de casos), já que aqui é
 * documento assinado juridicamente.
 */
async function publicarProcuracao(pdf: Buffer, nomeArquivo: string): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    log("publicar", {
      destino: "data-uri",
      motivo: "BLOB_READ_WRITE_TOKEN ausente",
      bytes: pdf.length,
    });
    return `data:application/pdf;base64,${pdf.toString("base64")}`;
  }

  try {
    const { put } = await import("@vercel/blob");
    const result = await put(`procuracoes/${nomeArquivo}`, pdf, {
      access: "public",
      addRandomSuffix: true,
      contentType: "application/pdf",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    log("publicar", { destino: "vercel-blob", bytes: pdf.length, url: result.url });
    return result.url;
  } catch (e) {
    console.error("[PROCURACAO] publicar FALHOU no Vercel Blob, caindo para data URI", e);
    return `data:application/pdf;base64,${pdf.toString("base64")}`;
  }
}

async function carregarLocadora(locadoraId: string) {
  const { getLocadoraComCertificado } = await import("./locadoras.functions");
  const registro = await getLocadoraComCertificado(locadoraId);
  if (!registro) falhar("buscar-locadora", "Locadora não encontrada.");

  log("buscar-locadora", {
    id: locadoraId,
    nome: registro.locadora.nomeSocial,
    temCertificado: !!registro.certificadoUrl && !!registro.certificadoSenha,
    vencimento: registro.locadora.certificadoVencimento,
  });
  return registro;
}

/**
 * Fallback para a procuração sem assinatura, onde não há certificado a ler.
 * O cadastro é fraco (metade das locadoras não tem representante utilizável),
 * então o que não passa no filtro simplesmente não é impresso.
 */
function representanteDoCadastro(locadora: {
  representanteNome: string;
  nomeSocial: string;
}): Representante | null {
  const nome = locadora.representanteNome.trim();
  if (!nome || !nomePlausivel(nome, locadora.nomeSocial)) return null;
  return { nome };
}

async function gerarPdf(locadora: DadosProcuracao): Promise<Buffer> {
  try {
    const { gerarProcuracaoPdf } = await import("./procuracao-pdf.server");
    const pdf = Buffer.from(await gerarProcuracaoPdf(locadora));
    log("gerar-pdf", {
      bytes: pdf.length,
      comImagemAssinatura: !!locadora.assinaturaUrl,
      representante: locadora.representante?.nome ?? null,
    });
    return pdf;
  } catch (e) {
    falhar("gerar-pdf", "Falha ao gerar o PDF da procuração.", e);
  }
}

/**
 * Gera a procuração em PDF e assina com o certificado digital A1 (.pfx) da
 * própria locadora. Tudo acontece no servidor: o .pfx e a senha nunca chegam
 * ao browser.
 */
export const gerarProcuracaoAssinada = createServerFn({ method: "POST" })
  .inputValidator((d: { locadoraId: string }) => ({
    locadoraId: z.string().min(1).parse(d.locadoraId),
  }))
  .handler(async ({ data }): Promise<{ url: string; nomeArquivo: string }> => {
    const { getAppSession } = await import("./session.server");
    const session = await getAppSession();
    if (!session.data.userId) throw new Error("Não autenticado");

    const { locadora, email, certificadoUrl, certificadoSenha } = await carregarLocadora(
      data.locadoraId,
    );

    if (!certificadoUrl || !certificadoSenha) {
      falhar("validar-certificado", "Esta locadora não possui certificado digital cadastrado.");
    }
    if (locadora.certificadoVencimento && locadora.certificadoVencimento < Date.now()) {
      const dataBr = new Date(locadora.certificadoVencimento).toLocaleDateString("pt-BR");
      falhar(
        "validar-certificado",
        `Certificado digital vencido em ${dataBr}. Renove antes de assinar.`,
      );
    }

    let pfxBuffer: Buffer;
    try {
      const url = certificadoUrl.startsWith("//") ? `https:${certificadoUrl}` : certificadoUrl;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      pfxBuffer = Buffer.from(await res.arrayBuffer());
      log("baixar-pfx", { bytes: pfxBuffer.length, tipo: res.headers.get("content-type") });
    } catch (e) {
      falhar("baixar-pfx", "Falha ao baixar o certificado digital.", e);
    }

    const arquivoInvalido = descreverArquivoInvalido(pfxBuffer);
    if (arquivoInvalido) {
      falhar(
        "validar-certificado",
        `O campo de certificado desta locadora contém ${arquivoInvalido}, não um arquivo .pfx. Corrija o cadastro no Bubble.`,
      );
    }

    const { nomeTitular, representante } = await lerCertificado(pfxBuffer, certificadoSenha);
    if (nomeTitular && nomeTitular !== locadora.nomeSocial) {
      log("validar-certificado", {
        aviso: "nome do certificado difere do cadastro",
        cadastro: locadora.nomeSocial,
        certificado: nomeTitular,
      });
    }

    const pdfBytes = await gerarPdf({
      ...locadora,
      nomeAssinatura: nomeTitular ?? undefined,
      representante,
    });

    let assinado: Buffer;
    try {
      const { PDFDocument } = await import("pdf-lib");
      const { pdflibAddPlaceholder } = await import("@signpdf/placeholder-pdf-lib");
      const { criarSignerPades } = await import("./pades-signer.server");
      const assinador = await carregarAssinador();

      const pdfDoc = await PDFDocument.load(pdfBytes);
      pdflibAddPlaceholder({
        pdfDoc,
        reason: "Assinatura digital da procuração",
        name: locadora.nomeSocial,
        location: "Itapetininga/SP",
        contactInfo: email,
        // Certificados com cadeia maior geram CMS bem acima de 8 KB; o excedente
        // vira só padding no PDF, então reservar com folga não custa quase nada.
        signatureLength: 32768,
      });

      // useObjectStreams: false é exigência do signpdf para localizar o ByteRange.
      const comPlaceholder = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
      const signer = await criarSignerPades(pfxBuffer, certificadoSenha);
      assinado = await assinador.sign(comPlaceholder, signer);
      log("assinar", {
        bytesAntes: comPlaceholder.length,
        bytesDepois: assinado.length,
        assinadoPor: signer.titular,
        perfil: "PAdES-B com signingCertificateV2",
      });
    } catch (e) {
      if (e instanceof ErroProcuracao) throw e;
      const msg = e instanceof Error ? e.message : String(e);

      if (msg.includes("exceeds placeholder length")) {
        falhar(
          "assinar",
          "A assinatura deste certificado é maior que o espaço reservado no PDF. Avise o suporte.",
          e,
        );
      }
      // node-forge sinaliza senha errada pela verificação do MAC do PKCS#12.
      if (/MAC could not be verified|Invalid password/i.test(msg)) {
        falhar("assinar", "Senha do certificado digital incorreta.", e);
      }
      if (/ASN\.1|DER|Unparsed/i.test(msg)) {
        falhar(
          "assinar",
          "O arquivo do certificado (.pfx) está corrompido ou em formato inválido.",
          e,
        );
      }
      // Sem correspondência conhecida, repassa a causa real em vez de mascarar.
      falhar("assinar", `Falha ao assinar: ${msg}`, e);
    }

    const nomeArquivo = `procuracao-${slug(locadora.nomeSocial)}.pdf`;
    const url = await publicarProcuracao(assinado, nomeArquivo);

    return { url, nomeArquivo };
  });

/**
 * Gera a procuração em PDF sem assinatura digital, para conferência ou para
 * assinar por outro meio. Ao contrário da versão assinada, funciona para
 * qualquer locadora — inclusive as sem certificado ou com certificado vencido.
 */
export const gerarProcuracaoSemAssinatura = createServerFn({ method: "POST" })
  .inputValidator((d: { locadoraId: string }) => ({
    locadoraId: z.string().min(1).parse(d.locadoraId),
  }))
  .handler(async ({ data }): Promise<{ url: string; nomeArquivo: string }> => {
    const { getAppSession } = await import("./session.server");
    const session = await getAppSession();
    if (!session.data.userId) throw new Error("Não autenticado");

    const { locadora } = await carregarLocadora(data.locadoraId);
    const pdf = await gerarPdf({ ...locadora, representante: representanteDoCadastro(locadora) });

    const nomeArquivo = `procuracao-${slug(locadora.nomeSocial)}-sem-assinatura.pdf`;
    const url = await publicarProcuracao(pdf, nomeArquivo);

    return { url, nomeArquivo };
  });
