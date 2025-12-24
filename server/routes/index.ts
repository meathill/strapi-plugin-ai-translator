const ADMIN_POLICIES = ['admin::isAuthenticatedAdmin'];

function createAdminRoutes() {
  return [
    {
      method: 'GET',
      path: '/health',
      handler: 'translate.health',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/settings',
      handler: 'settings.getSettings',
      config: {
        policies: [...ADMIN_POLICIES],
      },
    },
    {
      method: 'PUT',
      path: '/settings',
      handler: 'settings.updateSettings',
      config: {
        policies: [...ADMIN_POLICIES],
      },
    },
    {
      method: 'POST',
      path: '/translate-document',
      handler: 'translate.translateDocument',
      config: {
        policies: [...ADMIN_POLICIES],
      },
    },
  ];
}

export default {
  admin: () => ({
    type: 'admin',
    routes: createAdminRoutes(),
  }),
};
