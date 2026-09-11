import { describe, expect, it, beforeAll } from "vitest";
import crypto from "node:crypto";
import forge from "node-forge";

import { montarCmsPades } from "./pades-signer.server";

const OID_CONTENT_TYPE = "1.2.840.113549.1.9.3";
const OID_MESSAGE_DIGEST = "1.2.840.113549.1.9.4";
const OID_SIGNING_TIME = "1.2.840.113549.1.9.5";
const OID_SIGNING_CERTIFICATE_V2 = "1.2.840.113549.1.9.16.2.47";

/** Gera um .pfx autoassinado só para exercitar a montagem do CMS. */
function gerarPfx(senha: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2030, 0, 1);
  const nome = [
    { name: "commonName", value: "LOCADORA DE TESTE LTDA:12345678000199" },
    { name: "countryName", value: "BR" },
    { name: "organizationName", value: "ICP-Brasil" },
  ];
  cert.setSubject(nome);
  cert.setIssuer(nome);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha, {
    algorithm: "3des",
  });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
}

type Attr = { value: [{ value: string }, { value: [forge.asn1.Asn1] }] };

/**
 * O @types/node-forge declara `messageFromAsn1` devolvendo a união de envelope
 * e signed data, e não expõe o `rawCapture`. Aqui já se sabe que é SignedData.
 */
type CmsLido = {
  certificates: forge.pki.Certificate[];
  rawCapture: { authenticatedAttributes: Attr[]; signature: string };
};

describe("montarCmsPades", () => {
  const SENHA = "senha-de-teste";
  const CONTEUDO = Buffer.from("conteudo do pdf que entra no ByteRange", "utf8");

  let pfx: Buffer;
  let cms: Buffer;
  let titular: string;
  let atributos: Attr[];
  let p7: CmsLido;

  beforeAll(async () => {
    pfx = gerarPfx(SENHA);
    const r = await montarCmsPades(pfx, SENHA, CONTEUDO, new Date("2026-09-10T18:00:00Z"));
    cms = r.cms;
    titular = r.titular;
    p7 = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(cms.toString("binary"))),
    ) as unknown as CmsLido;
    atributos = p7.rawCapture.authenticatedAttributes;
  });

  function oidsDosAtributos(): string[] {
    return atributos.map((a) => forge.asn1.derToOid(a.value[0].value));
  }

  it("devolve o titular lido do certificado", () => {
    expect(titular).toBe("LOCADORA DE TESTE LTDA:12345678000199");
  });

  it("produz um CMS que abre como SignedData", () => {
    expect(cms.length).toBeGreaterThan(0);
    expect(p7.certificates.length).toBe(1);
  });

  it("inclui signingCertificateV2 — o atributo cuja falta invalidava a assinatura", () => {
    // Regressão do bug real: o P12Signer do @signpdf emite só três atributos e
    // omite este, obrigatório no CAdES-BES. Sem ele o ITI reprova a assinatura
    // mesmo com o documento íntegro e a cadeia ICP-Brasil completa.
    expect(oidsDosAtributos()).toContain(OID_SIGNING_CERTIFICATE_V2);
  });

  it("mantém os três atributos que já existiam", () => {
    const oids = oidsDosAtributos();
    expect(oids).toContain(OID_CONTENT_TYPE);
    expect(oids).toContain(OID_MESSAGE_DIGEST);
    expect(oids).toContain(OID_SIGNING_TIME);
    expect(oids).toHaveLength(4);
  });

  it("ordena o SET OF de atributos como o DER exige", () => {
    const ders = atributos.map((a) =>
      Buffer.from(forge.asn1.toDer(a as unknown as forge.asn1.Asn1).getBytes(), "binary"),
    );
    const ordenados = [...ders].sort(Buffer.compare);
    expect(ders.map((d) => d.toString("hex"))).toEqual(ordenados.map((d) => d.toString("hex")));
  });

  it("o messageDigest cobre exatamente o conteúdo recebido", () => {
    const attr = atributos.find(
      (a) => forge.asn1.derToOid(a.value[0].value) === OID_MESSAGE_DIGEST,
    );
    const noAtributo = Buffer.from(
      (attr!.value[1].value[0] as unknown as { value: string }).value,
      "binary",
    );
    expect(noAtributo.equals(crypto.createHash("sha256").update(CONTEUDO).digest())).toBe(true);
  });

  it("o signingCertificateV2 aponta para o certificado que assinou", () => {
    const attr = atributos.find(
      (a) => forge.asn1.derToOid(a.value[0].value) === OID_SIGNING_CERTIFICATE_V2,
    );
    const essCertId = (
      attr!.value[1].value[0] as unknown as { value: [{ value: [{ value: [{ value: string }] }] }] }
    ).value[0].value[0];
    const certHash = Buffer.from(essCertId.value[0].value, "binary");

    const derCert = Buffer.from(
      forge.asn1.toDer(forge.pki.certificateToAsn1(p7.certificates[0])).getBytes(),
      "binary",
    );
    expect(certHash.equals(crypto.createHash("sha256").update(derCert).digest())).toBe(true);
  });

  it("a assinatura RSA fecha com a chave pública do certificado", () => {
    const set = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      atributos as unknown as forge.asn1.Asn1[],
    );
    const der = Buffer.from(forge.asn1.toDer(set).getBytes(), "binary");
    const assinatura = Buffer.from(p7.rawCapture.signature, "binary");
    const pem = forge.pki.publicKeyToPem(p7.certificates[0].publicKey);
    expect(crypto.createVerify("RSA-SHA256").update(der).verify(pem, assinatura)).toBe(true);
  });

  it("recusa senha errada com erro, em vez de gerar assinatura silenciosamente inválida", async () => {
    await expect(montarCmsPades(pfx, "senha-errada", CONTEUDO)).rejects.toThrow();
  });
});
