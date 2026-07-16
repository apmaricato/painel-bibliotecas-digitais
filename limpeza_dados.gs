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

  // Garante que os aliases padrão estejam semeados na tabela
  _garantirAliasesPadrao(ss);
  _garantirAliasesInstPadrao(ss);

  const aliasesBiblio = _carregarAliases(ss, CONFIG.ABA_ALIASES_BIBLIO);
  const aliasesInst   = _carregarAliases(ss, CONFIG.ABA_ALIASES_INST);

  const wsRespostas = ss.getSheetByName(CONFIG.ABA_RESPOSTAS);
  if (!wsRespostas) {
    throw new Error(`Aba "${CONFIG.ABA_RESPOSTAS}" não encontrada. Verifique o nome.`);
  }

  const todasLinhas = wsRespostas.getDataRange().getValues();
  if (todasLinhas.length <= 1) return { instituicoes: 0, assinaturas: 0, bibliotecas: 0 };

  // Identificação dinâmica de índices de colunas com base no cabeçalho
  const cabecalho = todasLinhas[0].map(h => String(h || "").trim().toLowerCase());
  const colIndex = {
    TIMESTAMP:     cabecalho.findIndex(h => h.includes("carimbo") || h.includes("timestamp")),
    TIPO_IES:      cabecalho.findIndex(h => h.includes("sua instituição") || h.includes("tipo")),
    INSTITUICAO:   cabecalho.findIndex(h => h.includes("nome da sua") || h.includes("nome da institu")),
    ESTADO:        cabecalho.findIndex(h => h === "estado" || h.includes("uf")),
    BIBLIOTECAS:   cabecalho.findIndex(h => h.includes("bibliotecas digitais") || h.includes("bibliotecas assinadas")),
    EMAIL_CONTATO: cabecalho.findIndex(h => h.includes("email") || h.includes("contato")),
    SITE:          cabecalho.findIndex(h => h.includes("site") || h.includes("url")),
  };

  // Fallbacks padrão caso não localize alguma palavra-chave
  if (colIndex.TIMESTAMP === -1)     colIndex.TIMESTAMP = 0;
  if (colIndex.TIPO_IES === -1)      colIndex.TIPO_IES = 1;
  if (colIndex.INSTITUICAO === -1)   colIndex.INSTITUICAO = 2;
  if (colIndex.ESTADO === -1)        colIndex.ESTADO = 3;
  if (colIndex.BIBLIOTECAS === -1)   colIndex.BIBLIOTECAS = 4;
  if (colIndex.EMAIL_CONTATO === -1) colIndex.EMAIL_CONTATO = 5;
  if (colIndex.SITE === -1)          colIndex.SITE = 6;

  const linhasDados = todasLinhas.slice(1);

  // --- Deduplicar: mantém só a resposta mais recente por instituição ---
  const porInstituicao = {};

  for (const linha of linhasDados) {
    const nomeRaw = String(linha[colIndex.INSTITUICAO] || "").trim();
    if (!nomeRaw) continue;

    const nomeNorm  = _normalizarNome(nomeRaw);
    const nomeAlias = _aplicarAlias(aliasesInst, nomeNorm);
    const chave     = nomeAlias.toLowerCase();

    const ts = linha[colIndex.TIMESTAMP] instanceof Date
      ? linha[colIndex.TIMESTAMP].getTime()
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

    const tipoIes      = _normalizarTipoIES(String(linha[colIndex.TIPO_IES]      || ""));
    const estadoRaw    = String(linha[colIndex.ESTADO]        || "").trim();
    const estado       = _normalizarEstado(estadoRaw);
    const uf           = _extrairUF(estadoRaw);
    const dataResp     = linha[colIndex.TIMESTAMP] instanceof Date
      ? Utilities.formatDate(linha[colIndex.TIMESTAMP], CONFIG.TIMEZONE, "yyyy-MM-dd")
      : "";

    const bibliotecas = _parseBibliotecas(String(linha[colIndex.BIBLIOTECAS] || ""), aliasesBiblio);

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
  
  // Cria um conjunto de nomes e variantes conhecidos para evitar quebrar nomes compostos padronizados
  const conhecidos = new Set();
  for (const key in aliases) {
    conhecidos.add(key.toLowerCase().trim());
    conhecidos.add(aliases[key].toLowerCase().trim());
  }
  
  // Adiciona explicitamente o padrão comum "Taylor and Francis" (caso não esteja no alias)
  conhecidos.add("taylor and francis");
  conhecidos.add("taylor & francis");
  
  // Primeiro, divide pelo separador padrão do formulário (ponto e vírgula)
  const partesOficiais = campo.split(";");
  const resultado = [];
  
  for (let parte of partesOficiais) {
    parte = _normalizarNome(parte);
    if (!parte) continue;
    
    // Se a parte inteira já é um nome conhecido (ou variante cadastrada nos Aliases), não separa!
    if (conhecidos.has(parte.toLowerCase())) {
      resultado.push(_aplicarAlias(aliases, parte));
    } else {
      // Caso contrário (texto livre bagunçado), tenta separar por vírgula, " e " ou " and "
      const subpartes = parte.split(/\s*(?:,|\s+e\s+|\s+and\s+)\s*/i);
      for (const sub of subpartes) {
        const subNorm = _normalizarNome(sub);
        if (subNorm) {
          resultado.push(_aplicarAlias(aliases, subNorm));
        }
      }
    }
  }
  
  // Remove itens vazios e duplicados
  return resultado.filter((v, idx, self) => v && self.indexOf(v) === idx);
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
    .addItem("🔄 Reimportar Dados Legados",         "reimportarDadosLegados")
    .addItem("🔍 Depurar: Listar Abas e Linhas",   "exibirNomesAbas")
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
  
  _executarCopiaDadosLegados(ss, targetSheet);
}

function reimportarDadosLegados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName("Form_Responses");
  if (!targetSheet) {
    SpreadsheetApp.getUi().alert("Aba 'Form_Responses' não encontrada.");
    return;
  }
  
  const ui = SpreadsheetApp.getUi();
  const resposta = ui.alert(
    "⚠️ Reimportar Dados Legados",
    "Isso irá limpar a aba 'Form_Responses' e importar novamente os dados originais da aba 'Matriz' com a coluna de Bibliotecas preenchida.\n\nDeseja continuar?",
    ui.ButtonSet.YES_NO
  );
  
  if (resposta !== ui.Button.YES) return;
  
  // Limpa os dados existentes na aba Form_Responses
  if (targetSheet.getLastRow() > 1) {
    targetSheet.getRange(2, 1, targetSheet.getLastRow() - 1, targetSheet.getLastColumn()).clearContent();
  }
  
  _executarCopiaDadosLegados(ss, targetSheet);
  
  // Roda a limpeza para atualizar "Dados Limpos"
  _executarLimpeza();
  
  ui.alert("✅ Dados legados reimportados e limpos com sucesso!");
}

function _executarCopiaDadosLegados(ss, targetSheet) {
  const ignoreSheets = [
    "Form_Responses", "Dados Limpos", "Aliases Bibliotecas", 
    "Aliases Instituições", "Log Limpeza", "Matriz_tab", "TD_tab", 
    "TD", "Planilha1", "Linhas excluídas Dados Anterios", "Categoria BD"
  ];
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
  
  // Mapeia os índices das colunas por nome de cabeçalho (com fallbacks inteligentes)
  const colMap = {};
  targetHeader.forEach((title, idx) => {
    let originIdx = originHeader.indexOf(title);
    
    // Fallback para Carimbo de data/hora (Timestamp)
    if (originIdx === -1 && title === "Carimbo de data/hora") {
      originIdx = originHeader.indexOf("Hora de conclusão");
      if (originIdx === -1) originIdx = originHeader.indexOf("Hora de início");
      if (originIdx === -1) originIdx = originHeader.indexOf("Timestamp");
    }
    
    // Fallback para Autorização do E-mail (por conta de diferença de digitação no cabeçalho antigo)
    if (originIdx === -1 && title === "Autoriza compartilhar seu e-mail?") {
      originIdx = originHeader.indexOf("Autoriza compartilhar seu e-email?");
    }
    
    colMap[idx] = originIdx;
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

/**
 * Garante e alimenta automaticamente a aba 'Aliases Bibliotecas' com uma lista padrão
 * de variantes comuns antes de cada execução de limpeza, agilizando o processo.
 */
function _garantirAliasesPadrao(ss) {
  let ws = ss.getSheetByName(CONFIG.ABA_ALIASES_BIBLIO);
  
  if (!ws) {
    ws = ss.insertSheet(CONFIG.ABA_ALIASES_BIBLIO);
    ws.getRange(1, 1, 1, 2).setValues([["variante", "nome_padrao"]]);
    ws.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#e8f0fe");
  }
  
  const dadosExistentes = ws.getDataRange().getValues();
  const variantesExistentes = new Set(
    dadosExistentes.slice(1).map(row => String(row[0] || "").trim().toLowerCase())
  );
  
  const novosRows = [];
  const ALIASES_PADRAO = [
    ["dynamed", "DynaMed"],
    ["jstor", "JSTOR"],
    ["economatica", "Economática"],
    ["economática", "Economática"],
    ["uptodate", "UpToDate"],
    ["springer", "Springer Link"],
    ["springerlink", "Springer Link"],
    ["springer link", "Springer Link"],
    ["e-livros", "E-livro"],
    ["elivros", "E-livro"],
    ["e-livro", "E-livro"],
    ["elivro", "E-livro"],
    ["naxos", "Naxos Music Library"],
    ["naxos music library", "Naxos Music Library"],
    ["wiley", "Wiley Online Library"],
    ["wiley online", "Wiley Online Library"],
    ["cengage", "BD Cengage"],
    ["bd cengage", "BD Cengage"],
    ["ebsco ebook collection", "EBSCO eBooks"],
    ["ebsco ebooks", "EBSCO eBooks"],
    ["ebsco e-books", "EBSCO eBooks"],
    ["jstor e-books", "JSTOR e-Books"],
    ["jstor ebooks", "JSTOR e-Books"],
    ["proview", "BD Proview"],
    ["bd proview", "BD Proview"],
    ["proquest o'reilly", "ProQuest O'Reilly"],
    ["proquest oreilly", "ProQuest O'Reilly"],
    ["oreilly", "ProQuest O'Reilly"],
    ["o'reilly", "ProQuest O'Reilly"],
    ["pqdt", "ProQuest Dissertations & Theses Global (PQDT)"],
    ["proquest dissertations", "ProQuest Dissertations & Theses Global (PQDT)"],
    ["ieee", "IEEE Xplore"],
    ["ieee xplore", "IEEE Xplore"],
    ["heinonline", "HeinOnline"],
    ["cambridge", "Cambridge Core"],
    ["cambridge core", "Cambridge Core"],
    ["scopus", "Scopus"],
    ["web of science", "Web of Science"],
    ["wos", "Web of Science"],
    ["sciencedirect", "ScienceDirect Books"],
    ["science direct", "ScienceDirect Books"],
    ["elsevier sciencedirect", "ScienceDirect Books"],
    ["taylor francis", "Taylor and Francis"],
    ["taylor & francis", "Taylor and Francis"],
    ["arvore de livros", "Árvore de Livros"],
    ["árvore", "Árvore de Livros"],
    ["forum", "Fórum"],
    ["fórum", "Fórum"],
    ["religion", "ATLA Religion Database"],
    ["capes", "Portal de Periódicos da Capes"],
    ["portal capes", "Portal de Periódicos da Capes"],
    ["ebsco", "EBSCO"],
    ["ebsco-medline", "EBSCO-MEDLINE Ultimate"],
    ["medline", "EBSCO-MEDLINE Ultimate"]
  ];
  
  for (const [variante, nomePadrao] of ALIASES_PADRAO) {
    if (!variantesExistentes.has(variante.toLowerCase().trim())) {
      novosRows.push([variante, nomePadrao]);
    }
  }
  
  if (novosRows.length > 0) {
    ws.getRange(ws.getLastRow() + 1, 1, novosRows.length, 2).setValues(novosRows);
  }
}

/**
 * Exibe um alerta visual com a listagem de todas as abas e sua quantidade de linhas.
 * Utilizado para depuração quando o número de dados processados retorna zero.
 */
function exibirNomesAbas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const info = ss.getSheets().map(s => {
    return `• "${s.getName()}": ${s.getLastRow()} linhas, ${s.getLastColumn()} colunas`;
  }).join("\n");
  
  const ws = ss.getSheetByName("Form_Responses");
  let headers = "";
  let sample = "";
  if (ws && ws.getLastColumn() > 0) {
    const headerRow = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
    headers = "\n\n📋 Cabeçalhos de 'Form_Responses':\n" + 
              headerRow.map((h, i) => `   [${i}] ${h}`).join("\n");
              
    const cabecalho = headerRow.map(h => String(h || "").trim().toLowerCase());
    const colIndex = {
      TIMESTAMP:     cabecalho.findIndex(h => h.includes("carimbo") || h.includes("timestamp")),
      TIPO_IES:      cabecalho.findIndex(h => h.includes("sua instituição") || h.includes("tipo")),
      INSTITUICAO:   cabecalho.findIndex(h => h.includes("nome da sua") || h.includes("nome da institu")),
      ESTADO:        cabecalho.findIndex(h => h === "estado" || h.includes("uf")),
      BIBLIOTECAS:   cabecalho.findIndex(h => h.includes("bibliotecas digitais") || h.includes("bibliotecas assinadas")),
      EMAIL_CONTATO: cabecalho.findIndex(h => h.includes("email") || h.includes("contato")),
      SITE:          cabecalho.findIndex(h => h.includes("site") || h.includes("url")),
    };
    
    headers += "\n\n🔍 Mapeamento Encontrado:\n" + JSON.stringify(colIndex, null, 2);
    
    if (ws.getLastRow() > 1) {
      const firstRow = ws.getRange(2, 1, 1, ws.getLastColumn()).getValues()[0];
      sample = "\n\n💡 Primeira linha de dados:\n" + 
               firstRow.map((val, idx) => `   [${idx}] ${headerRow[idx]}: "${val}"`).join("\n");
    }
  }

  // Adiciona cabeçalhos das outras matrizes
  const wsMatrizTab = ss.getSheetByName("Matriz_tab");
  if (wsMatrizTab) {
    const matHeaders = wsMatrizTab.getRange(1, 1, 1, wsMatrizTab.getLastColumn()).getValues()[0];
    sample += `\n\n📋 Cabeçalhos de 'Matriz_tab':\n` + 
              matHeaders.map((h, i) => `   [${i}] ${h}`).join("\n");
  }
  
  const wsMatriz = ss.getSheetByName("Matriz");
  if (wsMatriz) {
    const matHeaders = wsMatriz.getRange(1, 1, 1, wsMatriz.getLastColumn()).getValues()[0];
    sample += `\n\n📋 Cabeçalhos de 'Matriz':\n` + 
              matHeaders.map((h, i) => `   [${i}] ${h}`).join("\n");
  }
  
  SpreadsheetApp.getUi().alert("Abas encontradas na planilha:\n\n" + info + headers + sample);
}

/**
 * Garante e alimenta automaticamente a aba 'Aliases Instituições' com uma lista padrão
 * de variantes comuns antes de cada execução de limpeza, agilizando o processo.
 */
function _garantirAliasesInstPadrao(ss) {
  let ws = ss.getSheetByName(CONFIG.ABA_ALIASES_INST);
  
  if (!ws) {
    ws = ss.insertSheet(CONFIG.ABA_ALIASES_INST);
    ws.getRange(1, 1, 1, 2).setValues([["variante", "nome_padrao"]]);
    ws.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#e8f0fe");
  }
  
  const dadosExistentes = ws.getDataRange().getValues();
  const variantesExistentes = new Set(
    dadosExistentes.slice(1).map(row => String(row[0] || "").trim().toLowerCase())
  );
  
  const novosRows = [];
  const ALIASES_INST_PADRAO = [
    ["fundação universidade regional de blumenau", "Fundação Universidade Regional de Blumenau (FURB)"],
    ["fundação dom cabral  (fdc)", "Fundação Dom Cabral (FDC)"],
    ["fundação dom cabral(fdc)", "Fundação Dom Cabral (FDC)"],
    ["serviço nacional de aprendizagem comercial (senac)", "Serviço Nacional de Aprendizagem Comercial (SENAC-SC)"]
  ];
  
  for (const [variante, nomePadrao] of ALIASES_INST_PADRAO) {
    if (!variantesExistentes.has(variante.toLowerCase().trim())) {
      novosRows.push([variante, nomePadrao]);
    }
  }
  
  if (novosRows.length > 0) {
    ws.getRange(ws.getLastRow() + 1, 1, novosRows.length, 2).setValues(novosRows);
  }
}

