import { Router } from 'express';
import { consolidacionController } from '../controllers/consolidacionController';
import { requireAuth, requireRol } from '../middlewares/auth';

const router = Router();

router.use(requireAuth);

router.post('/consolidacion/calcular', requireRol(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'CONTADOR']), consolidacionController.calcular);
router.post('/consolidacion/contabilizar', requireRol(['ADMINISTRADOR', 'CONTADOR_SENIOR', 'CONTADOR']), consolidacionController.contabilizar);
router.post('/consolidacion/extornar', requireRol(['ADMINISTRADOR', 'CONTADOR_SENIOR']), consolidacionController.extornar);

export const consolidacionRoutes = router;

