import controllers from './server/controllers';
import routes from './server/routes';
import services from './server/services';
import config from './server/config';

export default () => ({
  register({ strapi }) {},
  bootstrap({ strapi }) {},
  destroy({ strapi }) {},
  config,
  controllers,
  routes,
  services,
  contentTypes: {},
  policies: {},
  middlewares: {},
});
