const usersService = require('./users/adminUsers.service');
const notificationsService = require('./notifications/adminNotifications.service');

async function preloadAdminCache() {
  const results = await Promise.allSettled([
    usersService.listUsers({ sort: 'newest', limit: 25 }),
    notificationsService.getNotificationStats(),
  ]);

  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    console.warn(`Admin cache preload completed with ${failures.length} failure(s).`);
  } else {
    console.log('Admin cache preloaded.');
  }
}

module.exports = { preloadAdminCache };
