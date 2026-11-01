import React from 'react';
import { BarraHerramientasLocal } from '../ui/BarraHerramientasLocal';
import { TablaDensa, ColumnaTablaDensa } from '../ui/TablaDensa';

interface AtajoSistema {
  tecla: string;
  modulo: string;
  accion: string;
}

const ATAJOS: AtajoSistema[] = [
  { tecla: 'Alt', modulo: 'Barra de Menú Superior', accion: 'Enfoca el primer menú ("Archivo") para navegación con flechas ← → ↑ ↓, Enter y Esc' },
  { tecla: 'F2', modulo: 'Contabilidad › Asientos', accion: 'Abre la ventana de Registro de Asientos Contables (Vouchers)' },
  { tecla: 'F3', modulo: 'Facturación › Emitir factura o boleta', accion: 'Abre el emisor de Comprobantes de Pago Electrónicos UBL 2.1' },
  { tecla: 'F4', modulo: 'Registros Electrónicos › SIRE › Conciliador', accion: 'Abre el Conciliador Inteligente de Compras y Ventas SIRE' },
  { tecla: 'Ctrl+K', modulo: 'Archivo › Abrir empresa…', accion: 'Abre el selector rápido de empresas del estudio contable' },
  { tecla: 'Ctrl+B', modulo: 'Herramientas › Respaldo y restauración', accion: 'Abre el gestor de paquetes de respaldo cifrado (.ZIP) de la empresa activa' },
  { tecla: 'Ctrl+Shift+C', modulo: 'Herramientas › Calculadora tributaria', accion: 'Abre la Calculadora Contable y Tributaria con precisión Decimal.js' },
  { tecla: 'Ctrl+Shift+P', modulo: 'Paleta de Comandos Global', accion: 'Busca y ejecuta cualquier opción activa del menú del sistema' },
  { tecla: 'Ctrl+P', modulo: 'Barra de Herramientas', accion: 'Imprime el reporte o estado financiero actualmente en pantalla' },
  { tecla: 'Esc', modulo: 'Ventanas Modales / Menús', accion: 'Cierra el menú desplegable o la ventana modal activa' },
];

export const GuiaRapidaAtajosView: React.FC = () => {
  const columnas: ColumnaTablaDensa<AtajoSistema>[] = [
    {
      key: 'tecla',
      header: 'Combinación de Teclas',
      width: '145px',
      render: (r) => (
        <kbd className="px-1.5 py-0.5 font-mono font-bold text-[11px] bg-[#E8ECF1] border border-[#D1D5DB] text-[#1E3A5F]">
          {r.tecla}
        </kbd>
      ),
    },
    { key: 'modulo', header: 'Ubicación en Menú', width: '280px', render: (r) => <span className="font-bold text-[#111827]">{r.modulo}</span> },
    { key: 'accion', header: 'Función Ejecutada en Atlob Consultores ERP', render: (r) => r.accion },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <BarraHerramientasLocal
        titulo="Guía Rápida y Atajos de Teclado de Atlob Consultores ERP"
        subtitulo="Operación acelerada sin ratón para digitación contable de alto volumen"
      />

      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <TablaDensa
          columnas={columnas}
          datos={ATAJOS}
          rowKey={(r) => r.tecla}
        />
      </div>
    </div>
  );
};
