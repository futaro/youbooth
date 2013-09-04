var async = require('async');

module.exports = 
{
    _client: undefined,
    _io: undefined,
	_booths: [],
	
	init: function(client, io) {
		this._client = client;
		this._io = io;
	},

	enter: function(booth_name, facebook_id, socket_id, socket) {
		if (!this._booths[booth_name]) {
			return false;
		}
		this._booths[booth_name].users[facebook_id] = socket_id;
		this._updateBooth(booth_name);
		
		if (this._booths[booth_name].playing) {
			socket.emit(
				'video.play',
				{
					cue: this._booths[booth_name].playing, 
					starttime: this._booths[booth_name].starttime
				}
			);
		}
		return true;
	},
	
	create: function(booth_name, is_private) {
		this._booths[booth_name] = {
			name: booth_name,
			users: {},
			cues: [],
			playing: null,
			starttime: 0,
			timer_id: undefined,
			booth_user_count: 0,
			is_private: is_private
		};
		return true;
	},
	
	isExist: function(booth_name) {
		if (this._booths[booth_name]) {
			return true;
		} else {
			return false;
		}
	},
	
	part: function(booth_name, facebook_id) {
		if (this._booths[booth_name].timer_id) {
			clearTimeout(this._booths[booth_name].timer_id);
		}
		delete this._booths[booth_name].users[facebook_id];
		this._updateBooth(booth_name);
		if (this._booths[booth_name].booth_user_count<=0) {
			delete this._booths[booth_name];
		}
	},
	
	broadcast: function(booth_name, action_name, params) {
		var booth = this._booths[booth_name];
		if (!booth) {
			return;
		}
		for (var i in booth.users) {
			this._io.sockets.socket(booth.users[i]).emit(action_name, params);
		}
	},
	
	addCue: function(booth_name, params) {
		var booth = this._booths[booth_name];
			booth.cues.push(params);
		if (!booth.playing) {
			this.play(booth_name);
		}
		this._updateBooth(booth_name);
	},

  nextCue: function(booth_name) {
    var booth = this._booths[booth_name];
    if (!booth.playing || booth.cues.length<=1) return;
        booth.playing = null;
        clearTimeout(booth.timer_id);
    this.play(booth_name);
  },
	
	play: function(booth_name) {
		var booth = this._booths[booth_name];
		if (booth.playing || booth.cues.length<1 ) return;
		
		var cue = booth.cues.shift();
		booth.playing   = cue;
		booth.starttime = parseInt((new Date)/1000);
		booth.timer_id  = setTimeout(
			(function(_this){
				return function(){
					var booth = _this._booths[booth_name];
						booth.playing = null;
					_this.play(booth_name);
				}
			})(this), 
			cue.duration * 1000 + 3000
		);
		
		this.broadcast(
			booth_name,
			'video.play',
			{cue: cue}
		);
		this._updateBooth(booth_name);
	},
	
	getBoothList: function() {
		var booths = [];
		for (var i in this._booths) {
			if (!this._booths[i]['is_private']) {
				booths.push(this._booths[i]);
			}
		}
		return booths;
	},
	
	_updateBooth: function(booth_name) {
		var booth = this._booths[booth_name];
		var booth_user_count = 0;
		for (var i in booth.users) booth_user_count++;
		
		this._booths[booth_name].booth_user_count = booth_user_count;
		
		this.broadcast(
			booth_name, 
			'booth.update', 
			{
				booth_user_count: booth_user_count,
				cues: booth.cues
			}
		);
	}
}

