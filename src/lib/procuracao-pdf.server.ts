import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

import topoDataUri from "@/assets/Topo.png?inline";
import rodapeDataUri from "@/assets/Rodape.png?inline";
import marcadaguaDataUri from "@/assets/marcadagua.png?inline";
import {
  clausulaRepresentante,
  dataPorExtenso,
  formatCep,
  qualificacaoMandante,
  type Representante,
} from "./formatters";

export type { Representante };

export type DadosProcuracao = {
  nomeSocial: string;
  cnpj: string;
  logradouro: string;
  numero: string;
  bairro: string;
  complemento: string;
  cidade: string;
  estado: string;
  cep: string;
  assinaturaUrl: string;
  /**
   * Nome impresso sob a linha de assinatura. Quando o documento é assinado
   * digitalmente, recebe o titular lido do próprio certificado, para bater com
   * quem de fato assinou. Sem isso, cai no nomeSocial do cadastro.
   */
  nomeAssinatura?: string;
  /**
   * Representante legal que outorga em nome da pessoa jurídica. Quando ausente,
   * a cláusula inteira é omitida — ver `clausulaRepresentante`.
   */
  representante?: Representante | null;
};

// A4 em pontos
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const TEXT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

// Alturas derivadas da proporção nativa de cada imagem (912x149 e 1072x151)
const TOPO_HEIGHT = PAGE_WIDTH * (149 / 912);
const RODAPE_HEIGHT = PAGE_WIDTH * (151 / 1072);

const FONT_SIZE = 10;
const LINE_HEIGHT = 14;
const PARAGRAPH_GAP = 10;

// Caixa da imagem de assinatura, em pontos. A linha embaixo tem 240pt, então a
// assinatura fica um pouco mais estreita que ela. As 56 do cadastro são todas
// 800x200 (4:1) e renderizam em 220x55.
const ASSINATURA_MAX_W = 220;
const ASSINATURA_MAX_H = 70;

/**
 * Encaixa a imagem na caixa sem distorcer, escalando pelo eixo mais apertado.
 *
 * A versão anterior fixava a largura e recortava a altura por `Math.min`, o que
 * esticaria qualquer assinatura fora da proporção 4:1 do cadastro atual.
 */
export function enquadrar(
  largura: number,
  altura: number,
  maxLargura: number,
  maxAltura: number,
): { largura: number; altura: number } {
  if (largura <= 0 || altura <= 0) return { largura: 0, altura: 0 };
  const escala = Math.min(maxLargura / largura, maxAltura / altura);
  return { largura: largura * escala, altura: altura * escala };
}

type Run = { text: string; bold?: boolean; italic?: boolean };
type Word = { text: string; bold: boolean; italic: boolean; width: number };

type Fontes = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
};

/**
 * Helvetica usa WinAnsiEncoding (CP1252), que cobre os acentos do português.
 * Normaliza o punhado de caracteres tipográficos que costumam vir de texto
 * copiado e remove qualquer coisa fora do Latin-1 — `drawText` lança erro
 * quando encontra um caractere que a fonte não sabe codificar.
 */
export function sanitize(texto: string): string {
  return texto
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\xFF\n]/g, "");
}

function dataUriToBytes(dataUri: string): Uint8Array {
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

function pickFont(word: { bold: boolean; italic: boolean }, fontes: Fontes): PDFFont {
  if (word.bold) return fontes.bold;
  if (word.italic) return fontes.italic;
  return fontes.regular;
}

/**
 * Quebra os runs em palavras já medidas. Assume que os runs se separam em
 * fronteira de palavra (o texto da procuração respeita isso) — um run que
 * termina no meio de uma palavra ganharia um espaço indevido.
 */
function runsToWords(runs: Run[], fontes: Fontes, size: number): Word[] {
  const words: Word[] = [];
  for (const run of runs) {
    for (const parte of sanitize(run.text).split(/\s+/).filter(Boolean)) {
      const bold = !!run.bold;
      const italic = !!run.italic;
      const font = pickFont({ bold, italic }, fontes);
      words.push({ text: parte, bold, italic, width: font.widthOfTextAtSize(parte, size) });
    }
  }
  return words;
}

function quebrarEmLinhas(words: Word[], maxWidth: number, spaceWidth: number): Word[][] {
  const linhas: Word[][] = [];
  let atual: Word[] = [];
  let largura = 0;

  for (const w of words) {
    const acrescimo = atual.length === 0 ? w.width : spaceWidth + w.width;
    if (atual.length > 0 && largura + acrescimo > maxWidth) {
      linhas.push(atual);
      atual = [w];
      largura = w.width;
    } else {
      atual.push(w);
      largura += acrescimo;
    }
  }
  if (atual.length > 0) linhas.push(atual);
  return linhas;
}

type Contexto = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  fontes: Fontes;
  imagens: { topo: PDFImage; rodape: PDFImage; marcadagua: PDFImage };
};

function desenharMoldura(page: PDFPage, imagens: Contexto["imagens"]) {
  const { topo, rodape, marcadagua } = imagens;

  // Marca d'água primeiro, para o texto ficar por cima.
  const wmWidth = PAGE_WIDTH * 0.65;
  const wmHeight = wmWidth * (marcadagua.height / marcadagua.width);
  page.drawImage(marcadagua, {
    x: (PAGE_WIDTH - wmWidth) / 2,
    y: (PAGE_HEIGHT - wmHeight) / 2,
    width: wmWidth,
    height: wmHeight,
    opacity: 0.15,
  });

  page.drawImage(topo, {
    x: 0,
    y: PAGE_HEIGHT - TOPO_HEIGHT,
    width: PAGE_WIDTH,
    height: TOPO_HEIGHT,
  });

  page.drawImage(rodape, {
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: RODAPE_HEIGHT,
  });
}

function novaPagina(ctx: Contexto) {
  ctx.page = ctx.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  desenharMoldura(ctx.page, ctx.imagens);
  ctx.y = PAGE_HEIGHT - TOPO_HEIGHT - 28;
}

function garantirEspaco(ctx: Contexto, altura: number) {
  const limiteInferior = RODAPE_HEIGHT + 24;
  if (ctx.y - altura < limiteInferior) novaPagina(ctx);
}

function escreverParagrafo(ctx: Contexto, runs: Run[], opcoes: { justificado?: boolean } = {}) {
  const spaceWidth = ctx.fontes.regular.widthOfTextAtSize(" ", FONT_SIZE);
  const words = runsToWords(runs, ctx.fontes, FONT_SIZE);
  const linhas = quebrarEmLinhas(words, TEXT_WIDTH, spaceWidth);

  linhas.forEach((linha, i) => {
    garantirEspaco(ctx, LINE_HEIGHT);

    const ultima = i === linhas.length - 1;
    const larguraNatural = linha.reduce((s, w) => s + w.width, 0) + spaceWidth * (linha.length - 1);
    const extra =
      opcoes.justificado && !ultima && linha.length > 1
        ? (TEXT_WIDTH - larguraNatural) / (linha.length - 1)
        : 0;

    let x = MARGIN_X;
    for (const w of linha) {
      ctx.page.drawText(w.text, {
        x,
        y: ctx.y,
        size: FONT_SIZE,
        font: pickFont(w, ctx.fontes),
        color: rgb(0, 0, 0),
      });
      x += w.width + spaceWidth + extra;
    }
    ctx.y -= LINE_HEIGHT;
  });

  ctx.y -= PARAGRAPH_GAP;
}

function escreverCentralizado(ctx: Contexto, texto: string, size: number, font: PDFFont) {
  const limpo = sanitize(texto);
  const largura = font.widthOfTextAtSize(limpo, size);
  garantirEspaco(ctx, size + 6);
  ctx.page.drawText(limpo, {
    x: (PAGE_WIDTH - largura) / 2,
    y: ctx.y,
    size,
    font,
    color: rgb(0, 0, 0),
  });
  ctx.y -= size + 6;
}

async function baixarAssinatura(pdf: PDFDocument, url: string): Promise<PDFImage | null> {
  if (!url) return null;
  const absoluta = url.startsWith("//") ? `https:${url}` : url;
  try {
    const res = await fetch(absoluta);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Detecta o formato pelos bytes mágicos: PNG começa com 0x89 'P' 'N' 'G'.
    const ehPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    return ehPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

const TEXTO_MANDATARIO =
  "NATHÁLIA GOMES DOS SANTOS, inscrita na OAB/SP sob o nº 552.306, com escritório na Rua Doutor Virgílio de Rezende, nº 1.320, Centro, Itapetininga-SP.";

const TEXTO_PODERES =
  "Por este instrumento de procuração ad judicia et extra o mandante, nomeia e constitui seus procuradores ou mandatários a quem confere amplos e gerais poderes para o foro em geral, com a cláusula ad-judicia et extra, em qualquer Juízo, Instância ou Tribunal, podendo propor contra quem de direito as ações competentes e defendê-lo nas contrárias, seguindo uma e outras, até final decisão, usando os recursos legais e acompanhando-os, conferindo-lhes, mais poderes especiais para reconhecer a procedência do pedido, desistir, transigir, renunciar ao direito, firmar compromissos ou acordos, receber e dar quitação, receber precatório, dando tudo por bom, firme e valioso.";

export async function gerarProcuracaoPdf(dados: DadosProcuracao): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  const fontes: Fontes = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };

  const imagens = {
    topo: await pdf.embedPng(dataUriToBytes(topoDataUri)),
    rodape: await pdf.embedPng(dataUriToBytes(rodapeDataUri)),
    marcadagua: await pdf.embedPng(dataUriToBytes(marcadaguaDataUri)),
  };

  const ctx: Contexto = {
    pdf,
    page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: 0,
    fontes,
    imagens,
  };
  desenharMoldura(ctx.page, imagens);
  ctx.y = PAGE_HEIGHT - TOPO_HEIGHT - 40;

  escreverCentralizado(ctx, "Procuração", 14, fontes.bold);
  escreverCentralizado(ctx, '"Ad Judicia et Extra"', 11, fontes.italic);
  ctx.y -= 14;

  const endereco = [
    `Rua ${dados.logradouro || "—"}`,
    dados.numero || "—",
    dados.bairro || "—",
    ...(dados.complemento ? [dados.complemento] : []),
    `${dados.cidade || "—"}/${dados.estado || "—"}`,
  ].join(", ");

  escreverParagrafo(
    ctx,
    [
      { text: "Mandante:", bold: true },
      { text: dados.nomeSocial || "—", bold: true },
      {
        text: `, ${qualificacaoMandante(dados.cnpj)}, com estabelecimento ${endereco}, CEP nº ${
          dados.cep ? formatCep(dados.cep) : "—"
        }${clausulaRepresentante(dados.representante)}`,
      },
    ],
    { justificado: true },
  );

  escreverParagrafo(ctx, [{ text: "Mandatário:", bold: true }, { text: TEXTO_MANDATARIO }], {
    justificado: true,
  });

  escreverParagrafo(ctx, [{ text: "Poderes:", bold: true }, { text: TEXTO_PODERES }], {
    justificado: true,
  });

  ctx.y -= 10;
  escreverCentralizado(ctx, `Itapetininga/SP, ${dataPorExtenso()}.`, FONT_SIZE, fontes.regular);

  // Bloco de assinatura: imagem (quando houver) apoiada sobre a linha, nome embaixo.
  const assinatura = await baixarAssinatura(pdf, dados.assinaturaUrl);
  const img = assinatura
    ? enquadrar(assinatura.width, assinatura.height, ASSINATURA_MAX_W, ASSINATURA_MAX_H)
    : null;

  const alturaBloco = (img?.altura ?? 0) + 34;
  garantirEspaco(ctx, alturaBloco + 30);
  ctx.y -= 30;

  const larguraLinha = 240;
  const xLinha = (PAGE_WIDTH - larguraLinha) / 2;

  if (assinatura && img) {
    // `drawImage` posiciona pela base, então o cursor desce a altura da imagem
    // antes de desenhar — assim ela ocupa o espaço logo acima da linha. Descer
    // depois de desenhar deixaria a linha uma altura de imagem mais abaixo, que
    // era a origem do vão entre a assinatura e a linha.
    ctx.y -= img.altura;
    ctx.page.drawImage(assinatura, {
      x: (PAGE_WIDTH - img.largura) / 2,
      y: ctx.y,
      width: img.largura,
      height: img.altura,
    });
    ctx.y -= 4;
  }

  ctx.page.drawLine({
    start: { x: xLinha, y: ctx.y },
    end: { x: xLinha + larguraLinha, y: ctx.y },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });
  ctx.y -= 14;
  escreverCentralizado(
    ctx,
    dados.nomeAssinatura || dados.nomeSocial || "—",
    FONT_SIZE,
    fontes.bold,
  );

  return await pdf.save({ useObjectStreams: false });
}
