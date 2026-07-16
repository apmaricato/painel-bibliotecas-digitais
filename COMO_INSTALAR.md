# 🚀 Guia de Instalação — Painel Nacional de Bibliotecas Digitais

Este guia cobre todos os passos manuais necessários para colocar o projeto em produção.
Tempo estimado total: **30–40 minutos** (na primeira vez).

---

## Parte 1 — Apps Script na Planilha Google Sheets

### Pré-requisito
Você precisa ter acesso de edição à planilha  
`Painel Nacional de Bibliotecas Digitais - Assinatura Bibliotecas Digitais - Pesquisa.xlsx`  
Abra-a no Google Drive (se ainda estiver em formato `.xlsx`, o Google converte automaticamente ao abrir).

---

### Passo 1 — Verificar nomes das abas

Antes de instalar o script, confirme que sua planilha tem uma aba chamada **`Respostas do formulário 1`** com as respostas brutas do formulário.

> O script cria automaticamente as abas `Aliases Bibliotecas`, `Aliases Instituições`, `Dados Limpos` e `Log Limpeza` se elas não existirem.

---

### Passo 2 — Abrir o editor de script

1. Com a planilha aberta no Google, clique em **Extensões** (menu superior)
2. Clique em **Apps Script**
3. Uma nova aba abre com o editor de código

---

### Passo 3 — Colar o script

1. Selecione **todo o conteúdo** que já está na tela do editor (`Ctrl+A`)
2. Delete
3. Abra o arquivo `limpeza_dados.gs` (está na pasta do projeto)
4. Copie todo o conteúdo (`Ctrl+A` → `Ctrl+C`)
5. Cole no editor do Apps Script (`Ctrl+V`)
6. Clique no ícone de **disquete 💾** (ou `Ctrl+S`) para salvar
7. Dê um nome ao projeto quando solicitado, ex: **`Painel BD — Limpeza`**

---

### Passo 4 — Testar a limpeza manualmente

1. Feche a aba do Apps Script
2. **Recarregue a planilha** (F5 ou feche e abra de novo)
3. Um novo menu **🔄 Painel BD** aparecerá na barra de menus
4. Clique em **🔄 Painel BD → ▶ Rodar limpeza agora**
5. O Google pedirá autorização na primeira vez — clique em **Permitir**
   > ⚠️ O Google pode exibir um aviso "Este app não foi verificado". Clique em **Avançado → Ir para Painel BD (não seguro)**. Isso é normal para scripts próprios.
6. Aguarde o alerta de conclusão com os números
7. Verifique a aba **`Dados Limpos`** — ela deve ter aparecido com os dados processados

---

### Passo 5 — Configurar os triggers automáticos (faça UMA ÚNICA VEZ)

1. Clique em **🔄 Painel BD → ⚙️ Configurar triggers automáticos**
2. O Google pode pedir autorização novamente — permita
3. Um alerta confirmará:
   - ✅ Trigger de **on form submit** (roda a cada nova resposta)
   - ✅ Trigger **semanal** (todo domingo às 2h — para reprocessar quando aliases forem atualizados)

> Para verificar: Extensões → Apps Script → ícone ⏰ na barra lateral esquerda

---

### Passo 6 — Popular as abas de aliases

Após rodar a limpeza, as abas `Aliases Bibliotecas` e `Aliases Instituições` terão sido criadas automaticamente com cabeçalho.

**Copie os dados dos CSVs** do projeto para essas abas:

#### Aliases Bibliotecas (`aliases_bibliotecas.csv`):
| variante | nome_padrao |
|----------|-------------|
| dynamed | DynaMed |
| jstor | JSTOR |
| economatica | Economática |
| economática | Economática |
| uptodate | UpToDate |
| springer | Springer Link |
| e-livros | E-livro |
| naxos | Naxos Music Library |
| wiley | Wiley Online Library |
| cengage | BD Cengage |
| ebsco ebook collection | EBSCO eBooks |
| jstor e-books | JSTOR e-Books |

#### Aliases Instituições (`aliases_instituicoes.csv`):
| variante | nome_padrao |
|----------|-------------|
| fundação universidade regional de blumenau | Fundação Universidade Regional de Blumenau (FURB) |

> Dica: você pode copiar direto dos CSVs no Excel e colar na aba do Google Sheets. Para adicionar novos aliases no futuro, basta inserir uma nova linha nessas abas — **sem tocar no código**.

---

## Parte 2 — Looker Studio

### Passo 1 — Criar o relatório

1. Acesse [lookerstudio.google.com](https://lookerstudio.google.com)
2. Clique em **+ Criar → Relatório**
3. Em "Selecionar conector", escolha **Google Sheets**
4. Selecione sua planilha e a aba **`Dados Limpos`**
5. Clique em **Adicionar** e **Adicionar ao relatório**

---

### Passo 2 — Configurar o campo geográfico (UF)

Para que o mapa do Brasil funcione:

1. No menu superior, clique em **Recurso → Gerenciar fontes de dados**
2. Clique no lápis ✏️ ao lado da sua fonte
3. Encontre o campo **`uf`**
4. Na coluna **Tipo**, clique e mude para:  
   **Geo → Subdivisão do país (1º nível)**
5. Certifique-se de que o **Prefixo geográfico** está definido como **Brazil (BR)**
6. Salve e feche

---

### Passo 3 — Montar os visuais

Adicione os seguintes componentes (menu **Adicionar um gráfico**):

| Visual | Tipo no Looker Studio | Configuração |
|--------|----------------------|--------------|
| Total de instituições | Scorecard | Métrica: `instituicao` → Contagem distinta |
| Total de assinaturas | Scorecard | Métrica: `biblioteca_digital` → Contagem |
| Bibliotecas distintas | Scorecard | Métrica: `biblioteca_digital` → Contagem distinta |
| Ranking de bibliotecas | Gráfico de barras | Dimensão: `biblioteca_digital` · Métrica: `instituicao` Contagem distinta |
| Por tipo de IES | Gráfico de barras | Dimensão: `tipo_ies` · Métrica: `instituicao` Contagem distinta |
| Mapa do Brasil | Mapa preenchido | Dimensão: `uf` · Métrica: `instituicao` Contagem distinta |
| Tabela completa | Tabela | Dimensões: todas · com barra de pesquisa |

---

### Passo 4 — Adicionar filtros

Em **Adicionar um controle → Lista suspensa**:
- Filtro por `tipo_ies`
- Filtro por `estado`
- Filtro por `biblioteca_digital`

---

### Passo 5 — Publicar

1. Clique em **Arquivo → Compartilhar → Gerenciar acesso**
2. Mude para **Qualquer pessoa com o link pode visualizar**
3. Copie o link gerado
4. Este é o link que vai na landing page (`index.html`)

---

## Parte 3 — GitHub Pages (landing page)

### Passo 1 — Criar repositório

1. Acesse [github.com](https://github.com) e faça login
2. Clique em **+ → New repository**
3. Nome sugerido: `painel-bibliotecas-digitais`
4. Marque **Public**
5. Clique em **Create repository**

---

### Passo 2 — Atualizar os placeholders no index.html

Antes de publicar, edite o arquivo `index.html` e substitua:

```
COLE_AQUI_O_LINK_DO_LOOKER_STUDIO  →  URL do Looker Studio (Parte 2, Passo 5)
COLE_AQUI_O_LINK_DO_FORMULARIO     →  URL do Google Forms original
COLE_AQUI_O_EMAIL_DE_CONTATO       →  email institucional de contato
```

---

### Passo 3 — Publicar os arquivos

**Opção A — Via interface web (mais simples):**
1. No repositório criado, clique em **Add file → Upload files**
2. Arraste o arquivo `index.html`
3. Clique em **Commit changes**

**Opção B — Via Git (se tiver instalado):**
```bash
git init
git add index.html
git commit -m "Primeiro commit — landing page"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/painel-bibliotecas-digitais.git
git push -u origin main
```

---

### Passo 4 — Ativar GitHub Pages

1. No repositório, clique em **Settings**
2. Role até a seção **Pages** (menu lateral esquerdo)
3. Em **Source**, selecione: **Deploy from a branch → main → / (root)**
4. Clique em **Save**
5. Após 1–2 minutos, sua landing page estará em:  
   `https://SEU_USUARIO.github.io/painel-bibliotecas-digitais/`

---

## ✅ Checklist Final

- [ ] Aba `Dados Limpos` gerada com dados corretos
- [ ] Aliases populados nas abas da planilha
- [ ] Triggers configurados (verificar no Apps Script → ⏰)
- [ ] Looker Studio criado e publicado como público
- [ ] Placeholders da landing page substituídos
- [ ] Landing page publicada no GitHub Pages
- [ ] Link do Looker Studio encurtado (ex: bit.ly) para divulgação

---

## 🆘 Problemas comuns

**"Aba não encontrada"**  
→ Verifique se o nome da aba está exatamente `Respostas do formulário 1`. Ajuste a constante `ABA_RESPOSTAS` no topo do script se necessário.

**Mapa do Brasil não aparece no Looker Studio**  
→ Confirme que o campo `uf` está com tipo `Geo → Subdivisão do país (1º nível)` e prefixo `BR`.

**Script roda mas `Dados Limpos` fica vazio**  
→ Abra o Apps Script → menu Execuções (ícone ▶) para ver erros. Provavelmente é o índice de coluna errado — confira se sua aba `Respostas do formulário 1` tem as colunas na ordem documentada no script.
