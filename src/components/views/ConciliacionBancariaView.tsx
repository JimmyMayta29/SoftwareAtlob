import React from 'react';
import { useEmpresaPeriodo } from '../../context/EmpresaPeriodoContext';
import { useConciliacionV2Config } from '../../hooks/useConciliacionV2';
import { ConciliacionBancariaLegacyView } from './ConciliacionBancariaLegacyView';
import { ConciliacionBancariaV2View } from './ConciliacionBancariaV2View';

export const ConciliacionBancariaView: React.FC = () => {
  const { empresaId, usuario } = useEmpresaPeriodo();
  const { data: config } = useConciliacionV2Config(usuario?.id ? empresaId : null);

  if (config?.conciliacionV2Habilitada === true) {
    return <ConciliacionBancariaV2View />;
  }

  return <ConciliacionBancariaLegacyView />;
};
