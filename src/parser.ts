import { inflateRaw } from 'pako';
import type { FlowComponent, FlowPage, PanelInfo, PanelModule, ParsedFlow, Vertex } from './types';

/**
 * Parser do formato draw.io (mxfile), escrito do zero a partir do
 * formato público do arquivo. NÃO depende de DecompressionStream:
 * usa pako (inflate raw) embutido, então funciona em qualquer
 * navegador moderno — essa era uma das causas prováveis de o XML
 * não abrir na versão estática anterior, que dependia de uma API
 * que nem todo visualizador/navegador expõe.
 *
 * Formato de cada <diagram>: base64 de um XML comprimido com
 * deflate raw e URL-encoded. Componentes = <object> com
 * componentType. Painéis/módulos = objeto EP da página.
 */

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function safeDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s.replace(/%([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  }
}

export function decodeDiagramBlob(blob: string): string {
  const trimmed = blob.trim();
  if (!trimmed) throw new Error('Página vazia no arquivo.');
  if (trimmed.startsWith('<')) return trimmed;
  // 1) caminho principal: base64 + deflate raw (pako)
  try {
    // pako 3: toText:true devolve string (UTF-8). O XML decodificado
    // é URL-encoded, então o passo seguinte desfaz o %XX.
    const inflated = inflateRaw(base64ToBytes(trimmed), { toText: true });
    return safeDecodeURIComponent(inflated);
  } catch (e) {
    // 2) fallback: pode já ser XML URL-encoded sem compressão
    if (trimmed.includes('%3C') || trimmed.includes('%3c')) {
      return safeDecodeURIComponent(trimmed);
    }
    throw new Error(`Não consegui descomprimir esta página do diagrama (${e instanceof Error ? e.message : String(e)}). Verifique se o arquivo é um .xml / .drawio exportado pelo draw.io.`);
  }
}

function childCell(el: Element): Element | null {
  for (const n of el.childNodes) {
    if (n.nodeType === 1 && (n as Element).tagName === 'mxCell') return n as Element;
  }
  return null;
}

interface Geom {
  x: number;
  y: number;
  w: number;
  h: number;
  relative: boolean;
  sourcePoint: [number, number] | null;
  targetPoint: [number, number] | null;
}

function geometryOf(cell: Element | null): Geom | null {
  if (!cell) return null;
  for (const n of cell.childNodes) {
    if (n.nodeType === 1 && (n as Element).tagName === 'mxGeometry') {
      const g = n as Element;
      const geom: Geom = {
        x: parseFloat(g.getAttribute('x') || '0'),
        y: parseFloat(g.getAttribute('y') || '0'),
        w: parseFloat(g.getAttribute('width') || '0'),
        h: parseFloat(g.getAttribute('height') || '0'),
        relative: g.getAttribute('relative') === '1',
        sourcePoint: null,
        targetPoint: null,
      };
      for (const p of g.childNodes) {
        if (p.nodeType !== 1) continue;
        const pe = p as Element;
        if (pe.tagName === 'mxPoint' && pe.getAttribute('as') === 'sourcePoint') {
          geom.sourcePoint = [parseFloat(pe.getAttribute('x') || '0'), parseFloat(pe.getAttribute('y') || '0')];
        }
        if (pe.tagName === 'mxPoint' && pe.getAttribute('as') === 'targetPoint') {
          geom.targetPoint = [parseFloat(pe.getAttribute('x') || '0'), parseFloat(pe.getAttribute('y') || '0')];
        }
      }
      return geom;
    }
  }
  return null;
}

function parsePage(xmlText: string, pageName: string): FlowPage {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) throw new Error(`XML inválido na página "${pageName}".`);

  const page: FlowPage = { name: pageName, components: [], vertices: [], edges: [], cellsById: {} };
  const cellByElement = new Map<Element, Vertex>();
  let idx = 0;

  for (const cell of Array.from(doc.getElementsByTagName('mxCell'))) {
    const g = geometryOf(cell);
    const rec: Vertex = {
      idx: idx++,
      id: cell.getAttribute('id') || '',
      style: cell.getAttribute('style') || '',
      value: cell.getAttribute('value') || '',
      vertex: cell.getAttribute('vertex') === '1',
      edge: cell.getAttribute('edge') === '1',
      source: cell.getAttribute('source') || '',
      target: cell.getAttribute('target') || '',
      x: g?.x ?? 0,
      y: g?.y ?? 0,
      w: g?.w ?? 0,
      h: g?.h ?? 0,
      sourcePoint: g?.sourcePoint ?? null,
      targetPoint: g?.targetPoint ?? null,
    };
    cellByElement.set(cell, rec);
    if (rec.id) page.cellsById[rec.id] = rec;
    if (rec.vertex) page.vertices.push(rec);
    if (rec.edge) page.edges.push(rec);
  }

  for (const obj of Array.from(doc.getElementsByTagName('object'))) {
    const type = obj.getAttribute('componentType');
    if (!type) continue;
    const cell = childCell(obj);
    const comp: FlowComponent = {
      page: pageName,
      componentType: type,
      tag: obj.getAttribute('tag') || '',
      tagOption: obj.getAttribute('tagOption') || '',
      shortTag: '',
      electrical: obj.getAttribute('electrical') || '',
      electricalPanel: obj.getAttribute('electricalPanel') || '',
      electricalAddress: obj.getAttribute('electricalAddress') || '',
      panelAsiMaster: obj.getAttribute('panelAsiMaster') || '',
      asiMasterRef: obj.getAttribute('asiMasterRef') || '',
      voltage: obj.getAttribute('voltage') || '',
      size: obj.getAttribute('size') || '',
      code: obj.getAttribute('code') || '',
      productId: (obj.getAttribute('db_product_id') || '').trim(),
      productDesc: (obj.getAttribute('db_product_desc') || '').trim(),
      supplier: obj.getAttribute('db_product_supplier') || '',
      panelCommType: obj.getAttribute('panelCommType') || '',
      panelPowerScheme: obj.getAttribute('panelPowerScheme') || '',
      panelModulesRaw: obj.getAttribute('panelModules') || '',
    };
    comp.shortTag = comp.componentType + comp.tag + (comp.tagOption || '');
    page.components.push(comp);
    if (cell && cellByElement.has(cell)) {
      cellByElement.get(cell)!.componentShortTag = comp.shortTag;
    }
  }
  return page;
}

function parseModules(raw: string, panelCode: string): PanelModule[] {
  if (!raw) return [];
  try {
    const mods = JSON.parse(raw) as Array<{ type?: string; model?: string; networks?: string[]; electricalAddress?: string }>;
    if (!Array.isArray(mods)) return [];
    return mods.map((m) => ({
      panel: panelCode,
      type: m.type || '',
      model: m.model || '',
      networks: (m.networks || []).join(', '),
      address: m.electricalAddress || '',
    }));
  } catch {
    return [];
  }
}

export function parseMxFile(text: string): ParsedFlow {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error('Este arquivo não é um XML válido. Verifique se você selecionou o .xml / .drawio do draw.io, e não um PDF ou outro formato.');
  }

  const pages: FlowPage[] = [];
  const errors: string[] = [];
  const diagrams = Array.from(doc.getElementsByTagName('diagram'));

  if (diagrams.length === 0) {
    if (doc.documentElement.tagName === 'mxGraphModel') {
      pages.push(parsePage(text, 'Página 1'));
    } else {
      throw new Error('Não encontrei nenhuma página <diagram> neste arquivo. Ele parece não ser um fluxograma do draw.io (mxfile).');
    }
  } else {
    diagrams.forEach((d, i) => {
      const name = (d.getAttribute('name') || `Página ${i + 1}`).trim();
      try {
        pages.push(parsePage(decodeDiagramBlob(d.textContent || ''), name));
      } catch (e) {
        errors.push(`Página "${name}": ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  if (pages.length === 0) {
    throw new Error(`Não consegui abrir nenhuma página do arquivo. ${errors.join(' ')}`);
  }

  return buildParsedFlow(pages, errors);
}

export function buildParsedFlow(pages: FlowPage[], errors: string[] = []): ParsedFlow {
  const components = pages.flatMap((p) => p.components);
  const panelMap = new Map<string, PanelInfo>();
  for (const c of components) {
    if (!c.electricalPanel) continue;
    let p = panelMap.get(c.electricalPanel);
    if (!p) {
      p = { code: c.electricalPanel, components: [], pages: [], size: '', comm: '', powerScheme: '', modules: [] };
      panelMap.set(c.electricalPanel, p);
    }
    p.components.push(c);
    if (!p.pages.includes(c.page)) p.pages.push(c.page);
  }

  const modules: PanelModule[] = [];
  for (const page of pages) {
    const panelsInPage = [...new Set(page.components.map((c) => c.electricalPanel).filter(Boolean))];
    const eps = page.components.filter((c) => c.componentType === 'EP');
    if (panelsInPage.length === 1 && eps.length > 0) {
      const panel = panelMap.get(panelsInPage[0]);
      if (panel) {
        const ep = eps[0];
        panel.size = ep.size || panel.size;
        panel.comm = ep.panelCommType || panel.comm;
        panel.powerScheme = ep.panelPowerScheme || panel.powerScheme;
        panel.modules = parseModules(ep.panelModulesRaw, panel.code);
        modules.push(...panel.modules);
      }
    }
  }
  for (const c of components) {
    if (c.componentType === 'IO') {
      modules.push({ panel: c.electricalPanel || '(sem painel)', type: 'IO (diagrama)', model: c.shortTag, networks: c.electrical, address: c.electricalAddress });
    }
  }

  return { pages, components, panels: [...panelMap.values()].sort((a, b) => a.code.localeCompare(b.code)), modules, errors };
}
