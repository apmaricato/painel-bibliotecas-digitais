/**
 * Cria (uma unica vez) o novo Google Forms do Painel Nacional de
 * Bibliotecas Digitais, com todas as perguntas ja configuradas, incluindo
 * a lista fixa de bibliotecas digitais (extraida dos dados reais do
 * projeto). No final, escreve num log os codigos "entry.XXXXXXXX" de cada
 * pergunta, prontos para colar em gerar_links_atualizacao.gs.
 *
 * -----------------------------------------------------------------------
 * COMO USAR
 * -----------------------------------------------------------------------
 * 1. Acesse https://script.google.com/ > Novo projeto (nao precisa ser
 *    dentro de uma planilha -- este script cria o formulario do zero).
 * 2. Apague o conteudo padrao e cole este arquivo inteiro.
 * 3. Salve (icone de disquete, de um nome ao projeto, ex. "Criar
 *    Formulario BD").
 * 4. No topo, no seletor de funcao (ao lado do botao "Executar"/"Run"),
 *    escolha "criarFormulario".
 * 5. Clique em "Executar". Na primeira vez o Google pede autorizacao
 *    (o script vai criar um Forms na SUA conta) -- aceite.
 * 6. Abra "Ver" > "Registros" (ou "Execution log") para ver o resultado:
 *    o link de edicao do formulario, o link publico, e a lista de
 *    entry.XXXXXXXX de cada pergunta.
 * 7. Copie o link de edicao, abra o formulario, e confira/ajuste o que
 *    quiser (cores, textos, tornar campos obrigatorios, etc.) -- e um
 *    Google Forms normal depois de criado, edita como qualquer outro.
 * 8. Copie os valores do log para dentro de gerar_links_atualizacao.gs
 *    (FORM_URL_BASE e ENTRY_IDS).
 *
 * Rode esta funcao SÓ UMA VEZ (ela sempre cria um formulario novo -- rodar
 * de novo cria um segundo formulario duplicado, nao atualiza o existente).
 */

const ESTADOS_BR = [
  "Acre (AC)", "Alagoas (AL)", "Amapá (AP)", "Amazonas (AM)", "Bahia (BA)",
  "Ceará (CE)", "Distrito Federal (DF)", "Espírito Santo (ES)", "Goiás (GO)",
  "Maranhão (MA)", "Mato Grosso (MT)", "Mato Grosso do Sul (MS)",
  "Minas Gerais (MG)", "Pará (PA)", "Paraíba (PB)", "Paraná (PR)",
  "Pernambuco (PE)", "Piauí (PI)", "Rio de Janeiro (RJ)",
  "Rio Grande do Norte (RN)", "Rio Grande do Sul (RS)", "Rondônia (RO)",
  "Roraima (RR)", "Santa Catarina (SC)", "São Paulo (SP)", "Sergipe (SE)",
  "Tocantins (TO)",
];

const BIBLIOTECAS_DIGITAIS = [
  "ABNT Coleção", "AccessPharmacy", "African Newspapers",
  "ASM Handbooks Online", "Atheneu", "ATLA Religion Database", "BD Cengage",
  "BD Proview", "BD Senac", "Biblioteca A", "Bloomberg Professional Service",
  "BMJ Best Practice", "BV Pearson", "Cambridge Core", "Comdinheiro",
  "Digitalia Hispânica", "Dot.Lib", "Dot.Lib Lectio", "DynaMed", "E-livro",
  "EBSCO", "EBSCO eBooks", "EBSCO-MEDLINE Ultimate", "Economática",
  "eLibrary USA", "Elsevier", "EMIS", "Euromonitor", "Fórum", "HeinOnline",
  "IEEE Xplore", "IOB", "JSTOR", "JSTOR e-Books", "Karger", "LAFIS",
  "Minha Biblioteca", "MIT Press", "Naxos Music Library", "OnePetro",
  "Passport Euromonitor International", "PEP", "Portal de Periódicos da CAPES",
  "Portal ISSN", "PressReader", "ProQuest",
  "ProQuest Dissertations & Theses Global (PQDT)", "ProQuest Ebook Central",
  "ProQuest O'Reilly", "ProQuest Religion", "ProQuest's Arts E-book Subscription",
  "ProView", "RT Online", "Saraiva", "ScienceDirect Books", "Springer Link",
  "START by WGSN", "Target GEDWeb", "Target Normas", "Taylor and Francis",
  "The Economist Archive", "Tirant lo Blanch", "TLG", "UpToDate", "UseFashion",
  "Valor", "vLex", "Vogue Archive (ProQuest)", "Wiley Online Library",
  "Zoological Record", "Árvore de Livros",
];

function criarFormulario() {
  const form = FormApp.create("Painel Nacional de Bibliotecas Digitais — Assinatura de Bibliotecas Digitais (Pesquisa)");
  form.setDescription(
    "Pesquisa nacional para mapear quais bibliotecas digitais e fontes de " +
    "informação online cada instituição de ensino assina no Brasil. Leva " +
    "menos de 2 minutos. Se sua instituição já respondeu antes, use o link " +
    "personalizado enviado por e-mail para atualizar mais rápido."
  );
  form.setCollectEmail(false); // o email de contato e uma pergunta a parte, abaixo
  form.setLimitOneResponsePerUser(false); // precisa ficar desligado p/ permitir atualizacoes futuras
  form.setAllowResponseEdits(false);

  const itens = {};

  itens.tipoIes = form.addMultipleChoiceItem()
    .setTitle("Sua instituição é")
    .setChoiceValues(["Pública", "Privada", "Comunitária", "Filantrópica", "Autarquia"])
    .setRequired(true);

  itens.nomeInstituicao = form.addTextItem()
    .setTitle("Nome da sua Instituição")
    .setRequired(true);

  itens.estado = form.addListItem()
    .setTitle("Estado")
    .setChoiceValues(ESTADOS_BR)
    .setRequired(true);

  itens.bibliotecas = form.addCheckboxItem()
    .setTitle("Bibliotecas Digitais assinadas")
    .setHelpText("Marque todas as que sua instituição assina atualmente. Se não encontrar na lista, marque \"Outra\" e escreva o nome.")
    .setChoiceValues(BIBLIOTECAS_DIGITAIS)
    .showOtherOption(true)
    .setRequired(true);

  itens.emailContato = form.addTextItem()
    .setTitle("Email para contato")
    .setHelpText("Para dúvidas sobre esta resposta e para envio de atualizações futuras.")
    .setRequired(true);

  itens.siteBiblioteca = form.addTextItem()
    .setTitle("Site da Biblioteca")
    .setRequired(false);

  itens.observacoes = form.addParagraphTextItem()
    .setTitle("Observações")
    .setRequired(false);

  itens.tipoResposta = form.addMultipleChoiceItem()
    .setTitle("Atualização ou Nova Instituição?")
    .setChoiceValues(["Atualização", "Nova Instituição"])
    .setRequired(true);

  itens.autorizaEmail = form.addMultipleChoiceItem()
    .setTitle("Autoriza compartilhar seu e-mail?")
    .setChoiceValues(["Sim", "Não"])
    .setRequired(true);

  // ---------------------------------------------------------------------
  // Log com tudo que voce precisa copiar para o outro script
  // ---------------------------------------------------------------------
  const log = [];
  log.push("=== FORMULARIO CRIADO COM SUCESSO ===");
  log.push("Link de edição: " + form.getEditUrl());
  log.push("Link público (para responder): " + form.getPublishedUrl());
  log.push("");
  log.push("=== ENTRY IDs (copie para ENTRY_IDS em gerar_links_atualizacao.gs) ===");
  Object.keys(itens).forEach(function (chave) {
    log.push(chave + " -> entry." + itens[chave].getId());
  });
  log.push("");
  log.push("=== FORM_URL_BASE (copie para gerar_links_atualizacao.gs) ===");
  log.push(form.getPublishedUrl());

  Logger.log(log.join("\n"));
}
