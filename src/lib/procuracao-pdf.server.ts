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
import icpBrasilDataUri from "@/assets/icp-brasil.png?inline";
import {
  clausulaRepresentante,
  dataPorExtenso,
  formatCep,
  montarEndereco,
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
  /**
   * Momento exato da assinatura criptográfica. Presente **só** quando o PDF vai
   * ser de fato assinado com o certificado A1 logo em seguida — é o que troca a
   * linha de assinatura pelo selo ICP-Brasil.
   *
   * Precisa ser o mesmo instante gravado no atributo `signingTime` do CMS: o
   * selo afirma por escrito quando o documento foi assinado, e divergir do
   * carimbo criptográfico é o tipo de detalhe que um validador atento pega.
   */
  assinadoEm?: Date;
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

/**
 * Encaixa a imagem numa caixa sem distorcer, escalando pelo eixo mais apertado.
 * A logomarca da ICP-Brasil é alta (2834x3432), então é a altura que manda nela.
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

export type Run = { text: string; bold?: boolean; italic?: boolean };
export type Word = { text: string; bold: boolean; italic: boolean; width: number };

export type Fontes = {
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
export function runsToWords(runs: Run[], fontes: Fontes, size: number): Word[] {
  const words: Word[] = [];
  for (const run of runs) {
    const texto = sanitize(run.text);
    const partes = texto.split(/\s+/).filter(Boolean);

    // Um run que começa em pontuação continua a última palavra do run anterior.
    // Os parágrafos põem o nome em negrito num run e a vírgula que o segue no
    // run seguinte; sem isso saía "MARANATA MULTIMARCAS , pessoa jurídica".
    const colaNaAnterior = words.length > 0 && /^[,.;:!?)\]}…»”']/.test(texto);

    partes.forEach((parte, i) => {
      if (i === 0 && colaNaAnterior) {
        const anterior = words[words.length - 1];
        anterior.text += parte;
        anterior.width = pickFont(anterior, fontes).widthOfTextAtSize(anterior.text, size);
        return;
      }
      const bold = !!run.bold;
      const italic = !!run.italic;
      const font = pickFont({ bold, italic }, fontes);
      words.push({ text: parte, bold, italic, width: font.widthOfTextAtSize(parte, size) });
    });
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

/** Linha em branco para assinatura de próprio punho, na versão não assinada. */
function desenharLinhaDeAssinatura(ctx: Contexto, dados: DadosProcuracao) {
  garantirEspaco(ctx, 64);
  ctx.y -= 30;

  const larguraLinha = 240;
  const xLinha = (PAGE_WIDTH - larguraLinha) / 2;
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
    ctx.fontes.bold,
  );
}

const SELO_CINZA = rgb(0.45, 0.45, 0.45);
const SELO_FONT_SIZE = 7;
const SELO_LINE_HEIGHT = 9;
const SELO_LOGO_W = 36;

/**
 * Largura total do selo (logomarca + aviso). Bem menor que a área de texto do
 * documento: esticado de margem a margem o aviso competia visualmente com as
 * cláusulas, que são o conteúdo de fato. Encurtar joga o texto para mais linhas
 * e mantém o bloco compacto, como num carimbo.
 */
const SELO_MAX_W = 380;

function dataHoraDoSelo(quando: Date): string {
  const d = quando.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const h = quando.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false });
  return `${d} - ${h}`;
}

/**
 * Selo de assinatura digital, no padrão que os documentos assinados via
 * ICP-Brasil trazem: logomarca à esquerda e, à direita, o aviso de verificação
 * com quem assinou e quando.
 *
 * Só é desenhado quando o PDF vai mesmo ser assinado em seguida — ver
 * `DadosProcuracao.assinadoEm`. Escrever "assinado digitalmente" num documento
 * sem assinatura seria declaração falsa, não detalhe de layout.
 */
async function desenharSeloIcpBrasil(
  ctx: Contexto,
  dados: DadosProcuracao,
  assinadoEm: Date,
  endereco: string,
) {
  const { fontes } = ctx;
  const logo = await ctx.pdf.embedPng(dataUriToBytes(icpBrasilDataUri));
  const dim = enquadrar(logo.width, logo.height, SELO_LOGO_W, SELO_LOGO_W * 1.4);

  const quem = dados.nomeAssinatura || dados.nomeSocial || "—";
  const aviso =
    `Importante: Verifique a autenticidade e integridade do documento em: validar.iti.gov.br ` +
    `Assinado digitalmente conforme ICP-Brasil (MP 2.200-2/2001) por ${quem} em ${dataHoraDoSelo(assinadoEm)}`;

  // Bloco centralizado na página: logomarca à esquerda, aviso na coluna ao lado.
  const xSelo = (PAGE_WIDTH - SELO_MAX_W) / 2;
  const xTexto = xSelo + dim.largura + 10;
  const larguraTexto = xSelo + SELO_MAX_W - xTexto;
  const palavras = runsToWords([{ text: aviso }], fontes, SELO_FONT_SIZE);
  const espaco = fontes.regular.widthOfTextAtSize(" ", SELO_FONT_SIZE);
  const linhas = quebrarEmLinhas(palavras, larguraTexto, espaco);

  const alturaTexto = linhas.length * SELO_LINE_HEIGHT;
  const alturaCabecalho = Math.max(alturaTexto, dim.altura);
  garantirEspaco(ctx, alturaCabecalho + 46);
  ctx.y -= 26;

  const topo = ctx.y;
  // Centraliza a logomarca verticalmente em relação ao bloco de texto.
  ctx.page.drawImage(logo, {
    x: xSelo,
    y: topo - (alturaCabecalho + dim.altura) / 2,
    width: dim.largura,
    height: dim.altura,
  });

  // Cada linha sai num único `drawText`, com espaços de verdade na string.
  // Desenhar palavra a palavra posiciona tudo certo na tela, mas a 7pt o vão
  // entre elas fica em ~1,95pt — abaixo do limiar que os extratores de texto
  // usam para inferir separação, e o resultado era "validar.iti.gov.brAssinado"
  // ao copiar o documento. Aqui não há justificação, então nada se perde.
  let yLinha = topo - SELO_FONT_SIZE;
  for (const linha of linhas) {
    ctx.page.drawText(linha.map((p) => p.text).join(" "), {
      x: xTexto,
      y: yLinha,
      size: SELO_FONT_SIZE,
      font: fontes.regular,
      color: SELO_CINZA,
    });
    yLinha -= SELO_LINE_HEIGHT;
  }

  ctx.y = topo - alturaCabecalho - 12;

  // Identificação de quem assinou, em destaque, e o endereço logo abaixo.
  const documento = dados.cnpj ? qualificacaoMandante(dados.cnpj).replace(/^[^,]+, /, "") : "";
  escreverCentralizado(ctx, quem, 9, fontes.bold);
  if (documento) escreverCentralizado(ctx, documento, 8, fontes.regular);
  escreverCentralizado(
    ctx,
    `${endereco} - CEP ${dados.cep ? formatCep(dados.cep) : "—"}`,
    8,
    fontes.regular,
  );
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

  const endereco = montarEndereco(dados);

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

  if (dados.assinadoEm) {
    await desenharSeloIcpBrasil(ctx, dados, dados.assinadoEm, endereco);
  } else {
    desenharLinhaDeAssinatura(ctx, dados);
  }

  return await pdf.save({ useObjectStreams: false });
}
