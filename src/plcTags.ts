import type { FlowComponent, FlowPage, PlcTag } from './types';
import type { MappingSheet } from './asiMapping';

/**
 * XLSX "PLC Tags" exportado do ASi — o formato real que o Lucas
 * mostrou nos prints de 28/10 (aba "PLC Tags" no LibreOffice).
 *
 * Formato observado nos prints (colunas, da esquerda para a direita):
 *  A. Tag path: "I-001 IO9000001 PS9000001 PQI Device error/warning"
 *     - "I-001"/"I-002" = índice do módulo IO no painel (ignorado)
 *     - "IO9000001"/"IO9000002" = módulo IO-Link (mestre)
 *     - "PS9000001"/"LC9000001"/"CS9000002"/"PT9000001" = dispositivo
 *       de campo: tipo (2 letras) + equipamento (5 dígitos) + tag
 *       (2 dígitos) + sufixo opcional (ex.: LS01H -> token ...01H)
 *     - resto = sinal: "PQI Device error/warning",
 *       "Process data byte In 1 ... Valve position (24)",
 *       "Port 3 PQI Pin 4 In", etc.
 *  B. Master: "ASi-MASTER-EP9000001" -> painel EP9000001
 *  C. "Bool" (coluna de tipo, preservada como está — mesmo quando
 *     o endereço é %ID, o export diz Bool; não "corrigimos" isso)
 *  D. Endereço PLC: "%I1110.6", "%ID1116", "%I1116.1", ...
 *  E. Módulo IO de novo: "IO9000001" / "IO9000002"
 *
 * Cruzamento com o diagrama (conservador, para não inventar vínculo):
 *  - dispositivo primário = último token de dispositivo no tag path
 *    (ou o próprio módulo IO, nas linhas "Port N PQI ..." sem dispositivo)
 *  - candidato: tipo == tipo do token, tag == últimos 2 dígitos do
 *    número do token, painel == painel do master, e — se o diagrama
 *    registra um módulo IO para o componente — esse módulo tem que
 *    ser o mesmo da linha. Ex.: LS90000001 (módulo IO9000002) NÃO
 *    casa com LS01H do diagrama (módulo IO9000001, Port 3): fica
 *    como "sem correspondência", em vez de um vínculo errado.
 *  - sem vencedor único = ambíguo, não aplicado.
 * Linhas sem correspondência são LISTADAS na tela: elas são a
 * auditoria (dispositivo no ASi que não está no diagrama, ou com
 * tag/módulo diferente) — não são descartadas em silêncio.
 */

export interface PlcColumns {
  tagPath: string | null;
  master: string | null;
  dataType: string | null;
  plcAddress: string | null;
  ioModule: string | null;
}

export interface PlcRow {
  tagPath: string;
  master: string;
  dataType: string;
  plcAddress: string;
  ioModule: string;
  panel: string;
  deviceToken: string;
  signal: string;
}

export interface PlcMatchResult {
  mergedPages: FlowPage[];
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  ambiguousRows: number;
  componentsWithPlcTags: number;
  matched: Array<{ row: PlcRow; componentTag: string; page: string }>;
  unmatchedByToken: Array<{ token: string; count: number; firstAddress: string; exampleSignal: string }>;
  ioDivergent: Array<{ componentTag: string; page: string; diagramIo: string; xlsxIo: string; signal: string; plcAddress: string }>;
}

// Token de dispositivo: EXATAMENTE 2 letras + 7 dígitos + sufixo opcional
// (ex.: PS9000001, CS9000002, LS9000001H). Um token com 8 dígitos,
// como LS90000001 no print, NÃO é um token válido do diagrama —
// ele fica como "sem correspondência" em vez de casar à força com
// LS01H só porque termina em 01.
const TOKEN_RE = /\b([A-Z]{2})(\d{7})([A-Z]*)\b/g;
const BROAD_TOKEN_RE = /\b[A-Z]{2}\d{6,}\b/;
const PLC_ADDR_RE = /^%[IQ][A-Z]?\d/;
const DATA_TYPES = new Set(['BOOL', 'INT', 'DINT', 'REAL', 'WORD', 'DWORD', 'BYTE', 'UINT', 'UDINT', 'SINT', 'USINT', 'TIME', 'STRING', 'CHAR']);

function panelFromMaster(master: string): string {
  const m = master.match(/EP\d+/i);
  return m ? m[0].toUpperCase() : '';
}

function normalizeHeader(h: string): string {
  return h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isPlcTagsSheet(sheet: MappingSheet): boolean {
  if (/plc/i.test(sheet.name) && /tag/i.test(sheet.name)) return true;
  for (const row of sheet.rows) {
    for (const h of sheet.headers) {
      const v = row[h] || '';
      if (PLC_ADDR_RE.test(v.trim())) return true;
      if (/process data|pqi|liquiphant|positioner/i.test(v)) return true;
    }
  }
  return false;
}

export function detectPlcColumns(sheet: MappingSheet): PlcColumns {
  const cols: PlcColumns = { tagPath: null, master: null, dataType: null, plcAddress: null, ioModule: null };
  // 1) por nome de cabeçalho, quando existir
  for (const h of sheet.headers) {
    const n = normalizeHeader(h);
    if (!cols.plcAddress && (n.includes('address') || n === 'adresse' || n.includes('endereco'))) cols.plcAddress = h;
    else if (!cols.dataType && (n.includes('data type') || n.includes('datatype') || n === 'type' || n.includes('tipo'))) cols.dataType = h;
    else if (!cols.master && (n.includes('master') || n.includes('gateway') || n.includes('panel') || n.includes('painel'))) cols.master = h;
    else if (!cols.tagPath && (n.includes('tag') || n === 'name' || n.includes('nome'))) cols.tagPath = h;
    else if (!cols.ioModule && (n.includes('io') || n.includes('module') || n.includes('modulo'))) cols.ioModule = h;
  }
  // 2) por conteúdo, para as colunas que o nome não resolveu
  for (const h of sheet.headers) {
    if (cols.plcAddress && cols.dataType && cols.master && cols.tagPath && cols.ioModule) break;
    const values = sheet.rows.map((r) => (r[h] || '').trim()).filter(Boolean);
    if (values.length === 0) continue;
    const plcAddrShare = values.filter((v) => PLC_ADDR_RE.test(v)).length / values.length;
    const dataTypeShare = values.filter((v) => DATA_TYPES.has(v.toUpperCase())).length / values.length;
    const masterShare = values.filter((v) => /asi-master/i.test(v)).length / values.length;
    const tagPathShare = values.filter((v) => TOKEN_RE.test(v) || /process data|pqi/i.test(v)).length / values.length;
    TOKEN_RE.lastIndex = 0;
    if (!cols.plcAddress && plcAddrShare > 0.5) cols.plcAddress = h;
    else if (!cols.dataType && dataTypeShare > 0.5) cols.dataType = h;
    else if (!cols.master && masterShare > 0.5) cols.master = h;
    else if (!cols.tagPath && tagPathShare > 0.5) cols.tagPath = h;
    else if (!cols.ioModule && values.filter((v) => /^IO\d{7}$/.test(v)).length / values.length > 0.5) cols.ioModule = h;
  }
  return cols;
}

function tokensOf(tagPath: string): Array<{ type: string; number: string; suffix: string; raw: string }> {
  const out: Array<{ type: string; number: string; suffix: string; raw: string }> = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(tagPath)) !== null) {
    out.push({ type: m[1], number: m[2], suffix: m[3] || '', raw: m[0] });
  }
  return out;
}

export function parsePlcRows(sheet: MappingSheet, cols: PlcColumns): PlcRow[] {
  if (!cols.tagPath || !cols.plcAddress) return [];
  return sheet.rows
    .filter((r) => (r[cols.tagPath!] || '').trim() && (r[cols.plcAddress!] || '').trim())
    .map((r) => {
      const tagPath = (r[cols.tagPath!] || '').trim();
      const master = cols.master ? (r[cols.master] || '').trim() : '';
      const dataType = cols.dataType ? (r[cols.dataType] || '').trim() : '';
      const plcAddress = (r[cols.plcAddress!] || '').trim();
      const ioModule = cols.ioModule ? (r[cols.ioModule] || '').trim() : '';
      const tokens = tokensOf(tagPath);
      const ioToken = tokens.find((t) => t.type === 'IO');
      const deviceToken = [...tokens].reverse().find((t) => t !== ioToken);
      let rawToken = deviceToken?.raw || '';
      let signal = tagPath;
      if (deviceToken) {
        const idx = tagPath.indexOf(deviceToken.raw);
        signal = tagPath.slice(idx + deviceToken.raw.length).trim();
      } else if (ioToken) {
        // Sem token válido após o módulo IO: pode ser (a) linha "Port N
        // PQI ..." — sinal do próprio módulo IO; ou (b) token malformado
        // (ex.: LS90000001, 8 dígitos) — dispositivo desconhecido, NÃO
        // cai no módulo IO. Distingue pelos dois casos.
        const afterIo = tagPath.slice(tagPath.indexOf(ioToken.raw) + ioToken.raw.length);
        const broad = afterIo.match(BROAD_TOKEN_RE);
        if (broad) {
          rawToken = broad[0];
          signal = afterIo.slice(afterIo.indexOf(broad[0]) + broad[0].length).trim();
        } else {
          rawToken = ioToken.raw;
          signal = afterIo.trim();
        }
      }
      return {
        tagPath, master, dataType, plcAddress,
        ioModule: ioModule || ioToken?.raw || '',
        panel: panelFromMaster(master),
        deviceToken: rawToken,
        signal: signal || tagPath,
      };
    });
}

export function matchPlcTags(pages: FlowPage[], plcRows: PlcRow[]): PlcMatchResult {
  const allComponents: Array<{ comp: FlowComponent; page: string }> = [];
  for (const p of pages) for (const c of p.components) allComponents.push({ comp: c, page: p.name });

  const byComponent = new Map<FlowComponent, PlcRow[]>();
  const matched: PlcMatchResult['matched'] = [];
  const unmatched: PlcRow[] = [];
  const ioDivergent: PlcMatchResult['ioDivergent'] = [];
  let ambiguousRows = 0;

  for (const row of plcRows) {
    // Token primário vem do parse (já distingue token válido, token
    // malformado e linha "Port N" do módulo IO).
    const m = row.deviceToken.match(/^([A-Z]{2})(\d{7})([A-Z]*)$/);
    if (!m) { unmatched.push(row); continue; }
    const [, type, number, suffix] = m;
    const tagNum = number.slice(-2);
    const candidates = allComponents.filter(({ comp }) => {
      if (comp.componentType !== type) return false;
      if (comp.shortTag !== `${type}${tagNum}${suffix}` && comp.shortTag !== `${type}${tagNum}${comp.tagOption || ''}`) {
        // token sem sufixo: aceita qualquer sufixo, o painel decide
        if (suffix) return false;
        if (comp.shortTag.slice(0, 4) !== `${type}${tagNum}`) return false;
      }
      if (row.panel && comp.electricalPanel && comp.electricalPanel !== row.panel) return false;
      return true;
    });
    if (candidates.length === 1) {
      const { comp, page } = candidates[0];
      // Módulo IO divergente NÃO rejeita o vínculo (o diagrama é de
      // 05/10 e o export do ASi é de 28/10 — o dispositivo pode ter
      // mudado de módulo), mas é registrado como auditoria: o endereço
      // PLC do XLSX é o que vale para o TIA.
      const compIo = (`${comp.electrical || ''} ${comp.electricalAddress || ''}`).match(/\bIO\d{7}\b/);
      if (compIo && row.ioModule && compIo[0] !== row.ioModule) {
        ioDivergent.push({ componentTag: comp.shortTag, page, diagramIo: compIo[0], xlsxIo: row.ioModule, signal: row.signal, plcAddress: row.plcAddress });
      }
      if (!byComponent.has(comp)) byComponent.set(comp, []);
      byComponent.get(comp)!.push(row);
      matched.push({ row, componentTag: comp.shortTag, page });
    } else if (candidates.length > 1) {
      ambiguousRows++;
      unmatched.push(row);
    } else {
      unmatched.push(row);
    }
  }

  const mergedPages = pages.map((page) => ({
    ...page,
    components: page.components.map((c: FlowComponent) => {
      const rows = byComponent.get(c);
      if (!rows) return c;
      return {
        ...c,
        plcTags: rows.map((r) => ({ signal: r.signal, plcAddress: r.plcAddress, dataType: r.dataType, master: r.master, tagPath: r.tagPath })),
      };
    }),
  }));

  const byToken = new Map<string, { count: number; firstAddress: string; exampleSignal: string }>();
  for (const r of unmatched) {
    const key = r.deviceToken || '(sem token)';
    const cur = byToken.get(key) || { count: 0, firstAddress: r.plcAddress, exampleSignal: r.signal };
    cur.count++;
    byToken.set(key, cur);
  }

  return {
    mergedPages,
    totalRows: plcRows.length,
    matchedRows: matched.length,
    unmatchedRows: unmatched.length,
    ambiguousRows,
    componentsWithPlcTags: byComponent.size,
    matched,
    unmatchedByToken: [...byToken.entries()].map(([token, v]) => ({ token, ...v })).sort((a, b) => b.count - a.count),
    ioDivergent,
  };
}
