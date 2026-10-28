import * as XLSX from 'xlsx';
import type { FlowComponent, FlowPage } from './types';

/**
 * Importação do mapeamento ASi exportado pela Bihl+Wiedemann Suite.
 *
 * O formato exato do XLSX da Suite não é documentado publicamente
 * (e varia por versão), então este importador NÃO trava colunas:
 * ele detecta automaticamente pelos nomes dos cabeçalhos e deixa
 * o usuário corrigir o mapeamento na tela antes de aplicar.
 * Se o Lucas mandar um XLSX de exemplo, travamos as colunas exatas
 * dele aqui — até lá, a detecção + ajuste manual cobre o caso geral.
 *
 * Chave de cruzamento com o diagrama (em ordem):
 *  1. endereço ASi (ex.: "15/A", "9/B") == electricalAddress do componente
 *  2. tag do XLSX == shortTag do componente (ex.: XB01SS)
 *  3. tag do XLSX contém o shortTag, ou vice-versa
 */

export type MappingField = 'tag' | 'asiAddress' | 'slave' | 'module' | 'panel' | 'channel';
export type ColumnMap = Partial<Record<MappingField, string | null>>;

export interface MappingSheet {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface ParsedWorkbook {
  sheetNames: string[];
  sheets: MappingSheet[];
}

function normalizeHeader(h: string): string {
  return h
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAddress(a: string): string {
  return a.toUpperCase().replace(/\s+/g, '');
}

function normalizeTag(t: string): string {
  return t.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function parseWorkbook(data: ArrayBuffer): ParsedWorkbook {
  const wb = XLSX.read(data, { type: 'array' });
  const sheets: MappingSheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false }) as unknown[][];
    // primeira linha não vazia = cabeçalho
    const headerIdx = aoa.findIndex((r) => r.some((c) => String(c ?? '').trim() !== ''));
    if (headerIdx < 0) return { name, headers: [], rows: [] };
    const headers = (aoa[headerIdx] as unknown[]).map((c) => String(c ?? '').trim());
    const rows: Record<string, string>[] = [];
    for (const r of aoa.slice(headerIdx + 1)) {
      if (!r.some((c) => String(c ?? '').trim() !== '')) continue;
      const rec: Record<string, string> = {};
      headers.forEach((h, i) => { rec[h] = String(r[i] ?? '').trim(); });
      rows.push(rec);
    }
    return { name, headers: headers.filter(Boolean), rows };
  });
  return { sheetNames: wb.SheetNames, sheets };
}

const FIELD_PATTERNS: Array<{ field: MappingField; test: (n: string) => boolean }> = [
  { field: 'asiAddress', test: (n) => (n.includes('asi') && (n.includes('address') || n.includes('addr') || n.includes('adresse'))) || n === 'slave address' || n === 'address' || n === 'asi addr' },
  { field: 'tag', test: (n) => n.includes('tag') || n.includes('slave name') || n.includes('device name') || n === 'name' || n === 'bezeichnung' || n.includes('component') },
  { field: 'slave', test: (n) => n.includes('slave') || n.includes('node') },
  { field: 'module', test: (n) => n.includes('module') || n.includes('device type') || n === 'type' || n.includes('article') || n.includes('model') },
  { field: 'panel', test: (n) => n.includes('panel') || n.includes('gateway') || n.includes('master') || n.includes('circuit') || n.includes('cabinet') },
  { field: 'channel', test: (n) => n.includes('channel') || n.includes('port') || n === 'io' },
];

export function detectColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<string>();
  for (const { field, test } of FIELD_PATTERNS) {
    const hit = headers.find((h) => !used.has(h) && test(normalizeHeader(h)));
    if (hit) { map[field] = hit; used.add(hit); }
  }
  return map;
}

export interface MatchResult {
  mergedPages: FlowPage[];
  matchedComponents: number;
  unmatchedRows: number;
  ambiguousRows: number;
  componentsWithoutMapping: number;
  matchedRows: Array<{ row: Record<string, string>; componentTag: string }>;
}

/**
 * Cruzamento com desambiguação — CORREÇÃO IMPORTANTE:
 * endereço ASi sozinho NÃO é único no arquivo inteiro (o mesmo
 * "12/A" aparece em vários painéis/mestres), e shortTag sozinho
 * também se repete entre equipamentos. Por isso uma linha só é
 * aplicada quando há um vencedor único e qualificado:
 *  - tag exata + painel igual, ou
 *  - tag exata e única no arquivo, ou
 *  - endereço exato + painel igual, ou
 *  - endereço exato e único no arquivo.
 * Empate ou falta de qualificação = linha ambígua, NÃO aplicada
 * em silêncio (ela aparece no contador de ambíguas da tela).
 */
export function applyMapping(pages: FlowPage[], sheet: MappingSheet, colMap: ColumnMap): MatchResult {
  const tagCol = colMap.tag ?? null;
  const addrCol = colMap.asiAddress ?? null;
  const slaveCol = colMap.slave ?? null;
  const moduleCol = colMap.module ?? null;
  const panelCol = colMap.panel ?? null;

  const allComponents = pages.flatMap((p) => p.components);
  const addressFreq = new Map<string, number>();
  const tagFreq = new Map<string, number>();
  for (const c of allComponents) {
    if (c.electricalAddress) addressFreq.set(normalizeAddress(c.electricalAddress), (addressFreq.get(normalizeAddress(c.electricalAddress)) || 0) + 1);
    tagFreq.set(normalizeTag(c.shortTag), (tagFreq.get(normalizeTag(c.shortTag)) || 0) + 1);
  }

  interface Pair { row: Record<string, string>; comp: FlowComponent; score: number; }
  const pairs: Pair[] = [];
  for (const row of sheet.rows) {
    const rowTag = tagCol && row[tagCol] ? normalizeTag(row[tagCol]) : '';
    const rowAddr = addrCol && row[addrCol] ? normalizeAddress(row[addrCol]) : '';
    const rowPanel = panelCol && row[panelCol] ? row[panelCol].trim() : '';
    for (const c of allComponents) {
      let score = 0;
      let qualifies = false;
      const tagExact = Boolean(rowTag) && rowTag === normalizeTag(c.shortTag);
      const addrExact = Boolean(rowAddr) && c.electricalAddress && rowAddr === normalizeAddress(c.electricalAddress);
      const panelMatch = Boolean(rowPanel) && c.electricalPanel && rowPanel === c.electricalPanel;
      if (tagExact) {
        score += 20;
        if (panelMatch) score += 5;
        if (addrExact) score += 5;
        if (tagFreq.get(normalizeTag(c.shortTag)) === 1) qualifies = true;
        if (panelMatch) qualifies = true;
      }
      if (addrExact) {
        score += 10;
        if (panelMatch) { score += 5; qualifies = true; }
        if (addressFreq.get(normalizeAddress(c.electricalAddress)) === 1) qualifies = true;
      }
      if (qualifies && score > 0) pairs.push({ row, comp: c, score });
    }
  }

  // ganancioso por pontuação: maior score primeiro, cada linha e
  // cada componente usados no máximo uma vez; empate no topo de
  // uma linha = ambíguo (não aplica).
  pairs.sort((a, b) => b.score - a.score);
  const usedRows = new Set<Record<string, string>>();
  const usedComps = new Set<FlowComponent>();
  const tieRows = new Set<Record<string, string>>();
  const assignment = new Map<FlowComponent, Record<string, string>>();
  const matchedRows: MatchResult['matchedRows'] = [];
  for (const pair of pairs) {
    if (usedRows.has(pair.row) || usedComps.has(pair.comp)) continue;
    // se outra linha ainda não usada tem o mesmo score para este componente, é empate: pula
    const tie = pairs.some((p) => p !== pair && !usedRows.has(p.row) && p.comp === pair.comp && p.score === pair.score);
    if (tie) { tieRows.add(pair.row); continue; }
    usedRows.add(pair.row);
    usedComps.add(pair.comp);
    assignment.set(pair.comp, pair.row);
    matchedRows.push({ row: pair.row, componentTag: pair.comp.shortTag });
  }

  const unmatchedRows = sheet.rows.length - usedRows.size;

  const mergedPages = pages.map((page) => ({
    ...page,
    components: page.components.map((c: FlowComponent) => {
      const row = assignment.get(c);
      if (!row) return c;
      const mappedAddress = addrCol && row[addrCol] ? row[addrCol] : undefined;
      const mappedPanel = panelCol && row[panelCol] ? row[panelCol] : undefined;
      return {
        ...c,
        electricalAddress: mappedAddress || c.electricalAddress,
        electricalPanel: mappedPanel && /^EP\d/i.test(mappedPanel.trim()) ? mappedPanel.trim() : c.electricalPanel,
        mappedAsiAddress: mappedAddress,
        mappedModule: moduleCol && row[moduleCol] ? row[moduleCol] : undefined,
        mappedSlave: slaveCol && row[slaveCol] ? row[slaveCol] : undefined,
        mappedPanel,
      };
    }),
  }));

  return {
    mergedPages,
    matchedComponents: usedComps.size,
    unmatchedRows,
    ambiguousRows: tieRows.size,
    componentsWithoutMapping: allComponents.length - usedComps.size,
    matchedRows,
  };
}
