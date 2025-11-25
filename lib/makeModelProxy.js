const { getConn } = require("../lib/dbContext");

function makeModelProxy(modelName, schema) {
  function getModel() {
    const conn = getConn();
    return conn.models[modelName] || conn.model(modelName, schema);
  }
  const handler = {
    get(_t, prop) {
      return getModel()[prop];
    },
    apply(_t, thisArg, args) {
      return getModel().apply(thisArg, args);
    },
    construct(_t, args) {
      const M = getModel();
      return new M(...args);
    },
  };
  function dummy() {}
  return new Proxy(dummy, handler);
}
module.exports = { makeModelProxy };
