const bootstrapRepo = require('./bootstrap.repository');
const { NotFoundError } = require('../../shared/errors');

async function getBootstrap(userId) {
  const data = await bootstrapRepo.getBootstrapData(userId);
  if (!data) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }
  return data;
}

module.exports = {
  getBootstrap,
};
