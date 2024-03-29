var express = require('express')
var httpsRedirect = require('express-https-redirect');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var mysql = require('mysql');
var _ = require('underscore');



app.use(httpsRedirect());

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


// CORS
var cors = require('cors');

var whitelist = ['https://satoshidigits.com'];
var corsOptions = {
	origin: 'https://satoshidigits.com',
	methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  	credentials: true
};

app.use(cors(corsOptions));

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

app.use(sessionMiddleware);

// Use shared session middleware for socket.io
// setting autoSave:true
var sharedsession = require("express-socket.io-session");

io.use(sharedsession(sessionMiddleware, {
    autoSave:true
}));

// post body middleware
var bodyParser = require('body-parser')
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

// static files
app.use(express.static(__dirname+'/static'));

server.listen(80, function(){
	//console.log('listening on *:80');
});

app.get('/', function (req, res) {
	var response = JSON.parse(DEFAULT_RESPONSE);
	res.json(req.session.username);
});

// HELMET
var helmet = require('helmet');
app.use(helmet());

// CAJA - HTML sanitizer
var sanitizer = require('sanitizer');

// LOGIN //

app.get('/login', function (req, res) {
	var response = JSON.parse(DEFAULT_RESPONSE);
	var username = req.param('username');
	var password = req.param('password');

	if (req.session.username) {
		response.status = true;
		response.msg = 'login successful';
		response.username = req.session.username;

		res.json(response);
	} else {
		connection.query('SELECT password FROM user WHERE username=?', username, function(err, rows){
	    	if (rows) {
	    		var spassword = rows[0].password;
	    		if (password === spassword) {
	    			req.session.username = username;
					response.status = true;
					response.msg = 'login successful';
					response.username = req.session.username;
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
	 }
});

app.post('/login', function (req, res) {
	var response = JSON.parse(DEFAULT_RESPONSE);
	var username = req.body.username;
	var password = req.body.password;

	if (req.session.username) {
		response.status = true;
		response.msg = 'login successful';
		response.username = req.session.username;

		res.json(response);
	} else if (username && password) {
		connection.query('SELECT password FROM user WHERE username=?', username, function(err, rows){
	    	if (rows.length > 0) {
	    		var spassword = rows[0].password;
	    		if (password === spassword) {
	    			req.session.username = sanitizer.escape(username);
					response.status = true;
					response.msg = 'login successful';
					response.username = sanitizer.escape(username);
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
	 } else {
	 	res.json(response);
	 }
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
	    	if (rows.length > 0) {
	    		response.msg = 'username already exists.';
	    		res.json(response)
	    	} else {
	    		// account creation
	    		var record = {'username': username, 'password': password, 'email': email};
	    		connection.query('INSERT INTO user SET ?', record, function(err, resp){
    				req.session.username = sanitizer.escape(username);
    				response.status = true;
	    			response.msg = 'account created successfully.';
	    			response.username = username;
	    			res.json(response);
    			});
			}
	  	});
  	} else {
  		res.json(response);
  	}
});

// GAME
var POTS = [0.2, 0.1, 0.05, 0.01, 0.001];
var DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];


// online users
function onlineUsers() {
	var online = Object.keys(io.sockets.sockets).length;
	io.emit('online', {'count':online});
}
setInterval(onlineUsers, 30*1000);

// close round
function closeRound(gameid, round) {
	if (gameid && round) {
		redisclient.hget('game::'+gameid, 'round', function (err, res) {
			if (res && parseInt(res) === parseInt(round)) {
				redisclient.hset('game::'+gameid, 'round_status', 'closed', function (err, res) {
					io.to(gameid).emit('roundclosed', {'round': round});
					//console.log('roundclosed');
				});
			}
		});
	}
}

// next round
function nextRound(gameid, username) { // race-conditon/transaction
	if (gameid && username) {
		var users = JSON.parse(gameid);
		var opponent = _.difference(users, [username])[0];

		redisclient.hmget('game::'+gameid, 'round', 'round_status', 'result', function (err, res) {
			var res = {'round':res[0],'round_status':res[1],'result':res[2]};

			if (res.round_status === opponent) {
				redisclient.hdel('game::'+gameid, 'result', function (err, result) {
					// started next round
					var satoshidigits = _.sample(DIGITS, 5);
					var round = parseInt(res.round);
					var gamepot = {'round': round+1, 'satoshidigits':JSON.stringify(satoshidigits), 'round_status': 'open'};
					gamepot[username+'digits'] = JSON.stringify([]);
					gamepot[opponent+'digits'] = JSON.stringify([]);
					redisclient.hmset('game::'+gameid, gamepot, function (err, res) {
						io.to(gameid).emit('nextroundstarted', {'users': users, 'round': round+1});
						// digits timer
						setTimeout(closeRound, 21*1000, gameid, round+1);

						// result timer
						setTimeout(getRoundResult, 23*1000, gameid, round+1);
					});	
				});			
			} else if (res.result) {
				// waiting for opponent to accept
				redisclient.hset('game::'+gameid, 'round_status', username, function (err, res) {
					io.to(opponent).emit('opponentstartednextround');
				}); 
			} 
		});
	}
}

// round result
function getRoundResult(gameid, round) {
	if (gameid && round) {
		redisclient.hgetall('game::'+gameid, function (err, res) {
			if (res && parseInt(res.round) === parseInt(round)) {
				var result = {};
				var users = JSON.parse(gameid);
				var user1 = users[0];
				var user2 = users[1];
				var satoshidigits = JSON.parse(res.satoshidigits);
				var user1digits = res[user1+'digits'] ? JSON.parse(res[user1+'digits']) : [];
				var user2digits = res[user2+'digits'] ? JSON.parse(res[user2+'digits']) : [];
				var potvalue = parseFloat(res.value);

				result.users = [user1, user2];
				result.potvalue = potvalue;
				result.satoshidigits = satoshidigits;

				var user1matched = _.intersection(satoshidigits, user1digits);
				var user2matched = _.intersection(satoshidigits, user2digits);

				if (user1matched.length > user2matched.length) {
					result.winner = user1;
					result.draw = false;
				} else if (user1matched.length < user2matched.length) {
					result.winner = user2;
					result.draw = false;
				} else {
					result.draw = true;
					result.winner = 'draw';
				}

				// result declared
				redisclient.hset('game::'+gameid, 'result', result.winner, function (err, res) {
					io.to(gameid).emit('roundresult', result);
					//  check opponent connection
					var gamesockets = getAllRoomMembers(gameid);
					// delete pot data on disconnection
					if (gamesockets.length < 2) { 
						redisclient.del('game::'+gameid, function (err, res) {
							io.to(gameid).emit('gamestopped');
							gamesockets.forEach(function(s) {
								s.nickname = 0; // not connected
								s.leave(gameid);					
							});
						});
					}
					delete result.satoshidigits;
					io.emit('results', result);
				});

			}
		});
	}
}

// quit game
function quitGame(gameid, username) { // race-condition/transaction
	if (gameid && username) {
		var users = JSON.parse(gameid);
		var opponent = _.difference(users, [username])[0];

		redisclient.hget('game::'+gameid, 'result', function (err, res) {
			if (res) {
				redisclient.del('game::'+gameid, function (err, res) {
					// quit game
					io.to(gameid).emit('gamestopped');
					// leave room and socket.handshake.session.gameid = undefined

					var gamesockets = getAllRoomMembers(gameid);
					gamesockets.forEach(function(s){
						s.nickname = 0;
						s.leave(gameid);
					});	
				}); 
			}
		});
	}
}

// user disconnected
function userDisconnected(gameid, username) { // race-condition/transaction
	if (gameid === 0) { // not connected (ignore)
		// pass
	} else if (gameid === 1) { // connecting... (deque)
		var multi = redisclient.multi();
		POTS.forEach(function (pot) {
			multi.lrem('game::BTC'+pot, 1, username);
		});
		multi.exec(function (err, replies) {
    		//console.log(replies);
		});
	} else { // connected (clean)
		var users = JSON.parse(gameid);
		var opponent = _.difference(users, [username])[0];

		//io.to(gameid).emit('playerdisconnected', {'username': username});
		// // leave room and socket.handshake.session.gameid = 0
		redisclient.hget('game::'+gameid, 'result', function (err, result){
			if (result) {
				//console.log('disconnecting::'+result);
				var gamesockets = getAllRoomMembers(gameid);
				// delete pot data on disconnection
				redisclient.del('game::'+gameid, function (err, res) {
					io.to(gameid).emit('gamestopped');
					gamesockets.forEach(function(s) {
						s.nickname = 0; // not connected
						s.leave(gameid);					
					});
				});	
			}
		});
	}
}


function getAllRoomMembers(room, _nsp) {
	var roomMembers = [];
	var nsp = (typeof _nsp !== 'string') ? '/' : _nsp;

	if (io.nsps[nsp].adapter.rooms[room]) {
		for(var sid in io.nsps[nsp].adapter.rooms[room].sockets) {
	        if (io.sockets.connected[sid]) {
	        	roomMembers.push(io.sockets.connected[sid]);
	    	}
	    }
    }
    return roomMembers;
}

io.on('connection', function(socket){
	//console.log('a user connected');
	socket.nickname = 0; // not connected
	//socket.handshake.session.gameid = 0; // not connected
	socket.handshake.session.save();
	
	socket.on('disconnect', function(){
		//console.log('user disconnected');
		var username = socket.handshake.session.username;
		var gameid = socket.nickname; // socket.handshake.session.gameid;
		userDisconnected(gameid, username);
  	});

  	// joingame
  	socket.on('joingame', function (data) {
  		socket.handshake.session.reload(function(err) { // update session info
 			var pot = data.btc;
	  		var username = socket.handshake.session.username;
	  		
	  		// personal room
			if (username && getAllRoomMembers(username).length <= 0) {
				socket.join(username);
			}

			if (username && pot && _.contains(POTS, pot)) { // transaction
	  			if (socket.nickname === 0) { // not connected
	  				redisclient.lpop('game::BTC'+pot, function (err, res) {
		  				if (res) { // game started
		  					var opponent = res;
		  					var gameid = [username, opponent].sort(function(a, b){
									if(a < b) return -1;
									if(a > b) return 1;
									return 0;
								});
		  					gameid = JSON.stringify(gameid);

		  					// join user to game room
							socket.join(gameid);
							socket.nickname = gameid; // connected
							//socket.handshake.session.gameid = gameid;
							//socket.handshake.session.save();
							
							// join opponent to game room
							var opponentsockets = getAllRoomMembers(opponent);
							
							opponentsockets.forEach(function(s) {
								s.join(gameid);
								s.nickname = gameid;

							});

							// start first round
							var satoshidigits = _.sample(DIGITS, 5);
							var gamepot = {'round': 1, 'value': pot*2, 'satoshidigits':JSON.stringify(satoshidigits), 'round_status': 'open'};

							redisclient.hmset('game::'+gameid, gamepot, function (err, res) {
								io.to(gameid).emit('gamestarted', {'users': [username, opponent]});
								// digits timer
								setTimeout(closeRound, 21*1000, gameid, 1);

								// result timer
								setTimeout(getRoundResult, 23*1000, gameid, 1);
							});
						} else {   // enqueue
							socket.nickname = 1; // connecting
							//socket.handshake.session.gameid = 1; // connecting
							//socket.handshake.session.save();
		  					redisclient.rpush('game::BTC'+pot, username);
		  				}
		  			});				
				}
			}
		});
	});
	
	// select digits
	socket.on('selectdigits', function (data) {
		var username = socket.handshake.session.username;
		var digits = data.digits;
		var gameid = socket.nickname; // socket.handshake.session.gameid;
		//console.log('selecteddigits::username::'+username+'::digits::'+digits);

		if (username && digits && _.difference(_.intersection(DIGITS, digits), digits).length == 0) {
			if (_.isString(gameid)) { // connected
				redisclient.hget('game::'+gameid, 'round_status', function (err, res) {
					if (res === 'open') { 
						//console.log('Round is Open');
						redisclient.hset('game::'+gameid, username+'digits', JSON.stringify(digits), function (err, res) {
							socket.emit('selecteddigits', {'digits': digits}); // ack
							socket.broadcast.to(gameid).emit('opponentselecteddigits', {'digits': digits});
						});
					}else{
						//console.log('Round is closed: '+username+"::digits::"+digits);
					}
				});
			}
		}
	});

	// next round
	socket.on('nextround', function (data) {
		var username = socket.handshake.session.username;
		var gameid = socket.nickname; // socket.handshake.session.gameid;
		nextRound(gameid, username);
	});

	// quit game
	socket.on('quitgame', function (data) {
		var username = socket.handshake.session.username;
		var gameid = socket.nickname; // socket.handshake.session.gameid;
		quitGame(gameid, username);
	});

	// game chat
	socket.on('gamechat', function (data) {
		var username = socket.handshake.session.username;
		var gameid = socket.nickname; // socket.handshake.session.gameid;

		// sanitize
		var msg = sanitizer.escape(data.msg);

		if (username && _.isString(gameid)) { // connected
			socket.broadcast.to(gameid).emit('gamechat', {'msg': msg});
		}
	});	
});
