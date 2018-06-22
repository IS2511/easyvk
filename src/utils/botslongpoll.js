
/*
 *  This is LongPoll for Bots (groups longpoll) Object.
 *  Here you can create your bots and listen group events
 *
 */

"use strict";

const request = require("request");
const staticMethods = require("./staticMethods.js");
const EventEmitter = require("events");



//LongPollConnection initing automatically by me
class LongPollConnection extends EventEmitter {


	constructor (lpSettings, vk) {
		super();
		let self = this;

		self.config = lpSettings;
		self._vk = vk;
		self.userListeners = {};

		init();

		function init () {

			let server, forLongPollServer, _w;

			server = `${self.config.longpollServer}?`;
			forLongPollServer = {};
			_w = null;

			forLongPollServer.act = "a_check";
			forLongPollServer.key = self.config.longpollKey;
			forLongPollServer.ts = self.config.longpollTs;
			forLongPollServer.version = self.config.userConfig.forLongPollServer.version;
			forLongPollServer.wait = self.config.userConfig.forLongPollServer.wait;

			if (isNaN(forLongPollServer.version)) {
				forLongPollServer.version = "2";
			}

			_w = forLongPollServer.wait;

			forLongPollServer = staticMethods.urlencode(forLongPollServer);
			
			let params = {
				url: server + forLongPollServer, 
				timeout: (_w * 1000) + (1000 * 3) //3 seconds plus wait time
			}

			if (self._debug) {
				
				self._debug({
					type: "longPollParamsQuery",
					data: params
				});

			}


			self.lpConnection = request.get(params, (err, res) => {

				if (err) {
					self.emit("error", err);
				} else {

					self._vk.debugger.push("response", res.body);
					
					if (self._debug) {
						
						self._debug({
							type: "pollResponse",
							data: res.body
						});

					}

					let vkr = staticMethods.checkJSONErrors(res.body, (vkrError) => {
						self.emit("error", vkrError);
					});

					if (vkr) {
						//Ok
						if (vkr.failed) {

							if (vkr.failed === 1) { //update ts
								
								if (vkr.ts) {
									self.config.longpollTs = vkr.ts;
								}

								init();

							} else if ([2,3].indexOf(vkr.failed) != -1){ //need reconnect
								
								self._vk.call("messages.getLongPollServer", self.config.userConfig.forGetLongPollServer).then(({vkr}) => {
									
									self.config.longpollServer = vkr.response.server;
									self.config.longpollTs = vkr.response.ts;
									self.config.longpollKey =  vkr.response.key;
									
									init(); //reconnect with new parameters

								}).catch((err) => {
									self.emit("reconnectError", new Error(err));
								});

							} else {
								self.emit("failure", vkr);
							}
						} else {

							if (vkr.ts) {
								self.config.longpollTs = vkr.ts;
							}
							
							if (vkr.updates) {
								
								if (vkr.updates.length > 0) {
									self._checkUpdates(vkr.updates);
								}

							}	

							init();

						}

					}

				}

			});

		}

	}
    
    
	_checkUpdates(updates) {
		let self = this;

		if (Array.isArray(updates)) {
			
			for (let updateIndex = 0; updateIndex < updates.length; updateIndex++) {
				
				let typeEvent = updates[updateIndex].type.toString();
				
				self.emit(typeEvent, updates[updateIndex].object);

			}

		} else {
			
			return "Is not array!";
		}

	}
	
	/*
	 *  This function closes connection and stop it
	 *  
	 *  @return {Promise}
	 *  @promise Close connection
	 *  @resolve {*} response from abort() method
	 *  @rejet {Error} - Eror if connection not inited
	 * 
	 */

	async close () {
		let self = this;
		
		return new Promise ((resolve, reject) => {
			
			if (self.lpConnection) {
				
				self.emit("close", {
					time: new Date().getTime(),
				});
				
				return resolve(self.lpConnection.abort());

			} else {
				return reject(new Error("LongPoll not connected"));
			}

		});

	}

	/*
	 *  This function enables (adds) your debugger for each query
	 *  For example: you can see error if it occured and log it with debugger function
	 * 
	 *  @param {Function|Async Function} [debugg] - Function for debugg all queries
	 *  In this function will sending all responses from vk, you can log this object in console for know more
	 *  
	 *  @return {Boolean|Object} - If your function is not a function, then will be returned false,
	 *  else LongPollConnection object for chain it
	 * 
	 */

	debug (debugg) {
		let self = this;

		if (Object.prototype.toString.call(debugg).match(/function/i)) {
			self._debug = debugg;
		} else {
			return false;
		}

		return self;
	}
}

class LongPollConnector {

	//From EasyVK contructed
	constructor (vk) {
		let self = this; //For the future
		self._vk = vk;
	}

	/*
	 *
	 *  This function create LongPollConnection and then re-calls to a server for
	 *  get new events
	 *  
	 *  @param {Object} [params] - Is your settings for LongPoll connection
	 *  @param {Object} [params.forGetLongPollServer] - Is object for firs query 
	 *  when LongPollConnector getting url for connect. This parameters will be sended with
	 *  query uri, and you can see them here https://vk.com/dev/bots_longpoll
	 *  @param {Object} [params.forLongPollServer] - Is object with params for each query on longpoll server.
	 *  For example: { "wait": 10 } //wait 10seconds for new call
	 * 
	 *  @return {Promise}
	 *  @promise Conneto to longpoll server
	 *  @resolve {Object} - Is object which content this parameters: 
	 *   { vk: EasyVK, connection: LongPollConnection }
	 *  @reject {Error} - vk.com error or just an error from request module
	 *
	 */

	async connect (params = {}) {
		let self = this;
		return new Promise ((resolve, reject) => {
			
			if (!staticMethods.isObject(params)) {
				reject(new Error("LongPoll parameters mast be an object!"));
			} else {
				
				if (params.forGetLongPollServer) {
					
					if (!staticMethods.isObject(params.forGetLongPollServer)) {
						params.forGetLongPollServer = {};
					}

				} else {
					params.forGetLongPollServer = {};
				}


				if (params.forLongPollServer) {
					
					if (!staticMethods.isObject(params.forLongPollServer)) {
						params.forLongPollServer = {};
					}

				} else {
					params.forLongPollServer = {};
				}


				if (isNaN(params.forGetLongPollServer.lp_version)) {
					params.forGetLongPollServer.lp_version = "2";
				}

				if (isNaN(params.forLongPollServer.wait)) {
					params.forLongPollServer.wait = "25";
				}


				self._vk.call("groups.getLongPollServer", params.forGetLongPollServer).then(({vkr}) => {
					
					let forLongPoll = {
						longpollServer: vkr.response.server,
						longpollTs: vkr.response.ts,
						longpollKey: vkr.response.key,
						responseGetServer: vkr,
						userConfig: params
					};

					return resolve({
						connection: new LongPollConnection(forLongPoll, self._vk),
						vk: self._vk
					});

				}, reject);


			}

		});

	}
	
}

module.exports = LongPollConnector;