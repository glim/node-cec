'use strict';

function emitLines(stream) {
  var backlog;
  backlog = '';
  stream.on('data', function(data) {
    backlog += data;
    var results = [];
    var n = backlog.indexOf('\n');
    while (~n) {
      stream.emit('line', backlog.substring(0, n));
      backlog = backlog.substring(n + 1);
      results.push(n = backlog.indexOf('\n'));
    }
  });
  return stream.on('end', function() {
    if (backlog) {
      return stream.emit('line', backlog);
    }
  });
};

module.exports = emitLines;
