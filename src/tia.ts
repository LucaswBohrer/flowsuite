import type { FlowComponent, FlowPage } from './types';

/**
 * Geração TIA Portal (SCL) — implementação própria, no formato
 * visível nos prints da aba Automation do sistema original:
 *  1. I/O Datatypes (UDTs) — um TYPE por equipamento/página
 *  2. I/O Databases (DBs) — uma instância por componente
 *  3. Command & Status Blocks (FBs) — um FUNCTION por equipamento,
 *     com REGION por grupo (atuadores, sensores, motores)
 *  + blocos de endereço SCL para os componentes com endereço.
 *
 * O que NÃO é copiado nem inventado como se fosse do original:
 * o sufixo interno Q/PID e o número de ID exato do original
 * dependem de um mapeamento interno que não está no XML. Aqui:
 *  - o campo da UDT é o shortTag (ex.: XB01SS), com _PID para bombas;
 *  - o ID é sequencial por equipamento, começando em 1, e aparece
 *    explícito no código para conferência;
 *  - o tipo (MAN / SWITCH / ANALOG / PID / AUTO) é inferido dos
 *    prints: EV e JT aparecem como MAN, LS como SWITCH, LT como
 *    ANALOG, CP como PID e XB/SV/SW/TK/AG como AUTO. Se um tipo
 *    estiver errado para o seu caso, ajuste em componentKind().
 */

export function sanitizeName(s: string): string {
  return s.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'EQUIP';
}

export function componentKind(c: FlowComponent): 'MAN' | 'SWITCH' | 'ANALOG' | 'PID' | 'AUTO' {
  if (['EV', 'JT', 'BV', 'CV'].includes(c.componentType)) return 'MAN';
  if (['LS', 'CS'].includes(c.componentType)) return 'SWITCH';
  if (['LT', 'PT', 'TT', 'FT', 'PI', 'AI'].includes(c.componentType)) return 'ANALOG';
  if (c.componentType === 'CP') return 'PID';
  return 'AUTO';
}

function udtFieldName(c: FlowComponent): string {
  return componentKind(c) === 'PID' ? `${c.shortTag}_PID` : c.shortTag;
}

function groupKey(c: FlowComponent): string {
  return c.page;
}

export interface TiaStats {
  udts: number;
  dbInstances: number;
  addressBlocks: number;
}

export function tiaStats(pages: FlowPage[], components: FlowComponent[]): TiaStats {
  return {
    udts: pages.length,
    dbInstances: components.length,
    // com PLC Tags do ASi: cada sinal é uma linha de endereço;
    // sem PLC Tags: um componente com endereço = uma linha.
    addressBlocks: components.reduce((sum, c) => sum + (c.plcTags?.length ?? (c.electricalAddress ? 1 : 0)), 0),
  };
}

export function generateUdts(pages: FlowPage[]): string {
  const out: string[] = [];
  out.push('// tia_datatypes.udt — gerado pelo FlowSuite a partir do fluxograma');
  out.push('// Um TYPE (UDT) por equipamento/página. ID sequencial por equipamento.');
  out.push('');
  for (const page of pages) {
    const name = sanitizeName(page.name);
    out.push(`TYPE "S3_${name}"`);
    out.push('VERSION : 0.1');
    out.push('STRUCT');
    page.components.forEach((c, i) => {
      const kind = componentKind(c);
      const typeName = kind === 'PID' ? '"PID"' : `"component${kind}"`;
      // productDesc já costuma começar com o código ("07107 - VALV...")
      // — não duplicar o código no comentário nesse caso.
      const product = !c.productId
        ? 'sem cadastro de produto'
        : c.productDesc.startsWith(c.productId)
          ? c.productDesc
          : `${c.productId} - ${c.productDesc}`;
      out.push(`    ${udtFieldName(c)} : ${typeName} := ((), (), (), (), (), ${i + 1}, (), (), ()); // ${product}`);
    });
    out.push('END_STRUCT;');
    out.push('END_TYPE');
    out.push('');
  }
  return out.join('\n');
}

export function generateDbs(pages: FlowPage[]): string {
  const out: string[] = [];
  out.push('// I/O Databases — uma instância (DB) por componente, com ID atribuído');
  out.push('// Formato: DB_<Equipamento>_<Tag> := UDT do equipamento');
  out.push('');
  let globalId = 1;
  for (const page of pages) {
    const name = sanitizeName(page.name);
    out.push(`// --- ${page.name} ---`);
    for (const c of page.components) {
      out.push(`DATA_BLOCK "DB_${name}_${c.shortTag}"`);
      out.push(`{ S7_Optimized_Access := 'TRUE' }`);
      out.push(`VERSION : 0.1`);
      out.push(`"S3_${name}"`);
      out.push(`BEGIN`);
      const plcInfo = c.plcTags ? ` · PLC tags do ASi: ${c.plcTags.length} (ex.: ${c.plcTags[0].plcAddress} — ${c.plcTags[0].signal})` : '';
      out.push(`    // ID ${globalId} · painel ${c.electricalPanel || '(sem painel)'} · endereço ${c.electricalAddress || '(sem endereço)'}${plcInfo} · ${c.productDesc || 'sem produto'}`);
      out.push(`END_DATA_BLOCK`);
      out.push('');
      globalId++;
    }
  }
  return out.join('\n');
}

export function generateAddressBlocks(components: FlowComponent[]): string {
  const withPlc = components.filter((c) => c.plcTags && c.plcTags.length > 0);
  const out: string[] = [];
  if (withPlc.length > 0) {
    const total = withPlc.reduce((s, c) => s + (c.plcTags?.length || 0), 0);
    out.push('// SCL Address Blocks — endereços PLC vindos do XLSX "PLC Tags" do ASi');
    out.push(`// ${total} sinais em ${withPlc.length} componentes — endereço exato do export, sinal preservado`);
    out.push('');
    for (const c of withPlc) {
      out.push(`// ${c.shortTag} — ${c.page} — painel ${c.electricalPanel || '(sem painel)'}`);
      for (const t of c.plcTags!) {
        const sigName = sanitizeName(t.signal).slice(0, 60) || 'SIGNAL';
        out.push(`"${c.shortTag}_${sigName}" := "${t.plcAddress}"; // ${t.signal} [${t.dataType || 'tipo do export'}]`);
      }
    }
    // componentes restantes, com endereço do diagrama, entram depois
    const rest = components.filter((c) => !(c.plcTags && c.plcTags.length > 0) && c.electricalAddress);
    if (rest.length > 0) {
      out.push('');
      out.push('// --- sem PLC Tags no XLSX: endereço do diagrama ---');
      for (const c of rest) {
        out.push(`"${c.shortTag}_ADDR" := "${c.electricalAddress}"; // ${c.electrical || ''}`);
      }
    }
    return out.join('\n');
  }
  const withAddress = components.filter((c) => c.electricalAddress);
  out.push('// SCL Address Blocks — só componentes com endereço elétrico atribuído');
  out.push(`// ${withAddress.length} de ${components.length} componentes têm endereço`);
  out.push('');
  for (const c of withAddress) {
    out.push(`// ${c.shortTag} — ${c.page} — painel ${c.electricalPanel || '(sem painel)'}`);
    out.push(`"${c.shortTag}_ADDR" := "${c.electricalAddress}"; // ${c.electrical || ''}`);
  }
  return out.join('\n');
}

function fbRegionFor(kind: string): string {
  if (kind === 'MAN' || kind === 'AUTO') return 'COMPONENTS ACTUATORS';
  if (kind === 'SWITCH' || kind === 'ANALOG') return 'COMPONENTS SENSORS';
  if (kind === 'PID') return 'COMPONENTS MOTORS';
  return 'COMPONENTS';
}

export function generateFb(pages: FlowPage[]): string {
  const out: string[] = [];
  out.push('// tia_logic.scl — Command & Status Blocks (FBs)');
  out.push('// Um FUNCTION por equipamento, estruturado por tipo e por tag.');
  out.push('');
  for (const page of pages) {
    const name = sanitizeName(page.name);
    out.push(`FUNCTION "${name}_CMD&STS" : Void`);
    out.push(`{ S7_Optimized_Access := 'TRUE' }`);
    out.push('VERSION : 0.1');
    out.push('BEGIN');
    out.push('    // COMPONENT CONTROL PROGRAM');
    out.push('    // Structured by equipment type and tag-based regions');
    out.push('');
    const regions = new Map<string, FlowComponent[]>();
    for (const c of page.components) {
      const region = fbRegionFor(componentKind(c));
      if (!regions.has(region)) regions.set(region, []);
      regions.get(region)!.push(c);
    }
    let n = 1;
    for (const [region, comps] of regions) {
      out.push(`    REGION ${region}`);
      for (const c of comps) {
        const panelRef = c.electricalPanel ? `${c.electricalPanel}_` : '';
        out.push(`        REGION ${c.shortTag}`);
        out.push(`            "FC_CMD&STS"(N := ${n},`);
        out.push(`                TAG_COD_GENERIC := "forComponentHMIMenu".componentSpotlightCodeForClip,`);
        out.push(`                AUTO := "Always0",`);
        out.push(`                TAG_COMPONENTE := "${panelRef}${name}_IO".${name}.${c.shortTag});`);
        out.push(`        END_REGION`);
        n++;
      }
      out.push(`    END_REGION`);
      out.push('');
    }
    out.push('END_FUNCTION');
    out.push('');
  }
  return out.join('\n');
}

export function filterPages(pages: FlowPage[], group: string, query: string): FlowPage[] {
  const q = query.toLowerCase();
  return pages
    .filter((p) => !group || p.name === group)
    .map((p) => ({
      ...p,
      components: p.components.filter((c) => !q || [c.shortTag, c.componentType, c.productDesc, c.electricalPanel].join(' ').toLowerCase().includes(q)),
    }))
    .filter((p) => p.components.length > 0);
}
