jQuery.scope = function(target,func){ return function() { func.apply(target,arguments);}};

var YBView = function(developperkey, main) {
	this.developperkey = developperkey;
	this.main = main;
}
YBView.prototype = {
	
	player_id: "mainplayer",
	
	embedPlayer: function(){
		swfobject.embedSWF(
			"http://www.youtube.com/apiplayer?version=3&enablejsapi=1&key="+this.developperkey+"&playerapiid="+this.player_id,
			'mainplayer_field', 
			"100%", "100%", "8", null, {},
			{ allowScriptAccess: "always", bgcolor: "#000000", wmode: "transparent" },
			{ id: this.player_id }
		);
	},
	
	setUpEventListener: function() {
		
		// buttons
		$("#btn_chat, #btn_add, #btn_cues").click(
			function(e){
				e.preventDefault();
				var target = "#"+$(this).attr('target');
				if ($(target).css('display') != "none") {
					$(target).fadeOut('fast');
				} else {
					$("#floating .item").hide();
					$(target).fadeIn('fast');
				}
				return false;
			}
		);
    $("#btn_nextcue").click(
      $.scope(this.main, function(e){
        e.preventDefault();
        this.nextCue();
        return false;
      })
    );
		
		// search form
		$('form#search_form').submit($.scope(this.main, function(e) {
			e.preventDefault();
			this.searchVideo();
			return false;
		}));
		// click searched viedo
		$('.searched_video').live('click', $.scope(this.main, function(e) {
			e.preventDefault();
			$(e.currentTarget).fadeTo('fast', 0.2);
			$(e.currentTarget).removeClass('searched_video');
			this.addCue($(e.currentTarget).attr('vid'));
			return false;
		}));
		$('#results div.more').live('click', $.scope(this.main, function(e){
			e.preventDefault();
			this.searchViedeoNext();
			return false;
		}));
		
		// chat form
		$('form#chat').submit($.scope(this.main, function(e){
			e.preventDefault();
			this.sendChatMessage();
			return false;
		}));
		
		$("#chatarea").append("<ul>");
	},
	
	updateBooth: function(data) {
		$("#chat h2").html("chat("+data.booth_user_count+")");
		if (data.cues) {
			$("#cue_list").html('');
			for (var i in data.cues) {
				$("#cue_list").append("<img class='' vid='"+data.cues[i].vid+"' src='"+data.cues[i].thumbnail+"' />");
			}
		}
	},
	
	renderSearchResult: function(results, is_more) {
		if (!is_more) $("#results ul").html('');
		$("#results div.more").remove();
		if (results) {
			var html = "";
			for(var i=0; i<results.length; i++) {
				if (results[i].embed) {
					var title     = results[i].title;
					var vid       = results[i].vid;
					var thumbnail = results[i].thumbnail;
					var duration  = results[i].duration;
					var time      = parseInt(duration/60) + ":" + ("0" + (duration % 60)).slice(-2);
					html += "<li>"+
							"<img class='searched_video' "+
							" src='" + thumbnail + "'" +
							" id='" + vid + "'" + 
							" vid='" + vid + "'" + 
							" title='" + title + "'" + 
							" thumbnail='" + thumbnail + "'" + 
							" duration='" + duration + "'" + 
							" />"+
							"["+time+"]"+title+
							"</li>";
				}
			}
			$("#results ul").append(html);
			$("#results").append("<div class='more'><a href='#'>more...</a></div>");
		} else {
			if (!is_more) {
				$("#results ul").html('<li>no hit.</li>');
			} else {
				$("#results div.more").remove();
			}
		}
	},
	
	renderChatMessage: function(data) {
		if (data.is_system) {
			$("#chatarea ul").prepend("<li><span>"+data.date+"</span> <span>"+data.msg+"</span></li>");
		} else {
			$("#chatarea ul").prepend("<li><div class='pic'><img src='"+data.picture+"?type=square' /></div><div class='msg'>"+data.msg+"<br/><span>"+data.date+":"+data.user+"</span></div></li>");
		}
		
	},
	
	setTitle: function(title){
		$("#vtitle").html("::"+title);
		document.title = "YouBooth #" + window.booth_name + "::" + title;
	}
};






var YBMain = function(developperkey) {
	this.view = new YBView(developperkey, this);
}
YBMain.prototype = {
	
	player: null,
	socket: null,
	search_page: 1,
	
	init: function() {
		this.socket = io.connect('http://youbooth.futa.ro');
		this.socket.on('connect', $.scope(this, this.playerSetup));
	},
	
	playerSetup: function() {
		window.onYouTubePlayerReady = $.scope(this, this.onYouTubePlayerReady);
		this.view.embedPlayer();
	},
	
	onYouTubePlayerReady: function(player_id) {
		this.player = document.getElementById(player_id);
		this.setupYB();
	},
	
	setupYB: function() {
		// set up view
		this.view.setUpEventListener();
		// listen socket		
		this.socket.on('video.play',   $.scope(this, this.play));
		this.socket.on('chat.receive', $.scope(this, this.receiveChatMessage));
		this.socket.on('booth.update', $.scope(this.view, this.view.updateBooth));
		this.socket.on('status.redirect', function(data){
			location.href = data.path;
		});
		// init
		this.socket.emit('status.init', {booth_name:window.booth_name});
	},
	
	play: function(data) {
		var cue = data.cue;
		var starttime = (data.starttime) 
			? parseInt((new Date)/1000) - data.starttime 
			: 0;
		this.player.loadVideoById(cue.vid, starttime);
		this.view.setTitle(cue.title);
	},
	
	searchVideo: function() {
		var word = $("#search_box").val();
		if (!word.length) return;
		this.search_page = 1;
		this.getYouTube(word, false);
	},
	
	searchViedeoNext: function() {
		var word = $("#search_box").val();
		if (!word.length) return;
		this.search_page++;
		this.getYouTube(word, true);
	},
	
	getYouTube: function(word, is_more) {
		$.getJSON(
			"http://gdata.youtube.com/feeds/api/videos?callback=?",
			{ 
				vq: word,
				'max-results': 9,
				'start-index': (9 * (this.search_page-1) + 1),
				alt:"json" 
			},
			$.scope(this, function( response ){
				var entries = response.feed.entry;
				if (!entries) {
					this.view.renderSearchResult(false, is_more);
					return;
				}
				var entry;
				var results = [];
				for(var i=0; i<entries.length; i++) {
					entry = {
						title:     entries[i].title.$t,
						vid:       entries[i].id.$t.split("http://gdata.youtube.com/feeds/api/videos/").join(""),
						thumbnail: entries[i].media$group.media$thumbnail[2].url,
						duration:  entries[i].media$group.yt$duration.seconds,
						embed:     (entries[i].yt$noembed) ? false : true
					};
					results.push(entry);
				}
				this.view.renderSearchResult(results, is_more);
			})
		);
	},
	
	addCue: function(vid) {
		this.socket.emit('video.addCue', {
			vid:       $("#"+vid).attr('vid'), 
			title:     $("#"+vid).attr('title'),
			duration:  $("#"+vid).attr('duration'),
			thumbnail: $("#"+vid).attr('thumbnail')
		});
	},

  nextCue: function() {
    this.socket.emit('video.nextCue', {});
  },
	
	sendChatMessage: function() {
		var msg = $('#chatbox').val();
		if (msg) {
			this.socket.emit('chat.send', {msg: msg});
			$('#chatbox').val('');
		}
	},
	
	receiveChatMessage: function(data) {
		this.view.renderChatMessage(data);
	},
	
	
	test_: function() {
		this.socket.emit('testing', {hello: 'world'});
	}
}

$(function() {
	var yb = new YBMain('AI39si5V1IzE0O55x1DsQ5ArRt5pUwtRm71GecTvehN18iLgqXBviM2c5KIZ-mdBUO1no40fp9xhBERIfw3at0-NOGp7_Nuorw');
		yb.init();
});


