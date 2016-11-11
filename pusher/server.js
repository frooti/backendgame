var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);

var session = require('express-session');
var RedisStore = require('connect-redis')(session);

var options = {
	'host': 'satoshidigits-redis.sjvvfh.0001.euw1.cache.amazonaws.com',
	'port': 6379,
	'ttl': 3600,
	'prefix': 'sess::',
}

app.use(session({
    store: new RedisStore(options),
    secret: '$at0shiN@kam0to'
}));

server.listen(8080, function(){
  console.log('listening on *:8080');
});

app.get('/', function (req, res) {
  console.log(req.session);
});

io.on('connection', function(socket){
  console.log('a user connected');
  socket.on('disconnect', function(){
    console.log('user disconnected');
  });
});
