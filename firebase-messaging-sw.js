// firebase-messaging-sw.js
// Handles push notifications when app is in background

importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js');

// Your Firebase config (same as in script.js)
const firebaseConfig = {
  apiKey: "AIzaSyCUDOcVN9XhjlVPBdUjsFJZ7j63VRESoPQ",
  authDomain: "vbot-call-notificaion.firebaseapp.com",
  projectId: "vbot-call-notificaion",
  storageBucket: "vbot-call-notificaion.firebasestorage.app",
  messagingSenderId: "662455511920",
  appId: "1:662455511920:web:6f6f63cb31ed3d9cf63db5"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Background message received:', payload);
  
  const notificationTitle = payload.notification?.title || 'Cuộc gọi đến';
  const notificationOptions = {
    body: payload.notification?.body || 'Bạn có cuộc gọi đến',
    icon: 'https://files.tansinh.info/ads/tridhsp_1752750602636_ad_tridhsp_1752750602636.png',
    badge: 'https://files.tansinh.info/ads/tridhsp_1752750602636_ad_tridhsp_1752750602636.png',
    tag: 'incoming-call',
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked');
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});