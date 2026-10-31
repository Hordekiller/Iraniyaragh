import type { Instrumentation } from 'next';
import { logRenderFailure } from '@iranyaragh/contracts';

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  logRenderFailure(
    'iranyaragh-storefront',
    process.env.APP_VERSION,
    request.headers['x-request-id'],
    context.routePath,
    error,
  );
};
