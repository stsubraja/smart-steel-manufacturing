const test = require('node:test');
const assert = require('node:assert/strict');
const { visibleNotificationQuery, announcementRecipientQuery } = require('../src/utils/notificationAudience');

test('admin announcements are visible to users, including future users, but not admins', () => {
  const userId = 'user-id';
  const userQuery = visibleNotificationQuery({ _id: userId, role: 'USER' });
  const adminQuery = visibleNotificationQuery({ _id: 'admin-id', role: 'ADMIN' });
  const generalAudience = userQuery.$or.find(item => Array.isArray(item.audience?.$in))?.audience.$in;
  assert.ok(generalAudience?.includes('USERS_ONLY'));
  assert.ok(generalAudience?.includes('ALL_USERS'));
  assert.ok(!adminQuery.$or.some(item => item.audience === 'ALL_USERS' || item.audience?.$in));
  assert.deepEqual(adminQuery, { $or: [
    { audience: 'USERS', recipients: 'admin-id' },
    { audience: 'ACTIVE_USERS', recipients: 'admin-id' }
  ] });
});

test('announcement delivery targets active regular users and excludes the sender', () => {
  assert.deepEqual(announcementRecipientQuery('admin-id'), {
    status: 'ACTIVE', role: 'USER', _id: { $ne: 'admin-id' }
  });
});
