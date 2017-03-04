var express  = require('express');
var app      = express();// create our app w/ express

var path =  require("path");
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
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(__dirname + '/public'));                 // set the static files location /public/img will be /img for users

app.use('/scripts/ui-bootstrap', express.static(__dirname + '/node_modules/angular-ui-bootstrap/dist/'));
app.use('/scripts/angular-animate', express.static(__dirname + '/node_modules/angular-animate/'));
app.use('/scripts/angular-route', express.static(__dirname + '/node_modules/angular-route/'));
app.use('/scripts/bootstrap/', express.static(__dirname + '/node_modules/bootstrap/dist/'));
app.use('/scripts/angular/', express.static(__dirname + '/node_modules/angular/'));


app.use(morgan('dev'));                                         // log every request to the console
app.use(bodyParser.urlencoded({'extended':'true'}));            // parse application/x-www-form-urlencoded
app.use(bodyParser.json());                                     // parse application/json
app.use(bodyParser.json({ type: 'application/vnd.api+json' })); // parse application/vnd.api+json as json
app.use(methodOverride());

passport.serializeUser(function(user, done) {
    done(null, user.username);
});

passport.deserializeUser(function(username, done) {
    var user = party.guests.filter(function(guest){
        return guest.username == username;
    })[0];
    done(null, user);
});

passport.use(new LocalStrategy(
    function(username, password, done) {
        if(!party){
            return done(null, false);
        }
        var user = party.guests.filter(function(guest){
            return guest.username == username;
        })[0];
        if(!user){
            console.log(username, "is not a member of the party.")
            return done(null, false);
        }else if(user.password == password){
            console.log(user.username,"successfully authenticated.");
            return done(null, user);
        }else{
            console.log(user.username,"failed to authenticate.")
            return done(null, false);
        }
    }
));

var mopidy = new Mopidy({
    webSocketUrl: "ws://localhost:6680/mopidy/ws/"
});
mopidy.on('event:tracklistChanged', function(){
    gatherPartyInfo();
});
mopidy.on('event:trackPlaybackStarted', function(){

    gatherPartyInfo();
});

var gatherPartyInfo = function(){
    var promises = [];
    var playbackPromise = mopidy.playback.getCurrentTrack();
    promises.push(playbackPromise);
    var tracklistPromise = mopidy.tracklist.getTlTracks();
    promises.push(tracklistPromise);
    Promise.all(promises).then(function(){
        updateGuests();
    });
    playbackPromise.then(function(track) {
        party.currentTrack = track;
    });

    tracklistPromise.then(function(tracklist){
        party.tracklist = tracklist;
    });
}

var party;
var rootPath = "/api/v1";
/* Guest Login */
app.post(rootPath+'/login', function (req, res) {
    var userUUID = uuidV4();
    if(!party){
        res.status(404).send({errorCode:404, message:"There is no party to join"});
        return;
    }else if(party.guests.filter(function(guest){return guest.username == req.body.username;})[0]){
        res.status(403).send({errorCode:403, message:"User is already logged in."});
        return;
    }else{

        var guest = {username:req.body.username, password:userUUID};
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
        if(mopidy.playback){
            mopidy.playback.getCurrentTrack().done(printCurrentTrack);
        }
    }
});

function voteToSkip(voteBy){
    console.log(voteBy, "voted to skip");
    var guest = party.guests.filter(function(guest){
        return guest.connectionId == voteBy;
    });
    if(party.votesToSkipCurrentTrack.indexOf(voteBy) != -1){
        console.log(voteBy, "has already voted to skip, vote ignored")
    }else {
        party.votesToSkipCurrentTrack.push(voteBy);
        console.log(voteBy, "voted to skip registered")
        if(party.votesToSkipCurrentTrack.length >= 3){
            console.log("Skipping track due to enough votes.", party.votesToSkipCurrentTrack, "voted to skip.");
            mopidy.playback.next();
            party.votesToSkipCurrentTrack = [];
        }
    }
}
//passport.authenticate('local', { session: false }),
app.put(rootPath+'/queue/track',  function (req, res){
    if(!party){
        res.status(403).send({errorCode:403, message:"There is no party"});
        return;
    }
    if(!mopidy.tracklist){
        res.status(500).send({errorCode:500, message:"Internal Server Error"});
        return;
    }
    var play = {"tracks":null,"at_position":null,"uri":req.body.uri,"uris":null};
    mopidy.tracklist.add(null, null, req.body.uri).then(function(data){
        console.log(data);
    }).then(function (){
        mopidy.playback.getState().then(function(data){
            if(data == "stopped"){
                mopidy.playback.play();
            }
        });
    });
    res.send({status:"OK"});

});

app.get(rootPath+'/party', function (req, res){
    if(!party){
        res.status(404).send({errorCode:404, message:"There is no current party."});
    }else{
        var currentState = party;
        currentState.guests = party.guests.map(function(guest){ return {username:guest.username} });


        if(mopidy.playback){
            mopidy.playback.getCurrentTrack().then(function(track){
                if (track) {
                    currentState.currentTrack = track;
                    console.log("Currently playing:", track.name, "by", track.artists[0].name, "from", track.album.name);
                } else {
                    console.log("No current track");
                }
            }).then(function(){
                return mopidy.tracklist.getTlTracks();
            }).then(function(tracklist){
                currentState.tracklist = tracklist;
            }).then(function(){
                res.send(JSON.stringify(currentState));
            });
        }else{
            res.send(JSON.stringify(currentState));
        }
    }
});

app.get(rootPath+'/media', function(req, res){
    var q = req.query.q.split(":");
    var field = q[0];
    var query = q[1];
    if(q.length == 2){ //no field is specified
        field = q[0];
        query = q[1];
    }else{
        field = "any";
        query = req.query.q;
    }
    var searchQuery = {};
    searchQuery[field] = query;
    mopidy.library.search(searchQuery, [], true).then(function(results){
        var totalTracks = results[0].tracks ? results[0].tracks.length : 0;
        var totalArtists = results[0].artists ? results[0].artists.length : 0;
        var totalAlbums = results[0].albums ? results[0].albums.length : 0;
        console.log("tracks:", totalTracks, ", artists:", totalArtists, ", albums:", totalAlbums);
        res.send(JSON.stringify(results));
    });
});
app.get(rootPath+'/media/:uri', function(req, res){
    var uri = req.params.uri;
    var tracks;
    var albums;
    var artist;
    var searchQuery = {uri:uri};
    mopidy.library.search(searchQuery, [uri], true).then(function(results) {

        tracks = results[0].filter(function (item) {
            if (item.type == 'track') {
                return item;
            }
        });
        albums = results[0].filter(function (item) {
            if (item.type == 'album') {
                return item;
            }
        });
    }).then(function(){
        var searchQuery = {uri:uri};
        mopidy.library.search(searchQuery).then(function(results){
            artist = results[0];
        }).then(function(){
            var response = [{tracks :tracks, albums:albums, artists:[artist]}];
            res.send(JSON.stringify(response));
        });
    })
});

/* Create a new party */
app.post(rootPath+'/party', function (req, res) {
    mopidy.tracklist.setConsume(true); //remove tracks once played
    var hostUUID = uuidV4();
    if(party){
        res.status(403).send({errorCode:403, message:"There is already a party in progress, you cannot create a new one until that one is finished!"})
    }else{
        party = {};
        party.host = {username:req.body.username, password: hostUUID};
        party.guests = [];
        party.votesToSkipCurrentTrack = [];
        console.log("New party hosted by", party.host.username);
        res.send(JSON.stringify(party.host));
    }

});

/* Update party settings */
app.put(rootPath+'/party', function (req, res) {

    if(!party){
        res.status(404).send({errorCode:404, message:"There is no current party."});
    }else{
        party.host = {username:req.body.username, password: req.body.password};
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

function updateGuests(){
    var partyJSON = JSON.stringify(party);
    connections.forEach(function(connection){
        connection.send(partyJSON);
    });
}
var server = ws.createServer(function (conn) {
    connections.push(conn);
    console.log("New connection", conn.key);
    conn.on("open", function(){
        gatherPartyInfo();
    });
    conn.on("text", function (str) {
        var message = JSON.parse(str);
        if(message.command == "login"){
            console.log("Guest with connection",conn.key, "is called", str);
            party.guests.push({connectionId:conn.key, username:str});
        }else if(message.command == "voteToSkip"){
            voteToSkip(conn.key);
        }
        updateGuests();

    })
    conn.on("close", function (code, reason) {
        console.log("Connection", conn.key, "closed. Code:", code, ", reason:", reason);
        var relevantGuest = party.guests.filter(function (guest) {
            return guest.connectionId == conn.key;
        });
        var guestIndex = party.guests.indexOf(relevantGuest[0]);
        if (guestIndex != -1) {
            party.guests.splice(guestIndex, 1);
        }
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