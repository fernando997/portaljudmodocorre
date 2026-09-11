/**
 * Assinador PAdES para as procurações.
 *
 * Substitui o `P12Signer` do @signpdf, que emite só três atributos assinados:
 * contentType, signingTime e messageDigest. Falta ali o `signingCertificateV2`
 * (RFC 5035), obrigatório no CAdES-BES e herdado pelo PAdES. Sem esse atributo
 * o resultado é um PKCS#7 cru, e o validador do ITI reprova a assinatura mesmo
 * com o documento íntegro, a chave correta e a cadeia ICP-Brasil completa —
 * foi exatamente o que aconteceu com a procuração da SANTO ANTONIO.
 *
 * O node-forge não serializa atributo fora dos três que conhece: o
 * `_attributeToAsn1` dele deixa o valor `undefined` para qualquer outro tipo.
 * Por isso o CMS é montado aqui à mão.
 *
 * As convenções de codificação seguem as do próprio forge — AlgorithmIdentifier
 * sempre com parâmetro NULL, signatário identificado por IssuerAndSerialNumber
 * — para que a única diferença em relação à assinatura que já funcionava seja o
 * atributo acrescentado.
 */

type Forge = typeof import("node-forge");
type Asn1 = import("node-forge").asn1.Asn1;
type Certificate = import("node-forge").pki.Certificate;

const OID_SIGNED_DATA = "1.2.840.113549.1.7.2";
const OID_DATA = "1.2.840.113549.1.7.1";
const OID_CONTENT_TYPE = "1.2.840.113549.1.9.3";
const OID_MESSAGE_DIGEST = "1.2.840.113549.1.9.4";
const OID_SIGNING_TIME = "1.2.840.113549.1.9.5";
const OID_SIGNING_CERTIFICATE_V2 = "1.2.840.113549.1.9.16.2.47";
const OID_SHA256 = "2.16.840.1.101.3.4.2.1";
const OID_RSA_ENCRYPTION = "1.2.840.113549.1.1.1";

/** AlgorithmIdentifier com parâmetro NULL explícito, como o forge emite. */
function algoritmo(forge: Forge, oid: string): Asn1 {
  const { asn1 } = forge;
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ""),
  ]);
}

/** Attribute ::= SEQUENCE { attrType OID, attrValues SET OF ANY } */
function atributo(forge: Forge, oid: string, valor: Asn1): Asn1 {
  const { asn1 } = forge;
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [valor]),
  ]);
}

function derDe(forge: Forge, no: Asn1): Buffer {
  return Buffer.from(forge.asn1.toDer(no).getBytes(), "binary");
}

/**
 * SigningCertificateV2 ::= SEQUENCE { certs SEQUENCE OF ESSCertIDv2 }
 * ESSCertIDv2 ::= SEQUENCE {
 *   hashAlgorithm AlgorithmIdentifier DEFAULT sha256,
 *   certHash OCTET STRING,
 *   issuerSerial IssuerSerial OPTIONAL }
 *
 * O hashAlgorithm é omitido de propósito: o DEFAULT da estrutura já é SHA-256 e
 * o DER exige que valores iguais ao DEFAULT não sejam codificados.
 *
 * O certHash cobre o DER do certificado do signatário. O forge guarda o
 * `tbsCertificate` original ao fazer o parse e o reaproveita na hora de
 * re-serializar, então o certificado embutido no CMS é byte a byte o mesmo que
 * está sendo resumido aqui.
 */
function signingCertificateV2(forge: Forge, cert: Certificate): Asn1 {
  const { asn1, pki, md } = forge;

  const certDer = asn1.toDer(pki.certificateToAsn1(cert)).getBytes();
  const hash = md.sha256.create().update(certDer).digest().getBytes();

  // GeneralNames ::= SEQUENCE OF GeneralName; directoryName é [4] EXPLICIT,
  // porque Name é um CHOICE e precisa da marcação explícita.
  const generalNames = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 4, true, [
      pki.distinguishedNameToAsn1({ attributes: cert.issuer.attributes }),
    ]),
  ]);

  const issuerSerial = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    generalNames,
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.INTEGER,
      false,
      forge.util.hexToBytes(cert.serialNumber),
    ),
  ]);

  const essCertIdV2 = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, hash),
    issuerSerial,
  ]);

  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [essCertIdV2]),
  ]);
}

/**
 * Num SET OF de DER os elementos vão ordenados pela própria codificação. O
 * forge não ordena; validadores mais rígidos reclamam quando não está ordenado.
 */
function ordenarParaSet(forge: Forge, elementos: Asn1[]): Asn1[] {
  return elementos
    .map((el) => ({ el, der: derDe(forge, el) }))
    .sort((a, b) => Buffer.compare(a.der, b.der))
    .map((x) => x.el);
}

export type ResultadoAssinatura = {
  cms: Buffer;
  /** Nome do titular (CN) do certificado que assinou, para conferência no log. */
  titular: string;
};

/**
 * Monta o CMS destacado sobre os bytes cobertos pelo ByteRange.
 *
 * Fica separado da classe de propósito: assim dá para exercitar a montagem em
 * teste sem depender do @signpdf nem de um PDF completo.
 */
export async function montarCmsPades(
  p12Buffer: Buffer,
  senha: string,
  pdfBuffer: Buffer,
  signingTime?: Date,
): Promise<ResultadoAssinatura> {
  const forge = (await import("node-forge")).default as unknown as Forge;
  const { asn1, pki, md, util, pkcs12 } = forge;

  const p12 = pkcs12.pkcs12FromAsn1(
    asn1.fromDer(util.createBuffer(p12Buffer.toString("binary"))),
    false,
    senha,
  );

  const certBags = p12.getBags({ bagType: pki.oids.certBag })[pki.oids.certBag] ?? [];
  const keyBags =
    p12.getBags({ bagType: pki.oids.pkcs8ShroudedKeyBag })[pki.oids.pkcs8ShroudedKeyBag] ?? [];

  const privateKey = keyBags[0]?.key;
  if (!privateKey) throw new Error("O certificado não contém chave privada utilizável.");

  // O certificado do signatário é o que casa com a chave privada; os demais
  // são a cadeia e vão junto no CMS para o validador conseguir subir até a raiz.
  const certificados: Certificate[] = [];
  let signatario: Certificate | undefined;
  for (const bag of certBags) {
    const cert = bag.cert;
    if (!cert) continue;
    certificados.push(cert);
    const pub = cert.publicKey as { n?: { compareTo(o: unknown): number }; e?: unknown };
    const priv = privateKey as unknown as { n: { compareTo(o: unknown): number }; e: unknown };
    if (pub?.n && priv.n.compareTo(pub.n) === 0) signatario = cert;
  }
  if (!signatario) {
    throw new Error("Nenhum certificado do arquivo corresponde à chave privada.");
  }
  const titular = String(signatario.subject.getField("CN")?.value ?? "");

  // --- atributos assinados ---
  const digestConteudo = md.sha256.create().update(pdfBuffer.toString("binary")).digest();

  const atributos = ordenarParaSet(forge, [
    atributo(
      forge,
      OID_CONTENT_TYPE,
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(OID_DATA).getBytes()),
    ),
    atributo(
      forge,
      OID_SIGNING_TIME,
      asn1.create(
        asn1.Class.UNIVERSAL,
        asn1.Type.UTCTIME,
        false,
        asn1.dateToUtcTime(signingTime ?? new Date()),
      ),
    ),
    atributo(
      forge,
      OID_MESSAGE_DIGEST,
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digestConteudo.getBytes()),
    ),
    atributo(forge, OID_SIGNING_CERTIFICATE_V2, signingCertificateV2(forge, signatario)),
  ]);

  // A assinatura cobre os atributos codificados como SET OF (tag 0x31); dentro
  // do SignerInfo eles reaparecem como [0] IMPLICIT (tag 0xA0). São as duas
  // codificações do mesmo conteúdo, e trocá-las invalida a assinatura.
  const paraAssinar = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, atributos);
  const digestAtributos = md.sha256.create().update(asn1.toDer(paraAssinar).getBytes());
  const assinatura = privateKey.sign(digestAtributos);

  const atributosImplicitos = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, atributos);

  // --- SignerInfo ---
  const signerInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(1).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      pki.distinguishedNameToAsn1({ attributes: signatario.issuer.attributes }),
      asn1.create(
        asn1.Class.UNIVERSAL,
        asn1.Type.INTEGER,
        false,
        util.hexToBytes(signatario.serialNumber),
      ),
    ]),
    algoritmo(forge, OID_SHA256),
    atributosImplicitos,
    algoritmo(forge, OID_RSA_ENCRYPTION),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, assinatura),
  ]);

  // --- SignedData ---
  const signedData = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(1).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [algoritmo(forge, OID_SHA256)]),
    // encapContentInfo sem eContent: assinatura destacada, o conteúdo é o PDF.
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(OID_DATA).getBytes()),
    ]),
    asn1.create(
      asn1.Class.CONTEXT_SPECIFIC,
      0,
      true,
      certificados.map((c) => pki.certificateToAsn1(c)),
    ),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [signerInfo]),
  ]);

  const contentInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OID,
      false,
      asn1.oidToDer(OID_SIGNED_DATA).getBytes(),
    ),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData]),
  ]);

  return { cms: derDe(forge, contentInfo), titular };
}

/**
 * Instância compatível com o @signpdf.
 *
 * O `signpdf.sign` recusa qualquer coisa que não passe num `instanceof Signer`,
 * então a classe precisa herdar da mesma cópia do módulo que ele carregou —
 * daí a fábrica assíncrona, já que não dá para fazer `extends` de um import
 * dinâmico na declaração da classe. É o mesmo cuidado de interop que o
 * `carregarAssinador` toma com o @signpdf/signpdf: sob o SSR do Vite a export
 * nomeada e a `default` nem sempre apontam para o mesmo objeto.
 */
export async function criarSignerPades(p12Buffer: Buffer, senha: string) {
  const mod = (await import("@signpdf/utils")) as unknown as Record<string, unknown>;
  const Base = (mod.Signer ?? (mod.default as Record<string, unknown> | undefined)?.Signer) as
    | (new () => object)
    | undefined;
  if (typeof Base !== "function") {
    throw new Error(
      `Não foi possível carregar a base Signer (@signpdf/utils). Chaves: ${Object.keys(mod).join(", ")}`,
    );
  }

  class PadesP12Signer extends Base {
    /** Preenchido após `sign`, para o chamador registrar quem de fato assinou. */
    titular = "";

    async sign(pdfBuffer: Buffer, signingTime?: Date): Promise<Buffer> {
      const { cms, titular } = await montarCmsPades(p12Buffer, senha, pdfBuffer, signingTime);
      this.titular = titular;
      return cms;
    }
  }

  return new PadesP12Signer();
}
