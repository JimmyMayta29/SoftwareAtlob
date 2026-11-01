import { Router } from 'express';
import { parametroController } from '../controllers/parametroController';
import { requireAuth, requireRol } from '../middlewares/auth';

const router = Router();

router.use(requireAuth);

router.get('/', parametroController.listar);
router.get('/historial', parametroController.historial);
router.post('/', requireRol(['ADMIN_ESTUDIO', 'ADMINISTRADOR', 'ADMIN']), parametroController.guardar);
router.put('/:codigo', requireRol(['ADMIN_ESTUDIO', 'ADMINISTRADOR', 'ADMIN']), (req, res) => {
  req.body = { ...req.body, codigoParametro: req.params.codigo || req.body.codigoParametro };
  return parametroController.guardar(req, res);
});
router.get('/cronograma', parametroController.obtenerCronograma);

export const parametroRoutes = router;
