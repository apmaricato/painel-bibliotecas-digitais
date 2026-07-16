# Handoff — Painel Nacional de Bibliotecas Digitais

Documento de transferência de contexto para continuar este projeto em outra conversa/IA.
Escrito originalmente em 2026-07-05, **reescrito e verificado contra o código e o histórico do git em 2026-07-13** — a versão anterior descrevia uma arquitetura (Streamlit) que foi abandonada sem que a documentação fosse atualizada. Leia este arquivo, não confie no `README.md`/`COMO_INSTALAR.md`/`LEIA-ME.md` para entender o estado atual (ver seção 6).

> [!IMPORTANT]
> **Regra de Interoperabilidade Multi-Agente (Antigravity, Claude, Cursor, etc.):**
> Para permitir que o desenvolvedor alterne entre diferentes IAs, registre sempre o seu ID de Sessão/Conversa e o caminho para a sua pasta de logs/artefatos no arquivo [AGENTS.md](file:///C:/Users/apmar/Downloads/Painel%20Nacional%20de%20Bibliotecas%20Digitais/Painel%20Nacional%20de%20Bibliotecas%20Digitais/.agents/AGENTS.md). Atualize este arquivo `HANDOFF.md` ao final do seu turno.

## 1. Quem é o usuário e o que ele quer

Pedro Maricato (Bibliotecário, CRB 8 - 6922) é o mantenedor único (solo) do "Painel Nacional de Bibliotecas Digitais" — uma pesquisa nacional que mapeia quais bibliotecas digitais e fontes de informação online cada instituição de ensino superior brasileira assina. Não é programador por preferência (quer baixa manutenção de código no dia a dia), mas cola e executa scripts prontos sem problema, incluindo autorizar permissões do Google quando pedido. Prefere respostas curtas e diretas.

## 2. Por que a migração

Stack antiga: Microsoft Forms → Excel (OneDrive, Power Query unpivot) → Power BI Service ("Publicar na Web"). Motivo: **depreciação real e com prazo da Microsoft** — o relatório antigo usa o modelo legado de importação Excel/CSV do Power BI Service, que a Microsoft está descontinuando em fases: nenhum modelo novo desse tipo após 2026-05-31, os existentes param de atualizar em **2026-07-31**, e param de carregar/consultar em **2026-08-31** (o link público passa a dar erro). Fonte: blog do Power BI, "Deprecation of old Excel and CSV import experience in Power BI Service" (fev/2026).

Pedro rejeitou explicitamente continuar com Power BI e pediu uma solução gratuita com gráficos avançados.

## 3. Arquitetura REAL atual (verificada em 2026-07-13)

O projeto passou por duas iterações de arquitetura de visualização antes de chegar na atual. **Não são planos concorrentes — a mais recente substitui as anteriores:**

1. ~~Streamlit + Plotly (`app.py`)~~ — protótipo inicial, funcional, mas **abandonado**. Não foi modificado desde o commit inicial do repositório enquanto todo o resto evoluiu (11 commits depois). Tratar como código morto/histórico.
2. ~~Google Forms → Sheets → Looker Studio + landing page HTML separada~~ — plano documentado em `COMO_INSTALAR.md`/`README.md`, **também superado**. Nunca foi finalizado (placeholders `COLE_AQUI_O_LINK_DO_LOOKER_STUDIO` etc. seguem vazios).
3. **Atual e publicada:** Google Forms → Google Sheets → Apps Script de limpeza → **dashboard interativo embutido em `index.html`, hospedado no GitHub Pages.**

### 3.1 Coleta

Google Forms → respostas caem automaticamente numa aba da planilha vinculada (nome da aba: ver alerta na seção 3.3 abaixo — **há uma divergência não resolvida entre os scripts**).

### 3.2 Limpeza automática (`limpeza_dados.gs`)

Script a instalar (ou já instalado — status não confirmado, ver seção 7) na planilha de respostas via Extensões → Apps Script. Ao rodar (manualmente pelo menu "🔄 Painel BD", por trigger a cada resposta nova, ou semanalmente aos domingos 5h UTC):

- Deduplica por instituição, mantendo **só a resposta mais recente** de cada uma.
- Aplica aliases de padronização de grafia — **lidos das abas "Aliases Bibliotecas" / "Aliases Instituições" DENTRO da própria planilha Google Sheets**, não dos arquivos `aliases_*.csv` do repositório (ver alerta na seção 4).
- Normaliza tipo de IES e estado/UF.
- Grava o resultado em formato longo (1 linha por assinatura) na aba **"Dados Limpos"**: colunas `instituicao, tipo_ies, estado, uf, biblioteca_digital, data_resposta`.
- Registra cada execução na aba "Log Limpeza".

### 3.3 ✅ Divergência resolvida (Atualizado pelo Antigravity em 2026-07-15)

Todos os scripts e tutoriais foram padronizados para apontar para a aba **"Respostas do formulário 1"** (nome padrão do Google Forms).
- `limpeza_dados.gs` → `CONFIG.ABA_RESPOSTAS = "Respostas do formulário 1"`
- `gerar_links_atualizacao.gs` → `NOME_ABA_RESPOSTAS = "Respostas do formulário 1"`
- `COMO_INSTALAR.md` → instrui a verificar a aba **"Respostas do formulário 1"**

**Nota para o Pedro:** Apenas se certifique de que na sua planilha oficial do Google Sheets a aba com as respostas está com o nome exato **"Respostas do formulário 1"**. Se não estiver, renomeie a aba lá no Google Sheets para que tudo funcione perfeitamente.

### 3.4 Visualização e publicação (`index.html`)

Um único arquivo autocontido (~2500 linhas, HTML+CSS+JS inline), hospedado via **GitHub Pages** no repositório `apmaricato/painel-bibliotecas-digitais` (branch `main`, deploy automático a cada push). Bibliotecas usadas via CDN: Chart.js (gráficos), Leaflet (mapa coroplético dos estados brasileiros), PapaParse (parse de CSV no navegador).

Duas abas de navegação dentro do próprio painel:
- **"Mapeamento de Assinaturas (IES)"** — KPIs, filtros multi-seleção (tipo de IES / biblioteca / estado), mapa clicável, ranking de bibliotecas, gráfico de rosca por tipo de IES, tabela paginada com busca.
- **"Guia de Bibliotecas Digitais"** — catálogo/diretório com 43 bibliotecas detalhadas (idioma, tipo de obra, área, modelo de negócio etc.), dados embutidos direto no JS como array `CATALOGO_DADOS` (linha ~1089), originados de `categoria_bd.json`. Tem busca livre e filtros por idioma/tipo de obra/modelo de negócio.

Pontos de referência no código (linhas aproximadas, na versão de 2026-07-13):
- `CSV_URL` (fonte de dados do dashboard): linha 1081
- `GEOJSON_URL` (contorno dos estados, buscado de `raw.githubusercontent.com` direto no navegador do visitante — funciona bem, diferente de fetch em ambiente de dev sandboxed): linha 1084
- `CATALOGO_DADOS`: linha ~1089
- Inicialização (`DOMContentLoaded`): linha ~1942
- `loadDataFromSheets()` / parse do CSV: linha ~1997
- `loadGeoJson()`: linha ~2040
- Gráficos e mapa: linhas ~2160–2350
- Tabela e paginação: linhas ~2400–2472

### 3.5 ⚠️ O painel publicado NÃO se atualiza sozinho (ponto mais importante deste documento)

`CSV_URL` em `index.html` aponta para um **arquivo local bundled no repositório** (`bibliotecas_digitais_dados.csv`), não para um link ao vivo do Google Sheets. Isso foi uma decisão deliberada — o histórico do git mostra que uma versão anterior conectava direto na Google Sheets publicada (commit "Connect live Google Sheets CSV to the interactive dashboard"), mas foi revertida por causa de CORS no navegador (commit "Use local CSV source to avoid browser CORS redirect restrictions").

**Consequência prática:** para o painel refletir novas respostas do formulário, é preciso **manualmente** exportar a aba "Dados Limpos" da planilha como CSV e substituir `bibliotecas_digitais_dados.csv` no repositório GitHub. Esse processo está descrito passo a passo, em linguagem não-técnica, em `MANUAL_ATUALIZACAO_DADOS.md` (arquivo novo, para o Pedro seguir sozinho).

**Verificado em 2026-07-13:** o `bibliotecas_digitais_dados.csv` publicado hoje ainda é o snapshot original de demonstração (634 linhas, 176 instituições, 86 grafias distintas de biblioteca — os mesmos números "sujos" do snapshot de 2026-06-17 do diagnóstico inicial). Ou seja: **nenhuma resposta real do Google Forms foi incorporada ao painel publicado ainda.** A ponte entre "Dados Limpos" (Sheets) e o CSV do repositório nunca foi executada.

**Melhoria futura recomendada, não tentada ainda:** experimentar o endpoint `https://docs.google.com/spreadsheets/d/ID/gviz/tq?tqx=out:csv&sheet=Dados%20Limpos` do Google Sheets em vez de `export?format=csv` — o endpoint `gviz` costuma enviar cabeçalhos CORS mais permissivos e pode eliminar a necessidade do processo manual. Vale testar antes de assumir que só o processo manual é possível.

## 4. Qualidade de dados — duas camadas coexistindo, não confundir

- **Camada antiga** (usada só pelo `app.py`/Streamlit, que hoje não está em produção): `aliases_bibliotecas.csv` (46 linhas) e `aliases_instituicoes.csv` (5 linhas) no repositório.
- **Camada nova** (a que importa de verdade hoje, usada por `limpeza_dados.gs`): abas "Aliases Bibliotecas" / "Aliases Instituições" **dentro da própria planilha Google Sheets**, populadas inicialmente copiando os CSVs do repo (conforme `COMO_INSTALAR.md` Parte 1 Passo 6), mas que evoluem de forma independente a partir daí.

**Consequência:** se alguém adicionar um alias novo (ex.: uma grafia nova de biblioteca digital), precisa adicionar **nas duas** — no CSV do repositório (só serve de histórico/documentação) e na aba correspondente da planilha (é o que realmente tem efeito na limpeza) — ou as duas fontes divergem silenciosamente e ninguém percebe.

`detectar_duplicatas.py` é uma ferramenta de apoio separada (não roda em produção): compara nomes distintos via `difflib.SequenceMatcher`, limiar de similaridade 0.90 (ajustado de 0.82 por gerar falsos positivos com nomes de universidades brasileiras templadas, ex. "Universidade Federal do Acre" vs "Universidade Federal do ABC"). Gera `revisar_duplicatas.csv` (16 pares suspeitos na última rodada) para revisão humana — não decide sozinho. **Nota:** este script pode ter sido modificado por Pedro depois da versão original — reler antes de editar.

## 5. Formulário Google Forms real

- Link de edição: `https://docs.google.com/forms/d/1Uo6dCM_XsE_PBniFDQjY4nNkjVLULrBgvPEzFkHtCpQ/edit`
- Link público: `https://docs.google.com/forms/d/e/1FAIpQLSdxrN5uD4cTMD9k9xiJUBh4YVoQu2M5oNG_FMsd_Tee1qykVQ/viewform`

⚠️ **Não reverificado desde 2026-07-05.** Antes de confiar nos dados abaixo, abra o link de edição e confirme que o formulário ainda existe e está assim.

Entry IDs (do log de execução de `criar_formulario.gs`):
```
tipoIes         -> entry.1058813345   (Sua instituição é)
nomeInstituicao -> entry.329448775    (Nome da sua Instituição — texto livre)
estado          -> entry.1015073937   (Estado)
bibliotecas     -> entry.215675741    (Bibliotecas Digitais assinadas, 71 opções)
emailContato    -> entry.527593896    (E-mail de contato)
siteBiblioteca  -> entry.557521567    (Site da biblioteca)
observacoes     -> entry.1028306553   (Observações)
tipoResposta    -> entry.1899481608   (Atualização ou Nova Instituição? — candidata a ser REMOVIDA, ver seção 8)
autorizaEmail   -> entry.462619758    (Autoriza compartilhar seu e-mail?)
```

Pendências conhecidas no formulário:
- Reordenar "Autoriza compartilhar seu e-mail?" para Não/Sim (alfabético).
- Reverificar do início ao fim se as 71 opções de "Bibliotecas Digitais assinadas" estão em ordem alfabética (não foi 100% confirmado).
- Existe um Google Form em branco criado por engano no Drive do Pedro — pode ser apagado a qualquer momento.

## 6. Documentação existente no repositório que está DESATUALIZADA — cuidado

- `README.md` e `COMO_INSTALAR.md` descrevem a arquitetura Google Forms → Looker Studio + landing page HTML separada, que foi **substituída** pelo dashboard embutido em `index.html` (seção 3). Placeholders não preenchidos (`COLE_AQUI_O_LINK_DO_LOOKER_STUDIO`, `COLE_AQUI_O_LINK_DO_FORMULARIO`, `COLE_AQUI_O_EMAIL_DE_CONTATO`) e ainda citam "CBBU" como iniciativa, enquanto `index.html` já foi atualizado para creditar "Pedro Maricato - Bibliotecário CRB 8 - 6922".
- `COMO_INSTALAR.md` também instrui verificar uma aba "Matriz" que não bate com o que os scripts `.gs` realmente procuram (ver seção 3.3).
- `LEIA-ME.md` descreve o protótipo Streamlit (`app.py`) como se fosse o painel atual — também desatualizado pelo mesmo motivo.
- **Não usar nenhum desses três arquivos para entender o estado atual do projeto.** Recomendação: atualizar ou apagar os três assim que houver tempo, para não confundir o próximo desenvolvedor/IA.

## 7. Status não confirmado (verificar diretamente com Pedro ou abrindo a planilha)

- Se `limpeza_dados.gs` já foi de fato instalado na planilha real e se os triggers (`configurarTriggers`) já foram configurados.
- Se as abas "Aliases Bibliotecas" / "Aliases Instituições" da planilha já foram populadas com os dados dos CSVs do repositório.
- O nome real da aba de respostas (ver divergência na seção 3.3).
- Se `gerar_links_atualizacao.gs` já foi instalado e testado na planilha de respostas real.

## 8. TAREFA ATIVA — redesenho do formulário (ainda não implementada)

Pedro pediu, e confirmou querer receber como **script pronto para colar** (não via automação de navegador):

> "consegue fazer o script ajustar o formulário (questão instituição) adicionando as opções existentes no formulário e, caso a instituição já exista, adicionar opção para a pessoa apenas informar o email e caso o email seja o mesmo do cadastro anterior, enviar link para atualização dos dados, daí não precisamos da questão sobre nova instituição ou complementação dos dados."

Desenho planejado (não escrito ainda — não existe nenhum arquivo `.gs` novo para isso):

1. Converter "Nome da sua Instituição" (hoje texto livre) em **lista suspensa**, populada com os nomes de instituição já existentes, mais uma opção final "Minha instituição não está nessa lista (nova instituição)".
2. Usar o branching nativo do Forms ("Ir para a seção com base na resposta") nessa pergunta:
   - Instituição já existente → seção curta "Atualizar dados" só com e-mail de contato.
   - "Nova instituição" → seção com todas as perguntas completas.
   - Elimina a pergunta "Atualização ou Nova Instituição?" (`entry.1899481608`).
3. Instalar um trigger `onFormSubmit` que, ao detectar submissão da seção curta, compara o e-mail informado com o e-mail salvo na última resposta daquela instituição:
   - Se bater → monta o link pré-preenchido (reaproveitando a lógica de `gerar_links_atualizacao.gs`) e **envia por e-mail automaticamente** via `MailApp`/`GmailApp`.
   - Se não bater → comportamento ainda em aberto. **Perguntar a Pedro qual prefere antes de implementar essa parte** (opção mais segura por padrão: avisar Pedro para revisão manual em vez de enviar).

Limitações técnicas: branching do Forms só funciona com múltipla escolha/lista (não texto livre); a lista de instituições precisa ficar sincronizada; envio automático de e-mail exige autorização de trigger instalável.

## 9. Lições operacionais importantes

- **Automação de navegador no editor do Google Apps Script (Monaco) é pouco confiável**: colagem grande "parece" funcionar mas não salva de fato; botões ficam inertes. A abordagem que funcionou foi **entregar o código completo em bloco de texto para o próprio usuário colar e rodar**. Automação de navegador funcionou bem para outras partes do Forms (cliques diretos, edição de texto de opções).
- Colar texto com acentos de certos apps/clipboards pode corromper o encoding (já causou um `SyntaxError`) — nesse caso, oferecer uma versão ASCII sem acentos como alternativa.
- Sandbox de desenvolvimento bloqueia fetch de domínios arbitrários (ex.: `raw.githubusercontent.com`) do lado do SERVIDOR/dev — mas isso não afeta o `index.html` publicado, porque o fetch do GeoJSON roda no navegador do visitante final, não no ambiente de desenvolvimento.

## 10. Inventário de arquivos (pasta do projeto)

Caminho: `C:\Users\apmar\Downloads\Painel Nacional de Bibliotecas Digitais\Painel Nacional de Bibliotecas Digitais`
Repositório remoto: `https://github.com/apmaricato/painel-bibliotecas-digitais` (branch `main`, GitHub Pages ativo)

| Arquivo | Status | O que é |
|---|---|---|
| `index.html` | **Ativo — é o painel publicado** | Dashboard completo (mapeamento + catálogo), autocontido, GitHub Pages |
| `bibliotecas_digitais_dados.csv` | **Ativo, mas desatualizado** | Fonte de dados lida por `index.html`; ainda é o snapshot de demonstração (634 assinaturas / 176 instituições / 86 bibliotecas), nunca foi substituído por dados reais do Forms |
| `categoria_bd.json` | Ativo (fonte do catálogo) | 43 bibliotecas com metadados (idioma, tipo de obra, área, modelo de negócio) — dados embutidos em `CATALOGO_DADOS` dentro do `index.html` |
| `catalogo_bibliotecas_digitais.csv` | Ativo | Lista canônica de 71 bibliotecas digitais, usada no formulário real |
| `limpeza_dados.gs` | Status de instalação não confirmado | Script de limpeza/dedup na planilha Google Sheets, gera aba "Dados Limpos" |
| `criar_formulario.gs` | Já executado — não rodar de novo | Criou o Google Forms real via `FormApp` |
| `gerar_links_atualizacao.gs` | Status de instalação não confirmado | Gera links pré-preenchidos de atualização por instituição |
| `aliases_bibliotecas.csv` / `aliases_instituicoes.csv` | Legado (usado só por `app.py`) | Dicionários de padronização de grafia — ver seção 4 sobre divergência com as abas da planilha |
| `detectar_duplicatas.py` | Ferramenta de apoio, roda sob demanda | Aponta candidatos a duplicata via fuzzy match |
| `revisar_duplicatas.csv` | Saída do script acima | 16 pares suspeitos na última rodada |
| `app.py` / `requirements.txt` | **Abandonado, não usado em produção** | Protótipo Streamlit + Plotly, congelado desde o commit inicial |
| `Diagnostico_e_Plano_de_Migracao_Painel_Bibliotecas_Digitais.docx` | Histórico | Relatório de diagnóstico entregue no início do projeto |
| `README.md`, `COMO_INSTALAR.md`, `LEIA-ME.md` | **Desatualizados — ver seção 6** | Descrevem arquiteturas abandonadas (Looker Studio / Streamlit) |
| `MANUAL_ATUALIZACAO_DADOS.md` | **Novo, escrito em 2026-07-13** | Guia não-técnico para o Pedro atualizar os dados do painel |

## 11. Próximos passos recomendados, em ordem de prioridade

1. Resolver a divergência de nome de aba entre `limpeza_dados.gs`, `gerar_links_atualizacao.gs` e `COMO_INSTALAR.md` (seção 3.3) — sem isso, qualquer automação vai falhar.
2. Confirmar diretamente com Pedro (ou abrindo a planilha) os itens da seção 7.
3. Fazer a primeira ponte real de dados: seguir `MANUAL_ATUALIZACAO_DADOS.md` e confirmar que o painel publicado passa a refletir respostas reais do Forms.
4. Investigar o endpoint `gviz/tq` do Google Sheets como alternativa ao processo manual (seção 3.5).
5. Implementar o redesenho do formulário (seção 8) — depois de perguntar a Pedro sobre o comportamento de fallback de e-mail.
6. Atualizar ou remover `README.md`, `COMO_INSTALAR.md`, `LEIA-ME.md`, e decidir o destino de `app.py`/`requirements.txt`.
