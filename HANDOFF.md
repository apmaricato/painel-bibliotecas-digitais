# Handoff — Painel Nacional de Bibliotecas Digitais

Documento de transferência de contexto para continuar este projeto em outra conversa/IA. Escrito em 2026-07-05.

## 1. Quem é o usuário e o que ele quer

Pedro é bibliotecário, mantenedor único (solo) do "Painel Nacional de Bibliotecas Digitais" — uma pesquisa nacional que mapeia quais bibliotecas digitais e fontes de informação online cada instituição de ensino superior brasileira assina. Não é programador por preferência (quer baixa manutenção de código no dia a dia), mas cola e executa scripts prontos sem problema, incluindo autorizar permissões do Google quando pedido. Prefere respostas curtas e diretas.

## 2. Por que a migração

Stack antiga: Microsoft Forms → Excel (OneDrive, Power Query unpivot) → Power BI Service ("Publicar na Web"). Motivo da migração: **depreciação real e com prazo da Microsoft** — o relatório usa o modelo legado de importação Excel/CSV do Power BI Service, que a Microsoft está descontinuando em fases: nenhum modelo novo desse tipo após 2026-05-31, os existentes param de atualizar em **2026-07-31**, e param de carregar/consultar em **2026-08-31** (o link público passa a dar erro). Confirmado no próprio relatório (banner de aviso). Fonte: blog do Power BI, "Deprecation of old Excel and CSV import experience in Power BI Service" (fev/2026).

Pedro rejeitou explicitamente continuar com Power BI ("não quero power bi") e pediu uma solução gratuita com gráficos avançados.

## 3. Arquitetura final decidida (e já construída)

- **Coleta e armazenamento:** Google Forms → Google Sheets (nativo, sem configuração — respostas caem direto numa planilha vinculada). Depois, Arquivo → Compartilhar → Publicar na Web → CSV gera um link de exportação que se atualiza sozinho a cada resposta.
- **Visualização:** Streamlit (Python) + Plotly, em vez de Power BI ou Looker Studio (Streamlit foi escolhido por ter os melhores gráficos entre as opções gratuitas avaliadas).
- **Por que não SQLite:** performance não é gargalo nesse volume; os bloqueios reais seriam precisar de backend custom para receber submissões de formulário, e hospedagens gratuitas (Streamlit Community Cloud, Hugging Face Spaces) terem disco não-persistente (um SQLite seria apagado a cada redeploy). Google Sheets resolve os dois de graça.
- **Deploy gratuito recomendado:** Streamlit Community Cloud (precisa repo público no GitHub, dorme com inatividade) ou Hugging Face Spaces (mais recursos, dorme depois de ~48h sem uso).

## 4. Inventário de arquivos (pasta do projeto)

Caminho: `C:\Users\apmar\Downloads\Painel Nacional de Bibliotecas Digitais\Painel Nacional de Bibliotecas Digitais`

| Arquivo | O que é |
|---|---|
| `Diagnostico_e_Plano_de_Migracao_Painel_Bibliotecas_Digitais.docx` | Relatório de diagnóstico e plano de migração entregue no início do projeto |
| `app.py` | Painel Streamlit + Plotly (protótipo funcional, testado com dados reais) |
| `requirements.txt` | streamlit>=1.38, pandas>=2.2, plotly>=5.22, requests>=2.31 |
| `bibliotecas_digitais_dados.csv` | Snapshot de dados reais (2026-06-17: 175 instituições, 634 assinaturas), deixado SEM correção manual de propósito, para a camada de alias demonstrar a limpeza |
| `aliases_bibliotecas.csv` / `aliases_instituicoes.csv` | Dicionários de padronização de grafia (variante → nome_padrao), aplicados automaticamente pelo `app.py` |
| `detectar_duplicatas.py` | Script separado que aponta candidatos a duplicata via fuzzy match (`difflib`), para revisão humana — **nota: pode ter sido modificado por Pedro depois da versão original, releia antes de editar** |
| `revisar_duplicatas.csv` | Saída gerada pelo script acima (15 pares suspeitos na última rodada) |
| `catalogo_bibliotecas_digitais.csv` | Lista canônica de 71 bibliotecas digitais, usada também no formulário real |
| `criar_formulario.gs` | Apps Script que criou o Google Forms real via `FormApp` (já executado — não rodar de novo, duplicaria o formulário) |
| `gerar_links_atualizacao.gs` | Apps Script que gera links pré-preenchidos de atualização por instituição (escrito e preenchido com dados reais, mas ainda não instalado/testado na planilha de respostas real) |
| `LEIA-ME.md` | Manual vivo do projeto: rodar local, publicar grátis, ligar a dados reais, qualidade de dados, criar o Forms via script, facilitar respostas repetidas |

## 5. Formulário real já criado (Google Forms)

- Link de edição: `https://docs.google.com/forms/d/1Uo6dCM_XsE_PBniFDQjY4nNkjVLULrBgvPEzFkHtCpQ/edit`
- Link público: `https://docs.google.com/forms/d/e/1FAIpQLSdxrN5uD4cTMD9k9xiJUBh4YVoQu2M5oNG_FMsd_Tee1qykVQ/viewform`

Entry IDs reais:
```
tipoIes         -> entry.1058813345   (Sua instituição é)
nomeInstituicao -> entry.329448775    (Nome da sua Instituição)
estado          -> entry.1015073937  (Estado)
bibliotecas     -> entry.215675741    (Bibliotecas Digitais assinadas, 71 opções)
emailContato    -> entry.527593896    (E-mail de contato)
siteBiblioteca  -> entry.557521567    (Site da biblioteca)
observacoes     -> entry.1028306553   (Observações)
tipoResposta    -> entry.1899481608   (Atualização ou Nova Instituição? — candidata a ser REMOVIDA, ver seção 7)
autorizaEmail   -> entry.462619758    (Autoriza compartilhar seu e-mail?)
```

Estado das perguntas:
- "Sua instituição é": já alfabetizada manualmente (Autarquia, Comunitária, Filantrópica, Privada, Pública). Google Forms **não tem** função nativa de ordenar opções alfabeticamente (só "Ordenar as opções aleatoriamente" = randomizar) — qualquer alfabetização futura tem que ser feita editando cada opção manualmente.
- "Estado": já alfabetizada nativamente, ok.
- "Bibliotecas Digitais assinadas": alfabetização completa **não foi 100% reverificada** até o fim da lista de 71 itens.
- "Autoriza compartilhar seu e-mail?": está Sim/Não, **pendente** reordenar para Não/Sim.

Detalhe de robustez: o formulário foi criado a partir de uma versão ASCII (sem acentos) do script porque a colagem do Pedro do arquivo original acentuado gerou `SyntaxError` (corrupção de encoding do clipboard/app usado, não bug do script). Mesmo assim o formulário publicado ficou com acentuação correta em tudo que foi verificado.

Existe também um Google Form em branco criado por engano (navegação inicial `forms.new`) ainda no Drive do Pedro — pode ser apagado a qualquer momento, não é tarefa pendente.

## 6. Qualidade de dados

Duas camadas: (1) alias CSVs aplicados automaticamente no `app.py`; (2) `detectar_duplicatas.py` para achar candidatos novos, com limiar de similaridade 0.90 (ajustado de 0.82 por gerar falsos positivos com nomes de universidades brasileiras templadas). Ver `LEIA-ME.md` seção "Tratamento de qualidade dos dados" para detalhes completos.

## 7. TAREFA ATIVA — ainda não implementada

Pedro pediu, e depois confirmou querer receber como **script pronto para colar** (não via automação de navegador):

> "consegue fazer o script ajustar o formulário (questão instituição) adicionando as opções existentes no formulário e, caso a instituição já exista, adicionar opção para a pessoa apenas informar o email e caso o email seja o mesmo do cadastro anterior, enviar link para atualização dos dados, daí não precisamos da questão sobre nova instituição ou complementação dos dados."

Desenho planejado (não escrito ainda):

1. Converter "Nome da sua Instituição" (hoje texto livre) em **lista suspensa**, populada com os nomes de instituição já existentes, mais uma opção final "Minha instituição não está nessa lista (nova instituição)".
2. Usar o branching nativo do Forms ("Ir para a seção com base na resposta") nessa pergunta:
   - Instituição já existente → seção curta "Atualizar dados" só com e-mail de contato.
   - "Nova instituição" → seção com todas as perguntas completas.
   - Isso elimina a pergunta "Atualização ou Nova Instituição?" (`entry.1899481608`), que pode ser removida.
3. Instalar um trigger `onFormSubmit` (Apps Script na planilha de respostas) que, ao detectar submissão da seção curta, compara o e-mail informado com o e-mail salvo na última resposta daquela instituição:
   - Se bater → monta o link pré-preenchido (reaproveitando a lógica de `gerar_links_atualizacao.gs`) e **envia por e-mail automaticamente** via `MailApp`/`GmailApp` — diferente do fluxo atual, que só gera links sob demanda via menu manual.
   - Se não bater → comportamento ainda em aberto (enviar mesmo assim, já que os dados não são sensíveis, ou avisar Pedro para revisão manual). **Perguntar a Pedro qual prefere antes de implementar essa parte.**

Limitações técnicas a considerar:
- Branching do Forms só funciona com perguntas de múltipla escolha/lista, não texto livre — daí a conversão obrigatória para lista suspensa.
- A lista de instituições da pergunta precisa ficar sincronizada conforme novas instituições se cadastram.
- Envio automático de e-mail exige autorização de trigger instalável (uma vez, aprovação do Pedro).

Não existe ainda nenhum arquivo `.gs` para isso — precisa ser escrito do zero, provavelmente estendendo `gerar_links_atualizacao.gs`.

## 8. Outras pendências menores

- Reordenar "Autoriza compartilhar seu e-mail?" para Não/Sim (alfabético).
- Reverificar do início ao fim se as 71 opções de "Bibliotecas Digitais assinadas" estão em ordem alfabética.
- Confirmar o nome real da aba de respostas (`NOME_ABA_RESPOSTAS` em `gerar_links_atualizacao.gs` está com o placeholder `"Respostas ao formulário 1"`) assim que a planilha de respostas existir.
- Instalar e testar `gerar_links_atualizacao.gs` na planilha de respostas real (ainda não confirmado que Pedro criou a planilha nem rodou esse script).
- Apagar o formulário em branco criado por engano (opcional, não urgente).
- Depois que houver respostas reais: trocar `DATA_SOURCE` em `app.py` para a URL de export CSV da Google Sheet publicada.

## 9. Lições operacionais importantes

- **Automação de navegador no editor do Google Apps Script (Monaco) é pouco confiável** nesse tipo de ambiente sandboxed: colagem grande "parece" funcionar mas não salva de fato; botões ficam inertes; "Mudanças não salvas" persiste mesmo após salvar. Depois de várias tentativas frustradas, a abordagem que funcionou foi **entregar o código completo em bloco de texto para o próprio usuário colar e rodar**. Automação de navegador funcionou bem para outras partes do Forms (cliques diretos, edição de texto de opções).
- Se o texto tiver acentos, colar de certos apps/clipboards pode corromper o encoding (já causou um `SyntaxError`) — nesse caso, oferecer uma versão ASCII sem acentos como alternativa (os acentos podem ser reintroduzidos depois direto na interface do Google Forms).
- Sandbox de desenvolvimento bloqueia fetch de domínios arbitrários (ex.: `raw.githubusercontent.com`) — por isso o GeoJSON do mapa é buscado em tempo de execução pelo próprio `app.py` (`requests.get`, com fallback de gráfico de barras), e não embutido no código.

## 10. Próximo passo recomendado

Escrever o Apps Script descrito na seção 7 (redesenho do formulário + branching + trigger de e-mail automático), entregando como bloco de código para Pedro colar — não tentar automação de navegador no editor do Apps Script. Antes de escrever, decidir/perguntar a Pedro o comportamento de fallback quando o e-mail não bate com o cadastro anterior.
