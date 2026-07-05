/**
 * Gera links pre-preenchidos do Google Forms, um por instituicao, usando a
 * resposta MAIS RECENTE dela, e grava numa coluna nova ao lado do email de
 * contato, na propria planilha de respostas do formulario.
 *
 * Isso NAO envia nada sozinho -- so gera os links. Para o envio em massa,
 * use um complemento como o "Yet Another Mail Merge" (YAMM), apontando para
 * a coluna gerada por este script.
 *
 * -----------------------------------------------------------------------
 * COMO INSTALAR (uma vez, depois que o Google Forms real existir):
 * -----------------------------------------------------------------------
 * 1. Abra a planilha de respostas do seu Google Forms (Respostas > icone do
 *    Sheets, ou Extensoes > Apps Script se ja estiver na planilha).
 * 2. Extensoes > Apps Script. Apague o conteudo padrao e cole este arquivo
 *    inteiro.
 * 3. Preencha as 4 secoes marcadas com ">>> PREENCHA" logo abaixo, usando os
 *    dados do SEU formulario (veja o passo a passo de cada uma).
 * 4. Salve (icone de disquete). Feche a aba do editor e volte pra planilha.
 * 5. Recarregue a planilha (F5). Deve aparecer um menu novo "Bibliotecas
 *    Digitais" na barra de menus.
 * 6. Clique em "Bibliotecas Digitais" > "Gerar links de atualizacao". Na
 *    primeira vez, o Google vai pedir autorizacao (é normal, é o script
 *    pedindo para ler/escrever NESSA planilha especifica) -- aceite.
 * 7. Confira a coluna nova gerada, abra um link de teste no navegador e
 *    veja se o formulario abre com as respostas certas ja marcadas.
 *
 * Repita o passo 6 sempre que quiser atualizar os links (ex.: uma vez por
 * ano, antes de disparar o email em massa).
 */

// >>> PREENCHA 1: nome EXATO da aba de respostas (aparece na aba inferior
// da planilha; geralmente "Respostas ao formulário 1").
const NOME_ABA_RESPOSTAS = "Respostas ao formulário 1";

// PREENCHIDO em 2026-07-05 com os valores reais devolvidos por
// criar_formulario.gs (link publico do formulario ja criado).
const FORM_URL_BASE = "https://docs.google.com/forms/d/e/1FAIpQLSdxrN5uD4cTMD9k9xiJUBh4YVoQu2M5oNG_FMsd_Tee1qykVQ/viewform";

// PREENCHIDO com os entry.XXXXXXXX reais (do log de execucao de
// criar_formulario.gs). Esses codigos NAO mudam mesmo se voce renomear a
// pergunta depois no Forms (ex.: ao adicionar os acentos de volta).
const ENTRY_IDS = {
  nomeInstituicao: "entry.329448775",
  tipoIes: "entry.1058813345",
  bibliotecasDigitais: "entry.215675741",
  estado: "entry.1015073937",
};

// >>> CONFIRME 4: os nomes EXATOS das colunas na planilha de respostas
// (cabecalho da 1a linha). Como o formulario foi criado sem acentos (para
// evitar erro de encoding no Apps Script), os cabecalhos comecam assim.
// Se depois voce corrigir a acentuacao das perguntas no Forms e o
// cabecalho da planilha acompanhar a mudanca, atualize os valores abaixo
// para bater com o que aparecer na planilha.
const COLUNAS = {
  nomeInstituicao: "Nome da sua Instituicao",
  tipoIes: "Sua instituicao e",
  bibliotecasDigitais: "Bibliotecas Digitais assinadas",
  estado: "Estado",
};

// Nome da coluna nova que este script cria com o link pronto.
const COLUNA_LINK_SAIDA = "Link de atualização";

// Separador usado no campo de bibliotecas dentro da planilha. O Google
// Forms grava respostas de caixa de selecao separadas por virgula por
// padrao -- mude para ";" se você mantiver o formato antigo do Microsoft
// Forms.
const SEPARADOR_BIBLIOTECAS = ",";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Bibliotecas Digitais")
    .addItem("Gerar links de atualização", "gerarLinks")
    .addToUi();
}

function gerarLinks() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const aba = planilha.getSheetByName(NOME_ABA_RESPOSTAS);
  if (!aba) {
    SpreadsheetApp.getUi().alert(
      'Aba "' + NOME_ABA_RESPOSTAS + '" não encontrada. Ajuste NOME_ABA_RESPOSTAS no topo do script (PREENCHA 1).'
    );
    return;
  }

  const dados = aba.getDataRange().getValues();
  if (dados.length < 2) {
    SpreadsheetApp.getUi().alert("Ainda não há respostas nessa aba.");
    return;
  }
  const cabecalho = dados[0];

  const indice = {};
  let erroColuna = null;
  Object.keys(COLUNAS).forEach(function (chave) {
    const col = cabecalho.indexOf(COLUNAS[chave]);
    if (col === -1) {
      erroColuna = COLUNAS[chave];
    }
    indice[chave] = col;
  });
  if (erroColuna) {
    SpreadsheetApp.getUi().alert(
      'Coluna "' + erroColuna + '" não encontrada no cabeçalho. Confira o nome exato e ajuste COLUNAS (PREENCHA 4).'
    );
    return;
  }

  let colunaLink = cabecalho.indexOf(COLUNA_LINK_SAIDA);
  if (colunaLink === -1) {
    colunaLink = cabecalho.length;
    aba.getRange(1, colunaLink + 1).setValue(COLUNA_LINK_SAIDA);
  }

  // Mantem so a linha MAIS RECENTE de cada instituicao (o Forms sempre
  // acrescenta respostas novas no final, entao a ultima ocorrencia de um
  // nome de instituicao e sempre a mais atual).
  const ultimaLinhaPorInstituicao = {};
  for (let i = 1; i < dados.length; i++) {
    const nomeInst = String(dados[i][indice.nomeInstituicao] || "").trim();
    if (nomeInst) {
      ultimaLinhaPorInstituicao[nomeInst] = i;
    }
  }

  let gerados = 0;
  Object.keys(ultimaLinhaPorInstituicao).forEach(function (nomeInst) {
    const linha = ultimaLinhaPorInstituicao[nomeInst];
    const valores = dados[linha];

    const params = [];
    params.push(ENTRY_IDS.nomeInstituicao + "=" + encodeURIComponent(nomeInst));
    params.push(ENTRY_IDS.tipoIes + "=" + encodeURIComponent(valores[indice.tipoIes] || ""));
    params.push(ENTRY_IDS.estado + "=" + encodeURIComponent(valores[indice.estado] || ""));

    // Campo de caixas de selecao (varias bibliotecas): o Forms espera um
    // parametro repetido, um por opcao marcada.
    const bibliotecasTexto = String(valores[indice.bibliotecasDigitais] || "");
    const bibliotecas = bibliotecasTexto
      .split(SEPARADOR_BIBLIOTECAS)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    bibliotecas.forEach(function (biblioteca) {
      params.push(ENTRY_IDS.bibliotecasDigitais + "=" + encodeURIComponent(biblioteca));
    });

    const link = FORM_URL_BASE + "?" + params.join("&");
    aba.getRange(linha + 1, colunaLink + 1).setValue(link);
    gerados++;
  });

  SpreadsheetApp.getUi().alert(
    gerados + ' links de atualização gerados/atualizados na coluna "' + COLUNA_LINK_SAIDA + '".'
  );
}
