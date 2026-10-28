import { useMemo, useRef, useState } from 'react';
import DiagramView from './components/DiagramView';
import TableView from './components/TableView';
import ElectricalView from './components/ElectricalView';
import BomView from './components/BomView';
import AutomationView from './components/AutomationView';
import LabelsView from './components/LabelsView';
import { buildParsedFlow, parseMxFile } from './parser';
import { DEMO_PAGES } from './demoData';
import type { ParsedFlow } from './types';
import './App.css';

type Tab = 'diagram' | 'table' | 'electrical' | 'bom' | 'automation' | 'labels';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'diagram', label: 'Diagram' },
  { id: 'table', label: 'Table View' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'bom', label: 'BOM' },
  { id: 'automation', label: 'Automation' },
  { id: 'labels', label: 'Labels' },
];

export default function App() {
  const [parsed, setParsed] = useState<ParsedFlow | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('diagram');
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    if (!parsed) return [];
    const linked = parsed.components.filter((c) => c.electricalPanel).length;
    const bomLines = new Set(parsed.components.map((c) => (c.productId ? `${c.productId}|${c.productDesc}` : 'SEM CADASTRO'))).size;
    return [
      ['Páginas', parsed.pages.length],
      ['Componentes', parsed.components.length],
      ['Painéis', parsed.panels.length],
      ['Linkados', linked],
      ['Não linkados', parsed.components.length - linked],
      ['Módulos (automação)', parsed.modules.length],
      ['Linhas de BOM', bomLines],
    ] as const;
  }, [parsed]);

  async function handleFile(file: File) {
    setLoading(true);
    setError('');
    setWarning('');
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error('O arquivo está vazio.');
      const result = parseMxFile(text);
      setParsed(result);
      setFileName(file.name);
      setTab('diagram');
      if (result.errors.length > 0) {
        setWarning(`Arquivo aberto, mas ${result.errors.length} página(s) falharam: ${result.errors.join(' ')}`);
      }
    } catch (e) {
      // Erro VISÍVEL, nunca silêncio: na versão anterior uma falha
      // de decodificação só aparecia no console e parecia que
      // "não abriu o xml".
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function loadDemo() {
    setParsed(buildParsedFlow(DEMO_PAGES));
    setFileName('Demonstração: E2DEMO (dados fictícios, 8 componentes)');
    setError('');
    setWarning('');
    setTab('diagram');
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
    >
      <header>
        <button className="hamburger" onClick={() => setMenuOpen((o) => !o)} aria-label="Abrir menu">☰</button>
        <h1>Flow<span>Suite</span> <small>— fluxograma → tabela, elétrica, BOM, automação e etiquetas</small></h1>
        <div className="filebox">
          <span className="filename">{fileName || 'Nenhum arquivo carregado'}</span>
          <button onClick={() => inputRef.current?.click()} disabled={loading}>{loading ? 'Lendo...' : 'Abrir .xml / .drawio'}</button>
          <button className="secondary" onClick={loadDemo}>Usar demonstração (E2DEMO — fictícia)</button>
          <input ref={inputRef} type="file" accept=".xml,.drawio" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
        </div>
      </header>

      {dragOver && <div className="dropzone">Solte o arquivo .xml / .drawio aqui</div>}
      {error && <div className="banner error">⚠️ Não consegui abrir o arquivo: {error}</div>}
      {warning && <div className="banner warn">⚠️ {warning}</div>}

      <div className="layout">
        <aside className={menuOpen ? 'open' : ''}>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); setMenuOpen(false); }}>{t.label}</button>
          ))}
          <div className="hint">
            O diagrama é a fonte de verdade. Painel, endereço e produto vêm dos atributos do próprio arquivo draw.io — nada é digitado duas vezes.
            <br /><br />
            Implementação original, em React + TypeScript. O arquivo é processado todo no navegador: nada sai da sua máquina.
          </div>
          <a className="extlink" href="https://app.diagrams.net/" target="_blank" rel="noopener noreferrer">Abrir no diagrams.net ↗</a>
        </aside>

        <main>
          {parsed ? (
            <>
              <div className="cards">
                {stats.map(([label, value]) => <div key={label} className="card"><b>{value}</b><span>{label}</span></div>)}
              </div>
              {tab === 'diagram' && <DiagramView key={fileName} pages={parsed.pages} components={parsed.components} />}
              {tab === 'table' && <TableView components={parsed.components} />}
              {tab === 'electrical' && <ElectricalView panels={parsed.panels} components={parsed.components} />}
              {tab === 'bom' && <BomView components={parsed.components} />}
              {tab === 'automation' && <AutomationView pages={parsed.pages} modules={parsed.modules} />}
              {tab === 'labels' && <LabelsView components={parsed.components} />}
            </>
          ) : (
            <div className="panel welcome">
              <h2>Comece abrindo um fluxograma</h2>
              <p>
                Clique em <b>Abrir .xml / .drawio</b> no topo, ou arraste o arquivo para esta janela.
                Funciona com o arquivo do draw.io direto — o mesmo formato do arquivo .xml do draw.io.
              </p>
              <p className="muted">
                Por que a versão anterior não abriu? Ela dependia de uma API do navegador (DecompressionStream) que nem todo
                visualizador expõe, e qualquer falha ficava só no console. Esta versão usa uma biblioteca de descompressão
                embutida (pako) e mostra qualquer erro em vermelho aqui em cima, em vez de ficar em silêncio.
              </p>
              <div className="row">
                <button onClick={() => inputRef.current?.click()}>Abrir arquivo...</button>
                <button className="secondary" onClick={loadDemo}>Ver demonstração (E2DEMO — fictícia)</button>
              </div>
              <p className="muted">Sem arquivo? A demonstração já vem com 8 componentes fictícios (E2DEMO). Seu arquivo real é carregado só no seu navegador, nunca enviado a um servidor.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
