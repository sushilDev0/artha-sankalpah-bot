import dns from 'node:dns';

/**
 * Global DNS Configuration
 * Fixes SRV lookup issues for MongoDB Atlas by bypassing ISP DNS
 */
dns.setServers(['8.8.8.8', '8.8.4.4']);

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

console.log('🌐 Global DNS servers set to Google (8.8.8.8)');