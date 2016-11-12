var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var mysql = require('mysql');

var connection = mysql.createConnection({
  host     : 'satoshidigits-mysql.cbxoxdbgejfz.eu-west-1.rds.amazonaws.com',
  port	   : 3306,
  user     : 'satoshidigits',
  password : '$shubteja$',
  database : 'satoshidigits'
});

connection.connect();

var session = require('express-session');
var RedisStore = require('connect-redis')(session);

var options = {
	'host': 'satoshidigits-redis.sjvvfh.0001.euw1.cache.amazonaws.com',
	'port': 6379,
	'ttl': 3600,
	'prefix': 'sess::',
}

var DEFAULT_RESPONSE = '{"status":false,"msg":"error."}';

// session middleware 
app.use(session({
	name: 'sid',
	store: new RedisStore(options),
	secret: '$at0shiN@kam0to',
	rolling: true,
	resave: true,
	saveUninitialized: true,
	cookie: { httpOnly: true}
}));

server.listen(8080, function(){
	console.log('listening on *:8080');
});

app.get('/', function (req, res) {
	var response = JSON.parse(DEFAULT_RESPONSE);
	res.json(response);
});

app.get('/login', function (req, res) {
	var response = JSON.parse(DEFAULT_RESPONSE);
	var username = req.param('username');
	var password = req.param('password');
	
	connection.query('SELECT password FROM user', function(err, rows){
    	if (rows) {
    		var spassword = rows[0].password;
    		if (password === spassword) {
    			req.session.username = rows[0].username;
				response.status = true;
				response.msg = 'login successful.';
				res.json(response);
    		} else{
    			response.status = false;
				response.msg = 'username or password is incorrect.';
				res.json(response);
    		}
    	} else {
    		res.json(response);
		}
  });
});

app.get('/logout', function(req, res) {
	var response = JSON.parse(DEFAULT_RESPONSE);
	var username = req.session.username;

	if (username) {
		req.session.destroy();
		response.status = true;
		response.msg = 'logout successful.';
		res.json(response);
	} else {
		res.json(response);
	}
});

io.on('connection', function(socket){
	console.log('a user connected');
	socket.on('disconnect', function(){
	console.log('user disconnected');
  });
});
