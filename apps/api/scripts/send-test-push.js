#!/usr/bin/env node
/**
 * Send ONE test push straight to an FCM token — for checking Firebase/APNs
 * setup (plan 07, P0) without the API, Kafka or the database.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=<base64> node scripts/send-test-push.js <fcmToken> [invoiceId] [orgId]
 *
 * With an invoiceId the push carries the same `data` as a real `invoice`
 * notification, so tapping it exercises the app's deep link.
 */
const { cert, initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

const [token, invoiceId = '', organizationId = ''] = process.argv.slice(2);
if (!token) {
  console.error('Usage: node scripts/send-test-push.js <fcmToken> [invoiceId] [orgId]');
  process.exit(1);
}
const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!encoded) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  process.exit(1);
}

const app = initializeApp({ credential: cert(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))) });

getMessaging(app)
  .send({
    token,
    notification: { title: 'Thông báo thử', body: `Gửi lúc ${new Date().toLocaleTimeString('vi-VN')}` },
    data: {
      notificationId: '00000000-0000-4000-8000-000000000000',
      type: 'invoice',
      organizationId,
      targetType: invoiceId ? 'invoice' : '',
      targetId: invoiceId,
      targetSlug: '',
      targetBranchId: '',
      v: '1',
    },
    android: { priority: 'high', notification: { channelId: 'erp_documents' } },
    apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
  })
  .then((id) => console.log(`Sent: ${id}`))
  .catch((err) => {
    console.error(`Failed: ${err.code ?? ''} ${err.message}`);
    process.exit(1);
  });
