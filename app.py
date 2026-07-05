"""
Painel Nacional de Bibliotecas Digitais — protótipo em Streamlit
=================================================================

Este app lê os dados de uma fonte tabular simples (hoje um CSV local, para o
protótipo) e desenha os mesmos indicadores do painel Power BI atual: total de
instituições, total de assinaturas, ranking de bibliotecas digitais,
distribuição por tipo de IES, mapa por estado e tabela filtrável.

Para colocar em produção (dados reais, atualizados pelo formulário):
1. Troque DATA_SOURCE abaixo pelo link de exportação CSV de uma Google Sheet
   publicada (Arquivo > Compartilhar > Publicar na Web > CSV) que recebe as
   respostas de um Google Forms. Não é necessário mudar mais nada no código
   sempre que o formulário receber uma resposta nova — o app relê a planilha
   a cada acesso.
2. Publique este repositório no GitHub (pode ser público) e implante em
   share.streamlit.io (Streamlit Community Cloud), gratuito.

Qualidade dos dados
--------------------
O app aplica automaticamente, a cada carregamento, duas listas de "apelidos"
(aliases_bibliotecas.csv e aliases_instituicoes.csv) para unificar grafias
diferentes do mesmo nome (ex.: "Jstor" e "JSTOR"). Essas listas são CSVs
simples de duas colunas (variante, nome_padrao) — Pedro pode editá-las direto
numa planilha, sem tocar em código, sempre que perceber uma duplicidade nova.
O script `detectar_duplicatas.py` (rodado separadamente, de vez em quando)
ajuda a encontrar candidatas a duplicata que ainda não estão nessas listas.
"""

import pandas as pd
import plotly.express as px
import requests
import streamlit as st

# ---------------------------------------------------------------------------
# Configuração da fonte de dados
# ---------------------------------------------------------------------------
# Protótipo: CSV local extraído da planilha atual (dados reais, snapshot de
# 2026-06-17). Em produção, troque pela URL de export CSV do Google Sheets:
#   DATA_SOURCE = "https://docs.google.com/spreadsheets/d/SEU_ID/export?format=csv"
DATA_SOURCE = "bibliotecas_digitais_dados.csv"

# Dicionários de padronização (edite estes CSVs para corrigir grafias —
# não é preciso mexer neste arquivo .py). Podem ser locais ou, em produção,
# também apontar para um link CSV publicado de uma aba do Google Sheets.
ALIASES_BIBLIOTECAS = "aliases_bibliotecas.csv"
ALIASES_INSTITUICOES = "aliases_instituicoes.csv"

GEOJSON_URL = (
    "https://raw.githubusercontent.com/giuliano-macedo/geodata-br-states/"
    "main/geojson/br_states.json"
)

st.set_page_config(
    page_title="Painel Nacional de Bibliotecas Digitais",
    page_icon="📚",
    layout="wide",
)


@st.cache_data(ttl=600)
def load_aliases(path: str) -> dict:
    """Lê um CSV de duas colunas (variante, nome_padrao) e devolve um dicionário
    de busca case-insensitive. Se o arquivo não existir, devolve vazio —
    o app funciona normalmente, só sem essa camada extra de padronização."""
    try:
        tabela = pd.read_csv(path)
        return {
            str(v).strip().lower(): str(p).strip()
            for v, p in zip(tabela["variante"], tabela["nome_padrao"])
        }
    except FileNotFoundError:
        return {}


@st.cache_data(ttl=600)
def load_data(source: str) -> pd.DataFrame:
    df = pd.read_csv(source)
    df["instituicao"] = df["instituicao"].str.strip()
    df["biblioteca_digital"] = df["biblioteca_digital"].str.strip()
    df["tipo_ies"] = (
        df["tipo_ies"].fillna("Não informado").str.strip().str.lower().str.capitalize()
    )

    lib_aliases = load_aliases(ALIASES_BIBLIOTECAS)
    inst_aliases = load_aliases(ALIASES_INSTITUICOES)
    df["biblioteca_digital"] = df["biblioteca_digital"].apply(
        lambda v: lib_aliases.get(v.lower(), v)
    )
    df["instituicao"] = df["instituicao"].apply(
        lambda v: inst_aliases.get(v.lower(), v)
    )
    return df


@st.cache_data(ttl=3600)
def load_geojson(url: str):
    try:
        resp = requests.get(url, timeout=8)
        resp.raise_for_status()
        return resp.json(), None
    except Exception as exc:  # noqa: BLE001 — queremos qualquer falha de rede aqui
        return None, str(exc)


df = load_data(DATA_SOURCE)

# ---------------------------------------------------------------------------
# Cabeçalho
# ---------------------------------------------------------------------------
st.title("📚 Painel Nacional de Bibliotecas Digitais")
st.caption(
    "Protótipo — mesmos indicadores do painel atual, lendo dados de uma "
    "planilha e sem etapa manual de republicação."
)

# ---------------------------------------------------------------------------
# Filtros (sidebar)
# ---------------------------------------------------------------------------
st.sidebar.header("Filtros")

tipos_disponiveis = sorted(df["tipo_ies"].unique())
tipo_sel = st.sidebar.multiselect(
    "Tipo de IES", tipos_disponiveis, default=tipos_disponiveis
)

libs_disponiveis = sorted(df["biblioteca_digital"].unique())
lib_sel = st.sidebar.multiselect("Biblioteca Digital", libs_disponiveis, default=[])

estados_disponiveis = sorted(df["estado"].dropna().unique())
estado_sel = st.sidebar.multiselect("Estado", estados_disponiveis, default=[])

filtrado = df[df["tipo_ies"].isin(tipo_sel)]
if lib_sel:
    filtrado = filtrado[filtrado["biblioteca_digital"].isin(lib_sel)]
if estado_sel:
    filtrado = filtrado[filtrado["estado"].isin(estado_sel)]

if filtrado.empty:
    st.warning("Nenhum dado para os filtros selecionados.")
    st.stop()

# ---------------------------------------------------------------------------
# KPIs
# ---------------------------------------------------------------------------
col1, col2, col3 = st.columns(3)
col1.metric("Total de instituições", filtrado["instituicao"].nunique())
col2.metric("Total de assinaturas", len(filtrado))
col3.metric("Bibliotecas digitais distintas", filtrado["biblioteca_digital"].nunique())

st.divider()

# ---------------------------------------------------------------------------
# Ranking de bibliotecas + distribuição por tipo de IES
# ---------------------------------------------------------------------------
col_esq, col_dir = st.columns([2, 1])

with col_esq:
    st.subheader("Total de assinantes por biblioteca digital")
    ranking = (
        filtrado.groupby("biblioteca_digital")["instituicao"]
        .nunique()
        .sort_values(ascending=True)
        .reset_index(name="assinantes")
    )
    fig_ranking = px.bar(
        ranking,
        x="assinantes",
        y="biblioteca_digital",
        orientation="h",
        text="assinantes",
        height=max(400, 20 * len(ranking)),
    )
    fig_ranking.update_layout(
        yaxis_title="", xaxis_title="Instituições assinantes", margin=dict(l=10, r=10, t=10, b=10)
    )
    st.plotly_chart(fig_ranking, use_container_width=True)

with col_dir:
    st.subheader("Por tipo de IES")
    tipo_counts = (
        filtrado.groupby("tipo_ies")["instituicao"]
        .nunique()
        .reset_index(name="instituicoes")
    )
    fig_tipo = px.bar(tipo_counts, x="tipo_ies", y="instituicoes", text="instituicoes")
    fig_tipo.update_layout(xaxis_title="", yaxis_title="", margin=dict(l=10, r=10, t=10, b=10))
    st.plotly_chart(fig_tipo, use_container_width=True)

st.divider()

# ---------------------------------------------------------------------------
# Mapa por estado
# ---------------------------------------------------------------------------
st.subheader("Assinaturas por estado")

por_estado = (
    filtrado.groupby(["estado", "uf"])["instituicao"]
    .nunique()
    .reset_index(name="instituicoes")
)

geojson, geo_error = load_geojson(GEOJSON_URL)

if geojson is not None:
    fig_mapa = px.choropleth(
        por_estado,
        geojson=geojson,
        locations="uf",
        featureidkey="properties.SIGLA",
        color="instituicoes",
        c