/**
 * =============================================================================
 * PAINEL NACIONAL DE BIBLIOTECAS DIGITAIS
 * Script de Limpeza e Normalização de Dados — Google Apps Script
 * =============================================================================
 *
 * ESTRUTURA ESPERADA NA PLANILHA:
 *   Aba "Respostas do formulário 1" → respostas brutas do Google Forms (não editar)
 *   Aba "Aliases Bibliotecas"  → colunas: variante | nome_padrao  (editável)
 *   Aba "Aliases Instituições" → colunas: variante | nome_padrao  (editável)
 *   Aba "Dados Limpos"         → gerada por este script (não editar manualmente)
 *   Aba "Log Limpeza"          → gerada por este script (histórico de execuções)
 *
 * COMO USAR:
 *   1. Cole este script em Extensões → Apps Script da sua planilha
 *   2. Salve (Ctrl+S) e dê um nome ao projeto (ex: "Painel BD - Limpeza")
 *   3. Recarregue a planilha — o menu "🔄 Painel BD" aparecerá no topo
 *   4. Vá em: 🔄 Painel BD → Configurar triggers automáticos (faça isso só UMA VEZ)
 *   5. Pronto! A limpeza rodará automaticamente a cada nova resposta do Forms
 *      e toda semana para reprocessar histórico quando aliases forem atualizados
 *
 * ATUALIZAR ALIASES (sem tocar no código):
 *   - Abra a aba "Aliases Bibliotecas" ou "Aliases Instituições"
 *   - Adicione uma nova linha: variante | nome_padrao
 *   - Ex: "jstor e-books" | "JSTOR e-Books"
 *   - Na próxima rodada do script, o alias será aplicado automaticamente
 * =============================================================================
 */


// =============================================================================
// ⚙️ CONFIGURAÇÕES — ajuste aqui se os nomes das abas mudarem
// =============================================================================

const CONFIG = {
  ABA_RESPOSTAS:      "Form_Responses",
  ABA_ALIASES_BIBLIO: "Aliases Bibliotecas",
  ABA_ALIASES_INST:   "Aliases Instituições",
  ABA_DADOS_LIMPOS:   "Dados Limpos",
  ABA_LOG:            "Log Limpeza",

  // Índices das colunas na aba Respostas do formulário 1 (0 = primeira coluna)
  // ID | Início | Conclusão | Email | Nome | Tipo IES | Instituição |
  // Bibliotecas | Email contato | Site | Observações | Estado | URL |
  // Tipo resposta | Autoriza email | Coluna1
  COL: {
    ID:            0,
    TIMESTAMP:     1,
    TIPO_IES:      5,
    INSTITUICAO:   6,
    BIBLIOTECAS:   7,
    EMAIL_CONTATO: 8,
    SITE:          9,
    ESTADO:        11,
  },

  TIMEZONE: "America/Sao_Paulo",
};


// =============================================================================
// 🚀 FUNÇÕES PRINCIPAIS (gatilhos apontam para estas)
// =============================================================================

function rodaLimpezaCompleta(e) {
  try {
    _executarLimpeza();
  } catch (err) {
    _registrarErro(err);
    throw err;
  }
}

function executarManualmente() {
  try {
    const stats = _executarLimpeza();
    SpreadsheetApp.getUi().alert(
      `✅ Limpeza concluída!\n\n` +
      `📊 Instituições únicas: ${stats.instituicoes}\n` +
      `📚 Assinaturas registradas: ${stats.assinaturas}\n` +
      `🏛️ Bibliotecas distintas: ${stats.bibliotecas}\n\n` +
      `A aba "Dados Limpos" está pronta para o Looker Studio.`
    );
  } catch (err) {
    SpreadsheetApp.getUi().alert(`❌ Erro durante a limpeza:\n${err.message}`);
  }
}


// =============================================================================
// 🔧 LÓGICA PRINCIPAL DE LIMPEZA
// =============================================================================

function _executarLimpeza() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const aliasesBiblio = _carregarAliases(ss, CONFIG.ABA_ALIASES_BIBLIO);
  const aliasesInst   = _carregarAliases(ss, CONFIG.ABA_ALIASES_INST);

  const wsRespostas = ss.getSheetByName(CONFIG.ABA_RESPOSTAS);
  if (!wsRespostas) {
    throw new Error(`Aba "${CONFIG.ABA_RESPOSTAS}" não encontrada. Verifique o nome.`);
  }

  const todasLinhas = wsRespostas.getDataRange().getValues();
  if (todasLinhas.length <= 1) return { instituicoes: 0, assinaturas: 0, bibliotecas: 0 };

  const linhasDados = todasLinhas.slice(1);

  // --- Deduplicar: mantém só a resposta mais recente por instituição ---
  const porInstituicao = {};

  for (const linha of linhasDados) {
    const nomeRaw = String(linha[CONFIG.COL.INSTITUICAO] || "").trim();
    if (!nomeRaw) continue;

    const nomeNorm  = _normalizarNome(nomeRaw);
    const nomeAlias = _aplicarAlias(aliasesInst, nomeNorm);
    const chave     = nomeAlias.toLowerCase();

    const ts = linha[CONFIG.COL.TIMESTAMP] instanceof Date
      ? linha[CONFIG.COL.TIMESTAMP].getTime()
      : 0;

    if (!porInstituicao[chave] || ts > porInstituicao[chave].ts) {
      porInstituicao[chave] = { ts, nomeDisplay: nomeAlias, linha };
    }
  }

  // --- Expandir para formato longo (1 linha por assinatura de biblioteca) ---
  const cabecalhoSaida = [
    "instituicao", "tipo_ies", "estado", "uf",
    "biblioteca_digital", "data_resposta"
  ];

  const linhasSaida    = [];
  const bibliotecasSet = new Set();

  for (const reg of Object.values(porInstituicao)) {
    const { linha, nomeDisplay } = reg;
    const C = CONFIG.COL;

    const tipoIes      = _normalizarTipoIES(String(linha[C.TIPO_IES]      || ""));
    const estadoRaw    = String(linha[C.ESTADO]        || "").trim();
    const estado       = _normalizarEstado(estadoRaw);
    const uf           = _extrairUF(estadoRaw);
    const dataResp     = linha[C.TIMESTAMP] instanceof Date
      ? Utilities.formatDate(linha[C.TIMESTAMP], CONFIG.TIMEZONE, "yyyy-MM-dd")
      : "";

    const bibliotecas = _parseBibliotecas(String(linha[C.BIBLIOTECAS] || ""), aliasesBiblio);

    if (bibliotecas.length === 0) {
      linhasSaida.push([nomeDisplay, tipoIes, estado, uf, "", dataResp]);
    } else {
      for (const bib of bibliotecas) {
        bibliotecasSet.add(bib);
        linhasSaida.push([nomeDisplay, tipoIes, estado, uf, bib, dataResp]);
      }
    }
  }

  // --- Gravar na aba "Dados Limpos" ---
  let wsSaida = ss.getSheetByName(CONFIG.ABA_DADOS_LIMPOS);
  if (!wsSaida) wsSaida = ss.insertSheet(CONFIG.ABA_DADOS_LIMPOS);
  wsSaida.clearContents();

  const todasLinhasSaida = [cabecalhoSaida, ...linhasSaida];
  wsSaida.getRange(1, 1, todasLinhasSaida.length, cabecalhoSaida.length)
         .setValues(todasLinhasSaida);

  // Formata cabeçalho
  wsSaida.getRange(1, 1, 1, cabecalhoSaida.length)
         .setFontWeight("bold")
         .setBackground("#1a1a2e")
         .setFontColor("#ffffff");
  wsSaida.setFrozenRows(1);

  const stats = {
    instituicoes: Object.keys(porInstituicao).length,
    assinaturas:  linhasSaida.length,
    bibliotecas:  bibliotecasSet.size,
  };
  _registrarLog(ss, stats);
  return stats;
}


// =============================================================================
// 🛠️ FUNÇÕES AUXILIARES
// =============================================================================

function _carregarAliases(ss, nomeAba) {
  let ws = ss.getSheetByName(nomeAba);
  if (!ws) {
    ws = ss.insertSheet(nomeAba);
    ws.getRange(1, 1, 1, 2).setValues([["variante", "nome_padrao"]]);
    ws.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#e8f0fe");
    return {};
  }
  const dados = ws.getDataRange().getValues();
  const mapa  = {};
  for (let i = 1; i < dados.length; i++) {
    const variante   = String(dados[i][0] || "").trim().toLowerCase();
    const nomePadrao = String(dados[i][1] || "").trim();
    if (variante && nomePadrao) mapa[variante] = nomePadrao;
  }
  return mapa;
}

function _aplicarAlias(aliases, nome) {
  return aliases[nome.toLowerCase()] || nome;
}

function _normalizarNome(nome) {
  return nome.replace(/\s+/g, " ").trim();
}

function _normalizarTipoIES(tipo) {
  if (!tipo || tipo.trim() === "") return "Não informado";
  const mapa = {
    "pública": "Pública", "publica": "Pública",
    "privada": "Privada",
    "comunitária": "Comunitária", "comunitaria": "Comunitária",
    "filantrópica": "Filantrópica", "filantropica": "Filantrópica",
    "autarquia": "Autarquia",
    "organização social": "Organização Social",
    "organizacao social": "Organização Social",
  };
  const chave = tipo.trim().toLowerCase();
  return mapa[chave] || (tipo.trim().charAt(0).toUpperCase() + tipo.trim().slice(1));
}

function _normalizarEstado(estado) {
  return estado
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")  // Remove chars Unicode invisíveis
    .replace(/\s+/g, " ")
    .replace(/\s*\([A-Z]{2}\)\s*$/, "")            // Remove "(SP)" do final
    .trim();
}

function _extrairUF(estado) {
  const match = estado.match(/\(([A-Z]{2})\)/);
  return match ? match[1] : "";
}

function _parseBibliotecas(campo, aliases) {
  if (!campo || campo === "None" || campo.trim() === "") return [];
  return campo
    .split(";")
    .map(b => _normalizarNome(b))
    .filter(b => b.length > 0)
    .map(b => _aplicarAlias(aliases, b));
}


// =============================================================================
// 📋 LOG DE EXECUÇÕES
// =============================================================================

function _registrarLog(ss, stats) {
  let wsLog = ss.getSheetByName(CONFIG.ABA_LOG);
  if (!wsLog) {
    wsLog = ss.insertSheet(CONFIG.ABA_LOG);
    wsLog.getRange(1, 1, 1, 5).setValues([[
      "Data/Hora", "Instituições", "Assinaturas", "Bibliotecas distintas", "Status"
    ]]);
    wsLog.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#e8f0fe");
  }
  const agora = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss");
  wsLog.appendRow([agora, stats.instituicoes, stats.assinaturas, stats.bibliotecas, "✅ OK"]);
}

function _registrarErro(err) {
  try {
    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    let wsLog = ss.getSheetByName(CONFIG.ABA_LOG);
    if (!wsLog) {
      wsLog = ss.insertSheet(CONFIG.ABA_LOG);
      wsLog.getRange(1, 1, 1, 5).setValues([[
        "Data/Hora", "Instituições", "Assinaturas", "Bibliotecas distintas", "Status"
      ]]);
    }
    const agora = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss");
    wsLog.appendRow([agora, "-", "-", "-", `❌ ERRO: ${err.message}`]);
  } catch (_) { /* silencia erros no log */ }
}


// =============================================================================
// ⏰ CONFIGURAÇÃO DE TRIGGERS (rode UMA ÚNICA VEZ pelo menu)
// =============================================================================

/**
 * ⚠️ Execute SOMENTE UMA VEZ via: 🔄 Painel BD → Configurar triggers automáticos
 * Rodar mais de uma vez cria triggers duplicados.
 */
function configurarTriggers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Remove triggers existentes para evitar duplicatas
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Trigger 1: On Form Submit — imediato a cada nova resposta
  ScriptApp.newTrigger("rodaLimpezaCompleta")
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  // Trigger 2: Semanal — todo domingo às 2h (Brasília) = 5h UTC
  ScriptApp.newTrigger("rodaLimpezaCompleta")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(5)
    .create();

  SpreadsheetApp.getUi().alert(
    "✅ Triggers configurados!\n\n" +
    "• Limpeza automática: toda nova resposta do Forms\n" +
    "• Reprocessamento completo: todo domingo às 2h (Brasília)\n\n" +
    "Para verificar: Extensões → Apps Script → ⏰ Gatilhos."
  );
}

function removerTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  SpreadsheetApp.getUi().alert(
    "🔴 Todos os triggers foram removidos.\n" +
    "Para reativar: 🔄 Painel BD → Configurar triggers automáticos."
  );
}


// =============================================================================
// 📌 MENU PERSONALIZADO
// =============================================================================

function onOpen() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets().map(s => s.getName() + " (Form: " + !!s.getFormUrl() + ")");
    Logger.log("SHEET NAMES: " + JSON.stringify(sheets));
    
    // Executa a cópia automática dos dados legados se a aba Form_Responses estiver vazia
    copiarDadosLegados();
  } catch (err) {
    Logger.log("Error during onOpen execution: " + err.message);
  }

  SpreadsheetApp.getUi()
    .createMenu("🔄 Painel BD")
    .addItem("▶ Rodar limpeza agora",              "executarManualmente")
    .addSeparator()
    .addItem("⚙️ Configurar triggers automáticos", "configurarTriggers")
    .addItem("🔴 Remover triggers",                "removerTriggers")
    .addSeparator()
    .addItem("🔗 Gerar links de atualização",      "gerarLinks")
    .addItem("🔤 Ordenar opções do Formulário",    "ordenarBibliotecasFormulario")
    .addItem("➕ Criar Formulário de Fornecedores", "criarFormularioFornecedores")
    .addSeparator()
    .addItem("📋 Ver log de execuções",            "irParaLog")
    .addItem("✨ Ir para Dados Limpos",            "irParaDadosLimpos")
    .addToUi();
}

/**
 * Copia automaticamente os dados legados para a aba Form_Responses se ela estiver vazia.
 * Alinha as colunas comparando o nome dos cabeçalhos.
 */
function copiarDadosLegados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName("Form_Responses");
  if (!targetSheet) return;
  
  // Se a aba destino já tiver dados (além do cabeçalho), não faz nada para evitar duplicados
  if (targetSheet.getLastRow() > 1) {
    return;
  }
  
  const ignoreSheets = ["Form_Responses", "Dados Limpos", "Aliases Bibliotecas", "Aliases Instituições", "Log Limpeza"];
  let originSheet = null;
  let maxRows = 0;
  
  ss.getSheets().forEach(s => {
    const name = s.getName();
    if (ignoreSheets.indexOf(name) === -1) {
      const rows = s.getDataRange().getNumRows();
      if (rows > maxRows) {
        maxRows = rows;
        originSheet = s;
      }
    }
  });
  
  if (!originSheet || maxRows <= 1) {
    ss.toast("Nenhuma aba com dados antigos foi encontrada para cópia.", "Painel BD");
    return;
  }
  
  const originData = originSheet.getDataRange().getValues();
  const originHeader = originData[0];
  const targetHeader = targetSheet.getRange(1, 1, 1, targetSheet.getLastColumn()).getValues()[0];
  
  // Mapeia os índices das colunas por nome de cabeçalho
  const colMap = {};
  targetHeader.forEach((title, idx) => {
    colMap[idx] = originHeader.indexOf(title);
  });
  
  const newRows = [];
  for (let i = 1; i < originData.length; i++) {
    const originRow = originData[i];
    const newRow = targetHeader.map((_, targetIdx) => {
      const originIdx = colMap[targetIdx];
      return (originIdx !== undefined && originIdx !== -1) ? originRow[originIdx] : "";
    });
    newRows.push(newRow);
  }
  
  if (newRows.length > 0) {
    targetSheet.getRange(2, 1, newRows.length, targetHeader.length).setValues(newRows);
    ss.toast(`✅ Sucesso: Copiado ${newRows.length} linhas de "${originSheet.getName()}" para "Form_Responses".`, "Painel BD", 8);
  }
}

function irParaLog() {
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABA_LOG);
  if (ws) SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(ws);
  else SpreadsheetApp.getUi().alert("Nenhum log ainda. Rode a limpeza primeiro.");
}

function irParaDadosLimpos() {
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABA_DADOS_LIMPOS);
  if (ws) SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(ws);
  else SpreadsheetApp.getUi().alert('Aba "Dados Limpos" ainda não criada. Rode a limpeza primeiro.');
}

/**
 * Ordena as opções do checkbox de "Bibliotecas Digitais" no Google Forms associado.
 */
function ordenarBibliotecasFormulario() {
  const formId = "1Uo6dCM_XsE_PBniFDQjY4nNkjVLULrBgvPEzFkHtCpQ";
  try {
    const form = FormApp.openById(formId);
    const items = form.getItems(FormApp.ItemType.CHECKBOX);
    let targetItem = null;
    
    for (const item of items) {
      if (item.getTitle().toLowerCase().includes("bibliotecas digitais")) {
        targetItem = item.asCheckboxItem();
        break;
      }
    }
    
    if (!targetItem) {
      SpreadsheetApp.getUi().alert("Pergunta 'Bibliotecas Digitais' não encontrada no formulário.");
      return;
    }
    
    // Pega as opções atuais, extrai os textos, ordena e salva de volta
    const choices = targetItem.getChoices();
    const values = choices.map(c => c.getValue()).filter(v => v && v.trim() !== "");
    
    // Ordena alfabeticamente ignorando acentos
    values.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    
    targetItem.setChoiceValues(values);
    SpreadsheetApp.getUi().alert("✅ Sucesso! As opções do formulário foram ordenadas alfabeticamente.");
  } catch (err) {
    SpreadsheetApp.getUi().alert("Erro ao ordenar formulário: " + err.message);
  }
}

/**
 * Cria automaticamente um novo formulário Google Forms estruturado para fornecedores
 * com base nos campos de categoria do Painel de Bibliotecas Digitais.
 */
function criarFormularioFornecedores() {
  try {
    const form = FormApp.create("Painel de Bibliotecas Digitais - Cadastro de Fornecedores");
    form.setDescription("Formulário destinado a fornecedores e editoras para cadastrar ou atualizar as características técnicas das bibliotecas digitais mapeadas no painel.");
    
    form.setCollectEmail(false);
    form.setAllowResponseEdits(true);
    
    const itemNome = form.addTextItem();
    itemNome.setTitle("Nome da Biblioteca Digital")
            .setHelpText("Ex: Minha Biblioteca, IEEE Xplore, JSTOR, etc.")
            .setRequired(true);
            
    const itemUrl = form.addTextItem();
    itemUrl.setTitle("URL Oficial da Biblioteca Digital")
           .setHelpText("Link de acesso principal da plataforma.");
           
    const itemModelo = form.addMultipleChoiceItem();
    itemModelo.setTitle("Modelo de Negócio")
              .setChoices([
                itemModelo.createChoice("Corporativo / Assinatura"),
                itemModelo.createChoice("Open Access (Livre)"),
                itemModelo.createChoice("Misto"),
                itemModelo.createChoice("Outro", true)
              ]);

    const itemTipoObra = form.addCheckboxItem();
    itemTipoObra.setTitle("Tipo de Obras Predominantes")
                .setChoices([
                  itemTipoObra.createChoice("e-books / Livros"),
                  itemTipoObra.createChoice("Periódicos / Artigos Científicos"),
                  itemTipoObra.createChoice("Normas Técnicas"),
                  itemTipoObra.createChoice("Patentes / Teses"),
                  itemTipoObra.createChoice("Outro", true)
                ]);

    const itemIdioma = form.addTextItem();
    itemIdioma.setTitle("Idioma Predominante")
              .setHelpText("Ex: Português, Inglês, Multilíngue.");

    const itemAreas = form.addParagraphTextItem();
    itemAreas.setTitle("Áreas do Conhecimento Cobertas")
             .setHelpText("Ex: Ciências da Saúde, Engenharias, Multidisciplinar, etc.");

    const itemOffline = form.addMultipleChoiceItem();
    itemOffline.setTitle("Possui suporte a Leitura Offline?")
               .setChoices([
                 itemOffline.createChoice("Sim (via App próprio)"),
                 itemOffline.createChoice("Sim (download de PDF / ePub)"),
                 itemOffline.createChoice("Não"),
                 itemOffline.createChoice("Outro", true)
               ]);

    const itemInteracoes = form.addParagraphTextItem();
    itemInteracoes.setTitle("Recursos de Interação do Leitor")
                  .setHelpText("Descreva os recursos disponíveis para o leitor (ex: realce de texto, anotações, flashcards, criação de listas, plano de aula).");

    const itemCompartilhamento = form.addParagraphTextItem();
    itemCompartilhamento.setTitle("Recursos de Compartilhamento")
                        .setHelpText("Descreva os recursos de compartilhamento (ex: envio de citações, exportação de referências, compartilhamento em redes sociais).");

    const itemSuporte = form.addParagraphTextItem();
    itemSuporte.setTitle("Suporte de Leitura e Formatos suportados")
               .setHelpText("Ex: Leitura direto no navegador, formatos ePub, PDF, etc.");

    const itemRecursos = form.addParagraphTextItem();
    itemRecursos.setTitle("Principais Recursos da Plataforma")
                .setHelpText("Ferramentas de busca avançada, estatísticas COUNTER, integração com Discovery, etc.");

    const itemApp = form.addMultipleChoiceItem();
    itemApp.setTitle("Possui App Móvel dedicado?")
           .setChoices([
             itemApp.createChoice("Sim (Android e iOS)"),
             itemApp.createChoice("Sim (Apenas Android)"),
             itemApp.createChoice("Sim (Apenas iOS)"),
             itemApp.createChoice("Não")
           ]);

    const itemAcessibilidade = form.addParagraphTextItem();
    itemAcessibilidade.setTitle("Recursos de Acessibilidade")
                      .setHelpText("Leitores de tela integrados, compatibilidade com NVDA/JAWS, alto contraste, etc.");

    const itemAcessoRemoto = form.addCheckboxItem();
    itemAcessoRemoto.setTitle("Formas de Acesso Remoto Suportadas")
                    .setChoices([
                      itemAcessoRemoto.createChoice("IP Institucional"),
                      itemAcessoRemoto.createChoice("Proxy Reverso (EZproxy, etc.)"),
                      itemAcessoRemoto.createChoice("Acesso Federado (Shibboleth / CAFe)"),
                      itemAcessoRemoto.createChoice("Login e Senha individual / e-mail institucional"),
                      itemAcessoRemoto.createChoice("Outro", true)
                    ]);

    const itemFornecedor = form.addTextItem();
    itemFornecedor.setTitle("Nome do Fornecedor / Representante")
                  .setRequired(true);

    const itemEmail = form.addTextItem();
    itemEmail.setTitle("E-mail de contato")
             .setRequired(true);

    const editUrl = form.getEditUrl();
    const publishedUrl = form.getPublishedUrl();
    
    const ui = SpreadsheetApp.getUi();
    const htmlOutput = HtmlService.createHtmlOutput(
      `<div style="font-family: Arial, sans-serif; color: #333; padding: 10px;">` +
      `<p>O formulário de fornecedores foi criado com sucesso no seu Google Drive!</p>` +
      `<p style="margin-top:15px;"><b>Link de Edição (para você gerenciar):</b><br>` +
      `<a href="${editUrl}" target="_blank" style="color:#00b4d8; text-decoration:none; word-break:break-all;">${editUrl}</a></p>` +
      `<p style="margin-top:15px;"><b>Link Público (para enviar aos fornecedores):</b><br>` +
      `<a href="${publishedUrl}" target="_blank" style="color:#00b4d8; text-decoration:none; word-break:break-all;">${publishedUrl}</a></p>` +
      `</div>`
    ).setWidth(600).setHeight(280);
    ui.showModalDialog(htmlOutput, "Formulário Criado! 🎉");

  } catch (err) {
    SpreadsheetApp.getUi().alert("Erro ao criar formulário: " + err.message);
  }
}
