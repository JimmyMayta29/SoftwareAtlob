import React from 'react';

export interface ColumnaTablaDensa<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  numeric?: boolean;
  render?: (fila: T, index: number) => React.ReactNode;
}

export interface TablaDensaProps<T> {
  columnas: ColumnaTablaDensa<T>[];
  datos: T[];
  rowKey: (fila: T, index: number) => string | number;
  mensajeVacio?: string;
  mensajeError?: string | null;
  cargando?: boolean;
  filaTotales?: React.ReactNode;
  totales?: Record<string, React.ReactNode>;
  onRowClick?: (fila: T) => void;
  filaSeleccionadaKey?: string | null;
}

export function TablaDensa<T>({
  columnas,
  datos,
  rowKey,
  mensajeVacio = 'Sin registros para el filtro o período seleccionado.',
  mensajeError = null,
  cargando = false,
  filaTotales,
  totales,
  onRowClick,
  filaSeleccionadaKey,
}: TablaDensaProps<T>) {
  return (
    <div className="w-full overflow-x-auto border border-[#D1D5DB] bg-[#FFFFFF] rounded-none">
      <table className="tabla-densa">
        <thead>
          <tr>
            {columnas.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={
                  col.align === 'right' || col.numeric
                    ? 'text-right tabular-nums'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left'
                }
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cargando ? (
            <tr>
              <td colSpan={columnas.length} className="text-center py-4 text-[#4B5563]">
                Cargando registros contables...
              </td>
            </tr>
          ) : mensajeError ? (
            <tr>
              <td colSpan={columnas.length} className="text-center py-4 text-[#B91C1C] font-bold">
                Error: {mensajeError}
              </td>
            </tr>
          ) : datos.length === 0 ? (
            <tr>
              <td colSpan={columnas.length} className="text-center py-4 text-[#4B5563]">
                {mensajeVacio}
              </td>
            </tr>
          ) : (
            datos.map((fila, idx) => {
              const key = String(rowKey(fila, idx));
              const seleccionada = filaSeleccionadaKey === key;
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(fila)}
                  className={`${
                    seleccionada
                      ? 'bg-[#E8ECF1] text-[#1E3A5F]'
                      : idx % 2 === 0
                      ? 'bg-[#FFFFFF] hover:bg-[#E8ECF1]'
                      : 'bg-[#F5F7FA] hover:bg-[#E8ECF1]'
                  } ${onRowClick ? 'cursor-pointer' : ''} transition-colors`}
                >
                  {columnas.map((col) => (
                    <td
                      key={col.key}
                      className={
                        col.align === 'right' || col.numeric
                          ? 'text-right tabular-nums'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }
                    >
                      {col.render ? col.render(fila, idx) : String((fila as any)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
        {(filaTotales || totales) && (
          <tfoot>
            {filaTotales}
            {totales && (
              <tr>
                {columnas.map((col) => (
                  <td
                    key={col.key}
                    className={
                      col.align === 'right' || col.numeric
                        ? 'text-right tabular-nums'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    }
                  >
                    {totales[col.key] ?? ''}
                  </td>
                ))}
              </tr>
            )}
          </tfoot>
        )}
      </table>
    </div>
  );
}
