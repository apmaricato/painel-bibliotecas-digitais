# Painel Nacional de Bibliotecas Digitais — protótipo Streamlit

Protótipo funcional com dados reais (snapshot de 17/06/2026: 175 instituições, 634 assinaturas, 82 bibliotecas digitais distintas), reproduzindo os indicadores do painel Power BI atual: KPIs, ranking de bibliotecas, distribuição por tipo de IES, mapa por estado e tabela filtrável.

## Arquivos

- `app.py` — o painel (Streamlit + Plotly).
- `bibliotecas_digitais_dados.csv` — dados de exemplo, extraídos e limpos da planilha mais recente que você enviou.
- `requirements.txt` — dependências.

## Rodar localmente (opcional, para você testar antes de publicar)

```bash
pip install -r requirements.txt
streamlit run app.py
```

Abre automaticamente em `http://localhost:8501`.

## Publicar de graça (Streamlit Community Cloud)

1. Crie um repositório no GitHub (pode ser público) com estes 3 arquivos.
2. Acesse [share.streamlit.io](https://share.streamlit.io), conecte sua conta GitHub e aponte para o repositório e o arquivo `app.py`.
3. Streamlit publica automaticamente e te dá uma URL tipo `seu-app.streamlit.app`.
4. Toda vez que você atualizar os dados (ver abaixo), o painel reflete a mudança sozinho — não é preciso reimplantar nada.

## Como ligar à coleta de dados real (a parte que falta)

Hoje o app lê `bibliotecas_digitais_dados.csv`, um arquivo estático, só para demonstração. Para produção:

1. Crie um Google Forms com as mesmas perguntas do formulário atual.
2. As respostas caem automaticamente numa Google Sheet (isso é nativo do Forms, sem configurar nada).
3. Nessa planilha: **Arquivo → Compartilhar → Publicar na Web → CSV**. Isso gera um link público de exportação em CSV que se atualiza sozinho a cada resposta nova.
4. No `app.py`, troque a linha:
   ```python
   DATA_SOURCE = "bibliotecas_digitais_dados.csv"
   ```
   por:
   ```python
   DATA_SOURCE = "https://docs.google.com/spreadsheets/d/SEU_ID/export?format=csv"
   ```
5. Pronto — nenhuma outra mudança de código é necessária depois disso. Cada nova resposta do formulário aparece no painel automaticamente (o app relê a planilha a cada acesso, com cache de 10 minutos).

## Sobre o mapa por estado

O mapa usa um contorno geográfico (GeoJSON) dos estados brasileiros, baixado da internet em tempo real (`requests.get`, com cache de 1 hora). Isso funciona normalmente assim que o app estiver publicado (Streamlit Community Cloud tem acesso normal à internet). Se por algum motivo o carregamento do mapa falhar, o app mostra automaticamente um ranking de instituições por estado em formato de barras, para nunca quebrar a página.

## Tratamento de qualidade dos dados

O `bibliotecas_digitais_dados.csv` deste protótipo tem os dados **crus** (sem correção manual) — de propósito, para o pipeline abaixo mostrar o problema real: 86 grafias distintas de biblioteca digital e 176 de instituição, quando o número real de bibliotecas/instituições é menor (nomes duplicados por causa de variação de digitação).

A correção