import { useEmpresaPeriodo } from './EmpresaPeriodoContext';
import { useToast } from './ToastContext';

export function useAppContext() {
  const { empresaActiva, periodo } = useEmpresaPeriodo();
  const { success, error, warning, info } = useToast();

  const notify = (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info'
  ) => {
    if (type === 'success') success(message);
    else if (type === 'error') error(message);
    else if (type === 'warning') warning(message);
    else info(message);
  };

  return {
    state: {
      activeEmpresa: empresaActiva?.id || 'emp-01',
      activeEmpresaRuc: empresaActiva?.ruc || '20601234567',
      activeEmpresaNombre: empresaActiva?.razonSocial || 'COMERCIALIZADORA ANDINA S.A.C.',
      activePeriodo: periodo || '2026-03',
      token: typeof window !== 'undefined' ? localStorage.getItem('atlob_access_token') : null,
    },
    notify,
  };
}
