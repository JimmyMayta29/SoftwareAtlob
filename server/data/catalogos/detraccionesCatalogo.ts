/**
 * Atlob Consultores ERP — Catálogo Oficial de Bienes y Servicios Sujetos al SPOT (Detracciones)
 * Base normativa: R.S. 183-2004/SUNAT, R.S. 073-2006/SUNAT, R.S. 057-2007/SUNAT y normas modificatorias vigentes.
 */

export interface CatalogoDetraccionItem {
  codigo: string;
  descripcion: string;
  porcentaje: number;
  umbralMinimo: number; // En Soles PEN (operaciones iguales o menores no están sujetas al SPOT)
  anexo: 'ANEXO_1' | 'ANEXO_2' | 'ANEXO_3';
  vigente: boolean;
  baseLegal: string;
}

export const CATALOGO_OFICIAL_DETRACCIONES_SUNAT: CatalogoDetraccionItem[] = [
  // --- ANEXO 3: SERVICIOS SUJETOS AL SPOT ---
  {
    codigo: '019',
    descripcion: 'Transporte de bienes realizado por vía terrestre',
    porcentaje: 4.0,
    umbralMinimo: 400.0, // R.S. 073-2006/SUNAT: mayor a S/ 400
    anexo: 'ANEXO_3',
    vigente: true,
    baseLegal: 'R.S. 073-2006/SUNAT'
  },
  {
    codigo: '020',
    descripcion: 'Mantenimiento y reparación de bienes muebles',
    porcentaje: 12.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_3',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '021',
    descripcion: 'Movimiento de carga',
    porcentaje: 10.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_3',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '022',
    descripcion: 'Otros servicios empresariales',
    porcentaje: 12.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_3',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '024',
    descripcion: 'Comisión mercantil',
    porcentaje: 10.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_3',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '025',
    descripcion: 'Fabricación de bienes por encargo',
    porcentaje: 10.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_3',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '026',
    descripcion: 'Servicio de transporte de personas',
    porcentaje: 10.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_3',
    vigente: true,
    baseLegal: 'R.S. 057-2007/SUNAT'
  },
  {
    codigo: '030',
    descripcion: 'Contratos de construcción',
    porcentaje: 4.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_3',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT mod. D.Leg. 1395'
  },
  {
    codigo: '037',
    descripcion: 'Demás servicios gravados con el IGV',
    porcentaje: 12.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_3',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '039',
    descripcion: 'Transporte de pasajeros por vía acuática',
    porcentaje: 10.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_3',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },

  // --- ANEXO 1 Y 2: BIENES SUJETOS AL SPOT ---
  {
    codigo: '001',
    descripcion: 'Azúcar y melaza de caña',
    porcentaje: 10.0,
    umbralMinimo: 0.0, // Anexo 1: sin umbral mínimo
    anexo: 'ANEXO_1',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '003',
    descripcion: 'Alcohol etílico',
    porcentaje: 10.0,
    umbralMinimo: 0.0, // Anexo 1: sin umbral mínimo
    anexo: 'ANEXO_1',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '004',
    descripcion: 'Recursos hidrobiológicos',
    porcentaje: 4.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_2',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '005',
    descripcion: 'Maíz amarillo duro',
    porcentaje: 4.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_2',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '007',
    descripcion: 'Caña de azúcar',
    porcentaje: 10.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_2',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '008',
    descripcion: 'Madera',
    porcentaje: 4.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_2',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '009',
    descripcion: 'Arena y piedra',
    porcentaje: 10.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_2',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '010',
    descripcion: 'Residuos, subproductos, desechos y chatarra',
    porcentaje: 15.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_2',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '012',
    descripcion: 'Bienes del inciso A del Apéndice I de la Ley del IGV',
    porcentaje: 1.5,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_2',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  },
  {
    codigo: '099',
    descripcion: 'Demás bienes o servicios sujetos al SPOT',
    porcentaje: 10.0,
    umbralMinimo: 700.0,
    anexo: 'ANEXO_2',
    vigente: true,
    baseLegal: 'R.S. 183-2004/SUNAT'
  }
];

export function buscarDetraccionPorCodigo(codigo: string): CatalogoDetraccionItem | undefined {
  return CATALOGO_OFICIAL_DETRACCIONES_SUNAT.find(item => item.codigo === codigo);
}

