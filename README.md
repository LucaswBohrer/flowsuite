# FlowSuite — React + TypeScript + Vite

Sistema inspirado no fluxo de trabalho do E2PS Suite, com
implementação 100% própria: abre o fluxograma draw.io e deriva
o resto (tabela, elétrica, BOM, etiquetas e geração TIA).

O arquivo do fluxograma é processado todo no navegador (pako para
descomprimir o draw.io) — nada sai da sua máquina. A demonstração
que vem no app (E2DEMO) usa dados fictícios; nenhum arquivo real
de projeto vai para o repositório nem para o deploy.

## Rodar no seu Windows (recomendado)

Pré-requisito: Node.js 20+ instalado.

```powershell
cd flowsuite-web
npm install
npm run dev
```

Abra http://localhost:5173 no Chrome/Edge, clique em
"Abrir .xml / .drawio" ou arraste seu arquivo .xml para a janela.

## Abrir sem servidor (arquivo único)

```powershell
npm run build
```

Isso gera `dist/index.html` — UM arquivo só, com todo o JS/CSS
embutido. Abra esse arquivo direto no Chrome/Edge. Não abra o app
pelo visualizador de anexo do Muse: ele não executa a aplicação
completa (é por isso que o XML "não abria" antes).

## O que tem

- Diagram: páginas do fluxograma com posições reais, zoom, busca e clique
- Table View: filtros, ordenação e exportação CSV
- Electrical: painéis + Unlinked Components
- BOM: agregada por produto, com exportação CSV
- Automation: **TIA Portal Generation** — UDTs por equipamento,
  DBs por instância, FBs de comando/status e blocos de endereço SCL,
  com COPY CODE e download (tia_datatypes.udt, tia_databases.db,
  tia_logic.scl, tia_address.scl)
- Automation, seção 0: **Mapeamento ASi** — suba o XLSX exportado
  do ASi e o sistema aplica o mapeamento antes de gerar o TIA:
  - **PLC Tags** (formato dos prints: tag path + master
    ASi-MASTER-EP… + tipo + endereço %I/%Q + módulo IO): cada
    sinal casa com o componente do diagrama por tipo + tag +
    painel, com vencedor único. Sinais sem correspondência e
    módulos IO divergentes do diagrama são listados como
    auditoria, não descartados em silêncio.
  - **Tabela simples** (tag / endereço ASi / slave / módulo /
    painel): detecção automática de colunas + ajuste manual.
- Labels: etiquetas imprimíveis

## Por que o XML não abriu na versão anterior

A versão estática dependia de `DecompressionStream`, uma API que
nem todo visualizador/navegador expõe, e qualquer falha ficava só
no console. Esta versão usa pako embutido e mostra qualquer erro
em vermelho no topo da tela, em vez de ficar em silêncio.

## Limites honestos

- O diagrama é uma renderização simplificada (posições reais), não
  o renderizador completo do draw.io.
- A geração TIA é própria, no formato visível nos prints. O ID é
  sequencial por equipamento e o tipo (MAN/SWITCH/ANALOG/PID/AUTO)
  é inferido dos prints — o mapeamento interno exato do original
  não está no XML.
- SharePoint ainda não está conectado (upload é arquivo local).
