var express = require('express');
var app = express();// create our app w/ express

var path = require("path");
var morgan = require('morgan');             // log requests to the console (express4)
var methodOverride = require('method-override'); // simulate DELETE and PUT (express4)
const uuidV4 = require('uuid/v4');
var Mopidy = require("mopidy");
var bodyParser = require('body-parser');

const session = require('express-session')

var app = express();
var passport = require('passport')
    , LocalStrategy = require('passport-local').Strategy;

app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({extended: true})); // support encoded bodies
app.use(passport.initialize());
app.use(passport.session());

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

passport.serializeUser(function (user, done) {
    done(null, user.username);
});

passport.deserializeUser(function (username, done) {
    var user = party.guests.filter(function (guest) {
        return guest.username == username;
    })[0];
    done(null, user);
});

passport.use(new LocalStrategy(
    function (username, password, done) {
        if (!party) {
            return done(null, false);
        }
        var user = party.guests.filter(function (guest) {
            return guest.username == username;
        })[0];
        if (!user) {
            console.log(username, "is not a member of the party.")
            return done(null, false);
        } else if (user.password == password) {
            console.log(user.username, "successfully authenticated.");
            return done(null, user);
        } else {
            console.log(user.username, "failed to authenticate.")
            return done(null, false);
        }
    }
));



var mopidy = new Mopidy({
    webSocketUrl: "ws://localhost:6680/mopidy/ws/"
});
mopidy.on('event:tracklistChanged', function () {
    gatherPartyInfo();
});
mopidy.on('event:trackPlaybackStarted', function () {
    party.votesToSkipCurrentTrack = [];

    gatherPartyInfo();
});

mopidy.on('event:trackPlaybackEnded', function(){
    party.tracklist.splice(0, 1); //remove the track that has just finished playing
    mopidy.playback.stop();
    if(party.tracklist.length > 1){
        var max = -Infinity;
        var maxUri;
        for (var i in votesToPlayNext) {
            if (votesToPlayNext[i] > max) {
                max = votesToPlayNext[i];
                maxUri = i;
            }
        }
        var trackToPlayNext;
        if (max > 0){
            trackToPlayNext = party.tracklist.filter(function(tlTrack){
                return tlTrack.uri == maxUri;
            })[0];

        }else{
            trackToPlayNext = party.tracklist[0];
        }
        var indexOfTrackToPlayNext = party.tracklist.findIndex(x => x.uri==trackToPlayNext.uri);
        if(indexOfTrackToPlayNext > 0){
            party.tracklist.splice(indexOfTrackToPlayNext, 1); //remove track to move
            party.tracklist.splice(0, 0, trackToPlayNext)//add it again at the top
        }
        mopidy.tracklist.add(null, null, trackToPlayNext.uri).then(function (data) {
            console.log(data);
        }).then(function () {
            mopidy.playback.getState().then(function (data) {
                if (data == "stopped") {
                    mopidy.playback.play();
                }
            });
        });
    }
    votesToPlayNext = {};
    party.votedThisSong = [];
});

var gatherPartyInfo = function () {
    var playbackPromise = mopidy.playback.getCurrentTrack().then(function (track) {
        party.currentTrack = track;
        updateGuests();
    });
}

var party;
var rootPath = "/api/v1";
/* Guest Login */
app.post(rootPath + '/login', function (req, res) {
    var userUUID = uuidV4();
    if (!party) {
        res.status(404).send({errorCode: 404, message: "There is no party to join"});
        return;
    } else if (party.guests.filter(function (guest) {
            return guest.username == req.body.username;
        })[0]) {
        res.status(403).send({errorCode: 403, message: "User is already logged in."});
        return;
    } else {

        var guest = {username: req.body.username, password: userUUID};
        party.guests.push(guest);
        var currentState = party;


        var printCurrentTrack = function (track) {
            if (track) {
                currentState.currentTrack = track;
                console.log("Currently playing:", track.name, "by", track.artists[0].name, "from", track.album.name);

            } else {
                console.log("No current track");
            }
            updateGuests();
            res.send(JSON.stringify(guest));
        };
        if (mopidy.playback) {
            mopidy.playback.getCurrentTrack().done(printCurrentTrack);
        }
    }
});
var votesToPlayNext = {};
function voteToPlayNext(votersGUID, uri){
    if(party.votedThisSong.indexOf(votersGUID) == -1){
        if(!votesToPlayNext[uri]){
            votesToPlayNext[uri] = 0;
        }
        if(uri != party.tracklist[0].uri){
            votesToPlayNext[uri] = votesToPlayNext[uri] + 1;
            party.votedThisSong.push(votersGUID);
            console.log(votersGUID, "voted to play", uri, "next. It now has", votesToPlayNext[uri], "votes");
        }else{
            console.log(votersGUID, "voted to play", uri, "next. It is already playing and cannot be voted for next. The UI should have prevented this!");
        }

    }else{
        console.log(votersGUID, "has already voted");
    }
}

function voteToSkip(votersConnectionKey, votersUsername) {
    // console.log(votersConnectionKey, "voted to skip");
    // var guest = party.guests.filter(function (guest) {
    //     return guest.connectionId == votersConnectionKey;
    // });
    // var vote = {connectionKey: votersConnectionKey, username: votersUsername};
    // if (party.votesToSkipCurrentTrack.indexOf(vote) != -1) {
    //     console.log(votersConnectionKey, "has already voted to skip, vote ignored")
    // } else {
    //     party.votesToSkipCurrentTrack.push(vote);
    //     console.log(votersConnectionKey, "voted to skip registered");
    //     if ((party.config.votesToSkip.unit == "votes" && party.votesToSkipCurrentTrack.length >= party.config.votesToSkip.value)
    //         || (party.config.votesToSkip.unit == "%" && (party.votesToSkipCurrentTrack.length / party.guests.length) >= party.config.votesToSkip.value / 100)) {
    //         console.log("Skipping track due to enough votes.", party.votesToSkipCurrentTrack, "voted to skip.");
    //         mopidy.playback.next();
    //         party.votesToSkipCurrentTrack = [];
    //     }
    // }
    // return;
    mopidy.playback.next();
}
//passport.authenticate('local', { session: false }),
function playTrack(connectionKey, uri) {
    if (!party) {
        return;
    }
    if (!mopidy.tracklist) {
        return;
    }
    mopidy.library.lookup(uri).then(function(track){
        if(track[0]){
            party.tracklist.push(track[0]);
            console.log("Added", uri, "to tracklist.");
        }
        return;
    }).then(function(){
        mopidy.playback.getState().then(function (data) {
            if (data == "stopped") {
                mopidy.tracklist.add(null, null, party.tracklist[0].uri).then(function (data) {
                    mopidy.playback.play();
                });
            }
            if(data == "paused") {
                mopidy.playback.resume();
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
    searchQuery[field] = query;
    mopidy.library.search(searchQuery, [], true).then(function (results) {

        var totalTracks = results[0].tracks ? results[0].tracks.length : 0;
        var totalArtists = results[0].artists ? results[0].artists.length : 0;
        var totalAlbums = results[0].albums ? results[0].albums.length : 0;
        console.log("tracks:", totalTracks, ", artists:", totalArtists, ", albums:", totalAlbums);
        res.send(JSON.stringify(results));
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
    // mopidy.library.browse(uri).then(function (results) {
    //
    //     tracks = results.filter(function (item) {
    //         return item.type == 'track'
    //     });
    //     albums = results.filter(function (item) {
    //         return item.type == 'album'
    //     });
    // }).then(function () {
    //     var response = [{tracks: tracks, albums: albums}];
    //     res.send(JSON.stringify(response));
    // })
});

/* Create a new party */
function createParty(host) {
    mopidy.tracklist.setConsume(true); //remove tracks once played
    mopidy.tracklist.setSingle(true);
    party = {};
    party.tracklist = [];
    party.votedThisSong = [];
    party.config = {};
    party.config.votesToSkip = {};
    party.config.votesToSkip.value = 35;
    party.config.votesToSkip.unit = "%";

    party.host = {username: host.username, connectionKey: host.connectionKey};
    party.guests = [];
    party.votesToSkipCurrentTrack = [];
    console.log("New party hosted by", party.host.username);
}

/* Update party settings */
app.put(rootPath + '/party', function (req, res) {

    if (!party) {
        res.status(404).send({errorCode: 404, message: "There is no current party."});
    } else {
        party.host = {username: req.body.username, password: req.body.password};
        console.log("Party Updated.  Host is", party.host.username);
        res.send(JSON.stringify(party));
    }

});

app.get('*', function (req, res) {
    res.sendFile(path.join(__dirname, '/public', 'index.html'));
});

app.listen(3000, function () {
    console.log('Example app listening on port 3000!')
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
            console.log("Guest with connection", conn.key, "is called", str);
            party.guests.push({connectionId: conn.key, username: message.username, userguid: message.userguid});
        } else if (message.command == "voteToSkip") {
            var connectedUser = getUserByConnectionKey(conn.key);
            voteToSkip(conn.key, connectedUser.username);
        } else if (message.command == "voteToPlayNext") {
            var connectedUser = getUserByConnectionKey(conn.key);
            voteToPlayNext(connectedUser.userguid, message.uri);
        } else if (message.command == "play") {
            var connectedUser = getUserByConnectionKey(conn.key);
            playTrack(conn.key, message.uri);
        }
        gatherPartyInfo();

    })
    conn.on("close", function (code, reason) {
        console.log("Connection", conn.key, "closed. Code:", code, ", reason:", reason);

        //remove guest
        var relevantGuest = getUserByConnectionKey(conn.key);
        var guestIndex = party.guests.indexOf(relevantGuest);
        if (guestIndex != -1) {
            party.guests.splice(guestIndex, 1);
        }

        //remove connection
        var connectionIndex = connections.indexOf(conn);
        if (connectionIndex != -1) {
            connections.splice(connectionIndex, 1);
        }

        //delete any votes cast
        var remainingVotes = party.votesToSkipCurrentTrack.filter(function (vote) {
            return vote.connectionKey != conn.key;
        });
        party.votesToSkipCurrentTrack = remainingVotes;
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