import { useMemo, useState } from 'react';
import type { FlowComponent } from '../types';

export default function LabelsView({ components }: { components: FlowComponent[] }) {
  const [panel, setPanel] = useState('');
  const [q, setQ] = useState('');
  const panels = useMemo(() => [...new Set(components.map((c) => c.electricalPanel).filter(Boolean))].sort(), [components]);
  const rows = useMemo(() => {
    const query = q.toLowerCase();
    return components.filter((c) => (!panel || c.electricalPanel === panel) && (!query || c.shortTag.toLowerCase().includes(query)));
  }, [components, panel, q]);

  return (
    <div className="panel">
      <h2>Labels</h2>
      <p className="sub">Etiquetas geradas a partir da Table View. Filtre por painel e use Imprimir (o navegador imprime só as etiquetas).</p>
      <div className="row no-print">
        <select value={panel} onChange={(e) => setPanel(e.target.value)}><option value="">Todos os painéis</option>{panels.map((p) => <option key={p}>{p}</option>)}</select>
        <input type="search" placeholder="Buscar tag..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => window.print()}>Imprimir etiquetas</button>
        <span className="muted">{rows.length} etiquetas</span>
      </div>
      <div className="labels">
        {rows.map((c, i) => (
          <div key={i} className="label">
            <b>{c.shortTag}</b> <span className="muted">{c.componentType}</span>
            <div>Painel: {c.electricalPanel || '—'} · End.: {c.electricalAddress || '—'}</div>
            <div>{c.productDesc}</div>
            <div>{c.page}</div>
          </div>
        ))}
        {rows.length === 0 && <div className="empty">Nenhuma etiqueta com esses filtros.</div>}
      </div>
    </div>
  );
}
