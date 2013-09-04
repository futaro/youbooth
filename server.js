String.prototype.h = function() {
	return this
		.split('&').join('&amp;')
		.split('"').join('&quot;')
		.split("'").join('&#039;')
		.split('<').join('&lt;')
		.split('>').join('&gt;');
}

// loas modules
var express = require('express')
  , everyauth = require('everyauth')
  , conf = require('./conf')
  , io = require('socket.io')
  , MemoryStore = express.session.MemoryStore
  , sessionStore = new MemoryStore()
  , mysql = require('mysql')
  , YB_Booth = require('./lib/Booth')
  , YB_User = require('./lib/User')


// mysql client
var client = mysql.createClient({
		user: conf.db.user,
		password: conf.db.password,
		database: conf.db.db
	});
	client.query('USE '+conf.db.db);


// variables
var usersById = {};
var nextUserId = 0;
var usersByFbId = {};

function now() {
	var date = new Date();
	var h = ("0"+date.getHours()).slice(-2);
	var m = ("0"+date.getMinutes()).slice(-2);
	var s = ("0"+date.getSeconds()).slice(-2);
	return h+":"+m+":"+s;
}


process.on('uncaughtException', function (err) {
    console.log('uncaughtException => ' + err);
});


// everyauth setting
everyauth.debug = false;
everyauth
	.facebook
		.myHostname('http://youbooth.futa.ro')
		.appId(conf.fb.appId)
		.appSecret(conf.fb.appSecret)
		.findOrCreateUser(function (session, accessToken, accessTokenExtra, fbUserMetadata) {
			session.facebook_id = fbUserMetadata.id;
			session.picture = "http://graph.facebook.com/"+fbUserMetadata.username+"/picture";
			session.name = fbUserMetadata.name;
			YB_User.login(fbUserMetadata);
			return fbUserMetadata;
		})
		.redirectPath('/');

// express 
var app = express.createServer();
	app.configure(function() {
		app.set('views', __dirname + '/views');
		app.set('view engine', 'jade');
		app.use(express.static(__dirname + '/public'));
		app.use(express.bodyParser());
		app.use(express.methodOverride());
		app.use(express.cookieParser());
		app.use(express.session({
			secret: 'y0ub00thsecrethe110',
			store: sessionStore
		}));
		app.use(everyauth.middleware());
	});

// routes
	app.get('/', function (req, res) {
		var booths = YB_Booth.getBoothList();
		res.render('home', {'booths':booths});
	});
	app.post('/booth/create', function(req, res) {
		if (!req.body.booth_name) {
			return res.send({'status':false, 'message':'booth name is require.'});
		} else {
			if (!req.body.booth_name.match(/^[一-龠]+|[ぁ-ん]+|[ァ-ヴ]+|[a-zA-Z0-9]+$/)) {
				return res.send({'status':false, 'message':'invalid booth name.'});
			}
			if (YB_Booth.isExist(req.body.booth_name)) {
				return res.send({'status':false, 'message':'already exists.'});
			}
		}
		var is_private = (req.body.is_private == 1) ? true : false;
		if (YB_Booth.create(req.body.booth_name, is_private)) {
			return res.send({'status':true, 'path': '/booth/'+req.body.booth_name});
		} else {
			return res.send({'status':false, 'message':'booth create limit.'});
		}
		
	});
	app.get('/booth/:booth_name', function (req, res) {
		if (req.session.auth==undefined) {
			return res.redirect('/');
		}
		var booth = req.params.booth_name;
		if (!YB_Booth.isExist(booth)) {
			return res.redirect('/');
		}
		res.render('booth', {'booth_name':booth});
	});
	everyauth.helpExpress(app);
	app.listen(6670);



// socket.io
var connect = require('connect');
var parseCookie = connect.utils.parseCookie
  , Session = connect.middleware.session.Session;
var io = io.listen(app);
	io.configure(function(){
		io.set('authorization', function(handshakeData, callback) {
			if (handshakeData.headers.cookie) {
				var cookie = handshakeData.headers.cookie;
				var sessionID = parseCookie(cookie)['connect.sid'];
				handshakeData.cookie = cookie;
				handshakeData.sessionID = sessionID;
				handshakeData.sessionStore = sessionStore;
				sessionStore.get(sessionID, function(err, session) {
					if (err) {
						callback('--'+err.message, false);
					} else {
						handshakeData.session = new Session(handshakeData, session);
						//console.log(handshakeData.session);
						callback(null, true);
					}
				});
			} else {
				callback('--Cookie Not Found', false);
			}
		});
	});

io.sockets.on('connection', function(socket) {
	var handshake = socket.handshake;

	socket.on('status.init', function(data) {
		
		handshake.session.booth = data.booth_name;
		
		var enter = YB_Booth.enter(
			handshake.session.booth, 
			handshake.session.facebook_id, 
			socket.id,
			socket
		);
		if (enter) {
		// @todo:同時ログインどうしよう
			var date = now();
			var booth_name = handshake.session.booth;
			YB_Booth.broadcast(
				booth_name, 
				'chat.receive', 
				{user: null, date: now(), msg: '+ '+handshake.session.name.h(), is_system: true}
			);
		} else {
			handshake.session.booth = null;
			socket.emit('status.redirect', {path:"/"});
		}
	});
	
	socket.on('video.addCue', function(data) {
		var booth_name = handshake.session.booth;
		YB_Booth.addCue(booth_name, data);
	});

  socket.on('video.nextCue', function(data) {
    var booth_name = handshake.session.booth;
    YB_Booth.nextCue(booth_name);
  });
	
	socket.on('chat.send', function(data) {
		var uname = handshake.session.name;
		var booth_name = handshake.session.booth;
		var picture = handshake.session.picture;
		YB_Booth.broadcast(
			booth_name, 
			'chat.receive', 
			{user: uname.h(), date: now(), msg: data.msg.h(), picture:picture}
		);
	});
	
	socket.on('disconnect', function() {
		var booth_name = handshake.session.booth;
		YB_Booth.broadcast(
			booth_name, 
			'chat.receive', 
			{user: null, date: now(), msg: '- '+handshake.session.name.h(), is_system: true}
		);
		YB_Booth.part(
			handshake.session.booth, 
			handshake.session.facebook_id
		);
	});
	


/*	
	var intervalID = setInterval(function() {
		
		handshake.session.reload(function() {
			handshake.session.touch().save();
		});
	}, 1000*2);

	socket.on('disconnect', function() {
		clearInterval(intervalID);
	});
*/
});


YB_User.init(client, io);
YB_Booth.init(client, io);

