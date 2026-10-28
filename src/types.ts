export interface FlowComponent {
  page: string;
  componentType: string;
  tag: string;
  tagOption: string;
  shortTag: string;
  electrical: string;
  electricalPanel: string;
  electricalAddress: string;
  panelAsiMaster: string;
  asiMasterRef: string;
  voltage: string;
  size: string;
  code: string;
  productId: string;
  productDesc: string;
  supplier: string;
  panelCommType: string;
  panelPowerScheme: string;
  panelModulesRaw: string;
  // Preenchidos quando um XLSX de mapeamento ASi é aplicado (aba Automation)
  mappedAsiAddress?: string;
  mappedModule?: string;
  mappedSlave?: string;
  mappedPanel?: string;
  // Sinais PLC vindos do XLSX "PLC Tags" exportado do ASi
  plcTags?: PlcTag[];
}

export interface PlcTag {
  signal: string;
  plcAddress: string;
  dataType: string;
  master: string;
  tagPath: string;
}

export interface Vertex {
  idx: number;
  id: string;
  style: string;
  value: string;
  vertex: boolean;
  edge: boolean;
  source: string;
  target: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sourcePoint: [number, number] | null;
  targetPoint: [number, number] | null;
  componentShortTag?: string;
}

export interface FlowPage {
  name: string;
  components: FlowComponent[];
  vertices: Vertex[];
  edges: Vertex[];
  cellsById: Record<string, Vertex>;
}

export interface PanelModule {
  panel: string;
  type: string;
  model: string;
  networks: string;
  address: string;
}

export interface PanelInfo {
  code: string;
  components: FlowComponent[];
  pages: string[];
  size: string;
  comm: string;
  powerScheme: string;
  modules: PanelModule[];
}

export interface ParsedFlow {
  pages: FlowPage[];
  components: FlowComponent[];
  panels: PanelInfo[];
  modules: PanelModule[];
  errors: string[];
}
