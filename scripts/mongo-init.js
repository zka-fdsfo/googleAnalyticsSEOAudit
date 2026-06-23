// MongoDB initialization script — runs once on first container start
db = db.getSiblingDB('seo-audit-tool');

db.createCollection('users');
db.createCollection('audits');

db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ googleId: 1 }, { sparse: true });
db.audits.createIndex({ userId: 1, createdAt: -1 });
db.audits.createIndex({ url: 1, createdAt: -1 });
db.audits.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // Auto-delete after 90 days

print('✅ MongoDB seo-audit-tool database initialized');
