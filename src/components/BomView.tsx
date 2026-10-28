import { useMemo, useState } from 'react';
import type { FlowComponent } from '../types';
import { downloadCsv } from '../utils';

interface BomRow { id: string; desc: string; supplier: string; qty: number; types: string[]; pages: string[]; panels: string[]; }

export default function BomView({ components }: { components: FlowComponent[] }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const map = new Map<string, BomRow>();
    for (const c of components) {
      const key = c.productId ? `${c.productId}|${c.productDesc}` : 'SEM CADASTRO';
      const b = map.get(key) || { id: c.productId || '', desc: c.productId ? c.productDesc : 'SEM CADASTRO DE PRODUTO', supplier: c.supplier || '', qty: 0, types: [] as string[], pages: [] as string[], panels: [] as string[] };
      b.qty++;
      if (!b.types.includes(c.componentType)) b.types.push(c.componentType);
      if (!b.pages.includes(c.page)) b.pages.push(c.page);
      if (c.electricalPanel && !b.panels.includes(c.electricalPanel)) b.panels.push(c.electricalPanel);
      map.set(key, b);
    }
    let out = [...map.values()].sort((a, b) => b.qty - a.qty);
    const query = q.toLowerCase();
    if (query) out = out.filter((b) => [b.id, b.desc, b.supplier].join(' ').toLowerCase().includes(query));
    return out;
  }, [components, q]);

  return (
    <div className="panel">
      <h2>BOM — Bill of Materials</h2>
      <p className="sub">Agregada por produto: a quantidade é a soma das ocorrências reais no diagrama. Itens sem produto cadastrado aparecem como "SEM CADASTRO DE PRODUTO".</p>
      <div className="row">
        <input type="search" placeholder="Buscar produto..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="secondary" onClick={() => downloadCsv('bom.csv', ['Código', 'Descrição', 'Fornecedor', 'Qtd', 'Tipos', 'Páginas', 'Painéis'], rows.map((b) => [b.id, b.desc, b.supplier, String(b.qty), b.types.sort().join('; '), b.pages.sort().join('; '), b.panels.sort().join('; ')]))}>Exportar CSV</button>
        <span className="muted">{rows.length} linhas de BOM</span>
      </div>
      <div style={{ overflow: 'auto' }}>
        <table><thead><tr><th>Código</th><th>Descrição</th><th>Fornecedor</th><th>Qtd</th><th>Tipos</th><th>Páginas</th><th>Painéis</th></tr></thead>
          <tbody>{rows.map((b, i) => <tr key={i}><td>{b.id || '—'}</td><td>{b.desc}</td><td>{b.supplier || '—'}</td><td><b>{b.qty}</b></td><td>{b.types.sort().join(', ')}</td><td>{b.pages.sort().join(', ')}</td><td>{b.panels.sort().join(', ') || '(sem painel)'}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
