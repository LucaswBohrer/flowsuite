import { useMemo, useState } from 'react';
import type { FlowComponent, FlowPage } from '../types';
import { symbolFromStyle } from '../utils';

export default function DiagramView({ pages, components }: { pages: FlowPage[]; components: FlowComponent[] }) {
  const [pageName, setPageName] = useState(pages[0]?.name ?? '');
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<FlowComponent | string | null>(null);

  const page = pages.find((p) => p.name === pageName) ?? pages[0];
  const bounds = useMemo(() => {
    if (!page) return null;
    const verts = page.vertices.filter((v) => v.w > 0 && v.h > 0);
    if (!verts.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of verts) {
      minX = Math.min(minX, v.x); minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x + v.w); maxY = Math.max(maxY, v.y + v.h);
    }
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  }, [page]);

  if (!page) return <div className="empty">Nenhuma página carregada.</div>;
  if (!bounds) return <div className="empty">Esta página não tem geometria para renderizar.</div>;

  const pad = 60;
  const q = search.toLowerCase();
  const compByTag = new Map(components.map((c) => [c.shortTag, c]));

  return (
    <div className="panel">
      <h2>Diagram</h2>
      <p className="sub">Posições reais do arquivo. Clique num símbolo para ver o componente. A renderização é simplificada — para edição completa, abra o arquivo no diagrams.net.</p>
      <div className="row">
        <label>Página{' '}
          <select value={page.name} onChange={(e) => { setPageName(e.target.value); setZoom(1); setSelected(null); }}>
            {pages.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </label>
        <input type="search" placeholder="Buscar tag (ex.: XB01)" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="secondary" onClick={() => setZoom((z) => z * 1.25)}>Zoom +</button>
        <button className="secondary" onClick={() => setZoom((z) => z / 1.25)}>Zoom −</button>
        <button className="secondary" onClick={() => setZoom(1)}>Enquadrar</button>
        <span className="muted">Legenda: <span style={{ color: '#ff6a00' }}>■</span> com painel &nbsp; <span style={{ color: '#dc2626' }}>■</span> sem painel &nbsp; <span style={{ color: '#378cce' }}>—</span> ligação</span>
      </div>
      <div className="svgwrap">
        <svg
          viewBox={`${bounds.minX - pad} ${bounds.minY - pad} ${bounds.w / zoom + pad * 2} ${bounds.h / zoom + pad * 2}`}
          width="100%"
          height={Math.max(420, Math.min(900, bounds.h * 0.6))}
        >
          {page.edges.map((e, i) => {
            const s = page.cellsById[e.source];
            const t = page.cellsById[e.target];
            let x1: number, y1: number, x2: number, y2: number;
            if (e.sourcePoint && e.targetPoint) { [x1, y1] = e.sourcePoint; [x2, y2] = e.targetPoint; }
            else if (s && t) { x1 = s.x + s.w / 2; y1 = s.y + s.h / 2; x2 = t.x + t.w / 2; y2 = t.y + t.h / 2; }
            else return null;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#378cce" strokeWidth={3} opacity={0.7} />;
          })}
          {page.vertices.filter((v) => v.w > 0 && v.h > 0).map((v) => {
            const isContainer = /container=1/.test(v.style);
            const comp = v.componentShortTag ? compByTag.get(v.componentShortTag) : undefined;
            const symbol = symbolFromStyle(v.style);
            const label = v.componentShortTag || v.value || symbol || '';
            const highlight = Boolean(q && label.toLowerCase().includes(q));
            if (isContainer) {
              return <rect key={v.idx} x={v.x} y={v.y} width={v.w} height={v.h} fill="none" stroke="#a9c4eb" strokeWidth={3} strokeDasharray="8 6" />;
            }
            const stroke = comp ? (comp.electricalPanel ? '#ff6a00' : '#dc2626') : '#9ca3af';
            const w = Math.max(v.w, 34), h = Math.max(v.h, 26);
            return (
              <g key={v.idx} style={{ cursor: 'pointer' }} onClick={() => setSelected(comp ?? (label || 'Símbolo sem componente'))}>
                <rect x={v.x} y={v.y} width={w} height={h} fill={highlight ? '#fff7ed' : '#fff'} stroke={stroke} strokeWidth={highlight ? 4 : 2} />
                <text className="vlabel" x={v.x + w / 2} y={v.y + h / 2} textAnchor="middle" dominantBaseline="middle">{label.slice(0, 18)}</text>
                {symbol && !comp && <text className="vlabel" x={v.x + w / 2} y={v.y + h + 12} textAnchor="middle" fill="#6b7280">{symbol}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="muted" style={{ marginTop: 10 }}>
        {selected && typeof selected !== 'string' ? (
          <><b>{selected.shortTag}</b> · tipo {selected.componentType} · página {selected.page} · painel {selected.electricalPanel || '—'} · endereço {selected.electricalAddress || '—'} · conexão {selected.electrical || '—'} · produto {selected.productDesc || '—'}</>
        ) : selected ? <>Símbolo: {selected} (não é um componente com componentType)</> : 'Nenhum componente selecionado.'}
      </div>
    </div>
  );
}
