var app = require('http').createServer(handler)
var io = require('socket.io')(app);
var fs = require('fs');

app.listen(8080);

io.on('connection', function (socket) {
  socket.emit('betstream', [['shubham', '0.01', 'lost'], ['teja', '0.02', 'won']]);
  socket.on('pot', function (data) {
    console.log(data);
  });
});