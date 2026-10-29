'use strict';
const { createApp } = require('./app');
const { startScheduler } = require('./jobs');

const app = createApp();
const { ctx, server } = app;
startScheduler(ctx);
server.listen(ctx.config.port, () => {
  console.log(`EarToKeysMusic API listening on ${ctx.config.baseUrl}  (port ${ctx.config.port})`);
  console.log(ctx.gateway.constructor.name === 'MockGateway' ? 'Payments: FAKE gateway (set PAYSTACK_SECRET_KEY for real Paystack)' : 'Payments: Paystack');
});
const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
