var async = require('async');

module.exports = 
{
	_client: undefined,
    _io: undefined,

	init: function(client, io) {
		this._client = client;
		this._io = io;
	},

	login: function(userdata) {
		
		var _this = this;

		var id = userdata.id;
		var name = userdata.name;
		
		async.waterfall([
			function(callback) {
				_this._client.query(
					'SELECT * FROM `User` WHERE `facebook_id` = ? LIMIT 1',
					[id],
					function(err, results, fields){
						callback(null, results);
					}
				);
			},
			function(arg, callback) {
				if (arg[0]) {
					_this._client.query(
						'UPDATE `User` SET name = ?, latest_login_at = NOW(), modified_at = NOW() WHERE facebook_id = ? LIMIT 1',
						[name, id]
					);
				} else {
					_this._client.query(
						'INSERT INTO `User` VALUES (?, ?, ?, NOW(), NOW(), NOW())',
						[null, id, name]
					);
				}
			}
		], function(err) {
			if (err) throw err;
		});
	}
};

