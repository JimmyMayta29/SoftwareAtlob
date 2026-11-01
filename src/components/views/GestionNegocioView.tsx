import React, { useState } from 'react';
import { 
  Briefcase, 
  Users, 
  FileCheck2, 
  FolderDown, 
  Star, 
  CheckCircle, 
  AlertCircle, 
  Download,
  Calendar,
  Building
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface DocumentoPlantilla {
  id: string;
  categoria: 'MINUTAS' | 'ACTAS' | 'DECLARACIONES' | 'CONTRATOS';
  titulo: string;
  descripcion: string;
  formato: 'DOCX' | 'PDF' | 'XLSX';
  tamano: string;
}

const DOCUMENTOS_DEMO: DocumentoPlantilla[] = [
  {
    id: 'doc-01',
    categoria: 'ACTAS',
    titulo: 'Acta de Junta General de Accionistas - Aprobación de Estados Financieros Anuales',
    descripcion: 'Modelo estándar conforme a la Ley General de Sociedades para aprobación del balance anual y distribución de dividendos.',
    formato: 'DOCX',
    tamano: '48 KB'
  },
  {
    id: 'doc-02',
    categoria: 'DECLARACIONES',
    titulo: 'Declaración Jurada de Domicilio Fiscal y Establecimientos Anexos',
    descripcion: 'Formato SUNAT para justificación de domicilio y actualización de locales en el RUC.',
    formato: 'PDF',
    tamano: '120 KB'
  },
  {
    id: 'doc-03',
    categoria: 'CONTRATOS',
    titulo: 'Contrato de Locación de Servicios Profesionales Contables y Tributarios',
    descripcion: 'Modelo de contrato de prestación de servicios para Atlob Consultores con cláusulas de confidencialidad y entrega de libros.',
    formato: 'DOCX',
    tamano: '62 KB'
  },
  {
    id: 'doc-04',
    categoria: 'MINUTAS',
    titulo: 'Minuta de Constitución de Sociedad Anónima Cerrada (S.A.C.)',
    descripcion: 'Estatuto social con aportes dinerarios y designación de Gerente General con facultades bancarias.',
    formato: 'DOCX',
    tamano: '95 KB'
  }
];

export const GestionNegocioView: React.FC = () => {
  const { success, info } = useToast();
  const [tab, setTab] = useState<'CALIDAD' | 'BIBLIOTECA'>('CALIDAD');
  const [categoriaDoc, setCategoriaDoc] = useState<string>('TODAS');

  const docsFiltrados = DOCUMENTOS_DEMO.filter(
    (d) => categoriaDoc === 'TODAS' || d.categoria === categoriaDoc
  );

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              <Briefcase className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Gestión de Negocio & Control de Calidad
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Atlob Consultores · Auditoría de cumplimiento tributario, satisfacción de clientes y repositorio de documentos y minutas.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 text-xs font-medium space-x-2">
        <button
          onClick={() => setTab('CALIDAD')}
          className={`px-3 py-2 border-b-2 transition-colors ${
            tab === 'CALIDAD'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Control de Calidad & Satisfacción
        </button>
        <button
          onClick={() => setTab('BIBLIOTECA')}
          className={`px-3 py-2 border-b-2 transition-colors ${
            tab === 'BIBLIOTECA'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Biblioteca de Documentos & Minutas ({DOCUMENTOS_DEMO.length})
        </button>
      </div>

      {/* CONTENIDO 1: Control de Calidad */}
      {tab === 'CALIDAD' && (
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-slate-800 p-4 rounded border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] text-slate-500">Índice de Cumplimiento SUNAT</span>
              <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">98.5%</div>
              <p className="text-[10.5px] text-slate-400 mt-1">
                Todas las declaraciones PDT 621 y SIRE presentadas dentro del cronograma oficial sin multas.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 rounded border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] text-slate-500">Satisfacción de Cartera (NPS)</span>
              <div className="text-2xl font-bold font-mono text-blue-600 mt-1">94 / 100</div>
              <div className="flex items-center text-amber-500 mt-1 space-x-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-current" />
                ))}
                <span className="text-[10.5px] text-slate-500 ml-1">Excelente</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 rounded border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] text-slate-500">Auditoría Preventiva de Libros</span>
              <div className="text-2xl font-bold font-mono text-indigo-600 mt-1">100% OK</div>
              <p className="text-[10.5px] text-slate-400 mt-1">
                Libros Diario y Mayor cuadrados contra Hoja de Trabajo y Balance de Comprobación.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-4">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm mb-2">
              Protocolo de Control de Calidad Mensual Atlob Consultores
            </h3>
            <ul className="space-y-2 text-slate-600 dark:text-slate-300">
              <li className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>Conciliación obligatoria de ventas y compras SIRE vs registros contables antes de cerrar el período.</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>Validación de comprobantes de pago de proveedores con RUC activo y habido en SUNAT.</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>Comprobación de bancarización y pago de detracciones antes del cómputo del crédito fiscal.</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* CONTENIDO 2: Biblioteca de Documentos */}
      {tab === 'BIBLIOTECA' && (
        <div className="space-y-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-medium">Filtrar por categoría:</span>
            <select
              value={categoriaDoc}
              onChange={(e) => setCategoriaDoc(e.target.value)}
              className="p-1.5 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-800 dark:text-slate-200 text-xs"
            >
              <option value="TODAS">Todas las categorías</option>
              <option value="MINUTAS">Minutas societarias</option>
              <option value="ACTAS">Actas de asamblea</option>
              <option value="DECLARACIONES">Declaraciones juradas</option>
              <option value="CONTRATOS">Contratos de servicios</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {docsFiltrados.map((doc) => (
              <div
                key={doc.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {doc.categoria}
                    </span>
                    <span className="font-mono text-[10.5px] text-slate-400">
                      {doc.formato} · {doc.tamano}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {doc.titulo}
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                    {doc.descripcion}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                  <button
                    onClick={() => success(`Descargando plantilla oficial: ${doc.titulo}`, 'Descarga')}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar Plantilla Oficial</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
