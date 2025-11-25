const { AsyncLocalStorage } = require("async_hooks");
const als = new AsyncLocalStorage();

function setConnForRequest(conn) {
  als.enterWith({ conn });
}
function getConn() {
  const store = als.getStore();
  if (!store || !store.conn) throw new Error("No DB connection in context");
  return store.conn;
}
function withConn(conn, fn) {
  return als.run({ conn }, fn);
}
module.exports = { setConnForRequest, getConn, withConn };
