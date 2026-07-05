"""
Detector de possiveis duplicatas -- instituicoes e bibliotecas digitais
========================================================================

Nao e parte do painel (o painel nao precisa disso para funcionar). E uma
ferramenta de qualidade de dados para rodar de vez em quando (ex.: uma vez
por mes, ou sempre que perceber numeros estranhos no painel) e manter os
dois arquivos de "apelidos" (aliases_bibliotecas.csv e
aliases_instituicoes.csv) sempre atualizados.

O que ele faz: compara todos os nomes distintos de uma coluna entre si e
sinaliza pares muito parecidos (ex.: "Jstor" vs "JSTOR", ou uma instituicao
digitada com espaco a mais) que AINDA NAO estao cobertos por um alias
existente. Isso nao decide sozinho -- so aponta candidatos para voce revisar.

Uso:
    python detectar_duplicatas.py

Saida:
    revisar_duplicatas.csv -- lista de pares suspeitos, ordenados do mais
    parecido para o menos parecido, com uma coluna de "similaridade" (0 a 1).

Depois de revisar, quem for de fato duplicata vira uma linha nova em
aliases_bibliotecas.csv ou aliases_instituicoes.csv (variante, nome_padrao).
Nao precisa mexer neste script nem no app.py para isso.
"""

from difflib import SequenceMatcher
import csv

DADOS = "bibliotecas_digitais_dados.csv"
ALIASES_BIBLIOTECAS = "aliases_bibliotecas.csv"
ALIASES_INSTITUICOES = "aliases_instituicoes.csv"

LIMIAR_SIMILARIDADE = 0.90  # 0 a 1 -- mais alto = so pega pares muito parecidos
# Nota: nomes de instituicao em portugues tem muitos "templates" repetidos
# (ex.: "Universidade Federal de/do <estado>"), o que gera falsos positivos
# mesmo em limiares altos. Isso e esperado -- e por isso que a lista e para
# revisao humana, nao para aplicacao automatica.


def carregar_aliases(caminho):
    try:
        with open(caminho, encoding="utf-8") as f:
            return {row["variante"].strip().lower() for row in csv.DictReader(f)}
    except FileNotFoundError:
        return set()


def carregar_valores_distintos(caminho, coluna):
    with open(caminho, encoding="utf-8") as f:
        return sorted({row[coluna].strip() for row in csv.DictReader(f) if row[coluna].strip()})


def similaridade(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def encontrar_suspeitos(valores, ja_conhecidos):
    suspeitos = []
    for i in range(len(valores)):
        for j in range(i + 1, len(valores)):
            a, b = valores[i], valores[j]
            if a.lower() == b.lower():
                continue
            if a.lower() in ja_conhecidos or b.lower() in ja_conhecidos:
                continue
            sim = similaridade(a, b)
            if sim >= LIMIAR_SIMILARIDADE:
                suspeitos.append((sim, a, b))
    return sorted(suspeitos, key=lambda x: -x[0])


def main():
    bibliotecas = carregar_valores_distintos(DADOS, "biblioteca_digital")
    instituicoes = carregar_valores_distintos(DADOS, "instituicao")

    aliases_bib = carregar_aliases(ALIASES_BIBLIOTECAS)
    aliases_inst = carregar_aliases(ALIASES_INSTITUICOES)

    suspeitos_bib = encontrar_suspeitos(bibliotecas, aliases_bib)
    suspeitos_inst = encontrar_suspeitos(instituicoes, aliases_inst)

    with open("revisar_duplicatas.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["tipo", "similaridade", "valor_1", "valor_2"])
        for sim, a, b in suspeitos_bib:
            w.writerow(["biblioteca_digital", "%.2f" % sim, a, b])
        for sim, a, b in suspeitos_inst:
            w.writerow(["instituicao", "%.2f" % sim, a, b])

    total = len(suspeitos_bib) + len(suspeitos_inst)
    print(str(len(bibliotecas)) + " bibliotecas distintas, " + str(len(instituicoes)) + " instituicoes distintas na base.")
    print(str(total) + " pares suspeitos encontrados -> revisar_duplicatas.csv")
    print("Revise o arquivo e copie os que forem duplicata de fato para os CSVs de alias.")


if __name__ == "__main__":
    main()
