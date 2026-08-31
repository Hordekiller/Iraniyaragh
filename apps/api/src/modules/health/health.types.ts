export const API_SERVICE_NAME = 'iranyaragh-api';

export type LivenessReport = {
  status: 'ok';
  service: typeof API_SERVICE_NAME;
  timestamp: string;
};

export type ReadinessReport = {
  status: 'ready' | 'not_ready';
  service: typeof API_SERVICE_NAME;
  timestamp: string;
  checks: {
    database: {
      status: 'up' | 'down';
    };
  };
  error?: {
    code: 'DATABASE_UNAVAILABLE';
    message: 'Required dependency is unavailable';
  };
};
