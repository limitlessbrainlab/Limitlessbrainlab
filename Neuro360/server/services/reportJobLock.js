let busy = false;

module.exports = {
  acquire() {
    if (busy) return false;
    busy = true;
    return true;
  },
  release() {
    busy = false;
  },
};
