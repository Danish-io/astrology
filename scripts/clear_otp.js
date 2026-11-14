const { run } = require('../lib/db');
run("DELETE FROM otp_verifications WHERE target = ?", ['+919876543210']);
console.log('cleared');
