import { Router } from 'express';
import { consolidacionController } from '../controllers/consolidacionController';
import { requireAuth, requireEmpresaMembership, requireRol } from '../middlewares/auth';
import { errorResponse } from '../utils/response';

const router = Router();

router.use(requireAuth);
router.use('/consolidacion', (req, res, next) => {
  const empresaId = req.body?.empresaId;
  if (typeof empresaId !== 'string' || !empresaId) return errorResponse(res, 'EMPRESA_REQUERIDA', 400);
  req.empresaId = empresaId;
  return next();
}, requireEmpresaMembership(['ADMINISTRADOR', 'CONTADOR_SENIOR']));

router.post('/consolidacion/calcular', requireRol(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'CONTADOR']), consolidacionController.calcular);
router.post('/consolidacion/contabilizar', requireRol(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'CONTADOR']), consolidacionController.contabilizar);
router.post('/consolidacion/extornar', requireRol(['ADMINISTRADOR', 'CONTADOR_SENIOR']), consolidacionController.extornar);

export const consolidacionRoutes = router;

