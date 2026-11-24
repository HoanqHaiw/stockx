import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { notFound } from './lib/errors.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { masterRouter } from './modules/master/master.routes.js';
import { partnerRouter } from './modules/master/partner.routes.js';
import { materialsRouter } from './modules/materials/materials.routes.js';
import { purchasingRouter } from './modules/purchasing/purchasing.routes.js';
import { stockRouter } from './modules/stock/stock.routes.js';
import { quotationsRouter, salesOrdersRouter } from './modules/sales/sales.routes.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));
  if (config.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/master', masterRouter);
  app.use('/api/materials', materialsRouter);
  app.use('/api/suppliers', partnerRouter('supplier', ['PURCHASING']));
  app.use('/api/customers', partnerRouter('customer', ['SALES']));
  app.use('/api/purchase-orders', purchasingRouter);
  app.use('/api/stock', stockRouter);
  app.use('/api/quotations', quotationsRouter);
  app.use('/api/sales-orders', salesOrdersRouter);

  app.use((_req, _res, next) => next(notFound('API không tồn tại')));
  app.use(errorHandler);
  return app;
}
