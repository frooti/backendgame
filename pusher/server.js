var express = require('express')
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var mysql = require('mysql');
var _ = require('underscore');

// MYSQL
var connection = mysql.createConnection({
  host     : 'satoshidigits-mysql.cbxoxdbgejfz.eu-west-1.rds.amazonaws.com',
  port	   : 3306,
  user     : 'satoshidigits',
  password : '$shubteja$',
  database : 'satoshidigits'
});

connection.connect();

// REDIS
var redis = require("redis");
var redisclient = redis.createClient(port=6379, host='satoshidigits-redis.sjvvfh.0001.euw1.cache.amazonaws.com');


// SESSION STORE
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
var sessionMiddleware = session({
	name: 'sid',
	store: new RedisStore(options),
	secret: '$at0shiN@kam0to',
	rolling: true,
	resave: true,
	saveUninitialized: true,
	cookie: { httpOnly: true}
});

io.use(function(socket, next) {
    sessionMiddleware(socket.request, socket.request.res, next);
});

app.use(sessionMiddleware);

// post body middleware
var bodyParser = require('body-parser')
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

// static files
app.use(express.static('static'));

server.listen(8080, function(){
	console.log('listening on *:8080');
});

app.get('/', function (req, res) {
	var response = JSON.parse(DEFAULT_RESPONSE);
	res.json(response);
});

// LOGIN //

app.get('/login', function (req, res) {
	var response = JSON.parse(DEFAULT_RESPONSE);
	var username = req.param('username'); //req.body.username;
	var password = req.param('password'); //req.body.password;
	
	connection.query('SELECT username, password FROM user', function(err, rows){
    	if (rows) {
    		var spassword = rows[0].password;
    		if (password === spassword) {
    			req.session.username = rows[0].username;
				response.status = true;
				response.msg = 'login successful';
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

// SIGNUP
app.post('/signup', function (req, res) {
	var response = JSON.parse(DEFAULT_RESPONSE);
	var username = req.body.username;
	var password = req.body.password;
	var email = req.body.email;

	if (username && password && email) {
		// username check
 		connection.query('SELECT username FROM user WHERE username=?', [username], function(err, rows){
	    	if (rows) {
	    		response.msg = 'username already exists.';
	    		res.json(response)
	    	} else {
	    		// account creation
	    		var record = {'username': username, 'password': password, 'email': email};
	    		connection.query('INSERT INTO user SET ?', record, function(err, res){
    				response.status = true;
	    			response.msg = 'account created successfully.';
	    			res.json(response);
    			});
			}
	  	});
  	} else {
  		res.json(response);
  	}
});

// GAME
var POTS = [1, 0.1, 0.01, 0.001, 0.0001];
var DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// close round
function closeRound(gameid, round) {
	if (gameid && round) {
		redisclient.hget('game::'+gameid, round, function (err, res) {
			if (res && res.round === round) {
				redisclient.hset('game::'+gameid, 'round_status', 'closed', function (err, res) {
					io.sockets.in(gameid).emit('roundclosed', {'round': round});
				});
			}
		});
	}
}

// next round
function nextRound(gameid, username) { // race-conditon/transaction
	if (gameid, username) {
		var users = JSON.parse(gameid);
		var opponent = _.difference(users, [username])[0];

		redisclient.hmget('game::'+gameid, round, round_status, function (err, res) {
			if (res.round_status === 'closed') {
				// waiting for opponent to accept
				redisclient.hset('game::'+gameid, res.round_status, username, function (err, res) {
					io.sockets.in(opponent).emit('opponentstartednextround');
				}); 
			} else if (res.round_status === opponent) {
				// started next round
				var satoshidigits = _.sample(DIGITS, 5);
				var gamepot = {'round': res.round+1, 'satoshidigits':JSON.stringify(satoshidigits), 'round_status': 'open'};
				gamepot[username+'digits'] = JSON.strigify([]);
				gamepot[opponent+'digits'] = JSON.strigify([]);
				redisclient.hmset('game::'+gameid, gamepot, function (err, res) {
					io.sockets.in(gameid).emit('roundstarted', {'users': users, 'round': res.round+1});
					// digits timer
					setTimeout(closeRound, 30*1000, gameid, res.round+1);

					// result timer
					setTimeout(getRoundResult, 35*1000, gameid, res.round+1);
				});				
			}
		});
	}
}

// round result
function getRoundResult(gameid, round) {
	if (gameid && round) {
		redisclient.hget('game::'+gameid, round, function (err, res) {
			if (res && res.round === round) {
				var result = {};
				var users = JSON.parse(gameid);
				var user1 = users[0];
				var user2 = users[1];
				var satoshidigits = JSON.parse(res.satoshidigits);
				var user1digits = res[user1] ? JSON.parse(res[user1]) : [];
				var user2digits = res[user2] ? JSON.parse(res[user2]) : [];
				var potvalue = res.value;

				result.users = [user1, user2];
				result.potvalue = potvalue;
				result.satoshidigits = satoshidigits;

				var user1matched = _.intersection(satoshidigits, user1digits);
				var user2matched = _.intersection(satoshidigits, user2digits);

				if (user1matched.length > user2matched.length) {
					result.winner = user1;
				} else if (user1matched.length < user2matched.length) {
					result.winner = user2;
				} else {
					result.winner = 'draw';
				}

				io.in(gameid).emit('roundresult', result);
				delete result.satoshidigits;
				io.emit('results', result);
			}
		});
	}
}

// quit game
function quitGame(gameid, username) { // race-condition/transaction
	if (gameid, username) {
		var users = JSON.parse(gameid);
		var opponent = _.difference(users, [username])[0];

		redisclient.hget('game::'+gameid, round_status, function (err, res) {
			if (res.round_status !== 'open') {
				// quit game
				redisclient.hdel('game::'+gameid, function (err, res) {
					io.sockets.in(gameid).emit('gamestopped');
					// leave room and socket.nickname = undefined
					io.sockets.clients(someRoom).forEach(function(s){
    					delete s.nickname;
    					s.leave(someRoom);
					});
				}); 
			}
		});
	}
}

// user disconnected
function userDisconnected(gameid, username) { // race-condition/transaction
	if (gameid, username) {
		var users = JSON.parse(gameid);
		var opponent = _.difference(users, [username])[0];

		redisclient.hget('game::'+gameid, round_status, function (err, res) {
			if (res.round_status !== 'open') {
				// disconnected
				redisclient.hdel('game::'+gameid, function (err, res) {
					io.sockets.in(gameid).emit('gamestopped', {'disconnected': username});
					// leave room and socket.nickname = undefined
					io.sockets.clients(someRoom).forEach(function(s){
    					delete s.nickname;
    					s.leave(someRoom);
					});
				}); 
			}
		});
	}
}


io.on('connection', function(socket){
	console.log('a user connected');
	
	socket.on('disconnect', function(){
		console.log('user disconnected');
		var username = socket.request.username;
		var gameid = socket.nickname;
		userDisconnected(gameid, username);
  	});

  	// joingame
  	socket.on('joingame', function (data) {
  		var pot = data.btc;
  		var username = socket.request.username;
  		// personal room
		if (socket.rooms.indexOf(username) < 0) {
			socket.join(username);
		}

  		if (username && pot && POTS.contains(pot)) { // transaction
  			redisclient.lpop('game::BTC'+pot, function (err, res) {
  				if (res) { // connected
  					var opponent = res;
  					var gameid = [username, opponent].sort(function(a, b){
							if(a < b) return -1;
							if(a > b) return 1;
							return 0;
						});
  					gameid = JSON.stringify(gameid);

  					// join user to game room
					socket.join(gameid);
					socket.nickname = gameid;
					
					// join opponent to game room
					var opponentsockets = io.sockets.clients(opponent);
					opponentsockets.forEach(function(s) {
						s.join(gameid);
						s.nickname = gameid;

					});

					// start first round
					var satoshidigits = _.sample(DIGITS, 5);
					var gamepot = {'round': 1, 'value': pot*2, 'satoshidigits':JSON.stringify(satoshidigits), 'round_status': 'open'};

					redisclient.hmset('game::'+gameid, gamepot, function (err, res) {
						io.sockets.in(gameid).emit('gamestarted', {'users': [username, opponent]});
						// digits timer
						setTimeout(closeRound, 30*1000, gameid, 1);

						// result timer
						setTimeout(getRoundResult, 35*1000, gameid, 1);
					});
				} else {   // enqueue
  					redisclient.rpush('game::BTC'+pot, username);
  				}
  			});
		}
	});
	
	// select digits
	socket.on('selectdigits', function (data) {
		var username = socket.request.username;
		var digits = data.digits;
		var gameid = socket.nickname;

		if (username && digits && DIGITS.contains(digits)) {
			redisclient.hget('game::'+gameid, 'round_status', function (err, res) {
				if (res.round_status === 'open') { 
					redisclient.hset('game::'+gameid, username+'digits', JSON.strigify(digits), function (err, res) {
						socket.emit('selecteddigits', {'digits': digits});
						socket.broadcast.to(gameid).emit('opponentselecteddigits', {'digits': digits});
					});
				}
			});
		}
	});

	// next round
	socket.on('nextround', function (data) {
		var username = socket.request.username;
		var gameid = socket.nickname;
		nextRound(gameid, username);
	});

	// quit game
	socket.on('quitgame', function (data) {
		var username = socket.request.username;
		var gameid = socket.nickname;
		quitGame(gameid, username);
	});

	// game chat
	socket.on('gamechat', function (data) {
		var username = socket.request.username;
		var gameid = socket.nickname;

		if (username) {
			socket.broadcast.to(gameid).emit('gamechat', data);
		}
	});	
});
