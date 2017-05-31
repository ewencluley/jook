var express = require('express');
var app = express();// create our app w/ express

var path = require("path");
var morgan = require('morgan');             // log requests to the console (express4)
var methodOverride = require('method-override'); // simulate DELETE and PUT (express4)
var Mopidy = require("mopidy");
var bodyParser = require('body-parser');
const debug = require('debug')('jook');


const session = require('express-session')

var app = express();

app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({extended: true})); // support encoded bodies

app.use(express.static(__dirname + '/public'));                 // set the static files location /public/img will be /img for users

app.use('/scripts/ui-bootstrap', express.static(__dirname + '/node_modules/angular-ui-bootstrap/dist/'));
app.use('/scripts/angular-animate', express.static(__dirname + '/node_modules/angular-animate/'));
app.use('/scripts/angular-route', express.static(__dirname + '/node_modules/angular-route/'));
app.use('/scripts/bootstrap/', express.static(__dirname + '/node_modules/bootstrap/dist/'));
app.use('/scripts/angular/', express.static(__dirname + '/node_modules/angular/'));


app.use(morgan('dev'));                                         // log every request to the console
app.use(bodyParser.urlencoded({'extended': 'true'}));            // parse application/x-www-form-urlencoded
app.use(bodyParser.json());                                     // parse application/json
app.use(bodyParser.json({type: 'application/vnd.api+json'})); // parse application/vnd.api+json as json
app.use(methodOverride());
var networkInterfaceDetails = require('os').networkInterfaces();

var mopidy = new Mopidy({
    webSocketUrl: "ws://localhost:6680/mopidy/ws/"
});
mopidy.on('event:tracklistChanged', function () {
    debug('Mopidy tracklist changed');
    gatherPartyInfo();
});
mopidy.on('event:trackPlaybackStarted', function () {
    debug('Mopidy started playback');
    gatherPartyInfo();
});

mopidy.on('event:trackPlaybackEnded', function () {
    if(party.tracklist[0]){
        debug('track "%s" has just ended', party.tracklist[0].name)
    }
    mopidy.playback.stop().then(function () {
        debug('playback stopped')
        party.tracklist.splice(0, 1); //remove the track that has just finished playing
        debug('removed the played track from the tracklist in node')
        if (party.tracklist.length > 0) {
            debug('there are still remaining tracks to play')
            var max = -Infinity;
            var maxUri;
            for (var i in votesToPlayNext) {
                if (votesToPlayNext[i] > max) {
                    max = votesToPlayNext[i];
                    maxUri = i;
                }
            }
            debug('%s has the most votes with %i', maxUri, max)
            var trackToPlayNext;
            if (max > 0) {
                debug('votes have been cast, finding the track to play next')
                trackToPlayNext = party.tracklist.filter(function (tlTrack) {
                    return tlTrack.uri == maxUri;
                })[0];
            } else {
                debug('no track had any votes to be bumped to the top of the queue')
                trackToPlayNext = party.tracklist[0];
            }
            debug('track to play next is %s (%s)', trackToPlayNext.name, trackToPlayNext.uri)
            var indexOfTrackToPlayNext = party.tracklist.findIndex(x => x.uri == trackToPlayNext.uri);
            debug('index of track to play next in tracklist is %i', indexOfTrackToPlayNext)
            if (indexOfTrackToPlayNext > 0) {
                debug('moving track from position %i to position 0', indexOfTrackToPlayNext)
                party.tracklist.splice(indexOfTrackToPlayNext, 1); //remove track to move
                party.tracklist.splice(0, 0, trackToPlayNext)//add it again at the top
            }
            debug('adding track to mopidy "%s" (%s)', trackToPlayNext.name, trackToPlayNext.uri)
            mopidy.tracklist.add(null, null, trackToPlayNext.uri).then(function (data) {
                debug('track added to mopidy "%s" (%s)', trackToPlayNext.name, trackToPlayNext.uri)
            }).then(function () {
                debug('restarting playback')
                mopidy.playback.play().then(function () {
                    debug('playback resumed')
                });
            });
        } else {
            debug('no more tracks to play')
        }
        debug('clearing votesToPlayNext')
        votesToPlayNext = {};
        debug('clearing votedThisSong')
        party.votedThisSong = [];
    }).then(function () {
        debug('going to update guests')
        gatherPartyInfo();
    });
});

var gatherPartyInfo = function () {
    var playbackPromise = mopidy.playback.getCurrentTrack().then(function (track) {
        party.currentTrack = track;
        updateGuests();
    });
};

var party;
var rootPath = "/api/v1";
var votesToPlayNext = {};
function voteToPlayNext(votersGUID, uri) {
    if (party.votedThisSong.indexOf(votersGUID) == -1) {
        if (!votesToPlayNext[uri]) {
            votesToPlayNext[uri] = 0;
        }
        if (uri != party.tracklist[0].uri) {
            votesToPlayNext[uri] = votesToPlayNext[uri] + 1;
            party.votedThisSong.push(votersGUID);
            console.log(votersGUID, "voted to play", uri, "next. It now has", votesToPlayNext[uri], "votes");
        } else {
            console.log(votersGUID, "voted to play", uri, "next. It is already playing and cannot be voted for next. The UI should have prevented this!");
        }

    } else {
        console.log(votersGUID, "has already voted");
    }
}


function playTrack(connectionKey, uri) {
    debug('Request to play track %s', uri)
    if (!party) {
        debug('No party exists')
        return;
    }
    mopidy.library.lookup(uri).then(function (track) {
        debug('Finding mopidy track for uri %s', uri)
        if (track[0]) {
            debug('Found mopidy track for uri %s.  It was %s', uri, track[0].name)
            party.tracklist.push(track[0]);
            debug('Added "%s" (%s) to tracklist', track[0].name, uri)
        }
        return;
    }).then(function () {
        debug('Getting mopidy plackback state')
        mopidy.playback.getState().then(function (data) {
            debug('Mopidy playback is "%s"', data)
            if (data === "stopped") {
                debug('Adding track to mopidy tracklist (%s)', uri)
                mopidy.tracklist.add(null, null, party.tracklist[0].uri).then(function (data) {
                    debug('Added track to mopidy tracklist (%s)', uri)
                    debug('Telling Mopidy to play')
                    mopidy.playback.play().then(function () {
                        debug('Mopidy playback started')
                    });
                });
            }
            if (data === "paused") {
                debug('Telling Mopidy to resume')
                mopidy.playback.resume().then(function () {
                    debug('Mopidy playback resumed')
                });
            }
        });
    });
}

app.get(rootPath + '/party', function (req, res) {
    if (!party) {
        res.status(404).send({errorCode: 404, message: "There is no current party."});
    } else {
        var currentState = party;
        currentState.guests = party.guests.map(function (guest) {
            return {username: guest.username}
        });


        if (mopidy.playback) {
            mopidy.playback.getCurrentTrack().then(function (track) {
                if (track) {
                    currentState.currentTrack = track;
                    console.log("Currently playing:", track.name, "by", track.artists[0].name, "from", track.album.name);
                } else {
                    console.log("No current track");
                }
            }).then(function () {
                return mopidy.tracklist.getTlTracks();
            }).then(function (tracklist) {
                currentState.tracklist = tracklist;
            }).then(function () {
                res.send(JSON.stringify(currentState));
            });
        } else {
            res.send(JSON.stringify(currentState));
        }
    }
});

app.get(rootPath + '/media', function (req, res) {
    var q = req.query.q.split(":");
    var field = q[0];
    var query = q[1];
    if (q.length == 2) { //no field is specified
        field = q[0];
        query = q[1];
    } else {
        field = "any";
        query = req.query.q;
    }
    var searchQuery = {};
    searchQuery[field] = [query];
    mopidy.library.search(searchQuery, [], true).then(function (results) {
        var albums = [],artists = [],tracks = [];
        var totalTracks =0, totalArtists=0, totalAlbums =0;
        results.forEach(function(resultSet) {
            totalTracks += resultSet.tracks ? resultSet.tracks.length : 0;
            totalArtists += resultSet.artists ? resultSet.artists.length : 0;
            totalAlbums += resultSet.albums ? resultSet.albums.length : 0;
            if (resultSet.albums) {
                albums = albums.concat(resultSet.albums)
            }
            if (resultSet.artists) {
                artists = artists.concat(resultSet.artists)
            }
            if (resultSet.tracks) {
                tracks = tracks.concat(resultSet.tracks)
            }
        });

        var response = {
            artists:artists,
            albums:albums,
            tracks:tracks
        };

        console.log("tracks:", totalTracks, ", artists:", totalArtists, ", albums:", totalAlbums);
        res.send(JSON.stringify(response));
    });
});
app.get(rootPath + '/media/:uri', function (req, res) {
    var uri = req.params.uri;
    var tracks;
    var albums;
    var searchQuery = {"uri": uri};
    mopidy.library.lookup({'uris': ["spotify:album:1hJ4ACIEdOmBJOZWyleWnf"]}).then(function (resultDict) {
        var resultArr = resultDict["spotify:album:1hJ4ACIEdOmBJOZWyleWnf"]
        console.log(resultArr);
    });
});

/* Create a new party */
function createParty(host) {
    debug('Creating Party')
    mopidy.tracklist.setConsume(true); //remove tracks once played
    mopidy.tracklist.setSingle(true);
    party = {};
    party.tracklist = [];
    party.votedThisSong = [];
    party.config = {};
    party.config.votesToSkip = {};
    party.config.votesToSkip.value = 35;
    party.config.votesToSkip.unit = "%";
    if(networkInterfaceDetails.wlan0 && networkInterfaceDetails.wlan0[0]){
        party.jookip = networkInterfaceDetails.wlan0[0].address;
    }

    party.host = {username: host.username, connectionKey: host.connectionKey};
    party.guests = [];
    party.votesToSkipCurrentTrack = [];
    console.log("New party hosted by", party.host.username);
}

app.get('*', function (req, res) {
    res.sendFile(path.join(__dirname, '/public', 'index.html'));
});
const port = process.env.DEBUG ? 3000 : 3000
app.listen(port, function () {
    debug('Debugging working, jook starting')
    console.log('Example app listening on port', port)
});

var ws = require("nodejs-websocket")
var connections = [];

function updateGuests() {
    var partyJSON = JSON.stringify(party);
    connections.forEach(function (connection) {
        connection.send(partyJSON);
    });
}
var server = ws.createServer(function (conn) {
    connections.push(conn);
    console.log("New connection", conn.key);
    conn.on("open", function () {
        gatherPartyInfo();
    });
    conn.on("text", function (str) {
        var message = JSON.parse(str);
        if (message.command == "login") {
            if (!party) {
                createParty({username: message.username, connectionKey: conn.key});
                console.log("New party created by", party.host.username);
            }
            var guestsWithMatchingUuid = party.guests.filter(function (guest) {
                return guest.userguid === message.userguid
            })
            if (!guestsWithMatchingUuid || guestsWithMatchingUuid.length == 0) {
                debug("New guest at party, adding %s (%s)", message.username, message.userguid)
                party.guests.push({connectionId: conn.key, username: message.username, userguid: message.userguid});
            } else {
                debug("Guest already at party: %s (%s)", message.username, message.userguid)
            }

            debug('Guest with connection %s is "%s" (%s)', conn.key, message.username, message.userguid);
        } else if (message.command == "voteToPlayNext") {
            var connectedUser = getUserByConnectionKey(conn.key);
            voteToPlayNext(connectedUser.userguid, message.uri);
        } else if (message.command == "play") {
            var connectedUser = getUserByConnectionKey(conn.key);
            playTrack(conn.key, message.uri);
        }
        gatherPartyInfo();

    });
    conn.on("close", function (code, reason) {
        console.log("Connection", conn.key, "closed. Code:", code, ", reason:", reason);

        //remove connection
        var connectionIndex = connections.indexOf(conn);
        if (connectionIndex != -1) {
            connections.splice(connectionIndex, 1);
        }

        updateGuests();
    });
    conn.on('error', function (err) {
        if (err.code !== 'ECONNRESET') {
            // Ignore ECONNRESET and re throw anything else
            throw err
        }
    })
}).listen(8001)

function getUserByConnectionKey(connectionKey) {
    var relevantGuest = party.guests.filter(function (guest) {
        return guest.connectionId == connectionKey;
    });
    return relevantGuest[0];
}