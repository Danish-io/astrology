const { get } = require('../lib/db');
console.log(JSON.stringify(get("SELECT COUNT(*) AS n FROM otp_verifications WHERE target = ?", ['+919876543210'])));
console.log(JSON.stringify(get("SELECT COUNT(*) AS n FROM otp_verifications WHERE created_at > datetime('now','-10 minutes')")));
