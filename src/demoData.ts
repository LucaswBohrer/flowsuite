import type { FlowPage } from './types';

/**
 * Demonstração SINTÉTICA — dados inventados, sem nenhum dado real
 * de projeto. Serve só para mostrar as abas sem subir um arquivo.
 * O arquivo real do trabalho NÃO vai para o
 * repositório nem para o deploy: ele é carregado localmente, no
 * navegador de quem usa, pelo botão "Abrir .xml / .drawio".
 *
 */
function comp(page: string, componentType: string, tag: string, tagOption: string, extra: Record<string, string>): FlowPage['components'][number] {
  return {
    page, componentType, tag, tagOption,
    shortTag: componentType + tag + tagOption,
    electrical: extra.electrical || '',
    electricalPanel: extra.electricalPanel || '',
    electricalAddress: extra.electricalAddress || '',
    panelAsiMaster: extra.panelAsiMaster || 'false',
    asiMasterRef: extra.asiMasterRef || '',
    voltage: extra.voltage || '',
    size: extra.size || '',
    code: extra.code || '',
    productId: extra.productId || '',
    productDesc: extra.productDesc || '',
    supplier: extra.supplier || '',
    panelCommType: extra.panelCommType || '',
    panelPowerScheme: extra.panelPowerScheme || '',
    panelModulesRaw: extra.panelModulesRaw || '',
  };
}

const page = 'E2DEMO';
const components = [
  comp(page, 'EV', '01', '', { electricalPanel: 'EP9000001', electricalAddress: '1/A', electrical: 'ASi', productId: 'DEMO-001', productDesc: 'DEMO - Válvula exemplo (dados fictícios)', supplier: 'Demo' }),
  comp(page, 'LS', '01', 'H', { electricalPanel: 'EP9000001', electricalAddress: 'IO9000001 - Port 1', electrical: 'IO' }),
  comp(page, 'LT', '01', '', { electricalPanel: 'EP9000001', electricalAddress: 'IO9000001 - Port 2', electrical: 'IO' }),
  comp(page, 'CP', '01', 'SS', { electricalPanel: 'EP9000001', electrical: 'el.Type' }),
  comp(page, 'XB', '01', 'SS', { electricalPanel: 'EP9000001', electricalAddress: '2/A', electrical: 'ASi' }),
  comp(page, 'IO', '01', '', { electricalPanel: 'EP9000001', electricalAddress: '1', electrical: 'ASi5 | 1' }),
  comp(page, 'EP', '01', '', {
    electricalPanel: 'EP9000001',
    size: '600x800x300', panelCommType: 'PROFINET', panelPowerScheme: '24V DC',
    panelModulesRaw: JSON.stringify([
      { type: 'ASi Master', model: 'DEMO-ASI-MASTER', networks: ['ASi'], electricalAddress: '' },
      { type: 'IO-Link Master', model: 'DEMO-IO-MASTER', networks: ['IO-Link'], electricalAddress: '' },
      { type: 'PLC', model: 'DEMO-PLC', networks: ['PROFINET'], electricalAddress: '' },
    ]),
  }),
  comp(page, 'CV', '01', '', { size: 'DN50', productId: 'DEMO-002', productDesc: 'DEMO - Válvula de retenção exemplo (dados fictícios)', supplier: 'Demo' }),
];

function vertex(idx: number, shortTag: string, x: number, y: number): FlowPage['vertices'][number] {
  return { idx, id: '', style: '', value: '', vertex: true, edge: false, source: '', target: '', x, y, w: 80, h: 80, sourcePoint: null, targetPoint: null, componentShortTag: shortTag };
}

export const DEMO_PAGES: FlowPage[] = [{
  name: page,
  components,
  vertices: [
    vertex(0, 'EV01', 100, 100),
    vertex(1, 'LS01H', 260, 100),
    vertex(2, 'LT01', 420, 100),
    vertex(3, 'CP01SS', 100, 260),
    vertex(4, 'XB01SS', 260, 260),
    vertex(5, 'IO01', 420, 260),
    vertex(6, 'EP01', 580, 100),
    vertex(7, 'CV01', 580, 260),
  ],
  edges: [
    { idx: 100, id: '', style: '', value: '', vertex: false, edge: true, source: '', target: '', x: 0, y: 0, w: 0, h: 0, sourcePoint: [180, 140], targetPoint: [260, 140] },
    { idx: 101, id: '', style: '', value: '', vertex: false, edge: true, source: '', target: '', x: 0, y: 0, w: 0, h: 0, sourcePoint: [340, 140], targetPoint: [420, 140] },
  ],
  cellsById: {},
}];
