const localStore = require('./localStore');
const accountStore = require('./localAccountStore');

Object.assign(localStore, accountStore);

module.exports = localStore;
