/**
 * =============================================================================
 * PAINEL NACIONAL DE BIBLIOTECAS DIGITAIS
 * Script de Limpeza e Normalização de Dados — Google Apps Script
 * =============================================================================
 *
 * ESTRUTURA ESPERADA NA PLANILHA:
 *   Aba "Matriz"               → respostas brutas do Google Forms (não editar)
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
  ABA_RESPOSTAS:      "Matriz",
  ABA_ALIASES_BIBLIO: "Aliases Bibliotecas",
  ABA_ALIASES_INST:   "Aliases Instituições",
  ABA_DADOS_LIMPOS:   "Dados Limpos",
  ABA_LOG:            "Log Limpeza",

  // Índices das colunas na aba Matriz (0 = primeira coluna)
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
    "biblioteca_digital", "email_contato", "site_biblioteca", "data_resposta"
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
    const emailContato = String(linha[C.EMAIL_CONTATO] || "").trim();
    const site         = String(linha[C.SITE]          || "").trim();
    const dataResp     = linha[C.TIMESTAMP] instanceof Date
      ? Utilities.formatDate(linha[C.TIMESTAMP], CONFIG.TIMEZONE, "yyyy-MM-dd")
      : "";

    const bibliotecas = _parseBibliotecas(String(linha[C.BIBLIOTECAS] || ""), aliasesBiblio);

    if (bibliotecas.length === 0) {
      linhasSaida.push([nomeDisplay, tipoIes, estado, uf, "", emailContato, site, dataResp]);
    } else {
      for (const bib of bibliotecas) {
        bibliotecasSet.add(bib);
        linhasSaida.push([nomeDisplay, tipoIes, estado, uf, bib, emailContato, site, dataResp]);
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
  SpreadsheetApp.getUi()
    .createMenu("🔄 Painel BD")
    .addItem("▶ Rodar limpeza agora",              "executarManualmente")
    .addSeparator()
    .addItem("⚙️ Configurar triggers automáticos", "configurarTriggers")
    .addItem("🔴 Remover triggers",                "removerTriggers")
    .addSeparator()
    .addItem("📋 Ver log de execuções",            "irParaLog")
    .addItem("✨ Ir para Dados Limpos",            "irParaDadosLimpos")
    .addToUi();
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
