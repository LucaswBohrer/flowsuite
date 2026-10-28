import type { FlowComponent, PanelInfo } from '../types';

export default function ElectricalView({ panels, components }: { panels: PanelInfo[]; components: FlowComponent[] }) {
  const unlinked = components.filter((c) => !c.electricalPanel);
  return (
    <>
      <div className="panel">
        <h2>Electrical Planning</h2>
        <p className="sub">Agrupado por painel. O cabeçalho do painel (tamanho, comunicação, módulos) vem do objeto EP da página correspondente, quando existe. Na v0 o agrupamento interno é por página do diagrama.</p>
        {panels.length === 0 && <div className="empty">Nenhum painel com componentes linkados.</div>}
        {panels.map((p) => {
          const byPage: Record<string, FlowComponent[]> = {};
          for (const c of p.components) (byPage[c.page] ||= []).push(c);
          return (
            <div key={p.code} className="panel" style={{ borderLeft: '5px solid #ff6a00' }}>
              <h2>⚡ PANEL: {p.code}</h2>
              <p className="sub">{p.components.length} componentes · {p.pages.length} página(s) · tamanho {p.size || '—'} · comunicação {p.comm || '—'} · módulos {p.modules.length || '—'} · esquema {p.powerScheme || '—'}</p>
              {Object.entries(byPage).map(([page, cs]) => (
                <details key={page}>
                  <summary>{page} — {cs.length} itens</summary>
                  <table><thead><tr><th>Tag</th><th>Tipo</th><th>Conexão</th><th>Endereço</th><th>Tensão</th></tr></thead>
                    <tbody>{cs.map((c, i) => <tr key={i}><td><b>{c.shortTag}</b></td><td>{c.componentType}</td><td>{c.electrical || '—'}</td><td>{c.electricalAddress || '—'}</td><td>{c.voltage || '—'}</td></tr>)}</tbody>
                  </table>
                </details>
              ))}
            </div>
          );
        })}
      </div>
      <div className="panel">
        <h2>Unlinked Components</h2>
        <p className="sub">Componentes sem painel atribuído — eles não somem, ficam aqui até serem atribuídos.</p>
        {unlinked.length === 0 ? <div className="empty">Nenhum componente sem painel. 🎉</div> : (
          <table><thead><tr><th>Tag</th><th>Tipo</th><th>Página</th><th>Conexão</th><th>Tensão</th></tr></thead>
            <tbody>{unlinked.map((c, i) => <tr key={i}><td><b>{c.shortTag}</b></td><td>{c.componentType}</td><td>{c.page}</td><td>{c.electrical || '—'}</td><td>{c.voltage || '—'}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
