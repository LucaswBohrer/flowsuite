import { useMemo, useState } from 'react';
import type { FlowComponent } from '../types';
import { downloadCsv } from '../utils';

type SortKey = 'page' | 'shortTag' | 'componentType' | 'electrical' | 'electricalPanel' | 'electricalAddress' | 'voltage' | 'productDesc';

export default function TableView({ components }: { components: FlowComponent[] }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState('');
  const [panel, setPanel] = useState('');
  const [type, setType] = useState('');
  const [linked, setLinked] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('page');
  const [sortDir, setSortDir] = useState(1);

  const pages = useMemo(() => [...new Set(components.map((c) => c.page))].sort(), [components]);
  const panels = useMemo(() => [...new Set(components.map((c) => c.electricalPanel).filter(Boolean))].sort(), [components]);
  const types = useMemo(() => [...new Set(components.map((c) => c.componentType))].sort(), [components]);

  const rows = useMemo(() => {
    const query = q.toLowerCase();
    const filtered = components.filter((c) =>
      (!query || [c.page, c.shortTag, c.componentType, c.electrical, c.electricalPanel, c.electricalAddress, c.productDesc].join(' ').toLowerCase().includes(query)) &&
      (!page || c.page === page) &&
      (!panel || c.electricalPanel === panel) &&
      (!type || c.componentType === type) &&
      (!linked || (linked === 'sim' ? Boolean(c.electricalPanel) : !c.electricalPanel)),
    );
    return [...filtered].sort((a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? '')) * sortDir);
  }, [components, q, page, panel, type, linked, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => -d); else { setSortKey(k); setSortDir(1); }
  };
  const headers: Array<[string, SortKey]> = [
    ['Página', 'page'], ['Tag', 'shortTag'], ['Tipo', 'componentType'], ['Conexão', 'electrical'],
    ['Painel', 'electricalPanel'], ['Endereço', 'electricalAddress'], ['Tensão', 'voltage'], ['Produto', 'productDesc'],
  ];

  return (
    <div className="panel">
      <h2>Table View</h2>
      <p className="sub">Todos os componentes do diagrama. Filtre e exporte em CSV.</p>
      <div className="row">
        <input type="search" placeholder="Buscar tag, produto, página..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={page} onChange={(e) => setPage(e.target.value)}><option value="">Todas as páginas</option>{pages.map((p) => <option key={p}>{p}</option>)}</select>
        <select value={panel} onChange={(e) => setPanel(e.target.value)}><option value="">Todos os painéis</option>{panels.map((p) => <option key={p}>{p}</option>)}</select>
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="">Todos os tipos</option>{types.map((p) => <option key={p}>{p}</option>)}</select>
        <select value={linked} onChange={(e) => setLinked(e.target.value)}><option value="">Linkado / não linkado</option><option value="sim">Linkado</option><option value="nao">Não linkado</option></select>
        <button className="secondary" onClick={() => downloadCsv('table_view.csv', ['Página', 'Tag', 'Tipo', 'Conexão', 'Painel', 'Endereço', 'Tensão', 'Produto', 'Status'], rows.map((c) => [c.page, c.shortTag, c.componentType, c.electrical, c.electricalPanel, c.electricalAddress, c.voltage, c.productDesc, c.electricalPanel ? 'sim' : 'nao']))}>Exportar CSV</button>
        <span className="muted">{rows.length} de {components.length} componentes</span>
      </div>
      <div style={{ overflow: 'auto' }}>
        <table>
          <thead><tr>{headers.map(([label, k]) => <th key={k} onClick={() => toggleSort(k)}>{label}{sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}</th>)}<th>Status</th></tr></thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={`${c.page}-${c.shortTag}-${i}`}>
                <td>{c.page}</td><td><b>{c.shortTag}</b></td><td>{c.componentType}</td>
                <td>{c.electrical || '—'}</td><td>{c.electricalPanel || '—'}</td><td>{c.electricalAddress || '—'}</td>
                <td>{c.voltage || '—'}</td><td>{c.productDesc || '—'}</td>
                <td><span className={`badge ${c.electricalPanel ? 'linked' : 'unlinked'}`}>{c.electricalPanel ? 'LINKADO' : 'UNLINKED'}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="empty">Nenhum componente com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
