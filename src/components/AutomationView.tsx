import { useMemo, useRef, useState } from 'react';
import type { FlowPage, PanelModule } from '../types';
import { applyMapping, detectColumns, parseWorkbook } from '../asiMapping';
import type { ColumnMap, MappingField, MatchResult, ParsedWorkbook } from '../asiMapping';
import { detectPlcColumns, isPlcTagsSheet, matchPlcTags, parsePlcRows } from '../plcTags';
import type { PlcColumns, PlcMatchResult } from '../plcTags';
import { componentKind, filterPages, generateAddressBlocks, generateDbs, generateFb, generateUdts, tiaStats } from '../tia';
import { downloadCsv } from '../utils';

const FIELDS: Array<{ field: MappingField; label: string }> = [
  { field: 'tag', label: 'Tag do componente' },
  { field: 'asiAddress', label: 'Endereço ASi' },
  { field: 'slave', label: 'Slave / nó ASi' },
  { field: 'module', label: 'Módulo / tipo de dispositivo' },
  { field: 'panel', label: 'Painel / gateway' },
  { field: 'channel', label: 'Canal / porta' },
];

function CodeSection({ title, subtitle, filename, code, defaultOpen }: { title: string; subtitle: string; filename: string; code: string; defaultOpen?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <details open={defaultOpen} className="panel" style={{ marginBottom: 14 }}>
      <summary style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{title}</span>
        <span className="muted" style={{ fontWeight: 400 }}>{subtitle}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }} onClick={(e) => e.preventDefault()}>
          <button className="secondary" onClick={copy}>{copied ? 'Copiado!' : 'COPY CODE'}</button>
          <button className="secondary" onClick={download}>Baixar {filename}</button>
        </span>
      </summary>
      <pre className="codeblock" style={{ marginTop: 12 }}>{code || '(nada com esses filtros)'}</pre>
    </details>
  );
}

export default function AutomationView({ pages, modules }: { pages: FlowPage[]; modules: PanelModule[] }) {
  const [group, setGroup] = useState('');
  const [q, setQ] = useState('');
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [xlsxName, setXlsxName] = useState('');
  const [xlsxError, setXlsxError] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [colMap, setColMap] = useState<ColumnMap>({});
  const [applied, setApplied] = useState<MatchResult | null>(null);
  const [plcCols, setPlcCols] = useState<PlcColumns>({ tagPath: null, master: null, dataType: null, plcAddress: null, ioModule: null });
  const [plcApplied, setPlcApplied] = useState<PlcMatchResult | null>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);

  const selectedSheet = useMemo(
    () => workbook?.sheets.find((s) => s.name === sheetName) ?? workbook?.sheets[0],
    [workbook, sheetName],
  );
  const plcMode = selectedSheet ? isPlcTagsSheet(selectedSheet) : false;

  // O mapeamento, quando aplicado, alimenta TODA a geração TIA abaixo:
  // no modo PLC Tags, os endereços %I/%Q do export do ASi viram os
  // blocos de endereço SCL; no modo simples, endereço ASi e painel
  // do XLSX passam a valer no lugar dos do diagrama.
  const basePages = plcApplied ? plcApplied.mergedPages : applied ? applied.mergedPages : pages;
  const filtered = useMemo(() => filterPages(basePages, group, q), [basePages, group, q]);
  const stats = useMemo(() => tiaStats(filtered, filtered.flatMap((p) => p.components)), [filtered]);
  const udts = useMemo(() => generateUdts(filtered), [filtered]);
  const dbs = useMemo(() => generateDbs(filtered), [filtered]);
  const fb = useMemo(() => generateFb(filtered), [filtered]);
  const addr = useMemo(() => generateAddressBlocks(filtered.flatMap((p) => p.components)), [filtered]);
  const allComponents = useMemo(() => filtered.flatMap((p) => p.components), [filtered]);

  async function handleXlsx(file: File) {
    setXlsxError('');
    setApplied(null);
    setPlcApplied(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = parseWorkbook(buf);
      if (wb.sheets.length === 0 || wb.sheets.every((s) => s.rows.length === 0)) {
        throw new Error('Não encontrei nenhuma planilha com dados neste arquivo.');
      }
      setWorkbook(wb);
      setXlsxName(file.name);
      const first = wb.sheets.find((s) => s.rows.length > 0) ?? wb.sheets[0];
      setSheetName(first.name);
      setColMap(detectColumns(first.headers));
      setPlcCols(detectPlcColumns(first));
    } catch (e) {
      setXlsxError(e instanceof Error ? e.message : String(e));
    }
  }

  function changeSheet(name: string) {
    setSheetName(name);
    setApplied(null);
    setPlcApplied(null);
    const sheet = workbook?.sheets.find((s) => s.name === name);
    if (sheet) {
      setColMap(detectColumns(sheet.headers));
      setPlcCols(detectPlcColumns(sheet));
    }
  }

  function doApply() {
    if (!selectedSheet) return;
    setApplied(applyMapping(pages, selectedSheet, colMap));
  }

  function doApplyPlc() {
    if (!selectedSheet) return;
    const rows = parsePlcRows(selectedSheet, plcCols);
    if (rows.length === 0) {
      setXlsxError('Não consegui identificar as colunas de tag e endereço PLC nesta aba — corrija os seletores abaixo e tente de novo.');
      return;
    }
    setXlsxError('');
    setPlcApplied(matchPlcTags(pages, rows));
  }

  return (
    <div>
      {/* 0. Mapeamento ASi — Bihl+Wiedemann Suite */}
      <div className="panel">
        <h2>0. Mapeamento ASi — Bihl+Wiedemann Suite</h2>
        <p className="sub">
          Suba aqui o XLSX exportado do ASi. Se for a aba <b>PLC Tags</b> (tag path + master ASi-MASTER-EP… + endereço %I/%Q),
          o sistema cruza cada sinal com o componente do diagrama — tipo + tag + painel + módulo IO — e os blocos de
          endereço SCL abaixo já saem com os endereços PLC exatos do export. Se for uma tabela simples de mapeamento
          (tag / endereço ASi / slave / módulo / painel), ela é aplicada no lugar dos endereços do diagrama.
          As colunas são detectadas automaticamente e você pode corrigir antes de aplicar.
        </p>
        <div className="row">
          <button onClick={() => xlsxRef.current?.click()}>Abrir XLSX de mapeamento...</button>
          <input ref={xlsxRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleXlsx(f); e.target.value = ''; }} />
          <span className="muted">{xlsxName || 'Nenhum XLSX carregado — a geração TIA usa só os dados do diagrama.'}</span>
          {(applied || plcApplied) && <button className="secondary" onClick={() => { setApplied(null); setPlcApplied(null); }}>Limpar mapeamento</button>}
        </div>
        {xlsxError && <div className="banner error" style={{ margin: '0 0 12px' }}>⚠️ {xlsxError}</div>}
        {workbook && selectedSheet && plcMode && (
          <>
            <div className="row">
              <label>Aba{' '}
                <select value={selectedSheet.name} onChange={(e) => changeSheet(e.target.value)}>
                  {workbook.sheetNames.map((n) => <option key={n}>{n}</option>)}
                </select>
              </label>
              <span className="muted"><b>Formato detectado: PLC Tags (export do ASi)</b> · {selectedSheet.rows.length} linhas · {selectedSheet.headers.length} colunas</span>
            </div>
            <div className="row">
              {([
                { key: 'tagPath', label: 'Tag path (col. A)' },
                { key: 'master', label: 'Master ASi (col. B)' },
                { key: 'dataType', label: 'Tipo (col. C)' },
                { key: 'plcAddress', label: 'Endereço PLC (col. D)' },
                { key: 'ioModule', label: 'Módulo IO (col. E)' },
              ] as const).map(({ key, label }) => (
                <label key={key}>{label}{' '}
                  <select value={plcCols[key] ?? ''} onChange={(e) => setPlcCols((m) => ({ ...m, [key]: e.target.value || null }))}>
                    <option value="">— não usar —</option>
                    {selectedSheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="row">
              <button onClick={doApplyPlc}>Aplicar PLC Tags ao TIA</button>
              <span className="muted">Cruzamento conservador: tipo + tag + painel + módulo IO, com vencedor único. Sem vencedor = linha sem correspondência, listada abaixo — não inventa vínculo.</span>
            </div>
            <div style={{ overflow: 'auto', maxHeight: 260 }}>
              <table><thead><tr>{selectedSheet.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {selectedSheet.rows.slice(0, 20).map((r, i) => (
                    <tr key={i}>{selectedSheet.headers.map((h) => <td key={h}>{r[h] || '—'}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">Prévia: primeiras 20 linhas da aba. Se as colunas detectadas estiverem erradas, corrija nos seletores acima antes de aplicar.</p>
            </div>
          </>
        )}
        {plcApplied && (
          <>
            <div className="cards">
              <div className="card"><b>{plcApplied.totalRows}</b><span>Sinais PLC no XLSX</span></div>
              <div className="card"><b>{plcApplied.matchedRows}</b><span>Sinais com componente</span></div>
              <div className="card"><b>{plcApplied.componentsWithPlcTags}</b><span>Componentes com PLC Tags</span></div>
              <div className="card"><b>{plcApplied.unmatchedRows}</b><span>Sinais sem correspondência</span></div>
            </div>
            <div className="row">
              <button className="secondary" onClick={() => downloadCsv('plc_tags_aplicados.csv', ['Componente', 'Página', 'Sinal', 'Endereço PLC', 'Tipo', 'Master'], plcApplied.matched.map((m) => [m.componentTag, m.page, m.row.signal, m.row.plcAddress, m.row.dataType, m.row.master]))}>Exportar PLC Tags aplicados (CSV)</button>
              <span className="muted">A partir daqui, a seção 4 (SCL Address Blocks) usa os endereços %I/%Q do export, por sinal.</span>
            </div>
            {plcApplied.ioDivergent.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Módulo IO divergente do diagrama — vale conferir</h3>
                <p className="sub">O dispositivo casou por tipo + tag + painel, mas o módulo IO no XLSX é diferente do registrado no diagrama (o diagrama é um snapshot mais antigo). O endereço PLC do XLSX é o que entra no TIA.</p>
                <table><thead><tr><th>Componente</th><th>Página</th><th>Diagrama</th><th>XLSX (ASi)</th><th>Sinal</th><th>Endereço PLC</th></tr></thead>
                  <tbody>
                    {plcApplied.ioDivergent.map((d, i) => (
                      <tr key={i}><td>{d.componentTag}</td><td>{d.page}</td><td>{d.diagramIo}</td><td>{d.xlsxIo}</td><td>{d.signal}</td><td>{d.plcAddress}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {plcApplied.unmatchedByToken.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Sinais sem correspondência no diagrama — auditoria</h3>
                <p className="sub">Dispositivos que existem no ASi mas não casaram com nenhum componente do diagrama (tag, painel ou módulo IO diferente). Vale conferir no fluxo se faltam no diagrama ou se a tag mudou.</p>
                <table><thead><tr><th>Dispositivo (token)</th><th>Sinais</th><th>1º endereço PLC</th><th>Exemplo de sinal</th></tr></thead>
                  <tbody>
                    {plcApplied.unmatchedByToken.map((u) => (
                      <tr key={u.token}><td>{u.token}</td><td>{u.count}</td><td>{u.firstAddress}</td><td>{u.exampleSignal}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
        {workbook && selectedSheet && !plcMode && (
          <>
            <div className="row">
              <label>Aba{' '}
                <select value={selectedSheet.name} onChange={(e) => changeSheet(e.target.value)}>
                  {workbook.sheetNames.map((n) => <option key={n}>{n}</option>)}
                </select>
              </label>
              <span className="muted">{selectedSheet.rows.length} linhas · {selectedSheet.headers.length} colunas</span>
            </div>
            <div className="row">
              {FIELDS.map(({ field, label }) => (
                <label key={field}>{label}{' '}
                  <select
                    value={colMap[field] ?? ''}
                    onChange={(e) => setColMap((m) => ({ ...m, [field]: e.target.value || null }))}
                  >
                    <option value="">— não usar —</option>
                    {selectedSheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="row">
              <button onClick={doApply}>Aplicar mapeamento ao TIA</button>
              <span className="muted">Cruzamento: endereço ASi → tag → tag parcial. Nada é aplicado sem você clicar aqui.</span>
            </div>
            <div style={{ overflow: 'auto', maxHeight: 260 }}>
              <table><thead><tr>{selectedSheet.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {selectedSheet.rows.slice(0, 20).map((r, i) => (
                    <tr key={i}>{selectedSheet.headers.map((h) => <td key={h}>{r[h] || '—'}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">Prévia: primeiras 20 linhas da aba. Se as colunas detectadas estiverem erradas, corrija nos seletores acima antes de aplicar.</p>
            </div>
          </>
        )}
        {applied && (
          <>
            <div className="cards">
              <div className="card"><b>{applied.matchedComponents}</b><span>Componentes mapeados</span></div>
              <div className="card"><b>{applied.componentsWithoutMapping}</b><span>Componentes sem mapeamento</span></div>
              <div className="card"><b>{applied.unmatchedRows}</b><span>Linhas do XLSX sem componente</span></div>
            </div>
            <div className="row">
              <button className="secondary" onClick={() => downloadCsv('mapeamento_asi_aplicado.csv', ['Componente', 'Endereço ASi (XLSX)', 'Módulo', 'Slave', 'Painel'], applied.matchedRows.map((m) => [m.componentTag, m.row[colMap.asiAddress ?? ''] ?? '', m.row[colMap.module ?? ''] ?? '', m.row[colMap.slave ?? ''] ?? '', m.row[colMap.panel ?? ''] ?? '']))}>Exportar mapeamento aplicado (CSV)</button>
              <span className="muted">A partir daqui, UDTs, DBs, FBs e blocos de endereço usam o mapeamento aplicado.</span>
            </div>
          </>
        )}
        <p className="muted">
          Formato PLC Tags travado a partir dos seus prints de 28/10: tag path + master + tipo + endereço %I/%Q + módulo IO.
          Se o seu XLSX real tiver cabeçalhos diferentes dos detectados aqui, me manda o arquivo (ou só a primeira linha dele)
          que eu travo as colunas exatas — a detecção por conteúdo já cobre a maioria dos casos.
        </p>
      </div>

      <div className="panel">
        <h2>TIA Portal Generation</h2>
        <p className="sub">Export generated SCL and DB files for SIEMENS TIA Portal integration. Geração própria, no formato visível nos prints: UDT por equipamento, DB por instância, FB de comando/status e blocos de endereço SCL.</p>
        <div className="row">
          <label>GROUP BY Equipment{' '}
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">All Equip.</option>
              {pages.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </label>
          <input type="search" placeholder="Buscar tag, tipo, produto..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="cards">
          <div className="card"><b>{stats.udts}</b><span>PLC DATATYPES (UDTs)</span></div>
          <div className="card"><b>{stats.dbInstances}</b><span>DB INSTANCES</span></div>
          <div className="card"><b>{stats.addressBlocks}</b><span>SCL ADDRESS BLOCKS</span></div>
        </div>
        <p className="muted">
          Tipos inferidos dos prints: EV/JT = MAN, LS = SWITCH, LT = ANALOG, CP = PID, demais = AUTO.
          O ID é sequencial por equipamento (começa em 1) e aparece explícito no código.
        </p>
        <p className="muted">Tipos no filtro atual: {[...new Set(allComponents.map((c) => `${c.componentType} → ${componentKind(c)}`))].sort().join(' · ') || '—'}</p>
      </div>

      <CodeSection title="1. I/O Datatypes" subtitle="SCL Datatypes (UDTs) for equipment IO structures." filename="tia_datatypes.udt" code={udts} defaultOpen />
      <CodeSection title="2. I/O Databases" subtitle="Global Data Blocks (DBs) for equipment instances and ID assignments." filename="tia_databases.db" code={dbs} />
      <CodeSection title="3. Command & Status Blocks" subtitle="Function Blocks (FBs) for component control and monitoring logic." filename="tia_logic.scl" code={fb} />
      <CodeSection title="4. SCL Address Blocks" subtitle="Só componentes com endereço elétrico atribuído (do diagrama ou do XLSX aplicado)." filename="tia_address.scl" code={addr} />

      <details className="panel">
        <summary>Módulos dos painéis (base para os endereços)</summary>
        <p className="sub">ASi Master, DI/DO, PLC, inversor, fonte, switch etc. vindos do objeto EP, mais os módulos IO do diagrama.</p>
        <table><thead><tr><th>Painel</th><th>Tipo</th><th>Modelo</th><th>Redes</th><th>Endereço</th></tr></thead>
          <tbody>
            {modules.map((m, i) => <tr key={i}><td>{m.panel}</td><td>{m.type}</td><td>{m.model}</td><td>{m.networks || '—'}</td><td>{m.address || '—'}</td></tr>)}
            {modules.length === 0 && <tr><td colSpan={5} className="empty">Nenhum módulo.</td></tr>}
          </tbody>
        </table>
      </details>
    </div>
  );
}
